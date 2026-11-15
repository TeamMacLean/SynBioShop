const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rules = require('../../lib/budgetHolderRules');

// Isolate external boundaries only. Run the real service source and its real
// reconciliation/calendar rules without bootstrapping the database or SMTP.
function fixture() {
  const start = Date.UTC(2026, 0, 1);
  let directory = {
    id: 'current',
    revision: 0,
    catalogRevision: 0,
    holders: [
      {
        id: 'user1:TSL',
        username: 'user1',
        description: 'Person (TSL)',
        institute: 'TSL',
        enabled: false,
      },
    ],
    institutes: [{ name: 'TSL', defaultEnabled: true }],
    activatedAt: start,
    nextRefreshAt: start,
    lastSuccess: null,
    failures: [],
    lease: null,
    lastAlertAt: null,
    alertRetryAt: null,
    alertError: null,
  };
  const store = {
    read: async function () {
      return structuredClone(directory);
    },
    change: async function (transform) {
      const next = transform(structuredClone(directory));
      if (next) directory = { ...next, revision: directory.revision + 1 };
      return structuredClone(directory);
    },
    conflict: function (message) {
      return Object.assign(new Error(message), { status: 409 });
    },
  };
  const source = {
    fetchHolders: sinon.stub().resolves([
      { username: 'user1', description: 'Person (TSL)', institute: 'TSL' },
      { username: 'user2', description: 'New Person (TSL)', institute: 'TSL' },
    ]),
  };
  const email = { sendEmail: sinon.stub().resolves() };
  const config = {
    baseURL: 'https://synbio.example',
    isTest: false,
    budgetHolderRefresh: {
      enabled: true,
      notificationsEnabled: true,
      maxRemovalFraction: 0.5,
    },
  };
  const interval = sinon.stub().returns({ unref: function () {} });
  const clear = sinon.spy();
  const filename = path.resolve(__dirname, '../../lib/budgetHolderService.js');
  const dependencies = {
    '../config': config,
    './budgetHolderStore': store,
    './budgetHolderSource': source,
    './email': email,
    './budgetHolderRules': rules,
    './budgetHolderSnapshot': require('../../lib/budgetHolderSnapshot'),
  };
  const sandbox = {
    module: { exports: {} },
    URL,
    require: function (name) {
      return dependencies[name] || require(name);
    },
    console: { error: function () {} },
    setInterval: interval,
    clearInterval: clear,
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return {
    service: sandbox.module.exports,
    store,
    source,
    email,
    config,
    interval,
    clear,
    start,
  };
}

function selection(state) {
  return {
    revision: state.catalogRevision,
    holders: state.holders.map(function (holder) {
      return { id: holder.id, enabled: holder.enabled };
    }),
    institutes: state.institutes,
    bulkInstitutes: [],
  };
}

describe('Budget-holder service without network dependencies', function () {
  it('publishes a refresh, preserving exceptions and inheriting defaults', async function () {
    const { service, store, start } = fixture();
    expect(
      (
        await service.run({
          trigger: 'manual',
          actor: 'deeks',
          clock: function () {
            return start;
          },
        })
      ).success
    ).to.equal(true);
    const state = await store.read();
    expect(
      state.holders.map(function (holder) {
        return holder.enabled;
      })
    ).to.deep.equal([false, true]);
    expect(state.lastSuccess.counts).to.deep.equal({
      added: 1,
      removed: 0,
      updated: 0,
    });
    expect(state.lease).to.equal(null);
  });

  it('logs each failed attempt while retaining the last usable data', async function () {
    const { service, source, store, start } = fixture();
    const before = await store.read();
    source.fetchHolders.rejects(
      new Error('Intranet request returned HTTP 401.')
    );
    for (let i = 0; i < 2; i++)
      await service.run({
        trigger: 'manual',
        actor: 'deeks',
        clock: function () {
          return start;
        },
      });
    const state = await store.read();
    expect(state.holders).to.deep.equal(before.holders);
    expect(state.failures).to.have.lengthOf(2);
    expect(state.lease).to.equal(null);
  });

  it('does not expose arbitrary exception contents in the refresh log', async function () {
    const { service, source, store, start } = fixture();
    source.fetchHolders.rejects(new Error('Authorization: secret-value'));
    await service.run({
      trigger: 'manual',
      clock: function () {
        return start;
      },
    });
    expect(JSON.stringify((await store.read()).failures)).to.not.include(
      'secret-value'
    );
  });

  it('preserves a selection saved during a request and rejects a second refresh', async function () {
    const { service, source, store, start } = fixture();
    let release;
    let entered;
    const started = new Promise(function (resolve) {
      entered = resolve;
    });
    source.fetchHolders.callsFake(function () {
      entered();
      return new Promise(function (resolve) {
        release = resolve;
      });
    });
    const refreshing = service.run({
      trigger: 'manual',
      clock: function () {
        return start;
      },
    });
    await started;
    const choices = selection(await store.read());
    choices.holders[0].enabled = true;
    await service.saveSelections(choices);
    let error;
    try {
      await service.run({
        trigger: 'manual',
        clock: function () {
          return start;
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error.status).to.equal(409);
    release([
      {
        username: 'user1',
        description: 'Renamed Person (TSL)',
        institute: 'TSL',
      },
    ]);
    await refreshing;
    expect((await store.read()).holders[0].enabled).to.equal(true);
  });

  it('rejects old selection versions, bad booleans and duplicate entries', async function () {
    const { service, store } = fixture();
    const choices = selection(await store.read());
    choices.holders[0].enabled = true;
    await service.saveSelections(choices);
    let error;
    try {
      await service.saveSelections(choices);
    } catch (caught) {
      error = caught;
    }
    expect(error.status).to.equal(409);
    const invalid = selection(await store.read());
    invalid.holders[0].enabled = 'false';
    try {
      await service.saveSelections(invalid);
    } catch (caught) {
      error = caught;
    }
    expect(error.status).to.equal(400);
    expect((await store.read()).holders[0].enabled).to.equal(true);
  });

  it('keeps institute defaults independent of current availability', async function () {
    const { service, store } = fixture();
    const choices = selection(await store.read());
    choices.institutes[0].defaultEnabled = false;
    const summary = await service.saveSelections(choices);
    expect(summary.instituteDefaults).to.equal(1);
    expect((await store.read()).holders[0].enabled).to.equal(false);
  });

  it('counts bulk operations as institutes and mixed edits as holders/defaults', async function () {
    const { service, store } = fixture();
    const choices = selection(await store.read());
    choices.holders[0].enabled = true;
    choices.bulkInstitutes = ['TSL'];
    const summary = await service.saveSelections(choices);
    expect(service.saveMessage(summary)).to.equal('1 institute updated.');
    expect(
      service.saveMessage({ categories: 1, entries: 2, instituteDefaults: 1 })
    ).to.equal(
      '1 institute updated; 2 budget holders updated; 1 institute default updated.'
    );
  });

  it('sends after three months, chases monthly, and resets after recovery', async function () {
    const { service, source, email, store } = fixture();
    source.fetchHolders.rejects(
      new Error('Intranet request returned HTTP 503.')
    );
    for (const timestamp of [
      Date.UTC(2026, 2, 31),
      Date.UTC(2026, 3, 1),
      Date.UTC(2026, 3, 2),
      Date.UTC(2026, 4, 1),
    ]) {
      await service.run({
        trigger: 'manual',
        clock: function () {
          return timestamp;
        },
      });
    }
    expect(email.sendEmail.callCount).to.equal(2);
    expect(email.sendEmail.firstCall.args[2].to).to.equal('deeks@nbi.ac.uk');
    source.fetchHolders.resolves([
      { username: 'user1', description: 'Person (TSL)', institute: 'TSL' },
    ]);
    await service.run({
      trigger: 'manual',
      clock: function () {
        return Date.UTC(2026, 4, 2);
      },
    });
    expect((await store.read()).failures).to.deep.equal([]);
    expect((await store.read()).lastAlertAt).to.equal(null);
  });

  it('retries failed email delivery after 24 hours', async function () {
    const { service, source, email, store } = fixture();
    const now = Date.UTC(2026, 3, 1);
    source.fetchHolders.rejects(
      new Error('Intranet request returned HTTP 503.')
    );
    email.sendEmail.rejects(new Error('SMTP unavailable'));
    await service.run({
      trigger: 'manual',
      clock: function () {
        return now;
      },
    });
    await service.run({
      clock: function () {
        return now + 3600000;
      },
    });
    expect(email.sendEmail.callCount).to.equal(1);
    email.sendEmail.resolves();
    await service.run({
      clock: function () {
        return now + 86400000;
      },
    });
    expect(email.sendEmail.callCount).to.equal(2);
    expect((await store.read()).alertError).to.equal(null);
  });

  it('catches up overdue schedules, without repeating a completed monthly attempt', async function () {
    const { service, source, start } = fixture();
    await service.run({
      clock: function () {
        return start;
      },
    });
    await service.run({
      clock: function () {
        return start + 3600000;
      },
    });
    expect(source.fetchHolders.callCount).to.equal(1);
    await service.run({
      clock: function () {
        return Date.UTC(2026, 3, 15);
      },
    });
    expect(source.fetchHolders.callCount).to.equal(2);
  });

  it('does not let a fetch which outlives its lease publish changes', async function () {
    const { service, source, store, start } = fixture();
    let now = start;
    source.fetchHolders.callsFake(async function () {
      now += 6 * 60000;
      return [
        { username: 'user1', description: 'Changed (TSL)', institute: 'TSL' },
      ];
    });
    try {
      await service.run({
        trigger: 'manual',
        clock: function () {
          return now;
        },
      });
    } catch (error) {
      expect(error.status).to.equal(409);
    }
    expect((await store.read()).holders[0].description).to.equal(
      'Person (TSL)'
    );
    source.fetchHolders.rejects(
      new Error('Intranet request returned HTTP 503.')
    );
    await service.run({
      trigger: 'manual',
      clock: function () {
        return now;
      },
    });
    expect((await store.read()).failures[0].error).to.include('interrupted');
  });

  it('runs reminders without any automatic fetching, including zero failed attempts', async function () {
    const { service, config, source, email, store } = fixture();
    config.budgetHolderRefresh.enabled = false;
    await service.run({
      clock: function () {
        return Date.UTC(2026, 3, 1);
      },
    });
    expect(source.fetchHolders.called).to.equal(false);
    expect(email.sendEmail.calledOnce).to.equal(true);
    expect(email.sendEmail.firstCall.args[1].failureCount).to.equal(0);
    expect((await store.read()).holders[0].enabled).to.equal(false);
    config.budgetHolderRefresh.notificationsEnabled = false;
    await service.run({
      clock: function () {
        return Date.UTC(2026, 5, 1);
      },
    });
    expect(email.sendEmail.calledOnce).to.equal(true);
  });

  it('imports atomically without fetching or emailing and does not reset dates on replay', async function () {
    const { service, store, source, email, start } = fixture();
    const { createSnapshot } = require('../../lib/budgetHolderSnapshot');
    const snapshot = createSnapshot(
      [
        { username: 'user1', description: 'Renamed (TSL)', institute: 'TSL' },
        { username: 'new1', description: 'New (TSL)', institute: 'TSL' },
      ],
      start,
      start
    );
    const result = await service.importSnapshot(snapshot, {
      actor: 'deeks',
      expectedRevision: 0,
      clock: function () {
        return start + 1000;
      },
    });
    expect(result.success).to.equal(true);
    const state = await store.read();
    expect(
      state.holders.map(function (h) {
        return h.enabled;
      })
    ).to.deep.equal([true, false]);
    expect(state.lastSuccess).to.include({
      fetchedAt: start,
      at: start + 1000,
      actor: 'deeks',
      source: 'snapshot',
    });
    expect(
      (
        await service.importSnapshot(snapshot, {
          clock: function () {
            return start + 2000;
          },
        })
      ).skipped
    ).to.equal(true);
    expect(await store.read()).to.deep.equal(state);
    expect(source.fetchHolders.called).to.equal(false);
    expect(email.sendEmail.called).to.equal(false);
  });

  it('rejects a snapshot if the saved version changed after its backup/preview', async function () {
    const { service, store, start } = fixture();
    const snapshot = require('../../lib/budgetHolderSnapshot').createSnapshot(
      [{ username: 'user1', description: 'Person (TSL)', institute: 'TSL' }],
      start,
      start
    );
    const choices = selection(await store.read());
    choices.holders[0].enabled = true;
    await service.saveSelections(choices);
    let error;
    try {
      await service.importSnapshot(snapshot, {
        expectedRevision: 0,
        clock: function () {
          return start;
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error.status).to.equal(409);
    expect((await store.read()).holders[0].enabled).to.equal(true);
    expect((await store.read()).lastSuccess).to.equal(null);
  });

  it('starts an hourly check and cancels it at shutdown; disabled/test modes schedule nothing', function () {
    const { service, interval, clear, config } = fixture();
    const stop = service.startScheduler();
    expect(interval.firstCall.args[1]).to.equal(3600000);
    stop();
    expect(clear.calledOnce).to.equal(true);
    config.isTest = true;
    service.startScheduler()();
    config.isTest = false;
    config.budgetHolderRefresh.enabled = false;
    config.budgetHolderRefresh.notificationsEnabled = false;
    service.startScheduler()();
    expect(interval.calledOnce).to.equal(true);
  });
});
