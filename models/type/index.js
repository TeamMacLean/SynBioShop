const DB = require('../db');

const types = {};
// const DB = require('../db');
types.type1 = require('./type1');
types.type2 = require('./type2');
types.type3 = require('./type3');

types.TYPES = [types.type1, types.type2, types.type3];

types.getByTypeNumber = id => {
    return types.TYPES.filter(t => t.type == id)[0];
};

function filterBy(key, filter) {
    var searcher = {};
    searcher[key] = filter;
    return new Promise((resolve, reject) => {
        const promises = types.TYPES.map(function (type) {
            return type.model.filter(searcher);
        });
        Promise.all(promises)
            .then((results)=> {
                const mergedResults = [].concat.apply([], results);
                return resolve(mergedResults);
            })
            .catch((err)=> {
                return reject(err);
            });
    });
}

types.getByID = function (typeID) {
    return filterBy('id', typeID);
};

types.getByCategory = function (dbID) {
    return filterBy('categoryID', dbID);
};


types.type1.model.belongsTo(DB, "db", "dbID", "id");
types.type2.model.belongsTo(DB, "db", "dbID", "id");
types.type3.model.belongsTo(DB, "db", "dbID", "id");

module.exports = types;