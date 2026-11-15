const { createHash } = require('crypto');
const {
  instituteFromDescription,
  mergeHolders,
} = require('./budgetHolderRules');

const SOURCE_URL = 'https://intranet.nbi.ac.uk/infoserv/cgi-bin/costcentres/';
const MAX_BYTES = 2 * 1024 * 1024;

function invalid(message) {
  return Object.assign(new Error(`Snapshot: ${message}`), { status: 400 });
}

function rawHolders(holders) {
  return holders
    .map(function (holder) {
      return {
        username: holder.username,
        description: holder.description,
        institute: holder.institute,
      };
    })
    .sort(function (a, b) {
      return a.username < b.username ? -1 : a.username > b.username ? 1 : 0;
    });
}

function fingerprint(holders) {
  return createHash('sha256')
    .update(JSON.stringify(rawHolders(holders)))
    .digest('hex');
}

function validateSnapshot(snapshot, now = Date.now()) {
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    snapshot.sourceUrl !== SOURCE_URL
  )
    throw invalid('unsupported format or source URL.');
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  if (
    !Number.isFinite(fetchedAt) ||
    fetchedAt <= 0 ||
    fetchedAt > now ||
    new Date(fetchedAt).toISOString() !== snapshot.fetchedAt
  )
    throw invalid('fetch date is invalid or in the future.');
  if (
    !Array.isArray(snapshot.holders) ||
    !snapshot.holders.length ||
    snapshot.holders.length > 10000
  )
    throw invalid('holder list is empty or too large.');
  const usernames = new Set();
  for (const holder of snapshot.holders) {
    if (
      !holder ||
      typeof holder.username !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(holder.username) ||
      typeof holder.description !== 'string' ||
      !holder.description.trim() ||
      holder.description.length > 500 ||
      /[\u0000-\u001f\u007f]/.test(holder.description) ||
      holder.institute !== instituteFromDescription(holder.description) ||
      Object.keys(holder).some(function (key) {
        return !['username', 'description', 'institute'].includes(key);
      })
    )
      throw invalid(
        'invalid holder or display settings included. Export raw source data only.'
      );
    if (usernames.has(holder.username)) throw invalid('duplicate usernames.');
    usernames.add(holder.username);
  }
  if (snapshot.sha256 !== fingerprint(snapshot.holders))
    throw invalid('checksum does not match the holder list.');
  return {
    schemaVersion: 1,
    sourceUrl: SOURCE_URL,
    fetchedAt: snapshot.fetchedAt,
    sha256: snapshot.sha256,
    holders: rawHolders(snapshot.holders),
  };
}

function createSnapshot(holders, fetchedAt, now = Date.now()) {
  return validateSnapshot(
    {
      schemaVersion: 1,
      sourceUrl: SOURCE_URL,
      fetchedAt: new Date(fetchedAt).toISOString(),
      sha256: fingerprint(holders),
      holders: rawHolders(holders),
    },
    now
  );
}

function planImport(state, input, maxRemovalFraction = 0.5, now = Date.now()) {
  const snapshot = validateSnapshot(input, now);
  if (state.lease && state.lease.expiresAt > now)
    throw Object.assign(
      new Error('A refresh is running. Retry after it completes.'),
      { status: 409 }
    );
  const previousAt = state.lastSuccess
    ? state.lastSuccess.fetchedAt || state.lastSuccess.at
    : 0;
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  if (fetchedAt < previousAt)
    throw invalid('older than the last successful source fetch.');
  if (fetchedAt === previousAt) {
    if (snapshot.sha256 !== fingerprint(state.holders))
      throw invalid('different data has the same fetch timestamp.');
    return { skipped: true, counts: { added: 0, removed: 0, updated: 0 } };
  }
  return {
    ...mergeHolders(state, snapshot.holders, maxRemovalFraction),
    fetchedAt,
    snapshot,
  };
}

module.exports = {
  SOURCE_URL,
  MAX_BYTES,
  createSnapshot,
  validateSnapshot,
  planImport,
};
