/**
 * Test setup and configuration
 * This file is loaded before all tests run
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console output during tests (optional - comment out if you want to see logs)
// global.console = {
//   log: function() {},
//   error: console.error,
//   warn: console.warn,
//   info: function() {},
//   debug: function() {}
// };

/**
 * Global test helpers
 */
global.testHelpers = {
  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  sleep: function(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }
};
