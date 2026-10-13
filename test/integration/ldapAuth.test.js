/**
 * Sign-in through the LDAP strategy — the path that actually runs in
 * production.
 *
 * Every other authenticated test uses the dev-mode local strategy, so this
 * branch had no coverage at all: the strategy registration in lib/util, the
 * attribute mapping onto the session user, and the error handling in
 * controllers/auth were all unexercised.
 *
 * Exercised against a real in-process directory rather than a stub, so the
 * passport-ldapauth handshake (service bind, search, then bind as the user)
 * runs for real.
 */

const { expect } = require("chai");
const ldapjs = require("ldapjs");
const config = require("../../config");
const util = require("../../lib/util");
const { req, anonymousAgent, SAME_ORIGIN } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

const SERVICE_DN = "cn=service,dc=example,dc=test";
const SERVICE_PASSWORD = "service-secret";
const BASE = "dc=example,dc=test";

/** Directory contents, keyed by sAMAccountName. */
const DIRECTORY = {
  deeks: {
    dn: "cn=deeks,dc=example,dc=test",
    password: "correct-horse",
    attributes: {
      sAMAccountName: "deeks",
      name: "George Deeks",
      mail: "deeks@nbi.ac.uk",
      company: "TSL",
      memberOf: ["cn=synbio,ou=groups,dc=example,dc=test"],
    },
  },
  // Deliberately has no memberOf: Active Directory omits the attribute for a
  // user in no groups, and the login handler used to read `memberOf.length`
  // unconditionally, which threw inside an async callback and exited the
  // process.
  loner: {
    dn: "cn=loner,dc=example,dc=test",
    password: "lonely",
    attributes: {
      sAMAccountName: "loner",
      name: "Solo User",
      mail: "loner@nbi.ac.uk",
      company: "JIC",
    },
  },
};

describe("LDAP authentication", function () {
  this.timeout(30000);

  let server;
  const saved = {};

  before(async function () {
    await testDb.reset();

    saved.devMode = config.devMode;
    saved.vpnMode = config.vpnMode;
    saved.url = config.ldap.url;
    saved.bindDn = config.ldap.bindDn;
    saved.bindCredentials = config.ldap.bindCredentials;
    saved.searchBase = config.ldap.searchBase;
    saved.searchFilter = config.ldap.searchFilter;

    server = ldapjs.createServer();

    // Service account bind, plus a bind for each user entry — passport-ldapauth
    // verifies the password by binding as the located user.
    server.bind(BASE, (bindReq, res, next) => {
      const dn = bindReq.dn.toString().toLowerCase();
      const password = bindReq.credentials;

      if (dn === SERVICE_DN.toLowerCase()) {
        if (password !== SERVICE_PASSWORD) {
          return next(new ldapjs.InvalidCredentialsError("bad service password"));
        }
        res.end();
        return next();
      }

      const entry = Object.values(DIRECTORY).find(
        (e) => e.dn.toLowerCase() === dn,
      );
      if (!entry || password !== entry.password) {
        return next(new ldapjs.InvalidCredentialsError("bad credentials"));
      }

      res.end();
      return next();
    });

    server.search(BASE, (searchReq, res, next) => {
      const filter = searchReq.filter.toString().toLowerCase();

      for (const entry of Object.values(DIRECTORY)) {
        const account = entry.attributes.sAMAccountName.toLowerCase();
        // Only an exact equality match; a filter that was rewritten by
        // injection will not match anything here.
        if (filter === `(samaccountname=${account})`) {
          res.send({ dn: entry.dn, attributes: entry.attributes });
        }
      }

      res.end();
      return next();
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    config.ldap.url = `ldap://127.0.0.1:${server.address().port}`;
    config.ldap.bindDn = SERVICE_DN;
    config.ldap.bindCredentials = SERVICE_PASSWORD;
    config.ldap.searchBase = BASE;
    config.ldap.searchFilter = "(sAMAccountName={{username}})";

    // Switch the app onto the LDAP strategy and register it.
    config.devMode = false;
    config.vpnMode = false;
    util.setupPassport();
  });

  after(function (done) {
    Object.assign(config, { devMode: saved.devMode, vpnMode: saved.vpnMode });
    Object.assign(config.ldap, {
      url: saved.url,
      bindDn: saved.bindDn,
      bindCredentials: saved.bindCredentials,
      searchBase: saved.searchBase,
      searchFilter: saved.searchFilter,
    });
    // Put the local strategy back for the rest of the suite.
    util.setupPassport();

    if (server) return server.close(() => done());
    done();
  });

  describe("successful sign-in", function () {
    it("authenticates a directory user with the right password", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/");
      expect(res.headers["set-cookie"]).to.be.an("array");
    });

    it("maps directory attributes onto the session user", async function () {
      const agent = anonymousAgent();
      await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      const page = await agent.get("/");
      expect(page.status).to.equal(200);
      // lib/util maps `name` from the entry onto the session user.
      expect(page.text).to.include("George Deeks");
    });

    it("grants admin rights based on the configured admin list", async function () {
      const agent = anonymousAgent();
      await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      // "deeks" is in config.admins, so an admin-only page must open.
      const res = await agent.get("/orders");
      expect(res.status).to.equal(200);
    });

    it("does not grant admin to a directory user outside the admin list", async function () {
      const agent = anonymousAgent();
      await agent
        .post("/signin")
        .type("form")
        .send({ username: "loner", password: "lonely" });

      const res = await agent.get("/orders");
      expect(res.status).to.equal(403);
    });

    it("signs in a user who belongs to no groups", async function () {
      // Active Directory omits memberOf entirely for such a user. The login
      // handler read `user.memberOf.length` unconditionally, and because that
      // ran inside the req.logIn callback the TypeError escaped as an
      // uncaughtException and terminated the process.
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "loner", password: "lonely" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/");
    });

    it("returns the user to the page they first asked for", async function () {
      const agent = anonymousAgent();

      const blocked = await agent.get("/premade");
      expect(blocked.headers.location).to.equal("/signin");

      const login = await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      expect(login.headers.location).to.equal("/premade");
    });
  });

  describe("rejected sign-in", function () {
    it("rejects a wrong password", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "wrong" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });

    it("rejects a username that is not in the directory", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "ghost", password: "whatever" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });

    it("shows a generic message that does not reveal which half was wrong", async function () {
      const agent = anonymousAgent();
      await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "wrong" });

      const page = await agent.get("/signin");
      expect(page.text).to.include("Invalid username/password");
      expect(page.text).to.not.include("ghost");
    });

    it("does not establish a session on a failed attempt", async function () {
      const agent = anonymousAgent();
      await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "wrong" });

      const res = await agent.get("/cart");
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });

    it("does not let a wildcard username match an account", async function () {
      // passport-ldapauth escapes the substituted value, so the filter cannot
      // be widened into matching every entry.
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "*", password: "correct-horse" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });

    it("does not let an injected filter fragment authenticate", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks)(objectClass=*", password: "correct-horse" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });
  });

  describe("directory unavailable", function () {
    let savedUrl;

    beforeEach(function () {
      savedUrl = config.ldap.url;
      // Port 1 is reserved; the connection is refused immediately.
      config.ldap.url = "ldap://127.0.0.1:1";
      util.setupPassport();
    });

    afterEach(function () {
      config.ldap.url = savedUrl;
      util.setupPassport();
    });

    it("reports the outage instead of crashing the process", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      expect(res.status).to.equal(500);
      expect(res.text).to.include("Cannot connect to LDAP server");
    });

    it("keeps serving other requests afterwards", async function () {
      const login = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      expect(login.status).to.equal(500);
      expect(login.text).to.include("Cannot connect to LDAP server");

      const res = await req().get("/");
      expect(res.status).to.equal(200);
    });
  });

  describe("VPN mode", function () {
    before(function () {
      config.vpnMode = true;
      util.setupPassport();
    });

    after(function () {
      config.vpnMode = false;
      util.setupPassport();
    });

    it("still authenticates through LDAP", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/");
    });

    it("does not offer the dev-mode picker on the sign-in page", async function () {
      // Showing it would advertise which usernames bypass authentication.
      const res = await req().get("/signin");
      expect(res.status).to.equal(200);
      expect(res.text.toUpperCase()).to.not.include("DEV MODE");
    });
  });

  describe("directory lookup endpoint", function () {
    it("reports a real directory user as existing", async function () {
      const agent = anonymousAgent();
      await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      const res = await agent
        .post("/check-ldap-user")
        .type("form")
        .send({ username: "loner" });

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ exists: true });
    });

    it("reports an unknown user as absent", async function () {
      const agent = anonymousAgent();
      await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "correct-horse" });

      const res = await agent
        .post("/check-ldap-user")
        .type("form")
        .send({ username: "nobody-here" });

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ exists: false });
    });

    it("still requires a session", async function () {
      const res = await req()
        .post("/check-ldap-user")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });
  });
});
