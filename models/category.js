const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;
// const Type = require('./type');
const util = require('../lib/util');


const Category = thinky.createModel('Category', {
    id: type.string(),
    name: type.string().required(),
    dbID: type.string().required()
    // safeName: type.string().required(),
    // type: type.number().required(),
    // createdAt: type.date().default(r.now())
});

module.exports = Category;

const DB = require('./db');
Category.belongsTo(DB, 'db', 'db', 'dbID');