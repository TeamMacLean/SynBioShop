const Type = require('../models/type');
const ShoppingCarts = require('../controllers/shoppingCart');
const CartItem = require('../models/cartItem');

module.exports = socket => {

    socket.on('addToCart', (data)=> {
        var typeID = data.typeID;
        var username = data.username;

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

    socket.on('removeFromCart', (data)=> {
        CartItem.get(data.id)
            .then((item)=> {
                item.delete()
                    .then(()=> {
                        socket.emit('removedFromCart', {
                            id: data.id
                        });
                    })
                    .catch((err)=> {
                        socket.emit('error', err);
                    });
            })
            .catch((err)=> {
                socket.emit('error', err);
            })
    });

    socket.on('changeQuantity', (data)=> {
        CartItem.get(data.id)
            .then((item)=> {
                item.largeScale = !item.largeScale;
                item.save()
                    .then((savedItem)=> {
                        //send done
                        socket.emit('quantityUpdated', {id: savedItem.id, large: savedItem.largeScale});
                    })
                    .catch((err)=> {
                        socket.emit('error', err);
                    })
            })
            .catch((err)=> {
                socket.emit('error', err);
            });

    });
};