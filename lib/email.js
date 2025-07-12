const nodemailer = require("nodemailer");
const smtpTransport = require("nodemailer-smtp-transport");
const { EmailTemplate } = require("email-templates");
const path = require("path");
const Order = require("../models/order"); // Assuming Order is still needed for email.newOrder context

const config = require("../config.json");
const { emailAdmins, admins, devMode, email: emailConfig } = config; // Destructure email config

const templatesDir = path.resolve(__dirname, "..", "views", "email");

const emailService = {};

// Helper function to create a Nodemailer transporter
// Moved outside specific email functions to avoid re-creation
const transporter = nodemailer.createTransport(
  smtpTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    // Add other SMTP options here if necessary (e.g., secure, auth)
    // secure: emailConfig.secure, // true for 465, false for other ports
    // auth: {
    //   user: emailConfig.auth.user,
    //   pass: emailConfig.auth.pass,
    // },
  })
);

/**
 * Centralised function to send emails using Nodemailer templates.
 * @param {string} templateName - The name of the email template folder (e.g., "new-order").
 * @param {object} templateData - Data to be passed to the email template.
 * @param {object} mailOptions - Nodemailer mail options (to, subject, etc.).
 * @returns {Promise<void>} A promise that resolves on success or rejects on error.
 */
emailService.sendEmail = async (templateName, templateData, mailOptions) => {
  try {
    const template = new EmailTemplate(path.join(templatesDir, templateName));
    const emailSender = transporter.templateSender(template, { from: emailConfig.from });

    await emailSender(mailOptions, templateData);
    console.log(`Email sent successfully to: ${mailOptions.to} with subject: "${mailOptions.subject}"`);
    return Promise.resolve();
  } catch (err) {
    console.error(`Error sending email to ${mailOptions.to} with subject "${mailOptions.subject}":`, err);
    // Re-throw or return a rejected promise to indicate failure
    return Promise.reject(err);
  }
};

/**
 * Send email about new order to customers and admins.
 * @param {object} order - The order object.
 * @param {object} user - The user object who placed the order.
 */
emailService.newOrder = async (order, user) => {
  const adminAddresses = emailAdmins.map(username => `${username}${config.email.emailDomain}`);
  let signatoryAddress = null;

  if (order.signatory) {
    // Dynamically construct signatory email, accounting for devMode
    const targetUsername = devMode
      ? `${config.emailAdmins[0]}+${order.signatory}` // Prefix for devMode
      : order.signatory;
    signatoryAddress = `${targetUsername}${config.email.emailDomain}`;
  }

  const toAddresses = [...adminAddresses];
  if (signatoryAddress) {
    toAddresses.push(signatoryAddress);
  }

  const mailOptions = {
    to: toAddresses.join(', '), // Join addresses into a single string
    subject: "SynBio - New Order",
    priority: "high",
  };

  const templateData = {
    order,
    user,
    baseURL: config.baseURL,
  };

  // Order.count() execution wasn't being used, removed. If needed, use it elsewhere.
  try {
    await emailService.sendEmail("new-order", templateData, mailOptions);
  } catch (err) {
    // The sendEmail function already logs the error, so we just need to handle the rejection here.
    // If a more specific action is needed (e.g., retrying, alerting admins via a separate channel),
    // it could be done here. For now, the logging within sendEmail is sufficient.
    // We are NOT sending another system error email here, as sendEmail already logged it.
  }
};

/**
 * Send email confirming the order is ready for collection.
 * @param {object} order - The order object.
 */
emailService.orderReady = async (order) => {
  const mailOptions = {
    to: `${order.username}${config.email.emailDomain}`,
    subject: "Your SynBio order is ready for collection",
    priority: "high",
  };

  const templateData = {
    order,
    baseURL: config.baseURL,
  };

  try {
    await emailService.sendEmail("order-ready", templateData, mailOptions);
  } catch (err) {
    // Similar to newOrder, the sendEmail function logs the error.
  }
};

module.exports = emailService;