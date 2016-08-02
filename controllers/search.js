const Document = require('../models/document');
const Type = require('../models/type');

const search = function (io) {

    const clients = [];

    io.on('connection', function (socket) {
        clients[socket.id] = socket;

        socket.on('disconnect', function () {
            delete clients[socket.id];
        });

        socket.on('search', function (text) {

            const typePromise = new Promise((good, bad)=> {
                    const results = [];
                    Promise.all(Type.filterAll('name', "(?i)" + text))
                        .then((types)=> {
                            if (types) {
                                const flat = [].concat.apply([], types);
                                if (flat.length) {
                                    const items = [];
                                    flat.map((t)=> {
                                        items.push({name: t.name, link: '/premade/' + t.id});
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
                Document.filter(function (doc) {
                    return doc('title').match("(?i)" + text);
                }).then((documents)=> {
                    if (documents.length > 0) {
                        const items = [];
                        documents.map((doc)=> {
                            items.push({name: doc.title, link: '/doc/' + doc.id});
                        });
                        results.push({heading: 'Documents', items})
                    }
                    good(results);
                }).catch((err)=> {
                    bad(err);
                });
            });


            Promise.all([documentPromise, typePromise]).then((results)=> {
                const flat = [].concat.apply([], results);
                socket.emit('results', flat);
            }).catch((err)=> {
                socket.emit('error', err);
            });


        })

    });


};


module.exports = search;
