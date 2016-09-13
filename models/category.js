const thinky = require( '../lib/thinky');
const type = thinky.type;
const r = thinky.r;

const Category = thinky.createModel('Category', {
    id: type.string(),
    name: type.string().required(),
    dbID: type.string().required(),
    createdAt: type.date().default(r.now()),
    position: type.number().default(0),
    description: type.string().required().default('')
});

module.exports = Category;
const DB = require('./db');
Category.belongsTo(DB, 'db', 'dbID', 'id');