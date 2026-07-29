const DB = require('../db');
const {NotFoundError} = require('../../lib/errors');

const types = {};
types.type1 = require('./type1');
types.type2 = require('./type2');
types.type3 = require('./type3');

types.TYPES = [types.type1, types.type2, types.type3];

types.getByTypeNumber = id => {
    return types.TYPES.filter(t => t.type == id)[0];
};

types.filterAll = (key, filter) => {
    return new Promise((good, bad)=> {
        return Promise.all(
            types.TYPES.map((type)=> {
                return type.model.filter(doc => doc(key).match(filter));
            })).then((nonFlat)=> {
            const flat = [].concat(...nonFlat);
            return good(flat);
        }).catch((err)=> {
            return bad(err)
        });
    });
};

function filterBy(key, filter) {
    const searcher = {};
    searcher[key] = filter;
    return new Promise((resolve, reject) => {
        const promises = types.TYPES.map(type => type.model.filter(searcher).getJoin({
            db: true,
            mapFile: true,
            sequenceFiles: true,
            category: true
        }));
        Promise.all(promises)
            .then((results)=> {
                const mergedResults = [].concat(...results);
                return resolve(mergedResults);
            })
            .catch((err)=> {
                return reject(err);
            });
    });
}

types.getAll = () => {
    return new Promise((resolve, reject) => {
        const promises = types.TYPES.map(type => type.model.getJoin({
            db: true,
            mapFile: true,
            sequenceFiles: true,
            category: true
        }));
        Promise.all(promises)
            .then((results)=> {
                const mergedResults = [].concat(...results);
                return resolve(mergedResults);
            })
            .catch((err)=> {
                return reject(err);
            });
    });
}

types.getByID = typeID => new Promise((good, bad)=> {

    filterBy('id', typeID).then((foundItems)=> {

        if (foundItems.length > 0) {
            return good(foundItems[0]);
        } else {
            // Reject with a real Error carrying a status. This used to reject
            // with a bare string, so callers reading `err.message` got
            // undefined — which turned a missing item into a 500, and threw a
            // second TypeError from inside the catch block that handled it.
            return bad(new NotFoundError(`No item found for id ${typeID}`));
        }

    }).catch((err)=> {
        return bad(err instanceof Error ? err : new Error(String(err)));
    })
});

types.getByCategory = dbID => filterBy('categoryID', dbID);

types.type1.model.belongsTo(DB, 'db', 'dbID', 'id');
types.type2.model.belongsTo(DB, 'db', 'dbID', 'id');
types.type3.model.belongsTo(DB, 'db', 'dbID', 'id');

module.exports = types;
