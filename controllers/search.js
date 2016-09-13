const Document = require('../models/document');
const Type = require('../models/type');

const search = io => {

    const clients = [];

    io.on('connection', socket => {
        clients[socket.id] = socket;

        socket.on('disconnect', () => {
            delete clients[socket.id];
        });

        socket.on('search', text => {
            function escapeRegExp(str) {
                return str.replace(/[\-\[\]\/{}()*+?.\\\^$|]/g, "\\$&");
            }

            text = escapeRegExp(text);

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
                console.error('err', err);
                socket.emit('error', err);
            });


        })

    });


};


module.exports = search;
