#!/usr/bin/env node
/** Probe and encrypted credential setup; no database or email imports. */
const readline = require('readline/promises');
const {
  saveCredentials,
  migrateCredentials,
} = require('../lib/budgetHolderCredentials');

function passwordPrompt() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(
      new Error('Run --prompt in an interactive terminal.')
    );
  }
  return new Promise(function (resolve, reject) {
    const previousRaw = Boolean(process.stdin.isRaw);
    const characters = [];
    process.stdout.write('Password (hidden): ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    function finish(error) {
      process.stdin.removeListener('data', input);
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      const password = characters.join('');
      characters.fill('');
      if (error) reject(error);
      else resolve(password);
    }
    function input(chunk) {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003' || character === '\u0004') {
          finish(new Error('Cancelled. Nothing saved.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') characters.pop();
        else if (character === '\u0015') characters.length = 0;
        else if (character >= ' ') characters.push(character);
      }
    }
    process.stdin.on('data', input);
  });
}

function usernameHint(lookup) {
  if (lookup.username) return lookup.username;
  const header = lookup.headers ? lookup.headers.authorization || '' : '';
  if (!/^Basic /i.test(header)) return '';
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  return colon > 0 ? decoded.slice(0, colon) : '';
}

async function main(args = process.argv.slice(2)) {
  const options = {
    prompt: false,
    save: false,
    migrate: false,
    direct: false,
    url: null,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompt') options.prompt = true;
    else if (args[i] === '--save') options.save = true;
    else if (args[i] === '--migrate') options.migrate = true;
    else if (args[i] === '--direct') options.direct = true;
    else if (args[i] === '--url' && args[i + 1]) options.url = args[++i];
    else if (args[i] === '--help') {
      console.log(
        'Usage: npm run budget-holders:check -- [--prompt] [--save] [--direct] [--url URL] | --migrate'
      );
      console.log(
        '--prompt asks for fresh credentials locally, with the password hidden.'
      );
      console.log(
        '--save requires --prompt; saves age-encrypted credentials only after a successful real fetch.'
      );
      console.log(
        '--migrate encrypts the password already saved in config.json, verifies decryption, then removes the plaintext. No network request.'
      );
      console.log(
        '--direct bypasses HTTP(S)_PROXY for this check. No database or email changes are made.'
      );
      return;
    } else
      throw new Error(
        'Unknown option. Use --help; never put a password in command arguments.'
      );
  }
  if (options.save && !options.prompt)
    throw new Error('--save requires --prompt.');
  if (
    options.migrate &&
    (options.prompt || options.save || options.direct || options.url)
  ) {
    throw new Error('--migrate cannot be combined with other options.');
  }
  const config = require('../config');
  if (options.migrate) {
    const files = await migrateCredentials(config.lookupBudget);
    console.log(
      'Credentials encrypted and verified. The budget-holder plaintext password and legacy auth/cookie were removed from config.json.'
    );
    console.log(`Encrypted file: ${files.credentialsFile}`);
    console.log(`Private identity: ${files.identityFile}`);
    console.log(
      'Restart the app to load the new settings. No network requests, database changes or emails.'
    );
    return;
  }
  const source = require('../lib/budgetHolderSource');
  const lookup = {
    ...config.lookupBudget,
    headers: { ...config.lookupBudget.headers },
  };
  if (options.url) lookup.url = options.url;
  if (options.direct) lookup.proxyMode = 'direct';
  if (options.prompt && lookup.fixture)
    throw new Error('Unset BUDGET_HOLDER_FIXTURE before testing credentials.');
  const target = lookup.fixture
    ? `Local fixture: ${lookup.fixture}`
    : new URL(lookup.url).origin + new URL(lookup.url).pathname;
  console.log(`Source: ${target}`);
  console.log(
    `Proxy: ${lookup.proxyMode === 'direct' ? 'direct connection' : 'environment settings'}`
  );
  if (options.prompt) {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      throw new Error('Run --prompt in an interactive terminal.');
    const hint = usernameHint(lookup);
    const terminal = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      lookup.username =
        (
          await terminal.question(`Username${hint ? ` [${hint}]` : ''}: `)
        ).trim() || hint;
    } finally {
      terminal.close();
    }
    lookup.password = await passwordPrompt();
    lookup.headers = {};
  }
  const started = Date.now();
  // A fresh prompt overrides the encrypted source for this probe only; retain
  // its path so --save updates the same encrypted file after a successful fetch.
  const holders = await source.fetchHolders(
    options.prompt ? { ...lookup, credentialsFile: '' } : lookup
  );
  const counts = new Map();
  for (const holder of holders)
    counts.set(holder.institute, (counts.get(holder.institute) || 0) + 1);
  console.log(
    `SUCCESS: parsed ${holders.length} budget holders in ${Date.now() - started} ms.`
  );
  console.log(
    [...counts]
      .sort()
      .map(function (entry) {
        return `${entry[0]}: ${entry[1]}`;
      })
      .join(', ')
  );
  console.log(
    `Authentication: ${lookup.fixture ? 'none (fixture)' : lookup.credentialsFile && !options.prompt ? 'age-encrypted credentials; no browser cookie' : lookup.username ? 'Basic username/password; no browser cookie' : 'configured legacy headers'}`
  );
  if (options.save) {
    await saveCredentials(lookup);
    console.log(
      'Credentials saved encrypted with age. config.json contains the username and file paths, with no budget-holder password or cookie. Restart the app to load them.'
    );
  }
  console.log('No database changes or emails.');
}

if (require.main === module) {
  main().catch(function (error) {
    console.error(
      error.code ? `${error.code}: ${error.message}` : error.message
    );
    process.exitCode = 1;
  });
}

module.exports = { main, usernameHint };
