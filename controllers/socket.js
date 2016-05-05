const db = require('../models/db');

module.exports = io => {
    io.on('connection', socket => {
        socket.on('addDB', name => {

            const newDB = new db({name});
            newDB.save().then(result => {
                    socket.emit('addedDB', result)
                })
                .error(err => {
                    socket.emit('error', err);
                });
        });
    });
};