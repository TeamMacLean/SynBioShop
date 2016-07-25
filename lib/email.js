const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const config = require('../config.json');
const email = {};
const EmailTemplate = require('email-templates').EmailTemplate;
const path = require('path');


var templatesDir = path.resolve(__dirname, '..', 'views', 'email');

email.newOrder = function (subject, text, order, user) {

    return new Promise((good, bad)=> {

        var transporter = nodemailer.createTransport(smtpTransport({
            host: config.email.host,
            port: config.email.port
        }));

        const addresses = [];

        config.admins.map(function (username) {
            addresses.push(username + config.email.emailDomain);
        });


        var newOrder = transporter.templateSender(new EmailTemplate(path.join(templatesDir, 'new-order')), {
            from: config.email.from
        });

        newOrder({
            to: addresses,
            subject: subject,
        }, {
            text: text,
            order: order,
            user: user,
            baseURL: config.baseURL
        }, function (err, info) {
            if (err) {
                return bad(err);
            } else {
                console.log('Message sent:', info.response);
                return good();
            }
        });
    })

};

email.emailSomeone = function (subject, text, addresses) {
    var transporter = nodemailer.createTransport(smtpTransport({
        host: config.email.host,
        port: config.email.port
    }));
    transporter.sendMail({
        from: config.email.from,
        to: addresses,
        subject: subject,
        text: text
    }, function (err, info) {
        if (err) {
            console.error(err);
        } else {
            console.log('Message sent:', info.response);
        }
    });

};


module.exports = email;