const DB = require('../db');

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

types.getByID = typeID => new Promise((good, bad)=> {

    filterBy('id', typeID).then((foundItems)=> {

        if (foundItems.length > 0) {
            return good(foundItems[0]);
        } else {
            return bad(`types.getByID could not find anything for id ${typeID}`);
        }

    }).catch((err)=> {
        return bad(err);
    })
});


types.getByCategory = dbID => filterBy('categoryID', dbID);


types.type1.model.belongsTo(DB, 'db', 'dbID', 'id');
types.type2.model.belongsTo(DB, 'db', 'dbID', 'id');
types.type3.model.belongsTo(DB, 'db', 'dbID', 'id');

module.exports = types;