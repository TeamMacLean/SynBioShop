#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { parseArgs } = require('util');
const { initialState } = require('../lib/budgetHolderState');
const {
  SOURCE_URL,
  MAX_BYTES,
  createSnapshot,
  validateSnapshot,
  planImport,
} = require('../lib/budgetHolderSnapshot');

function fail(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// Deliberately avoid the model layer: exports and previews must not create,
// migrate or repair database records merely by reading them.
async function readDirectory(config) {
  const r = require('rethinkdbdash')({
    host: config.dbHost,
    port: config.dbPort,
    db: config.dbName,
    silent: true,
  });
  try {
    const databases = await r.dbList().run();
    if (!databases.includes(config.dbName)) return initialState([]);
    const tables = await r.tableList().run();
    if (tables.includes('BudgetHolderDirectory')) {
      const state = await r.table('BudgetHolderDirectory').get('current').run();
      if (state) return state;
    }
    const legacy = tables.includes('BudgetHolder')
      ? await r.table('BudgetHolder').run()
      : [];
    return initialState(legacy);
  } finally {
    await r.getPoolMaster().drain();
  }
}

async function writeJson(filename, data) {
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function readSnapshot(filename) {
  const handle = await fs.open(filename, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES)
      throw fail('Snapshot must be a regular JSON file no larger than 2 MB.');
    // Bound the actual read too, in case the file grows after stat.
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        total,
        buffer.length - total,
        null
      );
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > MAX_BYTES) throw fail('Snapshot is larger than 2 MB.');
    let data;
    try {
      data = JSON.parse(buffer.subarray(0, total).toString('utf8'));
    } catch {
      throw fail('Snapshot is not valid JSON.');
    }
    return validateSnapshot(data);
  } finally {
    await handle.close();
  }
}

async function main(args = process.argv.slice(2)) {
  const command = args[0];
  if (!['export', 'import'].includes(command))
    throw fail('Choose export or import.');
  const { values, positionals } = parseArgs({
    args: args.slice(1),
    allowPositionals: true,
    options: {
      help: { type: 'boolean' },
      ...(command === 'export'
        ? {
            'from-db': { type: 'boolean' },
            out: { type: 'string' },
          }
        : { apply: { type: 'boolean' }, 'dry-run': { type: 'boolean' } }),
    },
  });
  if (values.help) {
    console.log(
      'Export: npm run budget-holders:export -- [--from-db] [--out tmp/budget-holders-latest.json]'
    );
    console.log('Import preview: npm run budget-holders:import -- FILE.json');
    console.log(
      'Import and back up: npm run budget-holders:import -- FILE.json --apply'
    );
    console.log(
      'Exports contain raw source data only. Imports preserve this database’s selections and defaults.'
    );
    return;
  }
  if (command === 'export' && positionals.length)
    throw fail('Use --out to choose the export file.');
  if (
    command === 'import' &&
    (positionals.length !== 1 || (values.apply && values['dry-run']))
  )
    throw fail(
      'Specify one snapshot file and choose preview (default) or --apply.'
    );
  const config = require('../config');
  if (command === 'export') {
    if (config.lookupBudget.fixture)
      throw fail(
        'Cannot export fictional fixture data as an intranet snapshot.'
      );
    let snapshot;
    if (values['from-db']) {
      const state = await readDirectory(config);
      if (!state.lastSuccess || state.lastSuccess.source === 'fixture')
        throw fail(
          'This database has no successful real source refresh to export.'
        );
      snapshot = createSnapshot(
        state.holders,
        state.lastSuccess.fetchedAt || state.lastSuccess.at
      );
    } else {
      if (config.lookupBudget.url !== SOURCE_URL)
        throw fail(
          'Use the confirmed NBI cost-centres source URL to export a snapshot.'
        );
      const holders = await require('../lib/budgetHolderSource').fetchHolders();
      snapshot = createSnapshot(holders, Date.now());
    }
    const filename = path.resolve(
      values.out || 'tmp/budget-holders-latest.json'
    );
    await writeJson(filename, snapshot);
    console.log(
      `Exported ${snapshot.holders.length} holders; source fetched ${snapshot.fetchedAt}.`
    );
    console.log(`File: ${filename}`);
    console.log(
      'No display settings or credentials included. No database changes or emails.'
    );
    return;
  }

  const snapshot = await readSnapshot(path.resolve(positionals[0]));
  const state = await readDirectory(config);
  const plan = planImport(
    state,
    snapshot,
    config.budgetHolderRefresh.maxRemovalFraction
  );
  console.log(
    `Database: ${config.dbName} on ${config.dbHost}:${config.dbPort}`
  );
  console.log(
    `Source fetched: ${snapshot.fetchedAt}; ${snapshot.holders.length} holders.`
  );
  if (plan.skipped) {
    console.log(
      'Already imported. No changes; refresh dates and reminder history retained.'
    );
    return;
  }
  console.log(
    `${plan.counts.added} added, ${plan.counts.removed} removed, ${plan.counts.updated} updated. Saved choices and institute defaults preserved.`
  );
  if (!values.apply) {
    console.log(
      'Preview only: no database changes, intranet requests or emails. Add --apply to import.'
    );
    return;
  }
  const backup = path.resolve(
    'tmp',
    `budget-holders-before-import-${Date.now()}-${randomUUID()}.json`
  );
  await writeJson(backup, state);
  console.log(`Backup: ${backup}`);
  // Schema creation/migration is only permitted after the explicit --apply.
  const service = require('../lib/budgetHolderService');
  const thinky = require('../lib/thinky');
  try {
    await thinky.ready();
    const result = await service.importSnapshot(snapshot, {
      actor: os.userInfo().username,
      expectedRevision: state.revision,
    });
    console.log(
      result.skipped
        ? 'Already imported. No changes.'
        : 'Import recorded on /budget. No intranet requests or emails.'
    );
  } finally {
    await thinky.r.getPoolMaster().drain();
  }
}

if (require.main === module) {
  main().catch(function (error) {
    // Do not dump database errors, documents or Axios request credentials.
    console.error(
      error.status || error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
        ? error.message
        : 'Snapshot command failed. Check the file, database connection and source access. Existing data was retained.'
    );
    process.exitCode = 1;
  });
}

module.exports = { main, readDirectory, readSnapshot, writeJson };
