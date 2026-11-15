const store = require('../lib/budgetHolderStore');
const service = require('../lib/budgetHolderService');
const { groupHolders } = require('../lib/budgetHolderRules');
const Flash = require('../lib/flash');
const config = require('../config');

function ensureAdmin(req, res, next) {
  if (!req.user || !config.admins.includes(req.user.username)) {
    return res.status(403).send('Admin access required.');
  }
  next();
}

async function index(req, res) {
  const directory = await store.read();
  res.render('budget/index', {
    directory,
    institutes: groupHolders(directory),
    sourceFixture: config.lookupBudget.fixture,
    automaticRefresh: config.budgetHolderRefresh.enabled && !config.isTest,
    refreshNotifications:
      config.budgetHolderRefresh.notificationsEnabled && !config.isTest,
    title: 'Budget Holders Management',
    formatTime: function (timestamp) {
      return timestamp
        ? new Date(timestamp).toLocaleString('en-GB', {
            timeZone: 'Europe/London',
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : 'Never';
    },
  });
}

async function save(req, res) {
  try {
    let payload;
    try {
      payload = JSON.parse(req.body.selection);
    } catch (error) {
      return res
        .status(400)
        .json({ error: 'Invalid selection. Reload the page and try again.' });
    }
    const summary = await service.saveSelections(payload);
    req.flash('budgetSuccess', service.saveMessage(summary));
    if (req.get('Accept') === 'application/json')
      return res.json({ redirect: '/budget' });
    return res.redirect('/budget');
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : 'Your changes could not be saved. Please try again.',
    });
  }
}

async function refresh(req, res) {
  try {
    const result = await service.run({
      trigger: 'manual',
      actor: req.user.username,
    });
    if (result.success) {
      const { added, removed, updated } = result.counts;
      req.flash(
        'budgetSuccess',
        `Refresh complete: ${added} added, ${removed} removed, ${updated} updated. Saved selections preserved.`
      );
    } else {
      Flash.error(req, result.error || 'Refresh is already running.');
    }
  } catch (error) {
    Flash.error(
      req,
      error.status
        ? error.message
        : 'Refresh could not complete. The previous list remains in use.'
    );
  }
  res.redirect('/budget');
}

module.exports = { ensureAdmin, index, save, refresh };
