const { expect } = require('chai');
const cheerio = require('cheerio');
const { signedInAgent } = require('../helpers/agent');
const testDb = require('../helpers/testDb');
const store = require('../../lib/budgetHolderStore');
const Order = require('../../models/order');

describe('Budget-holder selection at checkout', function () {
  this.timeout(30000);
  let agent;

  beforeEach(async function () {
    const ids = await testDb.reset();
    agent = await signedInAgent('testuser');
    // The local login normally creates TSL users. Exercise real paid-order
    // validation by giving this isolated session a non-TSL company.
    await testDb.r
      .table('sessions')
      .update({
        session: { passport: { user: { company: 'JIC' } } },
      })
      .run();
    await agent.post('/cart/add').type('form').send({ typeID: ids.type1 });
    await store.change(function (state) {
      state.holders = [
        {
          id: 'alice:TSL',
          username: 'alice',
          description: 'Alice Example (TSL)',
          institute: 'TSL',
          enabled: true,
        },
        {
          id: 'bob:TSL',
          username: 'bob',
          description: 'Bob Example (TSL)',
          institute: 'TSL',
          enabled: false,
        },
        {
          id: 'chris:JIC',
          username: 'chris',
          description: 'Chris Example (JIC)',
          institute: 'JIC',
          enabled: true,
        },
        {
          id: 'dana:EI',
          username: 'dana',
          description: 'Dana Example (EI)',
          institute: 'EI',
          enabled: false,
        },
      ];
      state.institutes = [
        { name: 'EI', defaultEnabled: true },
        { name: 'TEST', defaultEnabled: true },
        { name: 'JIC', defaultEnabled: false },
        { name: 'TSL', defaultEnabled: true },
      ];
      return state;
    });
  });

  it('offers only institutes with enabled holders, including individual exceptions', async function () {
    const response = await agent.get('/cart');
    expect(response.status).to.equal(200);
    const $ = cheerio.load(response.text);
    expect(
      $('#budgetInstitute option')
        .map(function () {
          return $(this).attr('value');
        })
        .get()
    ).to.deep.equal(['', 'TSL', 'JIC']);
    const options = $('#budget-holder-options').contents().find('option');
    expect(
      options
        .map(function () {
          return $(this).attr('value');
        })
        .get()
    ).to.deep.equal(['alice', 'chris']);
    expect($('#budgetInstitute').attr('required')).to.not.equal(undefined);
    expect($('#signatory').attr('disabled')).to.not.equal(undefined);
    expect($('#placeOrderButton').attr('disabled')).to.not.equal(undefined);
  });

  it('explains when no enabled budget holders are available', async function () {
    await store.change(function (state) {
      state.holders.forEach(function (holder) {
        holder.enabled = false;
      });
      return state;
    });
    const response = await agent.get('/cart');
    const $ = cheerio.load(response.text);
    expect($('#budgetInstitute option')).to.have.lengthOf(1);
    expect(response.text).to.include('No budget holders are currently enabled');
    expect($('#placeOrderButton').attr('disabled')).to.not.equal(undefined);
  });

  for (const [description, selection, message] of [
    [
      'missing institute',
      { signatory: 'alice' },
      'Institute selection is required',
    ],
    [
      'missing holder',
      { budgetInstitute: 'TSL' },
      'Budget holder selection is required',
    ],
    ['both missing', {}, 'Institute selection is required'],
    [
      'wrong institute',
      { budgetInstitute: 'JIC', signatory: 'alice' },
      'Select an enabled budget holder',
    ],
    [
      'unknown institute',
      { budgetInstitute: 'FAKE', signatory: 'alice' },
      'Select an enabled budget holder',
    ],
    [
      'disabled holder',
      { budgetInstitute: 'TSL', signatory: 'bob' },
      'Select an enabled budget holder',
    ],
    [
      'removed holder',
      { budgetInstitute: 'TSL', signatory: 'gone' },
      'Select an enabled budget holder',
    ],
  ]) {
    it(`rejects ${description} without placing an order`, async function () {
      const response = await agent
        .post('/cart/order')
        .type('form')
        .send({ costCode: '12345-678-9', ...selection });
      expect(response.status).to.equal(302);
      expect(response.headers.location).to.equal('/cart');
      expect(
        await Order.filter({ username: 'testuser' }).run()
      ).to.have.lengthOf(0);
      expect((await agent.get('/cart')).text).to.include(message);
    });
  }

  it('rechecks availability when it changes after the cart was loaded', async function () {
    await agent.get('/cart');
    await store.change(function (state) {
      state.holders[0].enabled = false;
      return state;
    });
    const response = await agent.post('/cart/order').type('form').send({
      costCode: '12345-678-9',
      budgetInstitute: 'TSL',
      signatory: 'alice',
    });
    expect(response.headers.location).to.equal('/cart');
    expect(await Order.filter({ username: 'testuser' }).run()).to.have.lengthOf(
      0
    );
  });

  it('places an order with an enabled holder in the chosen institute', async function () {
    const response = await agent.post('/cart/order').type('form').send({
      costCode: '12345-678-9',
      budgetInstitute: 'JIC',
      signatory: 'chris',
    });
    expect(response.status).to.equal(302);
    expect(response.headers.location).to.match(/^\/cart\?orderId=/);
    const orders = await Order.filter({ username: 'testuser' }).run();
    expect(orders).to.have.lengthOf(1);
    expect(orders[0].signatory).to.equal('chris');
    expect(Number(orders[0].totalCost)).to.be.greaterThan(0);
  });
});
