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

            // var searches = [];

            const results = [];

            // example:
            // [
            //   {heading: 'heading',
            //   results: [
            //     {name:'name', link: 'link'}
            //   ]
            //   }
            // ]


            const typePromise = new Promise((good, bad)=> {
                    Promise.all(Type.filterAll('name', text))
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

            Document.filter(function (doc) {
                return doc('(?i)title').match(text);
            }).then((documents)=> {

            }).catch((err)=> {
                console.error(err);
            });


            // searches = searches.concat(
            //     Type.filterAll('name', text)
            // );
            //
            // searches = searches.concat(
            //     Document.filter(function (doc) {
            //         return doc('title').match(text);
            //     })
            // );

            //
            // Promise.all(searches).then((results)=> {
            //     const flat = [].concat.apply([], results);
            //     socket.emit('results', flat);
            // }).catch((err)=> {
            //     socket.emit('error', err);
            // });


        })

    });


};


module.exports = search;
