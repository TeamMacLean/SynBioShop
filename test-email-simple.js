/**
 * Simple Email Test Script
 *
 * Tests basic email template rendering to debug why emails appear empty.
 *
 * Usage: node test-email-simple.js
 */

const nodemailer = require("nodemailer");
const Email = require("email-templates");
const path = require("path");
const config = require("./config.json");

const TEST_EMAIL = config.email.testEmail || "deeks@nbi.ac.uk";
const templatesDir = path.resolve(__dirname, "views", "email");

console.log("=".repeat(60));
console.log("Simple Email Test - Debugging Template Rendering");
console.log("=".repeat(60));
console.log("Templates dir:", templatesDir);
console.log("Test recipient:", TEST_EMAIL);
console.log("=".repeat(60));

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: false,
  tls: { rejectUnauthorized: false },
});

// Test data
const testData = {
  testMessage: "Hello from the test script!",
  timestamp: new Date().toISOString(),
  baseURL: config.baseURL,
  order: {
    id: "test-123",
    janCode: "JAN-TEST-001",
    username: "testuser",
    totalQuantity: 3,
    totalCost: 15.0,
    items: [
      {
        quantity: 2,
        type: {
          name: "Test Plasmid A",
          synBioID: "SB-001",
          concentration: "100ng/µL",
        },
      },
      {
        quantity: 1,
        type: {
          name: "Test Plasmid B",
          synBioID: "SB-002",
          concentration: "50ng/µL",
        },
      },
    ],
  },
  user: {
    username: "testuser",
    name: "Test User",
  },
  _devMode: true,
  _intendedRecipients: {
    to: "customer@nbi.ac.uk, admin@nbi.ac.uk",
    cc: "budgetholder@nbi.ac.uk",
  },
};

async function runTests() {
  try {
    // Verify SMTP
    console.log("\n1. Verifying SMTP connection...");
    await transporter.verify();
    console.log("   ✅ SMTP OK\n");

    // Test 1: Simple test template
    console.log("2. Testing simple 'test' template...");
    const email1 = new Email({
      message: { from: config.email.from },
      transport: transporter,
      views: {
        root: templatesDir,
        options: { extension: "ejs" },
      },
      preview: false,
      send: true,
    });

    await email1.send({
      template: "test",
      message: {
        to: TEST_EMAIL,
        subject: "[TEST 1] Simple Test Template",
      },
      locals: testData,
    });
    console.log("   ✅ Test template sent\n");

    // Test 2: new-order template
    console.log("3. Testing 'new-order' template...");
    const email2 = new Email({
      message: { from: config.email.from },
      transport: transporter,
      views: {
        root: templatesDir,
        options: { extension: "ejs" },
      },
      juice: true,
      juiceResources: {
        preserveImportant: true,
        webResources: { relativeTo: templatesDir },
      },
      preview: false,
      send: true,
    });

    await email2.send({
      template: "new-order",
      message: {
        to: TEST_EMAIL,
        subject: "[TEST 2] New Order Template",
      },
      locals: testData,
    });
    console.log("   ✅ New-order template sent\n");

    // Test 3: order-ready template
    console.log("4. Testing 'order-ready' template...");
    const email3 = new Email({
      message: { from: config.email.from },
      transport: transporter,
      views: {
        root: templatesDir,
        options: { extension: "ejs" },
      },
      juice: true,
      juiceResources: {
        preserveImportant: true,
        webResources: { relativeTo: templatesDir },
      },
      preview: false,
      send: true,
    });

    await email3.send({
      template: "order-ready",
      message: {
        to: TEST_EMAIL,
        subject: "[TEST 3] Order Ready Template",
      },
      locals: testData,
    });
    console.log("   ✅ Order-ready template sent\n");

    // Test 4: Send raw HTML to compare
    console.log("5. Sending raw HTML email (no template)...");
    await transporter.sendMail({
      from: config.email.from,
      to: TEST_EMAIL,
      subject: "[TEST 4] Raw HTML Email (no template engine)",
      html: `
        <!DOCTYPE html>
        <html>
        <head><title>Raw Test</title></head>
        <body style="font-family: Arial; padding: 20px;">
          <h1 style="color: #007bff;">Raw HTML Test</h1>
          <p>This email was sent directly via nodemailer without email-templates.</p>
          <p>If you see this but not the template emails, the issue is with email-templates rendering.</p>
          <hr>
          <h2>Test Data (hardcoded in raw HTML):</h2>
          <ul>
            <li><strong>Order ID:</strong> test-123</li>
            <li><strong>Jan Code:</strong> JAN-TEST-001</li>
            <li><strong>Items:</strong> 2 items</li>
          </ul>
          <div style="background-color: #d1ecf1; padding: 15px; border: 2px solid #bee5eb; margin-top: 20px;">
            <strong>🔧 DEV MODE</strong>
            <p>Intended recipients: customer@nbi.ac.uk, admin@nbi.ac.uk</p>
          </div>
        </body>
        </html>
      `,
      text: "Raw HTML Test - Plain text fallback",
    });
    console.log("   ✅ Raw HTML email sent\n");

    // Test 5: Render template to string and log it
    console.log("6. Rendering 'test' template to string (for debugging)...");
    const email4 = new Email({
      message: { from: config.email.from },
      transport: transporter,
      views: {
        root: templatesDir,
        options: { extension: "ejs" },
      },
      preview: false,
      send: false, // Don't send, just render
    });

    const rendered = await email4.render("test/html", testData);
    console.log("   Rendered HTML length:", rendered.length, "characters");
    console.log("   First 500 chars of rendered HTML:");
    console.log("   ---");
    console.log(rendered.substring(0, 500));
    console.log("   ---\n");

    // Test 6: Render new-order template
    console.log("7. Rendering 'new-order' template to string...");
    const rendered2 = await email4.render("new-order/html", testData);
    console.log("   Rendered HTML length:", rendered2.length, "characters");
    console.log("   First 500 chars of rendered HTML:");
    console.log("   ---");
    console.log(rendered2.substring(0, 500));
    console.log("   ---\n");

    console.log("=".repeat(60));
    console.log("All tests complete!");
    console.log("Check your inbox for 4 emails:");
    console.log("  1. [TEST 1] Simple Test Template");
    console.log("  2. [TEST 2] New Order Template");
    console.log("  3. [TEST 3] Order Ready Template");
    console.log("  4. [TEST 4] Raw HTML Email");
    console.log("");
    console.log("This test works on both dev and prod environments");
    console.log("as long as you can reach the NBI mail server.");
    console.log("=".repeat(60));
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
  }
}

runTests();
