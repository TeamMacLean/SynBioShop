const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const config = require('../config.json');
const email = {};
const EmailTemplate = require('email-templates').EmailTemplate;
const path = require('path');


var templatesDir = path.resolve(__dirname, '..', 'views', 'email');

email.newOrder = (order, user) => new Promise((good, bad)=> {

    var transporter = nodemailer.createTransport(smtpTransport({
        host: config.email.host,
        port: config.email.port
    }));

    const addresses = [];

    config.admins.map(username => {
        addresses.push(username + config.email.emailDomain);
    });


    var newOrder = transporter.templateSender(new EmailTemplate(path.join(templatesDir, 'new-order')), {
        from: config.email.from
    });

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

email.orderReady = order => new Promise((good, bad)=> {

    var transporter = nodemailer.createTransport(smtpTransport({
        host: config.email.host,
        port: config.email.port
    }));


    var newOrder = transporter.templateSender(new EmailTemplate(path.join(templatesDir, 'order-ready')), {
        from: config.email.from
    });

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