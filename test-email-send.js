/**
 * Test Email Script
 *
 * This script tests the email system by sending actual emails.
 * It simulates DEV/VPN mode to test the intended recipients banner.
 *
 * Note: NBI mail server only relays to internal domains (@nbi.ac.uk, @tsl.ac.uk)
 * Cannot send to external domains like @gmail.com
 *
 * Usage: node test-email-send.js
 */

const nodemailer = require("nodemailer");
const Email = require("email-templates");
const path = require("path");
const config = require("./config.json");

// Test configuration
const TEST_EMAIL = config.email.testEmail || "deeks@nbi.ac.uk";

// Simulate what production mode would send to
const SIMULATED_RECIPIENTS = {
  to: "customer@nbi.ac.uk, admin@nbi.ac.uk, mark.youles@tsl.ac.uk",
  cc: "budgetholder@nbi.ac.uk",
};

const templatesDir = path.resolve(__dirname, "views", "email");

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: false,
  tls: {
    rejectUnauthorized: false,
  },
});

console.log("=".repeat(60));
console.log("Email Test Script - DEV/VPN Mode Simulation");
console.log("=".repeat(60));
console.log("SMTP Host:", config.email.host);
console.log("SMTP Port:", config.email.port);
console.log("From:", config.email.from);
console.log("Actual Recipient:", TEST_EMAIL);
console.log("Simulated To:", SIMULATED_RECIPIENTS.to);
console.log("Simulated CC:", SIMULATED_RECIPIENTS.cc);
console.log("=".repeat(60));

// Verify SMTP connection first
console.log("\nVerifying SMTP connection...");
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP connection failed:", error.message);
    console.error("\nMake sure you are connected to the VPN if required.");
    process.exit(1);
  }

  console.log("✅ SMTP connection successful!\n");

  // Create email instance with preview disabled
  const email = new Email({
    message: {
      from: config.email.from,
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
    // Disable preview in browser
    preview: false,
    send: true,
  });

  // Comprehensive mock order data for testing
  const mockOrder = {
    id: "test-order-" + Date.now(),
    janCode: "JAN-2024-TEST-001",
    username: "testcustomer",
    signatory: "budgetholder",
    totalQuantity: 5,
    totalCost: 25.0,
    pricePerUnit: 5,
    costCode: "NBI-RESEARCH-2024-001",
    createdAt: new Date(),
    complete: false,
    user: {
      username: "testcustomer",
      name: "Test Customer Name",
      mail: "testcustomer@nbi.ac.uk",
      company: "TSL",
    },
    items: [
      {
        id: "item-001",
        quantity: 2,
        type: {
          id: "type-001",
          name: "pICH47742 - Level 0 Acceptor",
          concentration: "100 ng/µL",
          synBioID: "SB-0001",
          description: "Golden Gate Level 0 acceptor plasmid",
        },
      },
      {
        id: "item-002",
        quantity: 1,
        type: {
          id: "type-002",
          name: "pICH47751 - Level 1 Acceptor Position 1",
          concentration: "75 ng/µL",
          synBioID: "SB-0042",
          description: "Golden Gate Level 1 acceptor for position 1",
        },
      },
      {
        id: "item-003",
        quantity: 2,
        type: {
          id: "type-003",
          name: "pAGM4723 - Level 2 Acceptor",
          concentration: "50 ng/µL",
          synBioID: "SB-0156",
          description: "Golden Gate Level 2 acceptor plasmid",
        },
      },
    ],
  };

  const mockUser = {
    username: "testcustomer",
    name: "Test Customer Name",
    mail: "testcustomer@nbi.ac.uk",
    company: "TSL",
  };

  // DEV mode data to simulate what the email service adds
  const devModeData = {
    _devMode: true,
    _intendedRecipients: SIMULATED_RECIPIENTS,
  };

  // VPN mode data
  const vpnModeData = {
    _vpnMode: true,
    _intendedRecipients: SIMULATED_RECIPIENTS,
  };

  // Test 1: New Order Email (DEV mode)
  console.log("1. Sending test email: new-order (DEV mode - blue banner)...");
  email
    .send({
      template: "new-order",
      message: {
        to: TEST_EMAIL,
        subject: "[DEV] SynBio - New Order",
        priority: "high",
      },
      locals: {
        order: mockOrder,
        user: mockUser,
        baseURL: config.baseURL,
        ...devModeData,
      },
    })
    .then(() => {
      console.log("   ✅ new-order (DEV) sent to", TEST_EMAIL);

      // Test 2: Order Ready Email (DEV mode)
      console.log(
        "\n2. Sending test email: order-ready (DEV mode - blue banner)...",
      );
      return email.send({
        template: "order-ready",
        message: {
          to: TEST_EMAIL,
          subject: "[DEV] Your SynBio order is ready for collection",
          priority: "high",
        },
        locals: {
          order: mockOrder,
          baseURL: config.baseURL,
          ...devModeData,
        },
      });
    })
    .then(() => {
      console.log("   ✅ order-ready (DEV) sent to", TEST_EMAIL);

      // Test 3: New Order Email (VPN mode)
      console.log(
        "\n3. Sending test email: new-order (VPN mode - yellow banner)...",
      );
      return email.send({
        template: "new-order",
        message: {
          to: TEST_EMAIL,
          subject: "[VPN TEST] SynBio - New Order",
          priority: "high",
        },
        locals: {
          order: mockOrder,
          user: mockUser,
          baseURL: config.baseURL,
          ...vpnModeData,
        },
      });
    })
    .then(() => {
      console.log("   ✅ new-order (VPN) sent to", TEST_EMAIL);

      // Test 4: Order Ready Email (VPN mode)
      console.log(
        "\n4. Sending test email: order-ready (VPN mode - yellow banner)...",
      );
      return email.send({
        template: "order-ready",
        message: {
          to: TEST_EMAIL,
          subject: "[VPN TEST] Your SynBio order is ready for collection",
          priority: "high",
        },
        locals: {
          order: mockOrder,
          baseURL: config.baseURL,
          ...vpnModeData,
        },
      });
    })
    .then(() => {
      console.log("   ✅ order-ready (VPN) sent to", TEST_EMAIL);

      // Test 5: New Order Email (Production mode - no banner)
      console.log(
        "\n5. Sending test email: new-order (PROD mode - no banner)...",
      );
      return email.send({
        template: "new-order",
        message: {
          to: TEST_EMAIL,
          subject: "[PROD TEST] SynBio - New Order",
          priority: "high",
        },
        locals: {
          order: mockOrder,
          user: mockUser,
          baseURL: config.baseURL,
          // No _devMode or _vpnMode flag - simulates production
        },
      });
    })
    .then(() => {
      console.log("   ✅ new-order (PROD) sent to", TEST_EMAIL);

      console.log("\n" + "=".repeat(60));
      console.log("All test emails sent successfully!");
      console.log("=".repeat(60));
      console.log("\nCheck your inbox at:", TEST_EMAIL);
      console.log("\nYou should receive 5 emails:");
      console.log("  1. [DEV] New Order        - BLUE banner with recipients");
      console.log("  2. [DEV] Order Ready      - BLUE banner with recipients");
      console.log(
        "  3. [VPN TEST] New Order   - YELLOW banner with recipients",
      );
      console.log(
        "  4. [VPN TEST] Order Ready - YELLOW banner with recipients",
      );
      console.log("  5. [PROD TEST] New Order  - NO banner (production style)");
      console.log("\nAll emails should show:");
      console.log("  - Order: JAN-2024-TEST-001");
      console.log("  - Customer: Test Customer Name (testcustomer)");
      console.log("  - 3 items totaling 5 units");
      console.log("  - Cost code: NBI-RESEARCH-2024-001");
      console.log("  - Budget holder: budgetholder");
      console.log("=".repeat(60));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Failed to send email:", err.message);
      console.error(err);
      process.exit(1);
    });
});
