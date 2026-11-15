const cheerio = require('cheerio');

function instituteFromDescription(description) {
  const match = /\(([^()]*)\)\s*\]?\s*$/.exec(description);
  const institute = match ? match[1].trim().toUpperCase() : '';
  return /^[A-Z][A-Z0-9 &.-]{0,39}$/.test(institute) ? institute : 'Unknown';
}

function holderKey(holder) {
  return `${holder.username}:${holder.institute}`;
}

function parseBudgetHolders(html) {
  if (typeof html !== 'string' || !/<\/select\s*>/i.test(html)) {
    throw new Error(
      'The intranet did not return a complete budget-holder list.'
    );
  }
  const $ = cheerio.load(html, { sourceCodeLocationInfo: true });
  const select = $('select[name="BH"]');
  if (select.length !== 1 || $('input[type="password"]').length) {
    throw new Error(
      'Budget-holder dropdown missing or login page returned. Check intranet access.'
    );
  }
  if (!select[0].sourceCodeLocation || !select[0].sourceCodeLocation.endTag) {
    throw new Error(
      'The intranet did not return a complete budget-holder list.'
    );
  }
  const holders = [];
  const usernames = new Set();
  select.find('option').each(function () {
    const username = ($(this).attr('value') || '').trim();
    const description = $(this).text().replace(/\s+/g, ' ').trim();
    if (!username || /^SELECT BUDGET HOLDER$/i.test(description)) return;
    if (
      !/^[a-zA-Z0-9._-]{1,64}$/.test(username) ||
      !description ||
      description.length > 500
    ) {
      throw new Error(
        'The intranet list contains an invalid budget holder. No changes applied.'
      );
    }
    if (usernames.has(username)) {
      throw new Error(
        'The intranet list contains duplicate usernames. No changes applied.'
      );
    }
    usernames.add(username);
    holders.push({
      username,
      description,
      institute: instituteFromDescription(description),
    });
  });
  if (!holders.length || holders.length > 10000) {
    throw new Error(
      'The intranet returned an empty or unexpectedly large list. No changes applied.'
    );
  }
  return holders;
}

function groupHolders(state) {
  return state.institutes
    .map(function (institute) {
      const holders = state.holders
        .filter(function (holder) {
          return holder.institute === institute.name;
        })
        .sort(function (a, b) {
          return a.description.localeCompare(b.description);
        });
      return {
        ...institute,
        holders,
        enabledCount: holders.filter(function (holder) {
          return holder.enabled;
        }).length,
      };
    })
    .sort(function (a, b) {
      function priority(name) {
        return name === 'TSL'
          ? 0
          : name === 'JIC'
            ? 1
            : name === 'Unknown'
              ? 3
              : 2;
      }
      return (
        priority(a.name) - priority(b.name) || a.name.localeCompare(b.name)
      );
    });
}

function mergeHolders(state, incoming, maxRemovalFraction = 0.5) {
  const oldByKey = new Map(
    state.holders.map(function (holder) {
      return [holderKey(holder), holder];
    })
  );
  const incomingKeys = new Set(incoming.map(holderKey));
  const removed = state.holders.filter(function (holder) {
    return !incomingKeys.has(holderKey(holder));
  }).length;
  if (
    state.holders.length &&
    removed / state.holders.length > maxRemovalFraction
  ) {
    throw new Error(
      'Refresh would remove more than the allowed proportion of holders. Check the source list.'
    );
  }
  const institutes = state.institutes.map(function (institute) {
    return { ...institute };
  });
  let added = 0;
  let updated = 0;
  const holders = incoming.map(function (holder) {
    let institute = institutes.find(function (item) {
      return item.name === holder.institute;
    });
    if (!institute) {
      institute = { name: holder.institute, defaultEnabled: false };
      institutes.push(institute);
    }
    const old = oldByKey.get(holderKey(holder));
    if (!old) added++;
    else if (old.description !== holder.description) updated++;
    return {
      ...holder,
      id: holderKey(holder),
      enabled: old ? old.enabled : institute.defaultEnabled,
    };
  });
  return { holders, institutes, counts: { added, removed, updated } };
}

// Calendar months, clamped at the end of the target month (31 Jan -> 28 Feb).
function addMonths(timestamp, months) {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

function nextMonthlyRefresh(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 3);
}

function alertDue(state, now) {
  if (
    now <
    addMonths(
      state.lastSuccess
        ? state.lastSuccess.fetchedAt || state.lastSuccess.at
        : state.activatedAt,
      3
    )
  )
    return false;
  if (state.lastAlertAt && now < addMonths(state.lastAlertAt, 1)) return false;
  return !state.alertRetryAt || now >= state.alertRetryAt;
}

module.exports = {
  instituteFromDescription,
  holderKey,
  parseBudgetHolders,
  groupHolders,
  mergeHolders,
  addMonths,
  nextMonthlyRefresh,
  alertDue,
};
