const assert = require('node:assert/strict');
const sinon = require('sinon');
const { chromium } = require('playwright');
const { getApp } = require('../helpers/agent');
const testDb = require('../helpers/testDb');
const thinky = require('../../lib/thinky');
const store = require('../../lib/budgetHolderStore');
const source = require('../../lib/budgetHolderSource');

describe('Budget-holder drawers in the browser', function () {
  this.timeout(30000);
  let browser;
  let context;
  let page;
  let server;
  let baseURL;
  let startedServer = false;

  before(async function () {
    server = getApp();
    await thinky.ready();
    if (!server.listening) {
      await new Promise(function (resolve) {
        server.listen(0, '127.0.0.1', resolve);
      });
      startedServer = true;
    }
    baseURL = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(
      process.env.PLAYWRIGHT_CHANNEL
        ? { channel: process.env.PLAYWRIGHT_CHANNEL }
        : {}
    );
  });

  after(async function () {
    if (browser) await browser.close();
    if (startedServer && server.listening)
      await new Promise(function (resolve) {
        server.close(resolve);
      });
  });

  beforeEach(async function () {
    await testDb.reset();
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
          enabled: false,
        },
      ];
      state.institutes = [
        { name: 'JIC', defaultEnabled: false },
        { name: 'TSL', defaultEnabled: true },
      ];
      return state;
    });
    context = await browser.newContext();
    await context.route('**/*', function (route) {
      return new URL(route.request().url()).origin === baseURL
        ? route.continue()
        : route.abort();
    });
    page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`${baseURL}/signin`);
    await page.getByLabel(/Username/).fill('deeks');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await Promise.all([
      page.waitForURL(`${baseURL}/`),
      page.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ]);
    await page.goto(`${baseURL}/budget`);
  });

  afterEach(async function () {
    if (context) await context.close();
    sinon.restore();
  });

  function tsl() {
    return page.locator('[data-institute="TSL"]');
  }

  async function openPricedCart() {
    const csrf = await page
      .locator('#budget-selections input[name="_csrf"]')
      .inputValue();
    const response = await page.request.post(`${baseURL}/cart/add`, {
      form: { typeID: testDb.IDS.type1, _csrf: csrf },
    });
    assert.equal(response.ok(), true);
    await page.goto(`${baseURL}/cart?adminForceShowPricing=true`);
    await page.locator('#budgetInstitute').waitFor();
  }

  it('filters checkout holders by institute and requires both selections', async function () {
    await store.change(function (state) {
      state.holders.find(function (holder) {
        return holder.username === 'chris';
      }).enabled = true;
      state.institutes.push({ name: 'TEST', defaultEnabled: true });
      return state;
    });
    await openPricedCart();
    const institute = page.locator('#budgetInstitute');
    const holder = page.locator('#signatory');
    const order = page.locator('#placeOrderButton');
    assert.deepEqual(
      await institute.locator('option').evaluateAll(function (options) {
        return options.map(function (option) {
          return option.value;
        });
      }),
      ['', 'TSL', 'JIC']
    );
    assert.equal(await holder.isDisabled(), true);
    assert.equal(await order.isDisabled(), true);

    await institute.selectOption('TSL');
    assert.equal(await holder.isEnabled(), true);
    assert.equal(await order.isDisabled(), true);
    assert.deepEqual(
      await holder.locator('option').evaluateAll(function (options) {
        return options.map(function (option) {
          return option.value;
        });
      }),
      ['', 'alice']
    );
    await holder.selectOption('alice');
    assert.equal(await order.isEnabled(), true);

    // JIC defaults to disabled, but Chris is an enabled exception.
    await institute.selectOption('JIC');
    assert.equal(await holder.inputValue(), '');
    assert.equal(await order.isDisabled(), true);
    assert.deepEqual(
      await holder.locator('option').evaluateAll(function (options) {
        return options.map(function (option) {
          return option.value;
        });
      }),
      ['', 'chris']
    );
    await holder.selectOption('chris');
    assert.equal(await order.isEnabled(), true);
    await holder.selectOption('');
    assert.equal(await order.isDisabled(), true);
    await institute.selectOption('');
    assert.equal(await holder.isDisabled(), true);
    assert.equal(await order.isDisabled(), true);
  });

  it('keeps checkout disabled when no budget holders are enabled', async function () {
    await store.change(function (state) {
      state.holders.forEach(function (holder) {
        holder.enabled = false;
      });
      return state;
    });
    await openPricedCart();
    assert.equal(await page.locator('#budgetInstitute option').count(), 1);
    assert.equal(await page.locator('#signatory').isDisabled(), true);
    assert.equal(await page.locator('#placeOrderButton').isDisabled(), true);
    assert.equal(
      await page
        .getByText(/No budget holders are currently enabled/)
        .isVisible(),
      true
    );
  });

  it('hides empty institutes and preserves their defaults when saving', async function () {
    await store.change(function (state) {
      state.institutes.push({ name: 'TEST', defaultEnabled: true });
      return state;
    });
    await page.reload();
    assert.equal(
      await page.locator('[data-institute="TEST"]').isVisible(),
      false
    );
    await tsl()
      .getByLabel('New budget holders enabled by default', { exact: true })
      .uncheck();
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.locator('.budget-toast').waitFor();
    const state = await store.read();
    assert.equal(
      state.institutes.find(function (institute) {
        return institute.name === 'TEST';
      }).defaultEnabled,
      true
    );
  });

  it('opens a drawer with mixed selection and enables both bulk actions', async function () {
    assert.equal(
      await page
        .locator('.budget-institute')
        .first()
        .getAttribute('data-institute'),
      'TSL'
    );
    assert.equal(await tsl().locator('.budget-members').isVisible(), false);
    assert.equal(await tsl().locator('.budget-all').count(), 0);
    assert.equal(
      await tsl().locator('.budget-display-label').textContent(),
      'Displays'
    );
    assert.equal(
      await page
        .locator('[data-institute="JIC"] .budget-display-label')
        .textContent(),
      'Does not display'
    );
    assert.equal(
      await tsl()
        .getByRole('button', { name: 'Enable all', exact: true })
        .isEnabled(),
      true
    );
    assert.equal(
      await tsl()
        .getByRole('button', { name: 'Disable all', exact: true })
        .isEnabled(),
      true
    );
    await tsl().locator('.budget-disclosure').click();
    assert.equal(await tsl().locator('.budget-members').isVisible(), true);
  });

  it('cancels or confirms replacing exceptions and discards all unsaved edits', async function () {
    page.once('dialog', function (dialog) {
      void dialog.dismiss();
    });
    await tsl()
      .getByRole('button', { name: 'Disable all', exact: true })
      .click();
    assert.equal(
      await tsl().locator('.budget-holder-checkbox:checked').count(),
      1
    );
    assert.equal(await page.locator('#budget-save-footer').isVisible(), false);
    page.once('dialog', function (dialog) {
      void dialog.accept();
    });
    await tsl()
      .getByRole('button', { name: 'Disable all', exact: true })
      .click();
    assert.equal(
      await tsl().locator('.budget-holder-checkbox:checked').count(),
      0
    );
    assert.equal(await tsl().locator('.budget-default').isChecked(), false);
    assert.equal(
      await tsl().locator('.budget-display-label').textContent(),
      'Does not display'
    );
    assert.equal(await page.locator('#budget-save-footer').isVisible(), true);
    await page
      .getByRole('button', { name: 'Discard changes', exact: true })
      .click();
    assert.equal(
      await tsl().locator('.budget-holder-checkbox:checked').count(),
      1
    );
    assert.equal(await tsl().locator('.budget-default').isChecked(), true);
    assert.equal(
      await tsl().locator('.budget-display-label').textContent(),
      'Displays'
    );
    assert.equal(await page.locator('#budget-save-footer').isVisible(), false);
  });

  it('changes the arrival default without toggling current holders', async function () {
    await tsl()
      .getByLabel('New budget holders enabled by default', { exact: true })
      .uncheck();
    assert.equal(
      await tsl().locator('.budget-display-label').textContent(),
      'Displays'
    );
    assert.equal(
      await tsl().locator('.budget-holder-checkbox:checked').count(),
      1
    );
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.locator('.budget-toast').waitFor();
    assert.match(
      await page.locator('.budget-toast').textContent(),
      /1 institute default updated/
    );
    const state = await store.read();
    assert.equal(
      state.institutes.find(function (item) {
        return item.name === 'TSL';
      }).defaultEnabled,
      false
    );
    assert.equal(
      state.holders.find(function (item) {
        return item.username === 'alice';
      }).enabled,
      true
    );
  });

  it('saves individual changes and reports their count', async function () {
    await tsl().locator('.budget-disclosure').click();
    await tsl()
      .getByLabel(/Bob Example/)
      .check();
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.locator('.budget-toast').waitFor();
    assert.match(
      await page.locator('.budget-toast').textContent(),
      /1 budget holder updated/
    );
    assert.equal(
      (await store.read()).holders.find(function (item) {
        return item.username === 'bob';
      }).enabled,
      true
    );
  });

  it('counts a whole-institute save once, including its default change', async function () {
    page.once('dialog', function (dialog) {
      void dialog.accept();
    });
    await tsl()
      .getByRole('button', { name: 'Disable all', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.locator('.budget-toast').waitFor();
    assert.match(
      await page.locator('.budget-toast').textContent(),
      /^1 institute updated\.$/
    );
  });

  it('retains unsaved choices when another admin changes the saved version', async function () {
    await tsl().locator('.budget-disclosure').click();
    await tsl()
      .getByLabel(/Bob Example/)
      .check();
    await store.change(function (state) {
      state.catalogRevision++;
      return state;
    });
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page.locator('#budget-save-error').waitFor();
    assert.match(
      await page.locator('#budget-save-error').textContent(),
      /list has changed/
    );
    assert.equal(
      await tsl()
        .getByLabel(/Bob Example/)
        .isChecked(),
      true
    );
    assert.equal(
      (await store.read()).holders.find(function (item) {
        return item.username === 'bob';
      }).enabled,
      false
    );
  });

  it('warns before a refresh discards unsaved selections', async function () {
    const state = await store.read();
    const fetch = sinon.stub(source, 'fetchHolders').resolves(state.holders);
    await tsl()
      .getByLabel('New budget holders enabled by default', { exact: true })
      .uncheck();
    page.once('dialog', function (dialog) {
      void dialog.dismiss();
    });
    await page
      .getByRole('button', { name: 'Refresh now', exact: true })
      .click();
    assert.equal(fetch.called, false);
    page.once('dialog', function (dialog) {
      void dialog.accept();
    });
    await page
      .getByRole('button', { name: 'Refresh now', exact: true })
      .click();
    await page.locator('.budget-toast').waitFor();
    assert.equal(fetch.calledOnce, true);
    assert.equal(
      await tsl()
        .getByLabel('New budget holders enabled by default', { exact: true })
        .isChecked(),
      true
    );
  });
});
