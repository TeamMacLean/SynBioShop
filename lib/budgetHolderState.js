const { instituteFromDescription, holderKey } = require('./budgetHolderRules');

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

function initialState(legacy, now = Date.now()) {
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
  return {
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
}

module.exports = { deduplicateHolders, initialState };
