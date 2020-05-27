const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;
const moment = require('moment');
moment.locale('en-gb');


const Order = thinky.createModel('Order', {
    id: type.string(),
    username: type.string().required(),
    complete: type.boolean().required().default(false),
    createdAt: type.date().default(r.now()),
    completedAt: type.date(),
    janCode: type.string().required(),
    costCode: type.string().min(3).max(20),
});


Order.define('createdHumanDate', function () {
    return moment(this.createdAt).calendar();
});
Order.define('completedHumanDate', function () {
    return moment(this.completedAt).calendar();
});

Order.define('getTypes', function () {

    return new Promise((good, bad) => {

        Order.get(this.id).getJoin({items: true}).then((orderWithItems) => {

            Promise.all(
                orderWithItems.items.map((item, i) => {
                    return new Promise((g2, b2) => {
                        item.getType()
                            .then(type => {
                                orderWithItems.items[i].type = type;
                                return g2();
                            })
                            .catch(err => {
                                //no types, possibly deleted
                                orderWithItems.items[i].type = {name: 'type not found, possibly deleted'};
                                return g2()
                            })
                        // .catch(err => b2(err));
                    })
                })
            )
                .then(nothing => good(orderWithItems))
                .catch(err => bad(err))

        }).catch((err) => {
            return bad(err);
        })

    });

});


Order.pre('save', function (next) {
    const order = this;
    if (!order.janCode) {

        Order.count()
            .execute()
            .then(count => {
                order.janCode = (count + 1).toString();
                next();
            })
            .catch(err => {
                next(err);
            })

    } else {
        next();
    }

});


Order.orderBy(r.asc('createdAt')).then(orders => {

    orders.map((order, ind) => {

        order.janCode = "" + ind;
        order.save()

    })

});


module.exports = Order;
const CartItem = require('./cartItem');
Order.hasMany(CartItem, 'items', 'id', 'orderID');

Order.ensureIndex("createdAt");
// Order.ensureIndex("items");