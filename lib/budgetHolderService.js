const { randomUUID } = require('crypto');
const config = require('../config');
const store = require('./budgetHolderStore');
const source = require('./budgetHolderSource');
const email = require('./email');
const { planImport } = require('./budgetHolderSnapshot');
const {
  mergeHolders,
  nextMonthlyRefresh,
  alertDue,
} = require('./budgetHolderRules');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateChoices(choices, existing, key, value) {
  if (!Array.isArray(choices) || choices.length !== existing.length)
    throw invalid('The selection is incomplete. Reload the page.');
  const keys = new Set(
    existing.map(function (item) {
      return item[key];
    })
  );
  for (const choice of choices) {
    if (
      !choice ||
      !keys.delete(choice[key]) ||
      typeof choice[value] !== 'boolean'
    )
      throw invalid('Invalid budget-holder selection.');
  }
}

async function saveSelections(payload) {
  if (!payload || !Number.isInteger(payload.revision))
    throw invalid('Invalid selection version. Reload the page.');
  let summary;
  await store.change(function (state) {
    if (payload.revision !== state.catalogRevision) {
      throw store.conflict(
        'The list has changed since this page was opened. Reload it and review your selections before saving.'
      );
    }
    validateChoices(payload.holders, state.holders, 'id', 'enabled');
    validateChoices(
      payload.institutes,
      state.institutes,
      'name',
      'defaultEnabled'
    );
    const holders = new Map(
      payload.holders.map(function (item) {
        return [item.id, item.enabled];
      })
    );
    const defaults = new Map(
      payload.institutes.map(function (item) {
        return [item.name, item.defaultEnabled];
      })
    );
    const bulk = new Set(
      Array.isArray(payload.bulkInstitutes) ? payload.bulkInstitutes : []
    );
    let categories = 0;
    let entries = 0;
    let instituteDefaults = 0;
    for (const institute of state.institutes) {
      const members = state.holders.filter(function (holder) {
        return holder.institute === institute.name;
      });
      const changed = members.filter(function (holder) {
        return holder.enabled !== holders.get(holder.id);
      }).length;
      const defaultChanged =
        institute.defaultEnabled !== defaults.get(institute.name);
      const wholeCategory =
        bulk.has(institute.name) &&
        members.every(function (holder) {
          return holders.get(holder.id) === defaults.get(institute.name);
        });
      if (wholeCategory && (changed || defaultChanged)) categories++;
      else {
        entries += changed;
        if (defaultChanged) instituteDefaults++;
      }
      institute.defaultEnabled = defaults.get(institute.name);
    }
    summary = { categories, entries, instituteDefaults };
    if (!categories && !entries && !instituteDefaults) return null;
    state.holders.forEach(function (holder) {
      holder.enabled = holders.get(holder.id);
    });
    state.catalogRevision++;
    return state;
  });
  return summary;
}

function saveMessage(summary) {
  const parts = [];
  if (summary.categories)
    parts.push(
      `${summary.categories} institute${summary.categories === 1 ? '' : 's'} updated`
    );
  if (summary.entries)
    parts.push(
      `${summary.entries} budget holder${summary.entries === 1 ? '' : 's'} updated`
    );
  if (summary.instituteDefaults)
    parts.push(
      `${summary.instituteDefaults} institute default${summary.instituteDefaults === 1 ? '' : 's'} updated`
    );
  return parts.length ? `${parts.join('; ')}.` : 'No changes to save.';
}

function checkLease(state, token, now) {
  if (
    !state.lease ||
    state.lease.token !== token ||
    state.lease.expiresAt <= now
  ) {
    throw store.conflict(
      'This refresh expired or was interrupted. Please try again.'
    );
  }
}

async function run({
  trigger = 'automatic',
  actor = null,
  clock = Date.now,
} = {}) {
  const token = randomUUID();
  const startedAt = clock();
  function notificationDue(state, now) {
    return (
      config.budgetHolderRefresh.notificationsEnabled && alertDue(state, now)
    );
  }
  function fetchDue(state, now) {
    return (
      trigger === 'manual' ||
      (config.budgetHolderRefresh.enabled && now >= state.nextRefreshAt)
    );
  }
  const initial = await store.change(function (state) {
    if (state.lease && state.lease.expiresAt > startedAt) {
      if (trigger === 'manual')
        throw store.conflict(
          'A refresh or overdue notification is already running. Please wait.'
        );
      return null;
    }
    if (
      !state.lease &&
      !fetchDue(state, startedAt) &&
      !notificationDue(state, startedAt)
    )
      return null;
    if (state.lease && state.lease.attempt) {
      state.failures.push({
        ...state.lease.attempt,
        at: startedAt,
        error:
          'Refresh interrupted before completion; the previous list was retained.',
      });
    }
    state.lease = null;
    const refreshDue = fetchDue(state, startedAt);
    if (refreshDue || notificationDue(state, startedAt)) {
      state.lease = {
        token,
        expiresAt: startedAt + 5 * 60 * 1000,
        attempt: refreshDue ? { startedAt, trigger, actor } : null,
      };
    }
    return state;
  });
  if (!initial.lease || initial.lease.token !== token) return { skipped: true };
  let result = { skipped: true };
  try {
    if (initial.lease.attempt) {
      try {
        const incoming = await source.fetchHolders();
        const saved = await store.change(function (state) {
          checkLease(state, token, clock());
          const merged = mergeHolders(
            state,
            incoming,
            config.budgetHolderRefresh.maxRemovalFraction
          );
          state.holders = merged.holders;
          state.institutes = merged.institutes;
          state.catalogRevision++;
          state.lastSuccess = {
            ...state.lease.attempt,
            at: clock(),
            fetchedAt: clock(),
            source:
              config.lookupBudget && config.lookupBudget.fixture
                ? 'fixture'
                : 'intranet',
            counts: merged.counts,
          };
          state.failures = [];
          state.lastAlertAt = null;
          state.alertRetryAt = null;
          state.alertError = null;
          state.lease.attempt = null;
          if (startedAt >= state.nextRefreshAt)
            state.nextRefreshAt = nextMonthlyRefresh(startedAt);
          return state;
        });
        result = { success: true, counts: saved.lastSuccess.counts };
      } catch (error) {
        // Source errors are already sanitised; DB errors may include documents.
        const reason =
          error.status === 409
            ? error.message
            : error.message &&
                /^(The intranet|Intranet request|Could not reach|Budget-holder dropdown|Refresh would remove)/.test(
                  error.message
                )
              ? error.message
              : 'Refresh failed while reading or saving the directory. The previous list was retained.';
        await store.change(function (state) {
          checkLease(state, token, clock());
          state.failures.push({
            ...state.lease.attempt,
            at: clock(),
            error: reason,
          });
          state.lease.attempt = null;
          if (startedAt >= state.nextRefreshAt)
            state.nextRefreshAt = nextMonthlyRefresh(startedAt);
          return state;
        });
        result = { success: false, error: reason };
      }
    }
    const state = await store.read();
    if (notificationDue(state, clock())) {
      checkLease(state, token, clock());
      try {
        await email.sendEmail(
          'budget-holder-stale',
          {
            lastSuccess: state.lastSuccess
              ? new Date(
                  state.lastSuccess.fetchedAt || state.lastSuccess.at
                ).toISOString()
              : 'Never',
            activatedAt: new Date(state.activatedAt).toISOString(),
            failureCount: state.failures.length,
            latestError: state.failures.length
              ? state.failures[state.failures.length - 1].error
              : 'No failed attempts recorded. A fresh source fetch or snapshot import is overdue.',
            budgetURL: new URL('/budget', config.baseURL).href,
          },
          {
            to: 'deeks@nbi.ac.uk',
            subject: 'SynBioShop: budget-holder refresh overdue',
          }
        );
        await store.change(function (current) {
          checkLease(current, token, clock());
          current.lastAlertAt = clock();
          current.alertRetryAt = null;
          current.alertError = null;
          return current;
        });
      } catch (error) {
        await store.change(function (current) {
          checkLease(current, token, clock());
          current.alertRetryAt = clock() + 24 * 60 * 60 * 1000;
          current.alertError =
            'The overdue email could not be delivered. Another attempt is due in 24 hours.';
          return current;
        });
      }
    }
    return result;
  } finally {
    await store.change(function (state) {
      if (!state.lease || state.lease.token !== token) return null;
      // If recording a failure itself failed, leave the lease to expire so the
      // interrupted attempt is recovered and appears in the log next time.
      if (state.lease.attempt) return null;
      state.lease = null;
      return state;
    });
  }
}

async function importSnapshot(
  snapshot,
  { actor, expectedRevision, clock = Date.now } = {}
) {
  let result;
  try {
    await store.change(function (state) {
      if (expectedRevision !== undefined && state.revision !== expectedRevision)
        throw store.conflict(
          'The directory changed after preview. Run the import again.'
        );
      const plan = planImport(
        state,
        snapshot,
        config.budgetHolderRefresh.maxRemovalFraction,
        clock()
      );
      if (plan.skipped) {
        result = plan;
        return null;
      }
      state.holders = plan.holders;
      state.institutes = plan.institutes;
      state.catalogRevision++;
      state.lastSuccess = {
        at: clock(),
        fetchedAt: plan.fetchedAt,
        trigger: 'snapshot',
        source: 'snapshot',
        actor,
        sha256: plan.snapshot.sha256,
        counts: plan.counts,
      };
      state.failures = [];
      state.lease = null;
      state.lastAlertAt = null;
      state.alertRetryAt = null;
      state.alertError = null;
      state.nextRefreshAt = nextMonthlyRefresh(clock());
      result = { success: true, counts: plan.counts };
      return state;
    });
  } catch (error) {
    if (error.status !== 409) {
      await store.change(function (state) {
        state.failures.push({
          at: clock(),
          trigger: 'snapshot',
          actor,
          error:
            'Snapshot import failed. The previous list and saved selections were retained.',
        });
        return state;
      });
    }
    throw error;
  }
  return result;
}

function startScheduler() {
  if (
    config.isTest ||
    (!config.budgetHolderRefresh.enabled &&
      !config.budgetHolderRefresh.notificationsEnabled)
  )
    return function () {};
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await run();
    } catch (error) {
      console.error(
        'Budget-holder maintenance could not complete; it will retry on the next check.'
      );
    } finally {
      // This tick owns the guard until its finally block; no other tick can enter.
      // eslint-disable-next-line require-atomic-updates
      running = false;
    }
  }
  void tick();
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  return function stopScheduler() {
    clearInterval(timer);
  };
}

module.exports = {
  saveSelections,
  saveMessage,
  run,
  importSnapshot,
  startScheduler,
};
