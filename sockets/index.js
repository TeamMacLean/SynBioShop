const SocketCart = require("./cart");
const SocketSearch = require("./search");

/**
 * Rejects unauthenticated sockets and attaches the handlers.
 *
 * Previously every connection — including anonymous ones — got the cart
 * handlers, and those handlers took the username straight from the message
 * payload. Anyone could stuff or empty another user's cart without logging in.
 *
 * app.js runs the Express session and passport middleware on the socket
 * handshake, so `socket.request.user` is populated exactly as it is for HTTP.
 */
module.exports = (io) => {
  io.use((socket, next) => {
    const req = socket.request;
    const user = req && req.user;

    if (!user || !user.username) {
      return next(new Error("unauthorized"));
    }

    // Pin the identity to the connection. Handlers read this and never trust
    // a username sent by the client.
    socket.data.username = user.username;
    return next();
  });

  io.on("connection", (socket) => {
    SocketCart(socket);
    SocketSearch(socket);
  });
};
