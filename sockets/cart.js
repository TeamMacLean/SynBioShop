const Type = require('../models/type');
const ShoppingCarts = require('../controllers/shoppingCart');

module.exports = socket => {

    socket.on('addToCart', (data)=> {
        var typeID = data.typeID;
        var username = data.username;

        console.log('data', data);

        if (typeID && username) {
            Type.getByID(typeID).then((type) => {
                ShoppingCarts.ensureCart(username, {items: true}).then((cart)=> {
                    // socket.emit('cartItemCount', cart.items.length);
                    cart.contains(typeID)
                        .then((alreadyInCart)=> {
                            if (alreadyInCart) {
                                console.log('already in cart');
                                return socket.emit('alreadyInCart', type);
                            } else {
                                ShoppingCarts.ensureAdd(username, type.id).then(() => {
                                    socket.emit('addedToCart', type);
                                }).catch((err) => {
                                    socket.emit('error', err);
                                })
                            }
                        }).catch((err)=> {
                        socket.emit('error', err);
                    });
                }).catch((err)=> {
                    socket.emit('error', err);
                });
            }).catch((err) => {
                socket.emit('error', err);
            });
        }

    });
};