const { expect } = require('chai');
const rules = require('../../lib/budgetHolderRules');

function list(options) {
  return `<select name="BH"><option value="">SELECT BUDGET HOLDER</option>${options}</select>`;
}

describe('Budget-holder source and reconciliation rules', function () {
  it('reads the final institute, including multiple parenthesised departments', function () {
    expect(
      rules.instituteFromDescription(
        'JONES Jonathan Jones [Sainsbury Laboratory (JJ) (TSL)]'
      )
    ).to.equal('TSL');
    expect(rules.instituteFromDescription('John Smith (JIC)')).to.equal('JIC');
    expect(rules.instituteFromDescription('Unrecognised description')).to.equal(
      'Unknown'
    );
  });

  it('decodes HTML entities, skips the placeholder and extracts usernames', function () {
    const holders = rules.parseBudgetHolders(
      list('<option value="smithj">John &amp; Jane [Research (JIC)]</option>')
    );
    expect(holders).to.deep.equal([
      {
        username: 'smithj',
        description: 'John & Jane [Research (JIC)]',
        institute: 'JIC',
      },
    ]);
  });

  it('rejects login pages, empty lists, duplicate usernames and incomplete HTML', function () {
    for (const html of [
      '<form><input type="password"></form>',
      list(''),
      list(
        '<option value="user1">User (TSL)</option><option value="user1">User (JIC)</option>'
      ),
      '<select name="BH"><option value="user1">User (JIC)',
      '<select name="unrelated"></select><select name="BH"><option value="user1">User (JIC)',
      list('<option value="bad username">User (JIC)</option>'),
    ])
      expect(function () {
        rules.parseBudgetHolders(html);
      }).to.throw();
  });

  it('preserves choices, applies institute defaults and treats moves as new membership', function () {
    const state = {
      holders: [
        {
          username: 'old1',
          description: 'Old (TSL)',
          institute: 'TSL',
          enabled: false,
        },
        {
          username: 'move1',
          description: 'Move (TSL)',
          institute: 'TSL',
          enabled: true,
        },
        {
          username: 'gone1',
          description: 'Gone (JIC)',
          institute: 'JIC',
          enabled: true,
        },
      ],
      institutes: [
        { name: 'TSL', defaultEnabled: true },
        { name: 'JIC', defaultEnabled: false },
      ],
    };
    const incoming = rules.parseBudgetHolders(
      list(
        [
          '<option value="old1">Renamed (TSL)</option>',
          '<option value="move1">Move (JIC)</option>',
          '<option value="new1">New (TSL)</option>',
          '<option value="new2">New (EI)</option>',
        ].join('')
      )
    );
    const merged = rules.mergeHolders(state, incoming, 1);
    expect(
      merged.holders.map(function (holder) {
        return [holder.username, holder.enabled];
      })
    ).to.deep.equal([
      ['old1', false],
      ['move1', false],
      ['new1', true],
      ['new2', false],
    ]);
    expect(merged.counts).to.deep.equal({ added: 3, removed: 2, updated: 1 });
    expect(state.holders[0].description).to.equal('Old (TSL)');
  });

  it('rejects suspicious mass removal', function () {
    const state = {
      holders: [
        { username: 'a', institute: 'TSL' },
        { username: 'b', institute: 'TSL' },
      ],
      institutes: [],
    };
    expect(function () {
      rules.mergeHolders(state, []);
    }).to.throw('allowed proportion');
  });

  it('puts TSL and JIC first, others alphabetically and unknown last', function () {
    const names = ['QIB', 'Unknown', 'JIC', 'EI', 'TSL'];
    const groups = rules.groupHolders({
      holders: [],
      institutes: names.map(function (name) {
        return { name };
      }),
    });
    expect(
      groups.map(function (group) {
        return group.name;
      })
    ).to.deep.equal(['TSL', 'JIC', 'EI', 'QIB', 'Unknown']);
  });

  it('uses calendar months, including end-of-month and leap-year boundaries', function () {
    expect(
      new Date(rules.addMonths(Date.UTC(2027, 0, 31), 1)).toISOString()
    ).to.equal('2027-02-28T00:00:00.000Z');
    expect(
      new Date(rules.addMonths(Date.UTC(2028, 0, 31), 1)).toISOString()
    ).to.equal('2028-02-29T00:00:00.000Z');
    expect(
      new Date(rules.nextMonthlyRefresh(Date.UTC(2026, 11, 15))).toISOString()
    ).to.equal('2027-01-01T03:00:00.000Z');
  });

  it('alerts after three months without success and then monthly, regardless of attempt count', function () {
    const start = Date.UTC(2026, 0, 1);
    const state = {
      activatedAt: start,
      lastSuccess: null,
      failures: [{ error: 'Failed' }],
      lastAlertAt: null,
    };
    expect(rules.alertDue(state, Date.UTC(2026, 2, 31))).to.equal(false);
    expect(rules.alertDue(state, Date.UTC(2026, 3, 1))).to.equal(true);
    state.lastAlertAt = Date.UTC(2026, 3, 1);
    expect(rules.alertDue(state, Date.UTC(2026, 3, 30))).to.equal(false);
    expect(rules.alertDue(state, Date.UTC(2026, 4, 1))).to.equal(true);
    state.failures = [];
    expect(rules.alertDue(state, Date.UTC(2027, 4, 1))).to.equal(false);
  });
});
