const thinky = require('../lib/thinky');
const type = thinky.type;
const util = require('../lib/util');


const Cart = thinky.createModel('Cart', {
    id: type.string(),
    username: type.string(),
    typeID: type.string(),
    items: [type.string()]
});


module.exports = Cart;