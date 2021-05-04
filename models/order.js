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
    totalCost: type.string(),
    totalQuantity: type.string().min(1),
    pricePerUnit: type.string(),
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
                const newJanCode = count + 1;
                const newJanCodeStr = newJanCode.toString();
                if (typeof(newJanCodeStr) !== 'string'){
                    console.error('Did not convert JanCode to string')
                }
                if (!(newJanCode > count)){
                    console.error('JanCode is not increased from count')
                }
                console.log('originalCount', count,'new jancode:', newJanCode, 'as string:', newJanCodeStr)
                order.janCode = newJanCodeStr;
                if (order.janCode != newJanCodeStr){
                    console.error('Problems assigning order.janCode')
                }
                next();
            })
            .catch(err => {
                next(err);
            })

    } else {
        console.log('JanCode established as:', order.janCode, 'count not available unless added to code')
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