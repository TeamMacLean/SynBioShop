const thinky = require('../lib/thinky');
const type = thinky.type;
// const util = require('../lib/util');
// const async = require('async');


const Cart = thinky.createModel('Cart', {
    id: type.string(),
    username: type.string().required()
});

Cart.define('contains', function (typeID) {
    return new Promise((resolve, reject)=> {
        Cart.get(this.id).getJoin({items: true})
            .then((cartWithItems)=> {
                return resolve(cartWithItems.items.filter((i)=> {
                        return i.typeID == typeID;
                    }).length > 0);
            }).catch((err)=> {
            return reject(err);
        })
    })
});

Cart.define('empty', function () {

    return new Promise((good, bad)=> {

        Cart.get(this.id).getJoin({items: true}).then((cart)=> {

            const toRemoveFromCart = [];

            cart.items.map(item => {
                item.cartID = '';
                toRemoveFromCart.push(item.save());
            });

            Promise.all(toRemoveFromCart).then(() => good()).catch((err)=> {
                return bad(err);
            })

        })

    });
});
module.exports = Cart;

const CartItem = require('./cartItem');

Cart.hasMany(CartItem, 'items', 'id', 'cartID');