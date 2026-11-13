const { expect } = require('chai');
const sinon = require('sinon');
const { signedInAgent, anonymousAgent, req } = require('../helpers/agent');
const testDb = require('../helpers/testDb');
const store = require('../../lib/budgetHolderStore');
const source = require('../../lib/budgetHolderSource');

function payload(state) {
  return {
    revision: state.catalogRevision,
    holders: state.holders.map(function (holder) {
      return { id: holder.id, enabled: holder.enabled };
    }),
    institutes: state.institutes,
  };
}

describe('Budget-holder administration HTTP routes', function () {
  let agent;
  beforeEach(async function () {
    await testDb.reset();
    agent = await signedInAgent('deeks');
  });
  afterEach(function () {
    sinon.restore();
  });

  it('renders the drawers, refresh status and selection controls', async function () {
    const response = await agent.get('/budget');
    expect(response.status).to.equal(200);
    expect(response.text).to.include('TEST Budget Holder');
    expect(response.text).to.include('New budget holders enabled by default');
    expect(response.text).to.include('Last successful refresh');
    expect(response.text).to.not.include('Add New Budget Holder');
  });

  it('removes all former manual add, edit and delete routes', async function () {
    const [holder] = await testDb.r.table('BudgetHolder').run();
    for (const [method, path] of [
      ['get', '/budget/new'],
      ['post', '/budget'],
      ['get', `/budget/${holder.id}/edit`],
      ['post', `/budget/${holder.id}`],
      ['post', `/budget/${holder.id}/delete`],
    ]) {
      const response = await agent[method](path)
        .type('form')
        .send({ username: 'newperson', description: 'New Person (TSL)' });
      expect(response.status, path).to.equal(404);
    }
    expect(await testDb.r.table('BudgetHolder').count().run()).to.equal(2);
  });

  it('saves selections and provides a counted success toast after redirect', async function () {
    const changes = payload(await store.read());
    changes.holders[0].enabled = false;
    const response = await agent
      .post('/budget/selections')
      .set('Accept', 'application/json')
      .type('form')
      .send({ selection: JSON.stringify(changes) });
    expect(response.status).to.equal(200);
    expect(response.body.redirect).to.equal('/budget');
    const page = await agent.get('/budget');
    expect(page.text).to.include('1 budget holder updated.');
  });

  it('saves an institute default after loading a directory containing duplicate legacy holders', async function () {
    const original = await store.read();
    original.holders.push({ ...original.holders[0] });
    await testDb.r
      .table('BudgetHolderDirectory')
      .get('current')
      .replace(original)
      .run();
    expect((await agent.get('/budget')).status).to.equal(200);
    const changes = payload(await store.read());
    changes.institutes[0].defaultEnabled = false;
    const response = await agent
      .post('/budget/selections')
      .set('Accept', 'application/json')
      .type('form')
      .send({ selection: JSON.stringify(changes) });
    expect(response.status).to.equal(200);
    const saved = await store.read();
    expect(saved.institutes[0].defaultEnabled).to.equal(false);
    expect(saved.holders).to.deep.equal(original.holders.slice(0, 2));
    expect((await agent.get('/budget')).text).to.include(
      '1 institute default updated.'
    );
  });

  it('returns actionable 400 and 409 errors without changing newer selections', async function () {
    const changes = payload(await store.read());
    const bad = await agent
      .post('/budget/selections')
      .type('form')
      .send({ selection: '{bad' });
    expect(bad.status).to.equal(400);
    changes.holders[0].enabled = false;
    await agent
      .post('/budget/selections')
      .type('form')
      .send({ selection: JSON.stringify(changes) });
    const stale = await agent
      .post('/budget/selections')
      .type('form')
      .send({ selection: JSON.stringify(changes) });
    expect(stale.status).to.equal(409);
    expect(stale.body.error).to.include('list has changed');
  });

  it('runs manual refresh and shows sanitised failure details', async function () {
    sinon
      .stub(source, 'fetchHolders')
      .rejects(
        new Error('Intranet request returned HTTP 401. Check authentication.')
      );
    const response = await agent.post('/budget/refresh').type('form').send({});
    expect(response.status).to.equal(302);
    const page = await agent.get('/budget');
    expect(page.text).to.include('HTTP 401');
    expect(page.text).to.include('Manual — deeks');
    expect((await store.read()).failures).to.have.lengthOf(1);
  });

  it('requires authentication and admin privileges for both mutations', async function () {
    const fetch = sinon.stub(source, 'fetchHolders');
    const nonAdmin = await signedInAgent('testuser');
    for (const path of ['/budget/selections', '/budget/refresh']) {
      expect(
        (await anonymousAgent().post(path).type('form').send({})).status
      ).to.equal(302);
      expect((await nonAdmin.post(path).type('form').send({})).status).to.equal(
        403
      );
    }
    expect(fetch.called).to.equal(false);
    expect((await nonAdmin.get('/budget')).status).to.equal(403);
  });

  it('protects the new endpoints against cross-site POSTs', async function () {
    for (const path of ['/budget/selections', '/budget/refresh']) {
      const response = await req()
        .post(path)
        .set('Origin', 'https://untrusted.example')
        .type('form')
        .send({});
      expect(response.status).to.equal(403);
    }
  });
});
