const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;
const moment = require('moment');


const Order = thinky.createModel('Order', {
    id: type.string(),
    username: type.string().required(),
    complete: type.boolean().required().default(false),
    createdAt: type.date().default(r.now()),
    completedAt: type.date()
});

Order.define('createdHumanDate', function () {
    return moment(this.createdAt).calendar();
});
Order.define('completedHumanDate', function () {
    return moment(this.completedAt).calendar();
});

Order.define('getTypes', function () {

    return new Promise((good, bad)=> {
        const gettingTypes = [];

        Order.get(this.id).getJoin({items: true}).then((orderWithItems)=> {
            orderWithItems.items.map((item) => {
                gettingTypes.push(item.getType());
            });

            Promise.all(gettingTypes).then((types)=> {

                orderWithItems.items.map((item, i)=> {
                    item.type = types[i];
                });

                return good(orderWithItems);

            }).catch((err)=> {
                return bad(err);
            })
        }).catch((err)=> {
            return bad(err);
        })

    });

});


module.exports = Order;
const CartItem = require('./cartItem');
Order.hasMany(CartItem, 'items', 'id', 'orderID');