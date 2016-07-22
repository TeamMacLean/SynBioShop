const thinky = require('../lib/thinky');
const type = thinky.type;
const util = require('../lib/util');

const QUANTITY_OPTIONS = {normal: 'regular', large: 'large'};

const CartItem = thinky.createModel('CartItem', {
    id: type.string(),
    cartID: type.string().required(),
    typeID: type.string().required(),
    quantity: type.string().required().default(QUANTITY_OPTIONS.normal)
});
CartItem.QUANTITY_OPTIONS = QUANTITY_OPTIONS;

CartItem.define('getType', function () {
    const Type = require('./type');
    return Type.getByID(this.typeID);
});

CartItem.define('otherQuantities', function () {
    return Object.keys(QUANTITY_OPTIONS).filter((v)=> {
        return v != this.quantity;
    });
});

module.exports = CartItem;

const Cart = require('./cart');
CartItem.belongsTo(Cart, 'cart', 'id', 'cartID');
