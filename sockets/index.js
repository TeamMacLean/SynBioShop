const SocketCart = require('./cart');
const SocketSearch = require('./search');


module.exports = io => {
    //     clients[socket.id] = socket;
    io.on('connection', socket => {
        //
        //     socket.on('disconnect', () => {
        //         delete clients[socket.id];
        //     });
        SocketCart(socket);
        SocketSearch(socket);
    });


};