const renderError = require('../lib/renderError');
const Order = require('../models/order');

const orders = {};

orders.show = (req, res) => {

    const orderID = req.params.id;

    Order.get(orderID).getJoin({items: true}).then((order)=> {

        order.getTypes().then((orderWithTypes)=> {
            return res.render('orders/show', {order: orderWithTypes});

        }).catch((err)=> {
            return renderError(err, res);
        })


    }).catch((err)=> {
        return renderError(err, res);
    })


};

module.exports = orders;