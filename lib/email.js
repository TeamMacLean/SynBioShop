const nodemailer = require("nodemailer");

const Email = require("email-templates");
const path = require("path");

const config = require("../config.json");
const { emailAdmins, admins, devMode, email: emailConfig } = config;

const templatesDir = path.resolve(__dirname, "..", "views", "email");

const emailService = {};

const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.port,
  // Add other SMTP options here if necessary (e.g., secure, auth)
  secure: false,
  tls: {
    rejectUnauthorized: false,
  },
});

/**
 * Centralised function to send emails using Nodemailer templates.
 * @param {string} templateName - The name of the email template folder.
 * @param {object} templateData - Data for the email template.
 * @param {object} mailOptions - Nodemailer mail options.
 * @returns {Promise<void>} A promise that resolves on success or rejects on error.
 */
emailService.sendEmail = async (templateName, templateData, mailOptions) => {
  try {
    // In dev mode, just console log the email instead of sending
    if (devMode) {
      console.log("\n" + "=".repeat(60));
      console.log("📧 DEV MODE: Email would be sent");
      console.log("=".repeat(60));
      console.log(`Template: ${templateName}`);
      console.log(`To: ${mailOptions.to}`);
      console.log(`Subject: ${mailOptions.subject}`);
      console.log("=".repeat(60) + "\n");

      return Promise.resolve();
    }

    // Production mode - send actual email
    const email = new Email({
      message: {
        from: emailConfig.from,
      },
      transport: transporter,
      views: {
        root: templatesDir,
      },
      juice: true,
      juiceResources: {
        preserveImportant: true,
        webResources: {
          relativeTo: templatesDir,
        },
      },
    });

    await email.send({
      template: templateName,
      message: {
        to: mailOptions.to,
        subject: mailOptions.subject,
        priority: mailOptions.priority,
      },
      locals: templateData,
    });

    console.log(
      `Email sent successfully to: ${mailOptions.to} with subject: "${mailOptions.subject}"`,
    );
    return Promise.resolve();
  } catch (err) {
    console.error(
      `Error sending email to ${mailOptions.to} with subject "${mailOptions.subject}":`,
      err,
    );
    return Promise.reject(err);
  }
};

/**
 * Send email about new order to customers and admins.
 * @param {object} order - The order object.
 * @param {object} user - The user object who placed the order.
 */
emailService.newOrder = async (order, user) => {
  const adminAddresses = emailAdmins.map(
    (username) => username + config.email.emailDomain,
  );
  let signatoryAddress = null;

  if (order.signatory) {
    if (devMode) {
      // In dev mode, use plus addressing to route to admin but show it's working
      signatoryAddress = `deeks+${order.signatory}${config.email.emailDomain}`;
    } else {
      // In production, use actual signatory email
      signatoryAddress = order.signatory + config.email.emailDomain;
    }
  }

  let toAddresses = adminAddresses; // Start with admin addresses
  toAddresses.push(order.username + config.email.emailDomain); // Add customer address
  if (signatoryAddress) {
    toAddresses.push(signatoryAddress); // Add signatory if present (production only)
  }

  // Remove duplicates
  toAddresses = [...new Set(toAddresses)];

  const mailOptions = {
    to: toAddresses.join(", "),
    subject: "SynBio - New Order",
    priority: "high",
  };

  const templateData = {
    order,
    user,
    baseURL: config.baseURL,
  };

  try {
    if (devMode) {
      console.log(
        `📧 New order email - Order: ${order.janCode || order.id.slice(0, 8)} | Customer: ${order.username} | Recipients: ${toAddresses.join(", ")}`,
      );
    }
    await emailService.sendEmail("new-order", templateData, mailOptions);
  } catch (err) {
    console.error("Failed to send new order email:", err);
  }
};

/**
 * Send email confirming the order is ready for collection.
 * @param {object} order - The order object.
 */
emailService.orderReady = async (order) => {
  let recipientEmail;

  if (devMode) {
    // In dev mode, send to first admin
    recipientEmail = emailAdmins[0] + config.email.emailDomain;
  } else {
    // In production, send directly to the customer
    recipientEmail = order.username + config.email.emailDomain;
  }

  const mailOptions = {
    to: recipientEmail,
    subject: "Your SynBio order is ready for collection",
    priority: "high",
  };

  const templateData = {
    order,
    baseURL: config.baseURL,
  };

  try {
    if (devMode) {
      console.log(
        `📧 Order ready email - Order: ${order.janCode || order.id.slice(0, 8)} | Customer: ${order.username} | Recipient: ${recipientEmail}`,
      );
    }
    await emailService.sendEmail("order-ready", templateData, mailOptions);
  } catch (err) {
    console.error("Failed to send order ready email:", err);
  }
};

module.exports = emailService;
