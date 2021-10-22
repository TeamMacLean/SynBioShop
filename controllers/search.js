const Type = require('../models/type');
const Document = require('../models/document');

const recent = {};

function getSearchResults(queryString) {
    return new Promise((resolve, reject) => {

        function escapeRegExp(str) {
            return str.replace(/[\-\[\]\/{}()*+?.\\\^$|]/g, '\\$&');
        }
        
        const mongoQueryString = escapeRegExp(queryString);
        
        const typePromise = new Promise((good, bad)=> {
            const results = [];
            
            Promise.all([Type.filterAll('name', `(?i)${mongoQueryString}`), Type.filterAll('description', `(?i)${mongoQueryString}`)])
            .then((nonFlat)=> {
                nonFlat = nonFlat.filter(n => !n.disabled);
                
                if (nonFlat) {
                    const types = [].concat(...nonFlat);
                    
                    /**
                     * Returns an array of objects with no duplicates
                     * @param {Array} arr Array of Objects
                     * @param {Array} keyProps Array of keys to determine uniqueness
                     */
                    function getUniqueArray(arr, keyProps) {
                        return Object.values(
                        arr.reduce((uniqueMap, entry) => {
                            const key = keyProps.map((k) => entry[k]).join('|')
                            if (!(key in uniqueMap)) uniqueMap[key] = entry
                            return uniqueMap
                        }, {}),
                        )
                    }

                    const unique = getUniqueArray(types, ['id'])

                    if (unique.length) {
                        
                        const items = {
                            levelUnknown: [],
                            level0: [],
                            level1: [],
                            level2: [],
                            levelM: [],
                            levelP: [],
                            levelMinus1: [],
                        };
                        unique.forEach((doc)=> {

                            const finalObj = {
                                name: doc.name, 
                                link: `/docs/item/${doc.id}`,
                                id: doc.id,
                                description: doc.description,
                                level: doc.level,
                            };

                            if (!doc.level){
                                items.levelUnknown.push(finalObj)
                            } else if (doc.level === '0' || doc.level === 0){
                                items.level0.push(finalObj);
                            } else if (doc.level === '1' || doc.level === 1){
                                items.level1.push(finalObj);
                            } else if (doc.level === '2' || doc.level === 2){
                                items.level2.push(finalObj);
                            } else if (doc.level === 'M' || doc.level === 3){
                                items.levelM.push(finalObj);
                            } else if (doc.level === 'P' || doc.level === 4){
                                items.levelP.push(finalObj);
                            } else if (doc.level === '-1 (pUAP)' || doc.level === '-1' || doc.level === 5 || doc.level === -1){
                                items.levelMinus1.push(finalObj);
                            } else {
                                items.levelUnknown.push(finalObj)
                            }
                        });

                        results.push({heading: 'premade', items})
                    }
                }
                good(results);
            })
            .catch((err)=> {
                        bad(err);
                    });
            }
        );

        const documentPromise = new Promise((good, bad)=> {
            const results = [];
            Document.filter(doc => doc('title').match(`(?i)${mongoQueryString}`))
                .then((documents)=> {
                    documents = documents.filter(n => !n.disabled);
                    if (documents.length > 0) {
                        const items = [];
                        documents.map((doc)=> {
                            items.push({
                                name: doc.title, 
                                link: `/docs/item/${doc.id}`,
                                id: doc.id,
                                content: doc.content
                            });
                        });
                        
                        results.push({heading: 'documents', items})
                    }                
                    good(results);
                }).catch((err)=> {
                    bad(err);
                }
            );
        });

        Promise.all([documentPromise, typePromise]).then((results)=> {
            const flat = [].concat(...results);

            const documentObj = flat.filter(resObj => resObj.heading === 'documents')[0];
            const premadeObj = flat.filter(resObj => resObj.heading === 'premade')[0];

            const documentItems = (documentObj && documentObj.items && documentObj.items.length) ? 
                documentObj.items : [];
                
            const levelUnknownPremadeItems = (premadeObj && premadeObj.items && premadeObj.items.levelUnknown && premadeObj.items.levelUnknown.length) ? 
                premadeObj.items.levelUnknown : [];
            const level0PremadeItems = (premadeObj && premadeObj.items && premadeObj.items.level0 && premadeObj.items.level0.length) ? 
                premadeObj.items.level0 : [];
            const level1PremadeItems = (premadeObj && premadeObj.items && premadeObj.items.level1 && premadeObj.items.level1.length) ? 
                premadeObj.items.level1 : [];
            const level2PremadeItems = (premadeObj && premadeObj.items && premadeObj.items.level2 && premadeObj.items.level2.length) ? 
                premadeObj.items.level2 : [];
            const levelMPremadeItems = (premadeObj && premadeObj.items && premadeObj.items.levelM && premadeObj.items.levelM.length) ? 
                premadeObj.items.levelM : [];
            const levelPPremadeItems = (premadeObj && premadeObj.items && premadeObj.items.levelP && premadeObj.items.levelP.length) ? 
                premadeObj.items.levelP : [];
            const levelMinus1PremadeItems = (premadeObj && premadeObj.items && premadeObj.items.levelMinus1 && premadeObj.items.levelMinus1.length) ? 
                premadeObj.items.levelMinus1 : [];

            resolve({
                documents: documentItems,
                premadeLevelUnknown: levelUnknownPremadeItems,
                premadeLevel0: level0PremadeItems,
                premadeLevel1: level1PremadeItems,
                premadeLevel2: level2PremadeItems,
                premadeLevelM: levelMPremadeItems,
                premadeLevelP: levelPPremadeItems,
                premadeLevelMinus1: levelMinus1PremadeItems,
                
            });
    
        }).catch((err)=> {
            console.error('err', err);
        });

    });
}

recent.index = (req, res, next) => {
    const {
        queryString
    } = req.query;
    
    return getSearchResults(queryString)
        .then(results => {
            return res.render('search/index', { 
                queryString, 
                documentation: results.documents, 
                premadeLevelUnknown: results.premadeLevelUnknown, 
                premadeLevel0: results.premadeLevel0, 
                premadeLevel1: results.premadeLevel1, 
                premadeLevel2: results.premadeLevel2, 
                premadeLevelM: results.premadeLevelM, 
                premadeLevelP: results.premadeLevelP, 
                premadeLevelMinus1: results.premadeLevelMinus1, 
            });
        }).catch(err => {
            console.error('issue with rendering recently-added items' + err)
        })
};

module.exports = recent;