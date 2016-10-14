const renderError = require('../lib/renderError');
// const Type = require('../models/type');
const Cart = require('../models/cart');
const CartItem = require('../models/cartItem');
const Order = require('../models/order');
// const Log = require('../lib/log');
// const async = require('async');
const Email = require('../lib/email');
const Flash = require('../lib/flash');

const ShoppingCart = {};

ShoppingCart.index = (req, res) => {
    ShoppingCart.ensureCart(req.user.username, {items: true})
        .then((cart)=> {

            if (!cart.items) {
                cart.items = [];
            }

            const promises = cart.items.map(item => new Promise((resolve, reject)=> {
                item.getType().then((type)=> {
                    item.type = type;
                    return resolve(item);
                }).catch((err)=> {
                    return reject(err);
                });
            }));
            Promise.all(promises).then((updatedItems)=> {

                // console.log('ui',updatedItems);

                cart.items = [].concat(...updatedItems);

                // console.log(cart.items);

                return res.render('cart/index', {cart});
            }).catch((err)=> {
                return renderError(err, res);
            });

        }).catch(err => renderError(err, res));
};

// ShoppingCart.add = (req, res, next) => {
//     const typeID = req.params.typeID;
//     if (!typeID) {
//         return next('no type ID given');
//     }
//
//     Type.getByID(typeID).then((type) => {
//         // console.log('adding to cart', type);
//         // if (types.length == 1 || !types.length) {
//
//
//         ShoppingCart.ensureCart(req.user.username, {items: true}).then((cart)=> {
//             cart.contains(typeID)
//                 .then((alreadyInCart)=> {
//                     if (alreadyInCart) {
//                         Flash.info(req, 'Item is already in cart');
//                         return res.redirect(`/premade/category/${type.categoryID}`);
//                         // return res.render('cart/exists');
//                     } else {
//                         ShoppingCart.ensureAdd(req.user.username, type.id).then(() => {
//                             Flash.success(req, 'Added to cart');
//
//                             return res.redirect(`/premade/category/${type.categoryID}`);
//
//                             // return res.redirect('/cart');
//                         }).catch((err) => {
//                             return renderError(err, res);
//                         })
//                     }
//                 }).catch((err)=> {
//                 return renderError(err, res);
//             });
//         }).catch((err)=> {
//             return renderError(err, res);
//         });
//         // } else {
//         //     if (types.length > 1) {
//         //         Log.error('TYPES', types);
//         //         return renderError(new Error('more than one type found with that id'), res);
//         //     } else {
//         //         return renderError(new Error('type not found'), res);
//         //     }
//         // }
//     }).catch((err) => {
//         return renderError(err, res);
//     });
// };
//
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
        new CartItem({cartID: cart.id, typeID})
            .save().then(() => {
            return good(cart);
        }).catch(err => {
            return bad(err);
        });
    });
});
//
// ShoppingCart.update = (req, res) => {
//
//     var items = req.body.item;
//
//
//     if (items && !Array.isArray(items)) {
//         items = [items]
//     }
//
//     async.each(items, (itemID, cb)=> {
//         CartItem.get(itemID).then((item)=> {
//             item.largeScale = !!req.body[`largeScale-${itemID}`];
//             item.save().then(()=> {
//                 return cb();
//             }).catch(err => {
//                 return cb(err);
//             });
//         }).catch(err => {
//             return cb(err);
//         });
//     }, (err)=> {
//         if (err) {
//             return renderError(err, res);
//         } else {
//             Flash.success(req, 'Cart updated');
//             return res.redirect('/cart');
//         }
//     });
// };
//
// ShoppingCart.remove = (req, res, next) => {
//     return res.redirect('/');
// };

ShoppingCart.placeOrder = (req, res) => {
    const username = req.user.username;
    ShoppingCart.ensureCart(username, {items: true}).then((cart)=> {
        new Order({username}).save().then((savedOrder)=> {
            const saving = [];

            cart.items.map(item => {
                item.orderID = savedOrder.id;
                saving.push(item.save());
            });

            Promise.all(saving).then(()=> {
                savedOrder.getTypes().then((orderWithTypes)=> {
                    console.log('passing to email', orderWithTypes);
                    Email.newOrder(orderWithTypes, req.user).then(()=> {
                        cart.empty().then(()=> {
                            Flash.success(req, 'Order successfully placed');
                            return res.redirect('/cart');
                        }).catch((err)=> {
                            return renderError(err, res);
                        })
                    }).catch((err)=> {
                        return renderError(err, res);
                    });
                }).catch((err)=> {
                    return renderError(err, res);
                });

            }).catch((err)=> {
                return renderError(err, res);
            });

        }).catch((err)=> {
            return renderError(err, res);
        });


    }).catch((err)=> {
        return renderError(err, res);
    });
};

module.exports = ShoppingCart;