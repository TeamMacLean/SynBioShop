const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function credentialError(message) {
  return new Error(`Intranet request credentials: ${message}`);
}

function locations(lookup, root = projectRoot) {
  const files = {
    credentialsFile: path.resolve(
      root,
      lookup.credentialsFile || 'secrets/budget-holders.age'
    ),
    identityFile: path.resolve(
      lookup.identityFile ||
        path.join(os.homedir(), '.config/synbioshop/budget-holders.key')
    ),
  };
  if (
    path.extname(files.credentialsFile) !== '.age' ||
    files.credentialsFile === files.identityFile
  ) {
    throw credentialError(
      'use a separate .age file for encrypted credentials, never the identity or config file.'
    );
  }
  return files;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

async function checkKeyDirectory(identityFile, root) {
  const directory = await fs.realpath(path.dirname(identityFile));
  if (inside(await fs.realpath(root), directory)) {
    throw credentialError(
      'keep the age identity outside the application repository.'
    );
  }
  const stat = await fs.stat(directory);
  if (stat.mode & 0o077 || (process.getuid && stat.uid !== process.getuid())) {
    throw credentialError(
      'the key directory must belong to the app account with permissions 0700.'
    );
  }
}

async function checkIdentity(identityFile, root) {
  try {
    await checkKeyDirectory(identityFile, root);
    const stat = await fs.lstat(identityFile);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.mode & 0o077 ||
      (process.getuid && stat.uid !== process.getuid())
    ) {
      throw credentialError(
        'the age identity must be a regular, owner-only file (0600), owned by the app account.'
      );
    }
  } catch (error) {
    if (error.message.startsWith('Intranet request credentials:')) throw error;
    throw credentialError(
      'the age identity is unavailable. Check its path and permissions.'
    );
  }
}

function runTool(executable, args, input) {
  return new Promise(function (resolve, reject) {
    const child = execFile(
      executable,
      args,
      {
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 64 * 1024,
      },
      function (error, stdout) {
        // Subprocess errors can contain decrypted stdout: never propagate them.
        if (error) {
          reject(
            credentialError(
              error.code === 'ENOENT'
                ? 'install age and age-keygen, and make them available to the app process.'
                : 'age failed. Check the identity, encrypted file and tool installation.'
            )
          );
        } else resolve(stdout);
      }
    );
    child.stdin.on('error', function () {
      /* Report failure through the exec callback. */
    });
    child.stdin.end(input);
  });
}

function ageTool() {
  return process.env.BUDGET_HOLDER_AGE_BIN || 'age';
}

function keygenTool() {
  return process.env.BUDGET_HOLDER_AGE_KEYGEN_BIN || 'age-keygen';
}

function validateCredentials(value, url) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch (error) {
    throw credentialError('the source URL is invalid.');
  }
  if (
    !value ||
    value.version !== 1 ||
    typeof value.username !== 'string' ||
    !value.username.trim() ||
    value.username.includes(':') ||
    typeof value.password !== 'string' ||
    !value.password ||
    value.origin !== origin ||
    !origin.startsWith('https://')
  ) {
    throw credentialError(
      'the encrypted data is invalid or belongs to another source hostname.'
    );
  }
  return { username: value.username, password: value.password };
}

async function decrypt(ciphertext, identityFile, url) {
  const plaintext = await runTool(
    ageTool(),
    ['--decrypt', '--identity', identityFile],
    ciphertext
  );
  let value;
  try {
    value = JSON.parse(plaintext);
  } catch (error) {
    throw credentialError('the decrypted data is not valid credential JSON.');
  }
  return validateCredentials(value, url);
}

async function loadCredentials(lookup, root = projectRoot) {
  if (!lookup.credentialsFile) return lookup;
  const files = locations(lookup, root);
  await checkIdentity(files.identityFile, root);
  let ciphertext;
  try {
    const stat = await fs.stat(files.credentialsFile);
    if (!stat.isFile() || stat.size > 64 * 1024)
      throw new Error('Invalid file');
    ciphertext = await fs.readFile(files.credentialsFile);
  } catch (error) {
    throw credentialError(
      'the encrypted credential file is missing, unreadable or too large.'
    );
  }
  const credentials = await decrypt(ciphertext, files.identityFile, lookup.url);
  // A configured encrypted file is authoritative: never fall back to stale
  // plaintext passwords/cookies if reading or decrypting it fails.
  return { ...lookup, ...credentials, headers: {} };
}

async function ensureIdentity(identityFile, root) {
  try {
    await fs.lstat(identityFile);
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw credentialError('could not inspect the age identity.');
    await fs.mkdir(path.dirname(identityFile), {
      recursive: true,
      mode: 0o700,
    });
    await checkKeyDirectory(identityFile, root);
    const identity = await runTool(keygenTool(), []);
    try {
      await fs.writeFile(identityFile, identity, { flag: 'wx', mode: 0o600 });
    } catch (writeError) {
      if (writeError.code !== 'EEXIST')
        throw credentialError(
          'could not create the age identity outside the repository.'
        );
    }
  }
  await checkIdentity(identityFile, root);
}

async function atomicWrite(filename, contents) {
  const directory = path.dirname(filename);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = await fs.mkdtemp(
    path.join(directory, '.budget-credentials-')
  );
  try {
    const staged = path.join(temporary, 'data');
    await fs.writeFile(staged, contents, { flag: 'wx', mode: 0o600 });
    await fs.rename(staged, filename);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function readLocalConfig(root) {
  try {
    return JSON.parse(
      await fs.readFile(path.join(root, 'config.json'), 'utf8')
    );
  } catch (error) {
    throw credentialError(
      'could not read local config.json. No plaintext credentials were removed.'
    );
  }
}

async function saveCredentials(lookup, root = projectRoot) {
  const current = await readLocalConfig(root);
  const files = locations(lookup, root);
  const value = {
    version: 1,
    username: lookup.username,
    password: lookup.password,
    origin: new URL(lookup.url).origin,
  };
  validateCredentials(value, lookup.url);
  await ensureIdentity(files.identityFile, root);
  const recipient = (
    await runTool(keygenTool(), ['-y', files.identityFile])
  ).trim();
  // Only public data is passed in argv. The plaintext travels through stdin.
  const ciphertext = await runTool(
    ageTool(),
    ['--encrypt', '--armor', '--recipient', recipient],
    JSON.stringify(value)
  );
  const roundTrip = await decrypt(ciphertext, files.identityFile, lookup.url);
  if (
    roundTrip.username !== value.username ||
    roundTrip.password !== value.password
  ) {
    throw credentialError(
      'the encrypted credential verification failed. Nothing was replaced.'
    );
  }
  await atomicWrite(files.credentialsFile, ciphertext);
  const stored = inside(root, files.credentialsFile)
    ? path.relative(root, files.credentialsFile)
    : files.credentialsFile;
  const next = {
    ...(current.lookupBudget || {}),
    url: lookup.url,
    username: lookup.username,
    proxyMode: lookup.proxyMode || 'auto',
    credentialsFile: stored,
    identityFile: files.identityFile,
  };
  delete next.password;
  next.headers = { ...(next.headers || {}) };
  delete next.headers.authorization;
  delete next.headers.cookie;
  delete next.headers.cookie_note;
  current.lookupBudget = next;
  // Remove plaintext only after the encrypted copy has passed a real round trip.
  // Stage the remaining config in the already ignored tmp/ directory.
  const temporaryRoot = path.join(root, 'tmp');
  await fs.mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
  const temporary = await fs.mkdtemp(
    path.join(temporaryRoot, 'budget-config-')
  );
  try {
    const staged = path.join(temporary, 'config.json');
    await fs.writeFile(staged, `${JSON.stringify(current, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    await fs.rename(staged, path.join(root, 'config.json'));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  return files;
}

async function migrateCredentials(overrides = {}, root = projectRoot) {
  const current = await readLocalConfig(root);
  const lookup = { ...(current.lookupBudget || {}) };
  for (const name of ['credentialsFile', 'identityFile']) {
    if (overrides[name]) lookup[name] = overrides[name];
  }
  if (!lookup.password && !lookup.credentialsFile) {
    const header = lookup.headers ? lookup.headers.authorization : '';
    if (header && /^Basic /i.test(header)) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon > 0) {
        lookup.username = decoded.slice(0, colon);
        lookup.password = decoded.slice(colon + 1);
      }
    }
  }
  const resolved =
    lookup.credentialsFile && !lookup.password
      ? await loadCredentials(lookup, root)
      : lookup;
  if (!resolved.username || !resolved.password) {
    throw credentialError(
      'no saved password to migrate. Use --prompt --save to set up encrypted credentials.'
    );
  }
  return saveCredentials(resolved, root);
}

module.exports = {
  loadCredentials,
  saveCredentials,
  migrateCredentials,
  locations,
};
