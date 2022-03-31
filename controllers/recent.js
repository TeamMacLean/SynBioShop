const Type = require('../models/type');

const recent = {};

function getMostRecentIncludeRecentlyTypes(limit) {
    return new Promise((resolve, reject) => {
        Type.getAll()
            .then(types => {

                if (!types.length){
                    resolve([])
                }

                const javascriptTypes = JSON.parse(JSON.stringify(types));
                
                const filtered = javascriptTypes.filter(type => !!type.includeOnRecentlyAdded);

                console.log('initial', javascriptTypes.length, 'display only', filtered.length)
                // could order by index instead but this should be more reliable

                const result = filtered.sort((a, b) => a.db.createdAt - b.db.createdAt);
                
                const sliced = result.slice(0, limit);

                console.log('before slice', result.length, 'after slice', sliced.length, 'slice number', limit)

                const slicedWithHumanDate = sliced.map(item => {
                    const date = new Date(item.db.createdAt);
                    const formattedDate = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
                    
                    return {
                        ...item,
                        humanFormattedDate: formattedDate,
                    }
                })
                
                resolve(slicedWithHumanDate);
            
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