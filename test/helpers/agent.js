/**
 * Supertest helpers for driving the app as a given user.
 *
 * The app is required lazily and cached: requiring app.js opens the socket.io
 * server and the DB pool, so it must happen exactly once per process and only
 * after test/helpers/setup.js has pinned the environment.
 */

const request = require("supertest");
const config = require("../../config");

let cachedApp = null;

/**
 * The Origin a real browser would send for a same-site form post.
 *
 * CSRF protection rejects state-changing requests that carry neither a
 * trusted Origin/Referer nor a valid token. Supertest sends no Origin by
 * default, so tests must set it to behave like the browsers they stand in for.
 * Tests that deliberately probe CSRF override it.
 */
const SAME_ORIGIN = (() => {
  try {
    return new URL(config.baseURL).origin;
  } catch (err) {
    return "http://127.0.0.1:3000";
  }
})();

/** Returns the singleton Express/HTTP server under test. */
function getApp() {
  if (!cachedApp) {
    cachedApp = require("../../app.js");
  }
  return cachedApp;
}

/**
 * Logs in and returns a cookie-persisting supertest agent.
 *
 * Relies on the devMode local strategy, which accepts any non-empty password
 * for configured admins (and the literal user "testuser").
 *
 * @param {string} username - Defaults to the seeded admin.
 * @returns {Promise<import('supertest').SuperAgentTest>}
 */
async function signedInAgent(username = "deeks") {
  const agent = request.agent(getApp());
  // Applies to every request this agent makes, mirroring a browser.
  agent.set("Origin", SAME_ORIGIN);

  const res = await agent
    .post("/signin")
    .type("form")
    .send({ username, password: "test-password" });

  if (res.status !== 302) {
    throw new Error(
      `Sign-in for "${username}" returned ${res.status}, expected a 302 redirect. ` +
        `Check that devMode is enabled and "${username}" is an admin or "testuser".`,
    );
  }
  if (/\/signin/.test(res.headers.location || "")) {
    throw new Error(
      `Sign-in for "${username}" bounced back to /signin — credentials rejected.`,
    );
  }
  return agent;
}

/** An agent with no session, for asserting that routes require auth. */
function anonymousAgent() {
  const agent = request.agent(getApp());
  agent.set("Origin", SAME_ORIGIN);
  return agent;
}

/**
 * A bare supertest request against the app (no cookie persistence, no default
 * Origin). Use when a test needs full control over the headers — for example
 * when probing CSRF behaviour.
 */
function req() {
  return request(getApp());
}

/**
 * Reads the CSRF token the server has issued to this agent's session.
 *
 * Pulls it out of the rendered sign-in form, which is the same value every
 * other form on the site receives.
 *
 * @param {import('supertest').SuperAgentTest} agent
 * @returns {Promise<string>}
 */
async function csrfToken(agent) {
  const res = await agent.get("/signin");
  const match = /name="_csrf" value="([^"]*)"/.exec(res.text);
  if (!match) {
    throw new Error("Could not find a CSRF token in the sign-in page.");
  }
  return match[1];
}

module.exports = {
  getApp,
  signedInAgent,
  anonymousAgent,
  req,
  csrfToken,
  SAME_ORIGIN,
};
