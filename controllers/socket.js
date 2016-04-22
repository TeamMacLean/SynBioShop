var db = require('../models/db');

module.exports = function (io) {
  io.on('connection', (socket) => {
    socket.on('addDB', (name) => {

      var newDB = new db({name: name});
      newDB.save().then((result) => {
          socket.emit('addedDB', result)
        })
        .error((err) => {
          socket.emit('error', err);
        });

      //console.log('received', name);
    });
  });
};

