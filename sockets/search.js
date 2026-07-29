const Document = require('../models/document');
const Type = require('../models/type');

const search = socket => {


    socket.on('search', text => {
        function escapeRegExp(str) {
            return str.replace(/[\-\[\]\/{}()*+?.\\\^$|]/g, '\\$&');
        }

        // A client emitting `search` with no payload used to reach
        // `undefined.replace(...)`, and socket.io does not catch throws in
        // listeners — it killed the process.
        if (typeof text !== 'string' || text.length === 0) {
            return socket.emit('results', []);
        }

        // Bound the work a single query can request.
        text = escapeRegExp(text.slice(0, 200));

        const typePromise = new Promise((good, bad)=> {
                const results = [];

                Promise.all([Type.filterAll('name', `(?i)${text}`), Type.filterAll('description', `(?i)${text}`)])
                    .then((nonFlat)=> {
                        nonFlat = nonFlat.filter(n => !n.disabled);
                        if (nonFlat) {
                            const types = [].concat(...nonFlat);
                            if (types.length) {
                                const items = [];
                                types.map((t)=> {
                                    items.push({name: t.name, link: `/premade/item/${t.id}`});
                                });
                                results.push({heading: 'Premade', items})
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
            Document.filter(doc => doc('title').match(`(?i)${text}`)).then((documents)=> {
                documents = documents.filter(n => !n.disabled);
                if (documents.length > 0) {
                    const items = [];
                    documents.map((doc)=> {
                        items.push({name: doc.title, link: `/docs/item/${doc.id}`});
                    });
                    results.push({heading: 'Documents', items})
                }
                good(results);
            }).catch((err)=> {
                bad(err);
            });
        });


        Promise.all([documentPromise, typePromise]).then((results)=> {
            const flat = [].concat(...results);
            socket.emit('results', flat);
        }).catch((err)=> {
            console.error('Socket "search" failed:', err && err.message ? err.message : err);
            socket.emit('error', {message: 'Search could not be completed.'});
        });


    })
};


module.exports = search;
