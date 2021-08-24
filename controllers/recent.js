const Type = require('../models/type');

const recent = {};

function getMostRecentIncludeRecentlyTypes(limit) {
    return new Promise((resolve, reject) => {
        Type.getAll()
            .then(types => {

                if (!types.length){
                    resolve([])
                }
                
                const filtered = types.filter(type => !!type.includeOnRecentlyAdded);
                // could order by index instead but this should be more reliable
                const result = filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                
                const sliced = result.slice(0, limit);
                
                resolve(sliced);
            
            }).catch(err => {                
                reject(err);
            });
    });
}

recent.index = (req, res, next) => {
    return getMostRecentIncludeRecentlyTypes(20)
        .then(items => {
            return res.render('recent/index', { items: items });
        }).catch(err => {
            console.error('issue with rendering recently-added items' + err)
        })
};

module.exports = recent;