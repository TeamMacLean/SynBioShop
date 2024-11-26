const nodemailer = require("nodemailer");
const smtpTransport = require("nodemailer-smtp-transport");
const config = require("../config.json");
const EmailTemplate = require("email-templates").EmailTemplate;
const path = require("path");
const templatesDir = path.resolve(__dirname, "..", "views", "email");
const Order = require("../models/order");

const { emailAdmins, admins, devMode } = config;

const email = {};

/**
 * Send email about new order
 * @param order
 * @param user
 */
email.newOrder = (order, user) =>
  new Promise((good, bad) => {
    const transporter = nodemailer.createTransport(
      smtpTransport({
        host: config.email.host,
        port: config.email.port,
      })
    );

    const addresses = [];

    emailAdmins.map((username) => {
      addresses.push(username + config.email.emailDomain);
    });

    if (order.signatory)  {
      const inDevMode = !!config.devMode;
      console.log('inDevMode?', inDevMode);
      if (inDevMode) {
        addresses.push(config.emailAdmins[0] + '+' + order.signatory + config.email.emailDomain);
      } else {
        addresses.push(order.signatory + config.email.emailDomain);
      }
    }

    Order.count()
      .execute()
      .then((count) => {
        // console.log('count when sending email', count)
      })
      .then((_) => {
        const newOrder = transporter.templateSender(
          new EmailTemplate(path.join(templatesDir, "new-order")),
          {
            from: config.email.from,
          }
        );
        newOrder(
          {
            to: addresses,
            subject: "SynBio - New Order",
            priority: "high",
          },
          {
            order,
            user,
            baseURL: config.baseURL,
          },
          (err, _) => {
            if (err) {
              return bad(err);
            } else {
              console.log("New Order email sent to:", addresses);
              return good();
            }
          }
        );
      });
  });

/**
 * Send email about new order
 * @param order
 */

email.orderReady = (order) =>
  new Promise((good, bad) => {
    const transporter = nodemailer.createTransport(
      smtpTransport({
        host: config.email.host,
        port: config.email.port,
      })
    );

    const newOrder = transporter.templateSender(
      new EmailTemplate(path.join(templatesDir, "order-ready")),
      {
        from: config.email.from,
      }
    );

    newOrder(
      {
        to: order.username + config.email.emailDomain,
        subject: "Your SynBio order is ready for collection",
        priority: "high",
      },
      {
        order,
        baseURL: config.baseURL,
      },
      (err, _) => {
        if (err) {
          return bad(err);
        } else {
              console.log("Completed Order email sent to:", order.username);
          return good();
        }
      }
    );
  });

module.exports = email;
