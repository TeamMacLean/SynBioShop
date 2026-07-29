/**
 * Global test bootstrap.
 *
 * Loaded by mocha via .mocharc.json BEFORE any spec file, and therefore before
 * anything requires ../config or ../lib/thinky. That ordering matters: the
 * database name and mail transport are read once at require-time, so they must
 * be pinned here.
 */

// --- Environment pinning (must happen before any app module is required) ---
process.env.NODE_ENV = "test";

// Route every test at a throwaway database. Without this the suite mutates the
// live `synbioshop` data: it creates and deletes real orders and permanently
// consumes janCode sequence numbers.
process.env.DB_NAME = process.env.TEST_DB_NAME || "synbioshop_test";

// Keep the suite off the network. lib/email.js honours these by swapping in an
// in-memory transport; without them the suite tries to reach mail.nbi.ac.uk.
process.env.MAIL_TRANSPORT = "memory";

// Write generated CSVs somewhere disposable rather than the real mount point.
process.env.CSV_DIR = require("path").join(
  __dirname,
  "..",
  ".tmp",
  "csv",
) + require("path").sep;
process.env.TMP_DIR = require("path").join(__dirname, "..", ".tmp", "uploads");
process.env.UPLOAD_ROOT = require("path").join(
  __dirname,
  "..",
  ".tmp",
  "public-uploads",
);

// Deterministic session secret so cookies stay valid across a run.
process.env.SESSION_SECRET = "test-secret-not-used-in-production";

// devMode gives us the local username/password strategy the tests log in with.
process.env.DEV_MODE = "true";

const fs = require("fs");
const path = require("path");
const config = require("../../config");

// --- Safety interlock -------------------------------------------------------
// A misconfigured environment that pointed the suite at production data would
// be destructive and silent. Fail loudly instead.
const FORBIDDEN_DB_NAMES = ["synbioshop", "synbioshop_production", "synbioshop_prod"];
if (FORBIDDEN_DB_NAMES.includes(config.dbName)) {
  throw new Error(
    `REFUSING TO RUN TESTS: database is "${config.dbName}", which looks like a ` +
      `live database. The suite truncates tables between tests and would destroy ` +
      `real data. Set TEST_DB_NAME to a disposable database name.`,
  );
}
if (!/test/i.test(config.dbName)) {
  throw new Error(
    `REFUSING TO RUN TESTS: database name "${config.dbName}" does not contain ` +
      `"test". Refusing to truncate a database that is not clearly disposable.`,
  );
}

// Ensure the disposable directories exist so file-writing code paths work.
for (const dir of [config.csvDir, config.tmpDir, config.uploadRoot]) {
  fs.mkdirSync(path.resolve(dir), { recursive: true });
}

/**
 * Global test helpers
 */
global.testHelpers = {
  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  sleep: function (ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  },
};

// --- Fail the run on unhandled async errors ---------------------------------
// Without this a route that rejects without a catch shows up as a passing test
// plus a warning on stderr, which is exactly the class of bug we are hunting.
const unhandled = [];
process.on("unhandledRejection", (reason) => {
  unhandled.push(reason);
  console.error("\n❌ Unhandled promise rejection during tests:", reason);
});

const testDb = require("./testDb");

// Mocha Root Hook Plugin. A plain `before()` is not in scope inside a
// --require'd module, so hooks must be exported this way.
exports.mochaHooks = {
  async beforeAll() {
    this.timeout(60000);
    await testDb.provision();
  },

  async afterAll() {
    this.timeout(30000);
    await testDb.teardown();

    if (unhandled.length) {
      throw new Error(
        `${unhandled.length} unhandled promise rejection(s) occurred during the ` +
          `test run. First: ${
            unhandled[0] && unhandled[0].stack ? unhandled[0].stack : unhandled[0]
          }`,
      );
    }
  },
};
