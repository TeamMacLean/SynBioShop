const thinky = require( '../lib/thinky');
const type = thinky.type;
const r = thinky.r;
// const util = require('../lib/util');
// const async = require('async');


const Cart = thinky.createModel('Cart', {
    id: type.string(),
    username: type.string().required()
});

/**
 * Whether this cart already holds an item for the given type.
 *
 * Counts in the database rather than loading every item, and tolerates the
 * cart having been deleted (getJoin resolves null, which used to throw).
 *
 * @param {string} typeID
 * @returns {Promise<boolean>}
 */
Cart.define('contains', function (typeID) {
    return r.table('CartItem')
        .filter({cartID: this.id, typeID})
        .count()
        .run()
        .then(count => count > 0);
});

/**
 * Detaches every item from this cart.
 *
 * Rewritten as a single atomic ReQL update. The previous version read the cart,
 * then saved each item individually, and had no `.catch` on the outer chain —
 * so any failure (including the cart having been deleted, which resolves to
 * null here) left the promise permanently unsettled. `placeOrder` awaits this,
 * so the effect was an order that committed and then hung the request forever.
 *
 * @param {string[]} [itemIDs] - Restrict to these items. Order placement passes
 *   the exact IDs it captured, so an item added mid-checkout is not silently
 *   detached without ever being ordered.
 * @returns {Promise<void>}
 */
Cart.define('empty', function (itemIDs) {
    const cartID = this.id;

    const query = Array.isArray(itemIDs)
        ? (itemIDs.length === 0
            ? null
            : r.table('CartItem').getAll(...itemIDs).filter({cartID}))
        : r.table('CartItem').filter({cartID});

    if (query === null) return Promise.resolve();

    return query.update({cartID: ''}).run().then(() => undefined);
});
module.exports = Cart;
const CartItem = require('./cartItem');
// model name
// items name for those CartItems
// id is the local key
// cart is the foreign key
Cart.hasMany(CartItem, 'items', 'id', 'cartID');