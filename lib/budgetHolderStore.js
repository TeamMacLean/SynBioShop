const { r } = require('./thinky');
const Directory = require('../models/budgetHolderDirectory');
const BudgetHolder = require('../models/budgetHolder');
const { instituteFromDescription, holderKey } = require('./budgetHolderRules');

function directoryRow() {
  return r.table(Directory.tableName).get('current');
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function deduplicateHolders(holders) {
  const unique = new Map();
  for (const holder of holders) {
    const key = holderKey(holder);
    const existing = unique.get(key);
    if (existing) {
      // Never re-enable a saved exception when legacy duplicates disagree.
      existing.enabled = existing.enabled && holder.enabled;
    } else {
      unique.set(key, { ...holder });
    }
  }
  return Array.from(unique.values());
}

async function replaceCurrent(current, next) {
  const result = await directoryRow()
    .replace(function (row) {
      return r.branch(row('revision').eq(current.revision), next, row);
    })
    .run();
  if (result.errors)
    throw new Error('Could not save the budget-holder directory.');
  return result.replaced === 1;
}

async function read() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await directoryRow().run();
    if (!existing) return initialise();
    const holders = deduplicateHolders(existing.holders);
    if (holders.length === existing.holders.length) return existing;
    // Repair directories migrated by earlier versions. Advance the selection
    // version so a page still displaying duplicates must reload before saving.
    const repaired = {
      ...existing,
      holders,
      revision: existing.revision + 1,
      catalogRevision: existing.catalogRevision + 1,
    };
    if (await replaceCurrent(existing, repaired)) return repaired;
  }
  throw conflict('The budget-holder list is busy. Please try again.');
}

async function initialise() {
  const legacy = await BudgetHolder.run();
  const holders = deduplicateHolders(
    legacy.map(function (holder) {
      const result = {
        username: holder.username,
        description: holder.description,
        institute: instituteFromDescription(holder.description),
        enabled: holder.enabled !== false,
      };
      return { ...result, id: holderKey(result) };
    })
  );
  const institutes = [
    ...new Set(
      holders.map(function (holder) {
        return holder.institute;
      })
    ),
  ].map(function (name) {
    return {
      name,
      defaultEnabled: holders
        .filter(function (holder) {
          return holder.institute === name;
        })
        .every(function (holder) {
          return holder.enabled;
        }),
    };
  });
  const now = Date.now();
  const initial = {
    id: 'current',
    revision: 0,
    catalogRevision: 0,
    holders,
    institutes,
    activatedAt: now,
    nextRefreshAt: now,
    lastSuccess: null,
    failures: [],
    lease: null,
    lastAlertAt: null,
    alertRetryAt: null,
    alertError: null,
  };
  // Concurrent first requests must not replace an already migrated directory.
  const result = await r
    .table(Directory.tableName)
    .insert(initial, {
      conflict: function (id, old, incoming) {
        return old;
      },
    })
    .run();
  if (result.errors)
    throw new Error('Could not initialise the budget-holder directory.');
  return read();
}

// Callbacks are pure: a concurrent writer may cause them to be evaluated again.
async function change(transform) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const current = await read();
    const next = transform(structuredClone(current));
    if (!next) return current;
    next.revision = current.revision + 1;
    if (await replaceCurrent(current, next)) return next;
  }
  throw conflict('The budget-holder list is busy. Please try again.');
}

module.exports = { read, change, conflict };
