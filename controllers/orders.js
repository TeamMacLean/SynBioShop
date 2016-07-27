const renderError = require('../lib/renderError');
const Order = require('../models/order');

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

orders.showAll = (req, res) => {

    Order.getJoin({items: true}).then((orders)=> {

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
        .then((order)=> {
            order.complete = true;
            order.save()
                .then(()=> {
                    return res.redirect('/order/' + orderID);
                })
                .catch((err)=>renderError(err, res));
        })
        .catch((err)=>renderError(err, res));
};

orders.markAsInComplete = (req, res) => {

    const orderID = req.params.id;


    Order.get(orderID)
        .then((order)=> {
            order.complete = false;
            order.save()
                .then(()=> {
                    return res.redirect('/order/' + orderID);
                })
                .catch((err)=>renderError(err, res));
        })
        .catch((err)=>renderError(err, res));
};

orders.showOpen = (req, res) => {

};

orders.showClosed = (req, res) => {

};

module.exports = orders;