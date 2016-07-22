const thinky = require('../lib/thinky');
const type = thinky.type;
const util = require('../lib/util');


const Cart = thinky.createModel('Cart', {
    id: type.string(),
    username: type.string()
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
module.exports = Cart;

const CartItem = require('./cartItem');

Cart.hasMany(CartItem, 'items', 'id', 'cartID');