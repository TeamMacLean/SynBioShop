const thinky = require('../lib/thinky');
const type = thinky.type;

const BudgetHolder = thinky.createModel('BudgetHolder', {
    id: type.string(),
    username: type.string().required().min(3).max(20),
    description: type.string().required().min(10).max(150)
});

// Ensure username is unique
BudgetHolder.ensureIndex('username');

module.exports = BudgetHolder;
