/**
 * Configuration Loader
 *
 * Loads config.json and adds runtime flags based on environment variables.
 * This allows for different operational modes without changing config.json.
 */

const configData = require('./config.json');

// Detect VPN mode from environment variable
const vpnMode = process.env.VPN_MODE === 'true';

// Create enhanced config object
const config = {
  ...configData,
  vpnMode: vpnMode
};

// Override devMode when in VPN mode
// VPN mode forces LDAP auth and real email sending (but to test addresses)
if (vpnMode) {
  console.log('🔐 VPN MODE: LDAP authentication required, emails redirected to test addresses');
  config.devMode = false; // Force LDAP authentication
}

module.exports = config;
