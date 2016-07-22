const renderError = require('../lib/renderError');
const Type = require('../models/type');
const Cart = require('../models/cart');
const CartItem = require('../models/cartItem');
const Log = require('../lib/log');
const ShoppingCart = {};

/**
 * render site index
 * @param req {request}
 * @param res {response}
 */
ShoppingCart.index = (req, res) => {
    Cart.filter({username: req.user.username}).getJoin({items: true}).then(function (carts) {
        if (carts.length == 1) {
            const cart = carts[0];
            const promises = cart.items.map(function (item) {

                return new Promise((resolve, reject)=> {
                    item.getType().then((foundTypes)=> {
                        if (foundTypes.length == 1) {
                            item.type = foundTypes[0];
                            return resolve(item);
                        } else {
                            return reject('found multiple types by id ' + item.typeID);
                        }
                    }).catch((err)=> {
                        return reject(err);
                    });
                })
            });
            Promise.all(promises).then((updatedItems)=> {
                cart.items = [].concat.apply([], updatedItems);
                return res.render('cart/index', {cart});
            }).catch((err)=> {
                return renderError(err, res);
            });

        } else {
            return renderError('found multiple carts for user ' + req.user.username, res);
        }
    }).error(function (err) {
        return renderError(err, res);
    });
};

ShoppingCart.add = (req, res, next) => {
    const typeID = req.params.typeID;
    if (!typeID) {
        return next('no type ID given');
    }

    Type.getByID(typeID).then((types) => {
        if (types.length == 1) {
            ShoppingCart.ensureCart(req.user.username, {items: true}).then((cart)=> {
                console.log('THI CART', cart);
                cart.contains(typeID)
                    .then((alreadyInCart)=> {
                        if (alreadyInCart) {
                            return res.render('cart/exists');
                        } else {
                            ShoppingCart.ensureAdd(req.user.username, types[0].id).then(() => {
                                return res.redirect('/cart');
                            }).catch((err) => {
                                return renderError(err, res);
                            })
                        }
                    }).catch((err)=> {
                    return renderError(err, res);
                });
            }).catch((err)=> {
                return renderError(err, res);
            });
        } else {
            if (types.length > 1) {
                Log.error('TYPES', types);
                return renderError(new Error('more than one type found with that id'), res);
            } else {
                return renderError(new Error('type not found'), res);
            }
        }
    }).catch((err) => {
        return renderError(err, res);
    });
};

ShoppingCart.ensureCart = (username, join) => new Promise((good, bad) => {
    join = join || {};
    Cart.filter({username}).getJoin(join).then(carts => {
        if (carts.length < 1) {
            new Cart({
                username
            }).save().then(savedCart => {
                return good(savedCart);
            }).catch(err => {
                return bad(err);
            });
        } else {
            return good(carts[0]);
        }
    }).catch(err => {
        return bad(err);
    });
});

ShoppingCart.ensureAdd = (username, typeID) => new Promise((good, bad) => {
    ShoppingCart.ensureCart(username).then((cart)=> {
        new CartItem({cartID: cart.id, typeID: typeID})
            .save().then(() => {
            return good(cart);
        }).catch(err => {
            return bad(err);
        });
    });
});

ShoppingCart.placeOrder = (req, res, next) => {
    return res.redirect('');
};


// Cart.filter({username}).run().then(carts => {
//     if (carts.length == 1) {
//         const foundCart = carts[0];
//         new CartItem({cartID: foundCart.id, typeID: typeID})
//             .save().then(savedCartItem => {
//             foundCart.items = [savedCartItem];
//             return good(foundCart);
//         }).catch(err => {
//             return bad(err);
//         });
//     } else {
//         if (carts.length > 1) {
//             return bad(new Error('more than one cart found for that user'));
//         } else {
//             new Cart({
//                 username
//             }).save().then(savedCart => {
//                 new CartItem({cartID: savedCart.id, typeID: typeID})
//                     .save().then(savedCartItem => {
//                     savedCart.items = [savedCartItem];
//                     return good(savedCart);
//                 }).catch(err => {
//                     return bad(err);
//                 });
//             }).catch(err => {
//                 return bad(err);
//             })
//         }
//     }
// }).catch(err => {
//     return bad(err);
// });

ShoppingCart.update = (req, res) => {

};


module.exports = ShoppingCart;