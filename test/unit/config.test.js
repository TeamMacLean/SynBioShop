/**
 * config.js — environment layering and the fail-closed production guards.
 *
 * These guards are the last line of defence against shipping the dev-mode auth
 * bypass, which accepts any password for any configured admin. Worth proving
 * they actually fire.
 */

const { expect } = require("chai");
const path = require("path");

const CONFIG_PATH = require.resolve("../../config.js");

/**
 * Loads a fresh copy of config.js under the given environment.
 *
 * The module caches a single object that the whole app shares, so the cache
 * entry is swapped out and restored around each load rather than left
 * replaced — otherwise later specs would see a different config object than
 * the one the app was built with.
 *
 * @param {object} env - Environment variables to apply for this load.
 * @returns {{config: object|null, error: Error|null}}
 */
function loadConfigWith(env) {
  const originalEntry = require.cache[CONFIG_PATH];
  const originalEnv = {};

  for (const key of Object.keys(env)) {
    originalEnv[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }

  delete require.cache[CONFIG_PATH];

  let config = null;
  let error = null;
  try {
    config = require(CONFIG_PATH);
  } catch (err) {
    error = err;
  } finally {
    delete require.cache[CONFIG_PATH];
    require.cache[CONFIG_PATH] = originalEntry;

    for (const key of Object.keys(originalEnv)) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }

  return { config, error };
}

describe("config", function () {
  describe("environment overrides", function () {
    it("takes the database name from DB_NAME", function () {
      const { config } = loadConfigWith({ DB_NAME: "some_other_test_db" });
      expect(config.dbName).to.equal("some_other_test_db");
    });

    it("takes the session secret from SESSION_SECRET", function () {
      const { config } = loadConfigWith({ SESSION_SECRET: "a-long-random-value" });
      expect(config.secret).to.equal("a-long-random-value");
    });

    it("takes the LDAP bind credential from the environment", function () {
      // So the real password need not sit in a file on disk.
      const { config } = loadConfigWith({
        LDAP_BIND_CREDENTIALS: "from-the-environment",
      });
      expect(config.ldap.bindCredentials).to.equal("from-the-environment");
    });

    it("ignores a blank env var rather than overriding with an empty string", function () {
      const { config } = loadConfigWith({ DB_NAME: "" });
      expect(config.dbName).to.not.equal("");
      expect(config.dbName).to.be.a("string").with.length.greaterThan(0);
    });

    it("falls back to config.json when the env var is unset", function () {
      const fromFile = require("../../config.json");
      const { config } = loadConfigWith({ DB_NAME: undefined });
      expect(config.dbName).to.equal(fromFile.dbName);
    });

    it("coerces the database port to a number", function () {
      const { config } = loadConfigWith({ DB_PORT: "29015" });
      expect(config.dbPort).to.equal(29015);
    });

    it("reads DEV_MODE as a boolean", function () {
      expect(loadConfigWith({ DEV_MODE: "false" }).config.devMode).to.equal(false);
      expect(loadConfigWith({ DEV_MODE: "true" }).config.devMode).to.equal(true);
      expect(loadConfigWith({ DEV_MODE: "1" }).config.devMode).to.equal(true);
    });
  });

  describe("production guards", function () {
    it("refuses to boot with dev mode enabled in production", function () {
      // devMode accepts any non-empty password for any configured admin.
      const { config, error } = loadConfigWith({
        NODE_ENV: "production",
        DEV_MODE: "true",
        SESSION_SECRET: "a-long-random-value",
      });

      expect(config, "config should not have loaded").to.equal(null);
      expect(error).to.be.an("error");
      expect(error.message).to.include("devMode");
      expect(error.message).to.include("production");
    });

    it("refuses to boot with the default session secret in production", function () {
      // "cats" is the committed default; a guessable secret lets an attacker
      // forge signed session cookies offline.
      const { config, error } = loadConfigWith({
        NODE_ENV: "production",
        DEV_MODE: "false",
        SESSION_SECRET: "cats",
      });

      expect(config).to.equal(null);
      expect(error.message).to.include("session secret");
    });

    it("boots in production when both are set correctly", function () {
      const { config, error } = loadConfigWith({
        NODE_ENV: "production",
        DEV_MODE: "false",
        SESSION_SECRET: "a-long-random-value",
      });

      expect(error, error && error.message).to.equal(null);
      expect(config.devMode).to.equal(false);
      expect(config.isProduction).to.equal(true);
    });

    it("does not block a development boot with dev mode on", function () {
      const { config, error } = loadConfigWith({
        NODE_ENV: "development",
        DEV_MODE: "true",
      });

      expect(error).to.equal(null);
      expect(config.devMode).to.equal(true);
    });
  });

  describe("VPN mode", function () {
    it("forces dev mode off, so LDAP is used", function () {
      const { config } = loadConfigWith({ VPN_MODE: "true", DEV_MODE: "true" });

      expect(config.vpnMode).to.equal(true);
      expect(config.devMode, "VPN mode must not allow the auth bypass").to.equal(
        false,
      );
    });
  });

  describe("derived settings", function () {
    it("enables secure cookies in production by default", function () {
      const { config } = loadConfigWith({
        NODE_ENV: "production",
        DEV_MODE: "false",
        SESSION_SECRET: "a-long-random-value",
        SECURE_COOKIES: undefined,
      });
      expect(config.secureCookies).to.equal(true);
    });

    it("leaves secure cookies off outside production", function () {
      const { config } = loadConfigWith({
        NODE_ENV: "development",
        SECURE_COOKIES: undefined,
      });
      expect(config.secureCookies).to.equal(false);
    });

    it("allows SECURE_COOKIES to override the default", function () {
      const { config } = loadConfigWith({
        NODE_ENV: "development",
        SECURE_COOKIES: "true",
      });
      expect(config.secureCookies).to.equal(true);
    });

    it("exposes a numeric upload limit", function () {
      const { config } = loadConfigWith({ MAX_UPLOAD_BYTES: "1048576" });
      expect(config.maxUploadBytes).to.equal(1048576);
    });

    it("defaults the upload limit when unset", function () {
      const { config } = loadConfigWith({ MAX_UPLOAD_BYTES: undefined });
      expect(config.maxUploadBytes).to.be.a("number").and.greaterThan(0);
    });

    it("flags the test environment", function () {
      const { config } = loadConfigWith({ NODE_ENV: "test" });
      expect(config.isTest).to.equal(true);
    });
  });

  describe("the live configuration this run uses", function () {
    it("points at a disposable database", function () {
      const config = require("../../config");
      expect(config.dbName).to.match(/test/i);
    });

    it("keeps paths inside the throwaway test directory", function () {
      const config = require("../../config");
      const tmp = path.join("test", ".tmp");
      expect(config.csvDir).to.include(tmp);
      expect(config.tmpDir).to.include(tmp);
    });
  });
});
