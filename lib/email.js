const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const config = require('../config.json');
const EmailTemplate = require('email-templates').EmailTemplate;
const path = require('path');
const templatesDir = path.resolve(__dirname, '..', 'views', 'email');
const Order = require('../models/order');

const { emailAdmins, admins } = config;

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

    emailAdmins.map(username => {
        addresses.push(username + config.email.emailDomain);
    });

    // delete this next time, it does nothing
    //user.isAdmin = admins.includes(user.username);
    
    console.log('Order jancode sent to NEW ORDER email:', order.janCode)

    Order
        .count()
        .execute()
        .then(count => {
            console.log('count is:', count)
        })
            .then(_ => {

            
                const newOrder = transporter.templateSender(new EmailTemplate(path.join(templatesDir, 'new-order')), {
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
            

        })


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
    
    console.log('Order jancode sent to COMPLETED ORDER email:', order.janCode)

    newOrder({
        // to: [order.username + config.email.emailDomain, "george.deeks@tsl.ac.uk"],
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