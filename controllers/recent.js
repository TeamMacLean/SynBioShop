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

                filtered.forEach((el, index) => {
                    if (!el){
                        console.error('issue with filtered[' + index + ']', filtered[index])
                    } else if (!el.db){
                        console.error('issue with filtered[' + index + '].db', filtered[index])
                    } else if (!el.db.createdAt){
                        console.error('issue with filtered[' + index + '].db.createdAt', filtered[index])
                    } else {
                        console.log('el fine', el.db.createdAt)
                    }
                })

                var arrayToAdjust = [];
                if (filtered.some((el, index) => !el.db || !el.db.createdAt)){
                    console.error('this doesnt have createdAt', el.name, el)
                    el.db = {'createdAt': 1}
                }

                const result = filtered.sort((a, b) => (new Date(b.db.createdAt)) - (new Date(a.db.createdAt)));

                const arrayHasBeenSorted = result.some((sortedArrayItem, index) => sortedArrayItem.name !== filtered[index].name)
                
                const sliced = result.slice(0, limit);
                //console.log(sliced.map(s => sliced.db.createdAt))

                console.log('Processing newest additions:')
                console.log('arrayHasBeenSorted', arrayHasBeenSorted)

                const slicedWithHumanDate = sliced.map(item => {
                    const date = new Date(item.db.createdAt);
                    const formattedDate = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
                    
                    return {
                        ...item,
                        createdAt: item.db.createdAt || 1,
                        humanFormattedDate: formattedDate,
                    }
                })

                console.log('result 1:', slicedWithHumanDate[0].name, slicedWithHumanDate[0].humanFormattedDate, slicedWithHumanDate[0].createdAt)
                console.log('result 3:', slicedWithHumanDate[2].name, slicedWithHumanDate[2].humanFormattedDate, slicedWithHumanDate[2].createdAt)
                console.log('result 5:', slicedWithHumanDate[4].name, slicedWithHumanDate[4].humanFormattedDate, slicedWithHumanDate[4].createdAt)
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