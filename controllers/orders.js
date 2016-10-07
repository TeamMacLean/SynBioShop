const renderError = require('../lib/renderError');
const Order = require('../models/order');
const Email = require('../lib/email');
const Flash = require('../lib/flash');
const Util = require('../lib/util');

const orders = {};

orders.show = (req, res) => {
    const orderID = req.params.id;
    Order.get(orderID).getJoin({items: true}).then((order)=> {
        order.getTypes().then((orderWithTypes)=> {
            return res.render('orders/show', {order: orderWithTypes});
        }).catch((err)=> renderError(err, res));
    }).catch((err)=> {
        return renderError(err, res);
    })
};

orders.mine = (req, res)=> {


};

orders.showAll = (req, res) => {

    var username = req.user.username;

    var filter = {};

    if (!Util.isAdmin(username)) {
        filter.username = username;
    }

    Order.filter(filter).getJoin({items: true}).then((orders)=> {

        const sortedOrders = {open: [], closed: []};

        orders.map((order)=> {
            if (order.complete) {
                sortedOrders.closed.push(order);
            } else {
                sortedOrders.open.push(order);
            }
        });
        return res.render('orders/all', {orders: sortedOrders});

    }).catch((err)=> renderError(err, res));


};

orders.markAsComplete = (req, res) => {

    const orderID = req.params.id;
    Order.get(orderID)
        .getJoin({items: true})
        .then((order)=> {
            order.getTypes().then((orderWithTypes)=> {
                orderWithTypes.complete = true;
                orderWithTypes.completedAt = Date.now();
                orderWithTypes.save()
                    .then(()=> {
                        Email.orderReady(orderWithTypes).then(()=> {
                            Flash.success(req, 'Completion email sent to user');
                            return res.redirect(`/order/${orderID}`);
                        }).catch((err)=> renderError(err, res));
                    })
                    .catch((err)=>renderError(err, res));
            })
                .catch((err)=>renderError(err, res));
        }).catch((err)=> renderError(err, res));
};

orders.markAsIncomplete = (req, res) => {

    const orderID = req.params.id;


    Order.get(orderID)
        .then((order)=> {
            order.complete = false;
            order.save()
                .then(()=> {
                    return res.redirect(`/order/${orderID}`);
                })
                .catch((err)=>renderError(err, res));
        })
        .catch((err)=>renderError(err, res));
};

// orders.showOpen = (req, res) => {
//
// };
//
// orders.showClosed = (req, res) => {
//
// };

module.exports = orders;