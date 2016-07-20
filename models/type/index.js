const DB = require('../db');

const types = {};
// const DB = require('../db');
types.type1 = require('./type1');
types.type2 = require('./type2');
types.type3 = require('./type3');
types.type4 = require('./type4');

types.TYPES = [types.type1, types.type2, types.type3, types.type4];

types.getByTypeNumber = id => {
    return types.TYPES.filter(t => t.type == id)[0];
    // if (found.length == 1) {
    //     return resolve(found[0]);
    // } else {
    //     console.log('found', found);
    //     if (found.length > 1) {
    //         return reject(new Error('more than one type found'));
    //     } else {
    //         return reject(new Error('non found of that type'));
    //     }
    // }
};

function filterBy(key, filter) {

    var searcher = {};
    searcher[key] = filter;
    console.log(searcher);
    return new Promise((resolve, reject) => {
        let found = [];
        types.type1.model.filter(searcher).then((t1)=> {
            found = found.concat(t1);
            types.type2.model.filter(searcher).then((t2)=> {
                found = found.concat(t2);
                types.type3.model.filter(searcher).then((t3)=> {
                    found = found.concat(t3);
                    types.type4.model.filter(searcher).then((t4)=> {
                        found = found.concat(t4);
                        return resolve(found);
                    }).catch((err)=> {
                        return reject(err);
                    });
                    return resolve(found);
                }).catch((err)=> {
                    return reject(err);
                })
            }).catch((err)=> {
                return reject(err);
            })
        }).catch((err)=> {
            return reject(err);
        })
    });
}

types.getByID = function (key, typeID) {
    return filterBy('id', typeID);
};

types.getByCategory = function (dbID) {
    return filterBy('categoryID', dbID);
};


types.type1.model.belongsTo(DB, "db", "dbID", "id");
types.type2.model.belongsTo(DB, "db", "dbID", "id");
types.type3.model.belongsTo(DB, "db", "dbID", "id");

module.exports = types;