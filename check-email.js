// test-email.js - run with: node test-email.js
const Email = require("email-templates");
const nodemailer = require("nodemailer");
const path = require("path");
const config = require("./config.json");

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: false,
  tls: { rejectUnauthorized: false },
});

const email = new Email({
  message: { from: config.email.from },
  transport: transporter,
  views: { root: path.resolve(__dirname, "views", "email") },
  juice: true,
});

email.send({
  template: "order-ready",  // or any existing template
  message: {
    to: "deeks@nbi.ac.uk",  // your email
    subject: "SynBio Email Test",
  },
  locals: {
    order: { janCode: "TEST-001", username: "testuser" },
    baseURL: config.baseURL,
  },
}).then(() => {
  console.log("✅ Email sent successfully!");
}).catch((err) => {
  console.error("❌ Email failed:", err);
});
