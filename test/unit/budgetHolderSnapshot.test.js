const { expect } = require('chai');
const { createHash } = require('crypto');
const {
  createSnapshot,
  validateSnapshot,
  planImport,
} = require('../../lib/budgetHolderSnapshot');
const { alertDue } = require('../../lib/budgetHolderRules');

const fetchedAt = Date.UTC(2026, 10, 13, 15, 6);
const holders = [
  {
    username: 'user1',
    description: 'A Person (TSL)',
    institute: 'TSL',
    enabled: false,
  },
  {
    username: 'user2',
    description: 'New Person (JIC)',
    institute: 'JIC',
    enabled: true,
  },
];

describe('Portable budget-holder source snapshots', function () {
  it('exports all holders without availability fields, preserving the real fetch date', function () {
    const snapshot = createSnapshot(holders, fetchedAt, fetchedAt + 7200000);
    expect(snapshot.holders).to.have.lengthOf(2);
    expect(snapshot.fetchedAt).to.equal('2026-11-13T15:06:00.000Z');
    expect(JSON.stringify(snapshot)).to.not.include('enabled');
    expect(validateSnapshot(snapshot, fetchedAt)).to.deep.equal(snapshot);
  });

  it('rejects corrupt, duplicate, empty, future-dated, mismatched and policy-bearing data', function () {
    const valid = createSnapshot(holders, fetchedAt, fetchedAt);
    const mutations = [
      function (s) {
        s.schemaVersion = 2;
      },
      function (s) {
        s.sourceUrl = 'https://other.example';
      },
      function (s) {
        s.fetchedAt = 'invalid';
      },
      function (s) {
        s.fetchedAt = new Date(fetchedAt + 1).toISOString();
      },
      function (s) {
        s.holders = [];
      },
      function (s) {
        s.holders.push(s.holders[0]);
      },
      function (s) {
        s.holders[0].institute = 'JIC';
      },
      function (s) {
        s.holders[0].description = 'Tampered (TSL)';
      },
      function (s) {
        s.holders[0].enabled = true;
      },
      function (s) {
        s.holders[0].username = 'bad username';
      },
      function (s) {
        s.holders[0].description = 'Control\nCharacter (TSL)';
      },
    ];
    for (const mutate of mutations) {
      const snapshot = structuredClone(valid);
      mutate(snapshot);
      expect(function () {
        validateSnapshot(snapshot, fetchedAt);
      }).to.throw();
    }
  });

  it('preserves production exceptions and uses production defaults for arrivals and moves', function () {
    const state = {
      holders: [
        holders[0],
        {
          username: 'user2',
          description: 'Moved (TSL)',
          institute: 'TSL',
          enabled: true,
        },
      ],
      institutes: [
        { name: 'TSL', defaultEnabled: true },
        { name: 'JIC', defaultEnabled: false },
      ],
    };
    const plan = planImport(
      state,
      createSnapshot(holders, fetchedAt, fetchedAt),
      0.5,
      fetchedAt
    );
    expect(
      plan.holders.map(function (h) {
        return h.enabled;
      })
    ).to.deep.equal([false, false]);
    expect(plan.counts).to.deep.equal({ added: 1, removed: 1, updated: 0 });
  });

  it('rejects older snapshots, skips identical replay and prevents changed data at the same timestamp', function () {
    const snapshot = createSnapshot(holders, fetchedAt, fetchedAt);
    const state = {
      holders,
      institutes: [],
      lastSuccess: { at: fetchedAt + 1000, fetchedAt },
    };
    expect(planImport(state, snapshot, 0.5, fetchedAt + 1000).skipped).to.equal(
      true
    );
    expect(function () {
      planImport(
        state,
        createSnapshot(holders, fetchedAt - 1, fetchedAt),
        0.5,
        fetchedAt
      );
    }).to.throw('older');
    const changed = structuredClone(snapshot);
    changed.holders[0].description = 'Renamed (TSL)';
    changed.sha256 = createHash('sha256')
      .update(JSON.stringify(changed.holders))
      .digest('hex');
    expect(function () {
      planImport(state, changed, 0.5, fetchedAt);
    }).to.throw('same fetch timestamp');
  });

  it('enforces removal limits and active refresh leases', function () {
    const snapshot = createSnapshot([holders[0]], fetchedAt, fetchedAt);
    const state = { holders, institutes: [] };
    expect(function () {
      planImport(state, snapshot, 0.4, fetchedAt);
    }).to.throw('allowed proportion');
    state.lease = { expiresAt: fetchedAt + 1 };
    expect(function () {
      planImport(state, snapshot, 1, fetchedAt);
    }).to.throw('refresh is running');
  });

  it('uses the fetch date for overdue reminders even after a recent import and without failed attempts', function () {
    const state = {
      lastSuccess: { fetchedAt, at: Date.UTC(2027, 1, 12) },
      failures: [],
      activatedAt: fetchedAt,
      lastAlertAt: null,
    };
    expect(alertDue(state, Date.UTC(2027, 1, 13, 15, 5))).to.equal(false);
    expect(alertDue(state, Date.UTC(2027, 1, 13, 15, 6))).to.equal(true);
    state.lastAlertAt = Date.UTC(2027, 1, 13, 15, 6);
    expect(alertDue(state, Date.UTC(2027, 2, 12))).to.equal(false);
    expect(alertDue(state, Date.UTC(2027, 2, 13, 15, 6))).to.equal(true);
  });
});
