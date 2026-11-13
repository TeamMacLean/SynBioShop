const { expect } = require('chai');
const ejs = require('ejs');
const cheerio = require('cheerio');
const less = require('less');
const fs = require('fs');
const path = require('path');
const { groupHolders } = require('../../lib/budgetHolderRules');
const { jsonForScript } = require('../../lib/sanitize');

async function render(directory) {
  return ejs.renderFile(
    path.resolve(__dirname, '../../views/budget/index.ejs'),
    {
      directory,
      institutes: groupHolders(directory),
      automaticRefresh: true,
      csrfToken: 'test-token',
      signedInUser: null,
      messages: {},
      jsonForScript,
      formatTime: function (timestamp) {
        return timestamp ? new Date(timestamp).toISOString() : 'Never';
      },
    }
  );
}

describe('Budget-holder admin templates', function () {
  it('renders institute drawers, checked defaults and enabled counts without manual CRUD controls', async function () {
    const directory = {
      holders: [
        {
          id: 'person:JIC',
          username: 'person',
          description: 'A Person (JIC)',
          institute: 'JIC',
          enabled: true,
        },
      ],
      institutes: [
        { name: 'JIC', defaultEnabled: false },
        { name: 'TSL', defaultEnabled: true },
      ],
      catalogRevision: 0,
      nextRefreshAt: Date.now(),
      lastSuccess: null,
      failures: [],
      lease: null,
    };
    const $ = cheerio.load(await render(directory));
    expect(
      $('.budget-institute')
        .map(function () {
          return $(this).attr('data-institute');
        })
        .get()
    ).to.deep.equal(['TSL', 'JIC']);
    // Empty policies stay in the save payload, but have no visible drawer.
    expect($('.budget-institute[hidden]').attr('data-institute')).to.equal(
      'TSL'
    );
    expect(
      $('.budget-institute:not([hidden])').attr('data-institute')
    ).to.equal('JIC');
    expect($('.budget-holder-checkbox:checked')).to.have.lengthOf(1);
    expect($('.budget-default:checked')).to.have.lengthOf(1);
    expect($('.budget-count').last().text()).to.equal('1 of 1 enabled');
    expect($('.budget-all')).to.have.lengthOf(0);
    expect($('[data-institute="JIC"] .budget-display-label').text()).to.equal(
      'Displays'
    );
    expect($('[data-institute="TSL"] .budget-display-label').text()).to.equal(
      'Does not display'
    );
    expect($('.budget-default-label').first().text()).to.include(
      'New budget holders enabled by default'
    );
    expect($('#budget-save-footer').attr('hidden')).to.not.equal(undefined);
    expect($('a[href="/budget/new"]')).to.have.lengthOf(0);
  });

  it('escapes intranet descriptions and recorded failure messages', async function () {
    const directory = {
      holders: [
        {
          id: 'person:TSL',
          username: 'person',
          description: '<img src=x onerror=alert(1)> (TSL)',
          institute: 'TSL',
          enabled: false,
        },
      ],
      institutes: [{ name: 'TSL', defaultEnabled: false }],
      catalogRevision: 0,
      nextRefreshAt: Date.now(),
      lastSuccess: null,
      lease: null,
      failures: [
        {
          at: Date.now(),
          trigger: 'manual',
          actor: 'deeks',
          error: '<script>alert(1)</script>',
        },
      ],
    };
    const html = await render(directory);
    expect(html).to.include('&lt;img');
    expect(html).to.include('&lt;script&gt;alert(1)');
    const $ = cheerio.load(html);
    expect($('.budget-display-label').text()).to.equal('Does not display');
    expect($('.budget-holder img')).to.have.lengthOf(0);
    expect($('.budget-failures script')).to.have.lengthOf(0);
  });

  it('compiles the stylesheet with the existing Less pipeline', async function () {
    const css = await less.render(
      fs.readFileSync(
        path.resolve(__dirname, '../../public/style/budget-holders.less'),
        'utf8'
      )
    );
    expect(css.css).to.include('.budget-save-footer');
    expect(css.css).to.include('calc((100% - 1150px) / 2)');
  });

  it('renders both overdue email formats with escaped error text', async function () {
    const data = {
      lastSuccess: 'Never',
      activatedAt: '2026-01-01',
      failureCount: 4,
      latestError: '<script>secret</script>',
      budgetURL: 'https://synbio.example/budget',
    };
    const html = await ejs.renderFile(
      path.resolve(__dirname, '../../views/email/budget-holder-stale/html.ejs'),
      data
    );
    const text = await ejs.renderFile(
      path.resolve(__dirname, '../../views/email/budget-holder-stale/text.ejs'),
      data
    );
    expect(html).to.include('&lt;script&gt;');
    expect(text).to.include('monthly');
  });
});
