const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const config = require('../config.json');
const EmailTemplate = require('email-templates').EmailTemplate;
const path = require('path');
const templatesDir = path.resolve(__dirname, '..', 'views', 'email');

const email = {};

/**
 * Send email about new order
 * @param order
 * @param user
 */
email.newOrder = (order, user) => new Promise((good, bad)=> {

    const transporter = nodemailer.createTransport(smtpTransport({
        host: config.email.host,
        port: config.email.port
    }));

    const addresses = [];

    config.admins.map(username => {
        addresses.push(username + config.email.emailDomain);
    });


    const newOrder = transporter.templateSender(new EmailTemplate(path.join(templatesDir, 'new-order')), {
        from: config.email.from
    });
    console.log(order);
    newOrder({
        to: addresses,
        subject: 'SynBio - New Order',
        priority: 'high'
    }, {
        order,
        user,
        baseURL: config.baseURL
    }, (err, info) => {
        if (err) {
            return bad(err);
        } else {
            console.log('Message sent:', info.response);
            return good();
        }
    });
});

/**
 * Send email about new order
 * @param order
 */

email.orderReady = order => new Promise((good, bad)=> {

    const transporter = nodemailer.createTransport(smtpTransport({
        host: config.email.host,
        port: config.email.port
    }));


    const newOrder = transporter.templateSender(new EmailTemplate(path.join(templatesDir, 'order-ready')), {
        from: config.email.from
    });

    console.log('completed order', order);

    newOrder({
        to: order.username + config.email.emailDomain,
        subject: 'Your SynBio order is ready for collection',
        priority: 'high'
    }, {
        order,
        baseURL: config.baseURL
    }, (err, info) => {
        if (err) {
            return bad(err);
        } else {
            console.log('Message sent:', info.response);
            return good();
        }
    });
});


module.exports = email;