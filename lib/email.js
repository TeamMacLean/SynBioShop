const nodemailer = require("nodemailer");

const Email = require("email-templates");
const path = require("path");

const config = require("../config");
const { email: emailConfig } = config;

// devMode and vpnMode are read from `config` at call time rather than
// destructured here. config.js itself flips devMode when VPN mode is on, and
// destructuring froze whatever the values happened to be when this module was
// first required — so a later change was silently ignored and the wrong
// delivery branch ran.
const mode = () => ({
  devMode: config.devMode,
  vpnMode: config.vpnMode,
  emailAdmins: config.emailAdmins || [],
});

console.log(
  `📧 Email service loaded - devMode: ${config.devMode}, vpnMode: ${config.vpnMode}`,
);

const templatesDir = path.resolve(__dirname, "..", "views", "email");

const emailService = {};

/**
 * Messages captured by the in-memory transport, newest last.
 *
 * Only populated when MAIL_TRANSPORT=memory (which the test bootstrap sets).
 * Tests assert against this instead of reaching for a real SMTP server.
 */
emailService.outbox = [];

/** Discards everything captured so far. */
emailService.clearOutbox = () => {
  emailService.outbox.length = 0;
};

// MAIL_TRANSPORT=memory swaps SMTP for nodemailer's jsonTransport, which
// renders the message fully but never opens a socket. This keeps the test
// suite off the network and makes delivery assertable.
const useMemoryTransport =
  process.env.MAIL_TRANSPORT === "memory" || config.isTest;

const transporter = useMemoryTransport
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: false,
      tls: {
        rejectUnauthorized: false,
      },
      // Without timeouts a hung mail server holds the connection open
      // indefinitely, tying up the request that triggered the send.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

/** Records a delivered message when the in-memory transport is active. */
function recordToOutbox(templateName, message) {
  if (!useMemoryTransport) return;
  emailService.outbox.push({
    template: templateName,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    sentAt: new Date(),
  });
}

// Test email address for VPN mode - all emails go here
const VPN_TEST_EMAIL = emailConfig.testEmail || "deeks@nbi.ac.uk";

/**
 * Centralised function to send emails using Nodemailer templates.
 * @param {string} templateName - The name of the email template folder.
 * @param {object} templateData - Data for the email template.
 * @param {object} mailOptions - Nodemailer mail options (to, subject, priority, cc).
 * @returns {Promise<void>} A promise that resolves on success or rejects on error.
 */
emailService.sendEmail = async (templateName, templateData, mailOptions) => {
  const { devMode, vpnMode } = mode();

  console.log(
    `\n📧 sendEmail called: template=${templateName}, devMode=${devMode}, vpnMode=${vpnMode}`,
  );

  // Debug: Log the order data structure
  if (templateData.order) {
    console.log("📧 Order data structure:");
    console.log("  - id:", templateData.order.id);
    console.log("  - janCode:", templateData.order.janCode);
    console.log("  - username:", templateData.order.username);
    console.log(
      "  - items:",
      templateData.order.items
        ? `${templateData.order.items.length} items`
        : "NO ITEMS",
    );
    if (templateData.order.items && templateData.order.items.length > 0) {
      console.log(
        "  - first item:",
        JSON.stringify(templateData.order.items[0], null, 2),
      );
    }
  }

  try {
    // In dev mode (not VPN), send actual emails but to test address with banner
    if (devMode && !vpnMode) {
      const intendedRecipients = {
        to: mailOptions.to,
        cc: mailOptions.cc || null,
      };

      console.log("\n" + "=".repeat(60));
      console.log("📧 DEV MODE: Sending email to test address");
      console.log("=".repeat(60));
      console.log(`Template: ${templateName}`);
      console.log(`Intended To: ${mailOptions.to}`);
      if (mailOptions.cc) {
        console.log(`Intended CC: ${mailOptions.cc}`);
      }
      console.log(`Actual To: ${VPN_TEST_EMAIL}`);
      console.log(`Subject: ${mailOptions.subject}`);
      console.log("=".repeat(60) + "\n");

      // Send to test email with dev mode banner
      const email = new Email({
        message: {
          from: emailConfig.from,
        },
        transport: transporter,
        views: {
          root: templatesDir,
          options: {
            extension: "ejs",
          },
        },
        juice: true,
        juiceResources: {
          preserveImportant: true,
          webResources: {
            relativeTo: templatesDir,
          },
        },
        preview: false,
        send: true,
      });

      await email.send({
        template: templateName,
        message: {
          to: VPN_TEST_EMAIL,
          subject: `[DEV] ${mailOptions.subject}`,
          priority: mailOptions.priority,
        },
        locals: {
          ...templateData,
          _devMode: true,
          _intendedRecipients: intendedRecipients,
        },
      });

      console.log(`📧 DEV MODE: Email sent to ${VPN_TEST_EMAIL}`);
      recordToOutbox(templateName, {
        to: VPN_TEST_EMAIL,
        cc: null,
        subject: `[DEV] ${mailOptions.subject}`,
      });
      return Promise.resolve();
    }

    // Determine actual recipient and subject
    let actualTo = mailOptions.to;
    let actualCc = mailOptions.cc;
    let actualSubject = mailOptions.subject;
    let enhancedTemplateData = { ...templateData };

    // In VPN mode, redirect all emails to test address and include intended recipients in email body
    if (vpnMode) {
      const intendedRecipients = {
        to: mailOptions.to,
        cc: mailOptions.cc || null,
      };

      console.log("\n" + "=".repeat(60));
      console.log("🔐 VPN MODE: Email redirected to test address");
      console.log("=".repeat(60));
      console.log(`Template: ${templateName}`);
      console.log(`Original To: ${mailOptions.to}`);
      if (mailOptions.cc) {
        console.log(`Original CC: ${mailOptions.cc}`);
      }
      console.log(`Redirected To: ${VPN_TEST_EMAIL}`);
      console.log(`Subject: ${mailOptions.subject}`);
      console.log("=".repeat(60) + "\n");

      // Override recipient to test email only
      actualTo = VPN_TEST_EMAIL;
      actualCc = undefined; // Don't CC anyone in VPN mode
      actualSubject = `[VPN TEST] ${mailOptions.subject}`;

      // Add intended recipients to template data so it shows in the email
      enhancedTemplateData = {
        ...templateData,
        _vpnMode: true,
        _intendedRecipients: intendedRecipients,
      };
    }

    // Production mode - no modifications needed, enhancedTemplateData already has templateData

    // Production mode or VPN mode - send actual email
    const email = new Email({
      message: {
        from: emailConfig.from,
      },
      transport: transporter,
      views: {
        root: templatesDir,
        options: {
          extension: "ejs",
        },
      },
      juice: true,
      juiceResources: {
        preserveImportant: true,
        webResources: {
          relativeTo: templatesDir,
        },
      },
      // Disable preview (opening in browser) and force sending
      preview: false,
      send: true,
    });

    await email.send({
      template: templateName,
      message: {
        to: actualTo,
        cc: actualCc,
        subject: actualSubject,
        priority: mailOptions.priority,
      },
      locals: enhancedTemplateData,
    });

    console.log(
      `Email sent successfully to: ${actualTo} with subject: "${actualSubject}"`,
    );
    recordToOutbox(templateName, {
      to: actualTo,
      cc: actualCc,
      subject: actualSubject,
    });
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
  const adminAddresses = mode().emailAdmins.map(
    (username) => username + config.email.emailDomain,
  );

  let signatoryAddress = null;
  if (order.signatory) {
    signatoryAddress = order.signatory + config.email.emailDomain;
  }

  // Build recipient list
  let toAddresses = [...adminAddresses];
  toAddresses.push(order.username + config.email.emailDomain);
  if (signatoryAddress) {
    toAddresses.push(signatoryAddress);
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

  // Deliberately not caught here. This used to swallow its own failures and
  // resolve, which made the `.catch(...)` at the call site in
  // controllers/shoppingCart.js unreachable — so a failed order email was
  // logged to stdout and no admin was ever notified, despite the calling code
  // appearing to do exactly that.
  await emailService.sendEmail("new-order", templateData, mailOptions);
};

/**
 * Send email confirming the order is ready for collection.
 * @param {object} order - The order object.
 */
emailService.orderReady = async (order) => {
  // Always calculate the real recipient (customer)
  const recipientEmail = order.username + config.email.emailDomain;

  const mailOptions = {
    to: recipientEmail,
    subject: "Your SynBio order is ready for collection",
    priority: "high",
  };

  const templateData = {
    order,
    baseURL: config.baseURL,
  };

  // Also propagates; callers decide whether a mail failure should surface.
  await emailService.sendEmail("order-ready", templateData, mailOptions);
};

module.exports = emailService;
