/**
 * Configuration Loader
 *
 * Loads config.json, then layers environment variables on top. Environment
 * variables always win, so deployments can keep secrets out of the repository
 * and tests can point at a throwaway database without editing tracked files.
 *
 * Precedence (lowest to highest):
 *   config.json  <  environment variables  <  derived runtime flags
 */

const configData = require("./config.json");

/**
 * Reads an environment variable, returning `undefined` when unset or blank so
 * that it falls through to the config.json value rather than overriding it
 * with an empty string.
 */
function env(name) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return undefined;
  return value;
}

/** Reads an env var as a boolean. Accepts "true"/"1" as true. */
function envBool(name) {
  const value = env(name);
  if (value === undefined) return undefined;
  return value === "true" || value === "1";
}

/** Returns the first argument that is not `undefined`. */
function pick(...values) {
  return values.find((v) => v !== undefined);
}

const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

// VPN mode forces LDAP auth and real email sending (but to test addresses).
const vpnMode = process.env.VPN_MODE === "true";

const config = {
  ...configData,

  // --- Core ---
  port: pick(env("PORT"), configData.port),
  secret: pick(env("SESSION_SECRET"), configData.secret),
  baseURL: pick(env("BASE_URL"), configData.baseURL),

  // --- Database ---
  // DB_NAME lets the test suite target an isolated database instead of the
  // live one. See test/helpers/testDb.js.
  dbName: pick(env("DB_NAME"), configData.dbName, "synbioshop"),
  dbHost: pick(env("DB_HOST"), configData.dbHost, "localhost"),
  dbPort: Number(pick(env("DB_PORT"), configData.dbPort, 28015)),

  // --- Filesystem ---
  uploadRoot: pick(env("UPLOAD_ROOT"), configData.uploadRoot),
  tmpDir: pick(env("TMP_DIR"), configData.tmpDir),
  csvDir: pick(env("CSV_DIR"), configData.csvDir),

  // --- Runtime flags ---
  vpnMode,
  isTest,
  isProduction,

  // Maximum bytes accepted for a single uploaded file (default 25 MB).
  maxUploadBytes: Number(pick(env("MAX_UPLOAD_BYTES"), 25 * 1024 * 1024)),

  // Set when the process is served over HTTPS, so session cookies can carry
  // the Secure attribute. Defaults on in production.
  secureCookies: pick(envBool("SECURE_COOKIES"), isProduction),
};

// --- LDAP (secrets overridable from the environment) ---
config.ldap = {
  ...(configData.ldap || {}),
  url: pick(env("LDAP_URL"), configData.ldap && configData.ldap.url),
  bindDn: pick(env("LDAP_BIND_DN"), configData.ldap && configData.ldap.bindDn),
  bindCredentials: pick(
    env("LDAP_BIND_CREDENTIALS"),
    configData.ldap && configData.ldap.bindCredentials,
  ),
};

// --- Email ---
config.email = {
  ...(configData.email || {}),
  host: pick(env("SMTP_HOST"), configData.email && configData.email.host),
  port: pick(env("SMTP_PORT"), configData.email && configData.email.port),
};

// --- devMode resolution ---
// devMode enables a local username/password strategy that accepts ANY password
// for configured admins. It must never be on in production.
config.devMode = pick(envBool("DEV_MODE"), configData.devMode, false);

if (vpnMode) {
  console.log(
    "🔐 VPN MODE: LDAP authentication required, emails redirected to test addresses",
  );
  config.devMode = false; // Force LDAP authentication
}

// devMode is the single most dangerous switch in this config, and NODE_ENV is
// not set by the current start script — so the production guard below may never
// fire. Make the state impossible to miss on every boot.
if (config.devMode && !isTest) {
  console.warn(
    "\n" +
      "!".repeat(72) +
      "\n!! DEV MODE IS ENABLED" +
      "\n!! Any non-empty password signs in as any configured admin: " +
      (config.admins || []).join(", ") +
      "\n!! LDAP is bypassed entirely. This must NEVER run in production." +
      "\n!! Set DEV_MODE=false (or \"devMode\": false in config.json) to disable." +
      "\n" +
      "!".repeat(72) +
      "\n",
  );
}

if (isProduction && config.devMode) {
  // Refuse to boot rather than silently exposing password-less admin login.
  throw new Error(
    "FATAL: devMode is enabled while NODE_ENV=production. devMode accepts any " +
      "password for admin accounts and must never run in production. Set " +
      'DEV_MODE=false (or "devMode": false in config.json) before deploying.',
  );
}

if (isProduction && config.secret === "cats") {
  throw new Error(
    "FATAL: the default session secret is in use while NODE_ENV=production. " +
      "Set the SESSION_SECRET environment variable to a long random value.",
  );
}

module.exports = config;
