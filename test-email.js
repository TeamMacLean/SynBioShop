// test-email.js - run with: node test-email.js
const Email = require("email-templates");
const nodemailer = require("nodemailer");
const path = require("path");
const config = require("./config.json");

console.log("=".repeat(60));
console.log("Email Test Script");
console.log("=".repeat(60));
console.log("SMTP Host:", config.email.host);
console.log("SMTP Port:", config.email.port);
console.log("From:", config.email.from);
console.log("=".repeat(60));

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: false,
  tls: { rejectUnauthorized: false },
  debug: true,
  logger: true,
});

// First verify the SMTP connection
console.log("\nVerifying SMTP connection...");
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP connection failed:", error);
    process.exit(1);
  }
  console.log("✅ SMTP server is ready to accept messages\n");

  const email = new Email({
    message: { from: config.email.from },
    transport: transporter,
    views: { root: path.resolve(__dirname, "views", "email") },
    juice: true,
    send: true, // Force sending even in dev
  });

  console.log("Sending test email to georgedeeks@gmail.com...\n");

  email.send({
    template: "order-ready",
    message: {
      to: "georgedeeks@gmail.com",
      subject: "SynBio Email Test - " + new Date().toISOString(),
    },
    locals: {
      order: { janCode: "TEST-001", username: "testuser" },
      baseURL: config.baseURL,
    },
  }).then((result) => {
    console.log("=".repeat(60));
    console.log("✅ Email sent successfully!");
    console.log("Message ID:", result.messageId);
    console.log("Accepted:", result.accepted);
    console.log("Rejected:", result.rejected);
    console.log("Response:", result.response);
    console.log("=".repeat(60));
  }).catch((err) => {
    console.error("=".repeat(60));
    console.error("❌ Email failed:");
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    console.error("=".repeat(60));
  });
});
