const renderError = require('../lib/renderError');
const Type = require('../models/type');
const Cart = require('../models/cart');
const ShoppingCart = {};

/**
 * render site index
 * @param req {request}
 * @param res {response}
 */
ShoppingCart.index = (req, res) => {
    const cart = res.locals.signedInUser.cart;
    Promise.all(cart.items.map(function (item) {
        return new Promise(function (good, bad) {
            Type.getByID(item).then(function (type) {
                return good(type[0])
            }).catch(function (err) {
                return bad(err);
            });
        });
    })).then(function (itemsInCart) {
        // console.log(itemsInCart);
        return res.render('cart/index', {itemsInCart});
    }).catch(function (err) {
        return renderError(err, res);
    });
};

ShoppingCart.add = (req, res, next) => {
    const typeID = req.params.typeID;
    if (!typeID) {
        return next();
    }
    Type.getByID(typeID).then((types) => {
        if (types.length == 1) {
            ShoppingCart.ensureAdd(req.user.username, types[0].id).then(() => {
                return res.redirect('/cart');
            }).catch((err) => {
                return renderError(err, res);
            })
        } else {
            if (types.length > 1) {
                return renderError(new Error('more than one type found with that id'), res);
            } else {
                return renderError(new Error('type not found'), res);
            }
        }
    }).catch((err) => {
        return renderError(err, res);
    })
};


ShoppingCart.ensureAdd = (username, typeID) => new Promise((good, bad) => {
    Cart.filter({username}).run().then(carts => {
        if (carts.length == 1) {
            carts[0].items = carts[0].items.concat(typeID);
            carts[0].save().then(saved => {
                return good(saved);
            }).catch(err => bad(err));
        } else {
            if (carts.length > 1) {
                return bad(new Error('more than one cart found for that user'));
            } else {
                const cart = new Cart({
                    username,
                    items: [typeID]
                });
                cart.save().then(saved => {
                    return good(saved)
                }).catch(err => {
                    return bad(err);
                })
            }
        }
    }).catch(err => {
        return bad(err);
    });

});


module.exports = ShoppingCart;