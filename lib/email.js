const nodemailer = require("nodemailer");
const smtpTransport = require("nodemailer-smtp-transport");
const { EmailTemplate } = require("email-templates");
const path = require("path");

const config = require("../config.json");
const { emailAdmins, admins, devMode, email: emailConfig } = config;

const templatesDir = path.resolve(__dirname, "..", "views", "email");

const emailService = {};

const transporter = nodemailer.createTransport(
  smtpTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    // Add other SMTP options here if necessary (e.g., secure, auth)
  })
);

/**
 * Centralised function to send emails using Nodemailer templates.
 * @param {string} templateName - The name of the email template folder.
 * @param {object} templateData - Data for the email template.
 * @param {object} mailOptions - Nodemailer mail options.
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
    return Promise.reject(err);
  }
};

/**
 * Send email about new order to customers and admins.
 * @param {object} order - The order object.
 * @param {object} user - The user object who placed the order.
 */
emailService.newOrder = async (order, user) => {
  const adminAddresses = emailAdmins.map(username => username + config.email.emailDomain);
  let signatoryAddress = null;

  if (order.signatory) {
    const targetUsername = devMode
      ? config.emailAdmins[0] + '+' + order.signatory // Prefix for devMode: adminEmail+signatory@domain
      : order.signatory;
    // signatoryAddress = targetUsername + config.email.emailDomain;
    signatoryAddress = 'deeks@nbi.ac.uk'; // HACK for now, deeks+example@nbi.ac.uk is not currently working (previously was)
  }

  const toAddresses = adminAddresses; // Start with admin addresses
  if (signatoryAddress) {
    toAddresses.push(signatoryAddress); // Add signatory if present
  }

  const mailOptions = {
    to: toAddresses.join(', '),
    subject: "SynBio - New Order",
    priority: "high",
  };

  const templateData = {
    order,
    user,
    baseURL: config.baseURL,
  };

  try {
    await emailService.sendEmail("new-order", templateData, mailOptions);
  } catch (err) {
    console.error('Failed to send new order email:', err);
  }
};

/**
 * Send email confirming the order is ready for collection.
 * @param {object} order - The order object.
 */
emailService.orderReady = async (order) => {
  let recipientEmail;

  if (devMode) {
    // If devMode is true, send to the first admin + customer's username
    // const adminUsername = config.emailAdmins[0]; // e.g., 'deeks'
    // const customerUsername = order.username; // e.g., 'jeff'
    // recipientEmail = adminUsername + '+' + customerUsername + config.email.emailDomain; // e.g., 'deeks+jeff@nbi.ac.uk'
    recipientEmail = 'deeks@nbi.ac.uk'; // HACK for now, deeks+example@nbi.ac.uk is not currently working (previously was)
  } else {
    // In production, send directly to the customer
    recipientEmail = order.username + config.email.emailDomain;
  }

  const mailOptions = {
    to: 'deeks@nbi.ac.uk',
    subject: "Your SynBio order is ready for collection",
    priority: "high",
  };

  const templateData = {
    order,
    baseURL: config.baseURL,
  };

  try {
    // console.table(templateData)
    // console.table(mailOptions)
    await emailService.sendEmail("order-ready", templateData, mailOptions);
  } catch (err) {
    console.error('Failed to send order ready email:', err);
    // You might want to send a system error email here
  }
};

module.exports = emailService;