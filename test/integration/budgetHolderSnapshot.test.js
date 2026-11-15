const { expect } = require('chai');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const testDb = require('../helpers/testDb');
const store = require('../../lib/budgetHolderStore');
const { initialState } = require('../../lib/budgetHolderState');
const { createSnapshot } = require('../../lib/budgetHolderSnapshot');
const { signedInAgent } = require('../helpers/agent');

const execute = promisify(execFile);
const script = path.resolve(__dirname, '../../scripts/budgetHolderSnapshot.js');

describe('Budget-holder snapshot CLI with an isolated database', function () {
  let temporary;
  let filename;
  async function command(args) {
    return execute(process.execPath, [script, ...args], {
      cwd: temporary,
      env: {
        ...process.env,
        BUDGET_HOLDER_FIXTURE: '',
        BUDGET_HOLDER_REFRESH_ENABLED: 'false',
        BUDGET_HOLDER_NOTIFICATIONS_ENABLED: 'false',
      },
      timeout: 15000,
    });
  }
  beforeEach(async function () {
    await testDb.reset();
    temporary = await fs.mkdtemp(
      path.resolve(__dirname, '../.tmp/budget-snapshot-')
    );
    filename = path.join(temporary, 'snapshot.json');
  });
  afterEach(async function () {
    await fs.rm(temporary, { recursive: true, force: true });
  });

  it('exports the whole saved source without changing the directory or including settings', async function () {
    await store.read();
    const fetchedAt = Date.now() - 3600000;
    const before = await store.change(function (state) {
      state.holders[0].enabled = false;
      state.lastSuccess = { at: fetchedAt, source: 'intranet' };
      return state;
    });
    await command(['export', '--from-db', '--out', filename]);
    const snapshot = JSON.parse(await fs.readFile(filename, 'utf8'));
    expect(snapshot.holders.length).to.equal(before.holders.length);
    expect(snapshot.fetchedAt).to.equal(new Date(fetchedAt).toISOString());
    expect(snapshot.holders[0]).to.have.all.keys(
      'username',
      'description',
      'institute'
    );
    expect((await fs.stat(filename)).mode & 0o777).to.equal(0o600);
    expect(await store.read()).to.deep.equal(before);
  });

  it('previews without migrating legacy data, then backs up and imports only with --apply', async function () {
    const legacy = await testDb.r.table('BudgetHolder').run();
    const initial = initialState(legacy);
    const fetchedAt = Date.now() - 3600000;
    const snapshot = createSnapshot(
      [
        ...initial.holders,
        {
          username: 'arriving',
          description: 'New Arrival (JIC)',
          institute: 'JIC',
        },
      ],
      fetchedAt
    );
    await fs.writeFile(filename, JSON.stringify(snapshot));
    const preview = await command(['import', filename]);
    expect(preview.stdout).to.include('Preview only');
    expect(
      await testDb.r.table('BudgetHolderDirectory').get('current').run()
    ).to.equal(null);
    expect(await testDb.r.table('BudgetHolder').run()).to.deep.equal(legacy);
    const applied = await command(['import', filename, '--apply']);
    expect(applied.stdout).to.include('Import recorded');
    const state = await store.read();
    expect(state.lastSuccess.fetchedAt).to.equal(fetchedAt);
    expect(state.lastSuccess.source).to.equal('snapshot');
    expect(
      state.holders.find(function (h) {
        return h.username === 'arriving';
      }).enabled
    ).to.equal(false);
    for (const holder of initial.holders) {
      expect(
        state.holders.find(function (h) {
          return h.id === holder.id;
        }).enabled
      ).to.equal(holder.enabled);
    }
    const backup = applied.stdout.match(/Backup: (.+)/)[1];
    expect((await fs.stat(backup)).mode & 0o777).to.equal(0o600);
    expect(JSON.parse(await fs.readFile(backup, 'utf8')).holders).to.deep.equal(
      initial.holders
    );
    const repeated = await command(['import', filename, '--apply']);
    expect(repeated.stdout).to.include('Already imported');
    expect(await store.read()).to.deep.equal(state);
    const agent = await signedInAgent('deeks');
    const page = await agent.get('/budget');
    expect(page.status).to.equal(200);
    expect(page.text).to.include('Imported snapshot');
    expect(page.text).to.include('Source fetched from intranet');
  });

  it('refuses invalid input before touching the database', async function () {
    await fs.writeFile(filename, '{invalid');
    let failed;
    try {
      await command(['import', filename, '--apply']);
    } catch (error) {
      failed = error;
    }
    expect(failed.code).to.equal(1);
    expect(failed.stderr).to.include('not valid JSON');
    expect(
      await testDb.r.table('BudgetHolderDirectory').get('current').run()
    ).to.equal(null);
  });
});
