const types = {};
// const DB = require('../db');
types.type1 = require('./type1');
types.type2 = require('./type2');
types.type3 = require('./type3');

types.TYPES = [types.type1, types.type2, types.type3];

types.getByTypeNumber = id => new Promise((resolve, reject) => {
    const found = types.TYPES.filter(t => t.type == id);
    if (found.length == 1) {
        return resolve(found[0]);
    } else {
        if (found.length > 1) {
            return reject(new Error('more than one type found'));
        } else {
            return reject(new Error('non found of that type'));
        }
    }
});

types.getByID = typeID => new Promise((resolve, reject) => {
    let found = [];
    types.type1.model.filter({id: typeID}).then((t1)=> {
        found = found.concat(t1);
        types.type2.model.filter({id: typeID}).then((t2)=> {
            found = found.concat(t2);
            types.type3.model.filter({id: typeID}).then((t3)=> {
                found = found.concat(t3);
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

types.getByDB = dbID => new Promise((resolve, reject) => {
    let found = [];
    types.type1.model.filter({dbID}).then((dbs1)=> {
        found = found.concat(dbs1);
        types.type2.model.filter({dbID}).then((dbs2)=> {
            found = found.concat(dbs2);
            types.type3.model.filter({dbID}).then((dbs3)=> {
                found = found.concat(dbs3);
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

module.exports = types;