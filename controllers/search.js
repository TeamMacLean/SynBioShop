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

            var searches = [];

            searches = searches.concat(Type.filterAll('name', text));

            searches = searches.concat(Document.filter(function (doc) {
                return doc('name').match(text);
            }));

            Promise.all(searches).then((results)=> {
                const flat = [].concat.apply([], results);
                socket.emit('results', flat);
            }).catch((err)=> {
                socket.emit('error', err);
            });

        })

    });


};


module.exports = search;
