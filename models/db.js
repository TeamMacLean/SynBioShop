const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;

const DB = thinky.createModel('DB', {
    id: type.string(),
    name: type.string().required(),
    type: type.number().required(),
    createdAt: type.date().default(r.now()),
    description: type.string().required().default('')
});

module.exports = DB;

const Category = require('./category');
DB.hasMany(Category, 'categories', 'id', 'dbID');