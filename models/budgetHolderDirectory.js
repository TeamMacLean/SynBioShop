const thinky = require('../lib/thinky');

// One document makes list replacement and checkbox saves atomic in RethinkDB.
// The old BudgetHolder table is retained solely as the migration source.
module.exports = thinky.createModel('BudgetHolderDirectory', {
  id: thinky.type.string(),
  revision: thinky.type.number(),
  catalogRevision: thinky.type.number(),
  holders: thinky.type.array(),
  institutes: thinky.type.array(),
});
