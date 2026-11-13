const { expect } = require('chai');
const {
  resolveBudgetHolderSettings,
} = require('../../lib/budgetHolderSettings');
const { usernameHint, main } = require('../../scripts/checkBudgetHolderSource');

describe('Budget-holder credentials and diagnostic settings', function () {
  it('keeps existing header configuration compatible', function () {
    const settings = resolveBudgetHolderSettings(
      {
        url: 'https://intranet.example/list',
        headers: { authorization: 'Basic old', cookie: 'old-cookie' },
      },
      {}
    );
    expect(settings.headers).to.deep.equal({
      authorization: 'Basic old',
      cookie: 'old-cookie',
    });
    expect(settings.fixture).to.equal('');
    expect(settings.proxyMode).to.equal('auto');
  });

  it('allows fresh credentials and URL/proxy overrides without modifying the original config', function () {
    const original = {
      url: 'https://old.example',
      username: 'old',
      password: 'old-password',
      headers: { cookie: 'old-cookie' },
    };
    const settings = resolveBudgetHolderSettings(original, {
      BUDGET_HOLDER_URL: 'https://intranet.example/list',
      BUDGET_HOLDER_USERNAME: 'service-user',
      BUDGET_HOLDER_PASSWORD: 'new-password',
      BUDGET_HOLDER_PROXY_MODE: 'direct',
      BUDGET_HOLDER_COOKIE: '',
      BUDGET_HOLDER_CREDENTIALS_FILE: '/private/budget.age',
      BUDGET_HOLDER_IDENTITY_FILE: '/private/key',
    });
    expect(settings).to.include({
      url: 'https://intranet.example/list',
      username: 'service-user',
      password: 'new-password',
      proxyMode: 'direct',
      credentialsFile: '/private/budget.age',
      identityFile: '/private/key',
    });
    expect(settings.headers.cookie).to.equal('');
    expect(original.password).to.equal('old-password');
  });

  it('requires fixture selection from the environment, never a saved config value', function () {
    expect(
      resolveBudgetHolderSettings({ fixture: 'before' }, {}).fixture
    ).to.equal('');
    expect(
      resolveBudgetHolderSettings({}, { BUDGET_HOLDER_FIXTURE: 'after' })
        .fixture
    ).to.equal('after');
  });

  it('derives a username hint without displaying or returning its password', function () {
    expect(
      usernameHint({
        headers: {
          authorization: `Basic ${Buffer.from('deeks:hidden-secret').toString('base64')}`,
        },
      })
    ).to.equal('deeks');
    expect(
      usernameHint({ headers: { authorization: 'Bearer anything' } })
    ).to.equal('');
  });

  it('does not save credentials without an explicit interactive prompt', async function () {
    let error;
    try {
      await main(['--save']);
    } catch (caught) {
      error = caught;
    }
    expect(error.message).to.equal('--save requires --prompt.');
  });
});
