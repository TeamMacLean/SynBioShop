const thinky = require('../lib/thinky');
const type = thinky.type;


const User = thinky.createModel('User', {
    id: type.string(),
    username: type.string().required(),
    name: type.string().required(),
    email: type.string().required()
});


module.exports = User;

const Order = require('./order');
User.hasMany(Order, 'orders', 'username', 'username');

const Cart = require('./cart');
User.hasMany(Cart, 'cart', 'username', 'username');