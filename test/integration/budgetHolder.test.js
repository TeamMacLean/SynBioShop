const { expect } = require('chai');
const sinon = require('sinon');
const testDb = require('../helpers/testDb');
const store = require('../../lib/budgetHolderStore');
const service = require('../../lib/budgetHolderService');
const source = require('../../lib/budgetHolderSource');
const email = require('../../lib/email');
const config = require('../../config');
const helpers = require('../../config/budgetHolders');

function selection(state) {
  return {
    revision: state.catalogRevision,
    holders: state.holders.map(function (holder) {
      return { id: holder.id, enabled: holder.enabled };
    }),
    institutes: state.institutes.map(function (institute) {
      return { ...institute };
    }),
    bulkInstitutes: [],
  };
}

function incoming(state) {
  return state.holders.map(function (holder) {
    return {
      username: holder.username,
      description: holder.description,
      institute: holder.institute,
    };
  });
}

describe('Budget-holder directory and refresh integration', function () {
  beforeEach(async function () {
    await testDb.reset();
    email.clearOutbox();
    sinon.stub(config.budgetHolderRefresh, 'enabled').value(true);
    sinon.stub(config.budgetHolderRefresh, 'notificationsEnabled').value(true);
  });
  afterEach(function () {
    sinon.restore();
  });

  it('deduplicates legacy memberships before their first migration', async function () {
    const [holder] = await testDb.r.table('BudgetHolder').run();
    await testDb.r
      .table('BudgetHolder')
      .insert({
        ...holder,
        id: 'duplicate-legacy-holder',
        enabled: false,
      })
      .run();
    const state = await store.read();
    expect(state.holders).to.have.lengthOf(2);
    expect(
      state.holders.find(function (item) {
        return item.username === holder.username;
      }).enabled
    ).to.equal(false);
    expect(state.institutes[0].defaultEnabled).to.equal(false);
  });

  it('repairs stored duplicates once under concurrent reads and preserves saved settings', async function () {
    const original = await store.read();
    original.holders.push({ ...original.holders[0], enabled: false });
    original.failures.push({
      at: Date.now(),
      trigger: 'manual',
      actor: 'deeks',
      error: 'Network unavailable',
    });
    await testDb.r
      .table('BudgetHolderDirectory')
      .get('current')
      .replace(original)
      .run();
    const [first, second] = await Promise.all([store.read(), store.read()]);
    expect(first.holders).to.have.lengthOf(2);
    expect(first).to.deep.equal(second);
    expect(first.revision).to.equal(original.revision + 1);
    expect(first.catalogRevision).to.equal(original.catalogRevision + 1);
    expect(first.holders[0].enabled).to.equal(false);
    expect(first.holders[1]).to.deep.equal(original.holders[1]);
    expect(first.institutes).to.deep.equal(original.institutes);
    expect(first.failures).to.deep.equal(original.failures);
    expect(first.activatedAt).to.equal(original.activatedAt);
    expect(first.nextRefreshAt).to.equal(original.nextRefreshAt);
    expect(await store.read()).to.deep.equal(first);

    let failure;
    try {
      await service.saveSelections(selection(original));
    } catch (error) {
      failure = error;
    }
    expect(failure.status).to.equal(409);
    expect(await store.read()).to.deep.equal(first);
  });

  it('reconciles before/after HTML fixtures and a repeat refresh with persisted choices', async function () {
    await store.change(function (state) {
      state.holders = [];
      state.institutes = [];
      return state;
    });
    const fixtureSetting = sinon.stub(config.lookupBudget, 'fixture');
    fixtureSetting.value('before');
    expect(
      (await service.run({ trigger: 'manual', actor: 'deeks' })).counts
    ).to.deep.equal({ added: 8, removed: 0, updated: 0 });
    const changes = selection(await store.read());
    changes.institutes.find(function (item) {
      return item.name === 'TSL';
    }).defaultEnabled = true;
    changes.holders.find(function (item) {
      return item.id === 'tsl_keep:TSL';
    }).enabled = true;
    changes.holders.find(function (item) {
      return item.id === 'jic_keep:JIC';
    }).enabled = true;
    await service.saveSelections(changes);
    fixtureSetting.value('after');
    const result = await service.run({ trigger: 'manual', actor: 'deeks' });
    expect(result.counts).to.deep.equal({ added: 4, removed: 2, updated: 1 });
    const after = await store.read();
    const holders = new Map(
      after.holders.map(function (holder) {
        return [holder.id, holder];
      })
    );
    expect(holders.size).to.equal(10);
    expect(holders.get('tsl_block:TSL').enabled).to.equal(false);
    expect(holders.get('jic_keep:JIC').enabled).to.equal(true);
    expect(holders.get('jic_move:TSL').enabled).to.equal(true);
    expect(holders.has('jic_move:JIC')).to.equal(false);
    expect(holders.has('jic_depart:JIC')).to.equal(false);
    expect(holders.get('tsl_new:TSL').enabled).to.equal(true);
    expect(holders.get('jic_new:JIC').enabled).to.equal(false);
    expect(holders.get('qibx_new:QIBX').enabled).to.equal(false);
    expect((await service.run({ trigger: 'manual' })).counts).to.deep.equal({
      added: 0,
      removed: 0,
      updated: 0,
    });
    fixtureSetting.value('before');
    expect((await service.run({ trigger: 'manual' })).counts).to.deep.equal({
      added: 2,
      removed: 4,
      updated: 1,
    });
    const returned = (await store.read()).holders.find(function (holder) {
      return holder.id === 'jic_move:JIC';
    });
    expect(returned.enabled).to.equal(false);
  });

  it('migrates the existing table exactly once, with existing holders enabled', async function () {
    const [one, two] = await Promise.all([store.read(), store.read()]);
    expect(one).to.deep.equal(two);
    expect(one.holders).to.have.lengthOf(2);
    expect(
      one.holders.every(function (holder) {
        return holder.enabled;
      })
    ).to.equal(true);
    await testDb.r.table('BudgetHolder').delete().run();
    expect((await store.read()).holders).to.have.lengthOf(2);
  });

  it('excludes disabled holders from both checkout options and server validation', async function () {
    const payload = selection(await store.read());
    payload.holders[0].enabled = false;
    await service.saveSelections(payload);
    const state = await store.read();
    const disabled = state.holders.find(function (holder) {
      return !holder.enabled;
    });
    expect(await helpers.isValidBudgetHolder(disabled.username)).to.equal(
      false
    );
    expect(await helpers.getBudgetHoldersForSelect()).to.have.lengthOf(1);
    expect(await helpers.getBudgetHolderName(disabled.username)).to.equal(
      disabled.description
    );
  });

  it('rejects stale saves and incomplete payloads without any partial writes', async function () {
    const payload = selection(await store.read());
    const stale = structuredClone(payload);
    payload.holders[0].enabled = false;
    await service.saveSelections(payload);
    const before = await store.read();
    stale.holders[1].enabled = false;
    let failure;
    try {
      await service.saveSelections(stale);
    } catch (error) {
      failure = error;
    }
    expect(failure.status).to.equal(409);
    const missing = selection(before);
    missing.holders.pop();
    try {
      await service.saveSelections(missing);
    } catch (error) {
      failure = error;
    }
    expect(failure.status).to.equal(400);
    expect(await store.read()).to.deep.equal(before);
  });

  it('allows only one of two simultaneous saves of the same version', async function () {
    const first = selection(await store.read());
    const second = structuredClone(first);
    first.holders[0].enabled = false;
    second.holders[1].enabled = false;
    const results = await Promise.allSettled([
      service.saveSelections(first),
      service.saveSelections(second),
    ]);
    expect(
      results.filter(function (result) {
        return result.status === 'fulfilled';
      })
    ).to.have.lengthOf(1);
    expect(
      (await store.read()).holders.filter(function (holder) {
        return !holder.enabled;
      })
    ).to.have.lengthOf(1);
  });

  it('counts whole institutes without also counting their holders', async function () {
    const payload = selection(await store.read());
    payload.holders.forEach(function (holder) {
      holder.enabled = false;
    });
    payload.institutes[0].defaultEnabled = false;
    payload.bulkInstitutes = [payload.institutes[0].name];
    const summary = await service.saveSelections(payload);
    expect(summary).to.deep.equal({
      categories: 1,
      entries: 0,
      instituteDefaults: 0,
    });
    expect(service.saveMessage(summary)).to.equal('1 institute updated.');
  });

  it('preserves a checkbox save made while the intranet request is in flight', async function () {
    const original = await store.read();
    let release;
    let entered;
    const started = new Promise(function (resolve) {
      entered = resolve;
    });
    sinon.stub(source, 'fetchHolders').callsFake(function () {
      entered();
      return new Promise(function (resolve) {
        release = resolve;
      });
    });
    const refresh = service.run({ trigger: 'manual', actor: 'deeks' });
    await started;
    const payload = selection(await store.read());
    payload.holders[0].enabled = false;
    payload.institutes[0].defaultEnabled = false;
    await service.saveSelections(payload);
    release([
      ...incoming(original),
      {
        username: 'newholder',
        description: 'NEW Holder [Fixtures]',
        institute: 'Unknown',
      },
    ]);
    expect((await refresh).success).to.equal(true);
    const state = await store.read();
    expect(
      state.holders.find(function (holder) {
        return holder.id === payload.holders[0].id;
      }).enabled
    ).to.equal(false);
    expect(
      state.holders.find(function (holder) {
        return holder.username === 'newholder';
      }).enabled
    ).to.equal(false);
  });

  it('prevents overlapping refreshes', async function () {
    await store.read();
    let release;
    let entered;
    const started = new Promise(function (resolve) {
      entered = resolve;
    });
    const stub = sinon.stub(source, 'fetchHolders').callsFake(function () {
      entered();
      return new Promise(function (resolve) {
        release = resolve;
      });
    });
    const first = service.run({ trigger: 'manual' });
    await started;
    let error;
    try {
      await service.run({ trigger: 'manual' });
    } catch (caught) {
      error = caught;
    }
    expect(error.status).to.equal(409);
    release(incoming(await store.read()));
    await first;
    expect(stub.callCount).to.equal(1);
  });

  it('records every failed attempt and leaves data and choices intact', async function () {
    const before = await store.read();
    sinon
      .stub(source, 'fetchHolders')
      .rejects(
        new Error(
          'Intranet request returned HTTP 401. Check the URL and authentication.'
        )
      );
    await service.run({ trigger: 'manual', actor: 'deeks' });
    await service.run({ trigger: 'manual', actor: 'deeks' });
    const after = await store.read();
    expect(after.holders).to.deep.equal(before.holders);
    expect(after.catalogRevision).to.equal(before.catalogRevision);
    expect(after.failures).to.have.lengthOf(2);
    expect(after.failures[0]).to.include({ trigger: 'manual', actor: 'deeks' });
    expect(after.lastSuccess).to.equal(null);
  });

  it('clears the failure display and alert cycle only after a successful refresh', async function () {
    const original = await store.read();
    await store.change(function (state) {
      state.failures = [{ at: Date.now(), error: 'Previous failure' }];
      state.lastAlertAt = Date.now();
      return state;
    });
    sinon.stub(source, 'fetchHolders').resolves(incoming(original));
    await service.run({ trigger: 'manual', actor: 'deeks' });
    const after = await store.read();
    expect(after.failures).to.deep.equal([]);
    expect(after.lastSuccess.actor).to.equal('deeks');
    expect(after.lastAlertAt).to.equal(null);
  });

  it('sends the first overdue email at three months and monthly chasers, never per attempt', async function () {
    const start = Date.UTC(2026, 0, 1);
    await store.read();
    await store.change(function (state) {
      state.activatedAt = start;
      state.nextRefreshAt = start;
      return state;
    });
    sinon
      .stub(source, 'fetchHolders')
      .rejects(new Error('Could not reach the intranet within 20 seconds.'));
    await service.run({
      clock: function () {
        return Date.UTC(2026, 2, 31);
      },
    });
    expect(email.outbox).to.have.lengthOf(0);
    await service.run({
      clock: function () {
        return Date.UTC(2026, 3, 1, 3);
      },
    });
    expect(email.outbox).to.have.lengthOf(1);
    expect(email.outbox[0].to).to.equal('deeks@nbi.ac.uk');
    await service.run({
      trigger: 'manual',
      clock: function () {
        return Date.UTC(2026, 3, 2);
      },
    });
    expect(email.outbox).to.have.lengthOf(1);
    await service.run({
      clock: function () {
        return Date.UTC(2026, 4, 1, 3);
      },
    });
    expect(email.outbox).to.have.lengthOf(2);
  });

  it('records email failures and retries delivery after 24 hours', async function () {
    const now = Date.UTC(2026, 5, 1);
    await store.read();
    await store.change(function (state) {
      state.activatedAt = Date.UTC(2026, 0, 1);
      state.nextRefreshAt = Date.UTC(2026, 6, 1);
      state.failures = [{ at: now, error: 'Intranet unavailable' }];
      return state;
    });
    const send = sinon
      .stub(email, 'sendEmail')
      .rejects(new Error('SMTP failed'));
    await service.run({
      clock: function () {
        return now;
      },
    });
    await service.run({
      clock: function () {
        return now + 3600000;
      },
    });
    expect(send.callCount).to.equal(1);
    send.resolves();
    await service.run({
      clock: function () {
        return now + 86400000;
      },
    });
    expect(send.callCount).to.equal(2);
    expect((await store.read()).alertError).to.equal(null);
  });

  it('keeps the monthly due date across restarts and manual refreshes', async function () {
    const original = await store.read();
    const stub = sinon
      .stub(source, 'fetchHolders')
      .resolves(incoming(original));
    const next = Date.UTC(2027, 0, 1, 3);
    await store.change(function (state) {
      state.nextRefreshAt = next;
      return state;
    });
    await service.run({
      clock: function () {
        return next - 86400000;
      },
    });
    expect(stub.callCount).to.equal(0);
    await service.run({
      trigger: 'manual',
      clock: function () {
        return next - 86400000;
      },
    });
    expect((await store.read()).nextRefreshAt).to.equal(next);
    await service.run({
      clock: function () {
        return next;
      },
    });
    expect((await store.read()).nextRefreshAt).to.equal(
      Date.UTC(2027, 1, 1, 3)
    );
  });

  it('recovers an expired refresh lease and records the interrupted attempt', async function () {
    const now = Date.now();
    await store.read();
    await store.change(function (state) {
      state.lease = {
        token: 'dead-worker',
        expiresAt: now - 1,
        attempt: {
          startedAt: now - 3600000,
          trigger: 'manual',
          actor: 'deeks',
        },
      };
      return state;
    });
    sinon
      .stub(source, 'fetchHolders')
      .rejects(new Error('Intranet request returned HTTP 401.'));
    await service.run({ trigger: 'manual' });
    const state = await store.read();
    expect(state.failures).to.have.lengthOf(2);
    expect(state.failures[0].error).to.include('interrupted');
    expect(state.lease).to.equal(null);
  });

  it('never starts an automatic scheduler in tests', function () {
    const interval = sinon.spy(global, 'setInterval');
    service.startScheduler()();
    expect(interval.called).to.equal(false);
  });
});
