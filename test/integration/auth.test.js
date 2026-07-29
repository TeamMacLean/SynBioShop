/**
 * Authentication behaviour: sign-in, sign-out, session handling.
 *
 * Replaces the old auth/devmode.test.js, which asserted a log line that
 * appears nowhere in the source, POSTed to a URL that does not exist
 * (/checkLDAPUser rather than /check-ldap-user) and self-skipped to green.
 */

const { expect } = require("chai");
const config = require("../../config");
const email = require("../../lib/email");
const { req, signedInAgent, anonymousAgent, SAME_ORIGIN } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

describe("Authentication", function () {
  this.timeout(30000);

  before(async function () {
    await testDb.reset();
  });

  describe("sign-in", function () {
    it("accepts a configured admin and redirects away from /signin", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "any-non-empty" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/");
      expect(res.headers["set-cookie"]).to.be.an("array");
    });

    it("rejects an empty password even in dev mode", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });

    it("rejects a username that is neither an admin nor the test user", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "not-a-real-user", password: "whatever" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });

    it("shows the failure as a flash message, exactly once", async function () {
      const agent = anonymousAgent();
      await agent
        .post("/signin")
        .type("form")
        .send({ username: "not-a-real-user", password: "wrong" });

      const page = await agent.get("/signin");
      expect(page.status).to.equal(200);
      expect(page.text).to.include("Invalid username/password");

      // Regression: the message used to be duplicated, and concatenated with
      // passport's own "Missing credentials" text.
      const occurrences = page.text.split("Invalid username/password").length - 1;
      expect(occurrences).to.equal(1);
      expect(page.text).to.not.include("Missing credentials");
    });

    it("does not leak whether the username exists", async function () {
      const unknownUser = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "definitely-not-a-user", password: "x" });
      const knownUserBadPassword = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "" });

      expect(unknownUser.headers.location).to.equal(
        knownUserBadPassword.headers.location,
      );
    });
  });

  describe("session handling", function () {
    it("issues a session cookie with the hardening flags set", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "x" });

      const cookie = res.headers["set-cookie"].join(";");
      expect(cookie, "session cookie must be HttpOnly").to.match(/HttpOnly/i);
      expect(cookie, "session cookie must set SameSite").to.match(/SameSite=Lax/i);
    });

    it("regenerates the session ID on login, defeating fixation", async function () {
      const agent = anonymousAgent();

      // Touch a protected page so the server issues a pre-login session.
      await agent.get("/cart");
      const before = await agent.get("/signin");
      const preLoginCookie = (before.headers["set-cookie"] || []).join(";");

      const res = await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "x" });

      const postLoginCookie = (res.headers["set-cookie"] || []).join(";");

      // Login must mint a new session ID rather than promoting the old one.
      expect(postLoginCookie, "login should set a fresh session cookie").to.not.equal(
        "",
      );
      if (preLoginCookie) {
        const idOf = (c) => (/synbio\.sid=([^;]+)/.exec(c) || [])[1];
        expect(idOf(postLoginCookie)).to.not.equal(idOf(preLoginCookie));
      }
    });

    it("returns the user to the page they originally asked for", async function () {
      const agent = anonymousAgent();

      const blocked = await agent.get("/premade");
      expect(blocked.status).to.equal(302);
      expect(blocked.headers.location).to.equal("/signin");

      const login = await agent
        .post("/signin")
        .type("form")
        .send({ username: "deeks", password: "x" });

      expect(login.headers.location).to.equal("/premade");
    });

    it("ends the session on sign-out", async function () {
      const agent = await signedInAgent("deeks");

      const before = await agent.get("/cart");
      expect(before.status).to.equal(200);

      const out = await agent.get("/signout");
      expect(out.status).to.equal(302);

      const after = await agent.get("/cart");
      expect(after.status).to.equal(302);
      expect(after.headers.location).to.equal("/signin");
    });
  });

  describe("POST /check-ldap-user", function () {
    it("requires a session", async function () {
      // Previously mounted with no middleware: an anonymous client could use
      // it to enumerate directory usernames.
      const res = await req()
        .post("/check-ldap-user")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks" });

      expect(res.status).to.not.equal(200);
    });

    it("reports a known admin as existing in dev mode", async function () {
      const agent = await signedInAgent("deeks");
      const res = await agent
        .post("/check-ldap-user")
        .type("form")
        .send({ username: "deeks" });

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ exists: true });
    });

    it("reports an unknown user as not existing", async function () {
      const agent = await signedInAgent("deeks");
      const res = await agent
        .post("/check-ldap-user")
        .type("form")
        .send({ username: "nobody-here" });

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ exists: false });
    });

    it("rejects a missing username rather than querying the directory", async function () {
      const agent = await signedInAgent("deeks");
      const res = await agent.post("/check-ldap-user").type("form").send({});

      expect(res.status).to.equal(400);
    });
  });

  describe("dev mode", function () {
    it("is enabled for this test run", function () {
      // Every authenticated test depends on the local strategy.
      expect(config.devMode).to.equal(true);
      expect(config.vpnMode).to.equal(false);
    });

    it("advertises dev mode on the sign-in page", async function () {
      const res = await req().get("/signin");
      expect(res.status).to.equal(200);
      expect(res.text.toUpperCase()).to.include("DEV MODE");
    });

    it("sends no mail over the network during tests", async function () {
      // lib/email swaps in an in-memory transport when MAIL_TRANSPORT=memory.
      // The old test asserted a log line ("Email would be sent") that exists
      // nowhere in the source, while the code genuinely opened an SMTP
      // connection to mail.nbi.ac.uk.
      email.clearOutbox();

      await email.sendEmail(
        "new-order",
        {
          order: {
            id: "fixture-order",
            janCode: "9001",
            username: "deeks",
            items: [],
            createdAt: new Date(),
          },
          user: { username: "deeks", name: "Dev User", company: "TSL" },
          baseURL: config.baseURL,
        },
        { to: "someone@example.com", subject: "Outbox check" },
      );

      expect(email.outbox).to.have.lengthOf(1);
      expect(email.outbox[0].subject).to.include("Outbox check");
    });
  });
});
