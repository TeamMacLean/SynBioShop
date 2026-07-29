/**
 * Application-level smoke tests: the app boots, serves its public pages, and
 * applies its baseline response headers.
 *
 * The previous version of this file accepted status lists so broad they could
 * not fail — `expect([200, 301, 302, 401, 403]).to.include(res.status)` on a
 * test named "should redirect unauthenticated users" passes on a total auth
 * bypass. Each assertion below names one expected outcome.
 */

const { expect } = require("chai");
const { req, anonymousAgent } = require("../helpers/agent");

describe("Application", function () {
  this.timeout(30000);

  describe("public pages", function () {
    it("serves the home page", async function () {
      const res = await req().get("/");
      expect(res.status).to.equal(200);
      expect(res.headers["content-type"]).to.match(/html/);
      expect(res.text.length).to.be.greaterThan(0);
    });

    it("serves the sign-in page", async function () {
      const res = await req().get("/signin");
      expect(res.status).to.equal(200);
      expect(res.text.toLowerCase()).to.include("sign");
    });

    it("returns 404 for an unknown path", async function () {
      const res = await req().get("/this-route-does-not-exist-12345");
      expect(res.status).to.equal(404);
    });

    it("returns 404 for a POST to an unknown path", async function () {
      const res = await anonymousAgent()
        .post("/nonexistent-endpoint")
        .type("form")
        .send({ test: "data" });
      expect(res.status).to.equal(404);
    });
  });

  describe("static assets", function () {
    it("serves compiled CSS", async function () {
      const res = await req().get("/style/style.min.css");
      expect(res.status).to.be.oneOf([200, 304]);
    });

    it("does not serve files outside the public directory", async function () {
      const res = await req().get("/../config.json");
      expect(res.status).to.not.equal(200);
    });
  });

  describe("protected routes", function () {
    it("redirects an anonymous request for /premade to /signin", async function () {
      const res = await req().get("/premade");
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });
  });

  describe("security headers", function () {
    let headers;

    before(async function () {
      const res = await req().get("/");
      headers = res.headers;
    });

    it("sets X-Content-Type-Options", function () {
      expect(headers["x-content-type-options"]).to.equal("nosniff");
    });

    it("sets X-Frame-Options", function () {
      expect(headers["x-frame-options"]).to.equal("SAMEORIGIN");
    });

    it("sets a Content-Security-Policy that blocks off-site scripts", function () {
      expect(headers["content-security-policy"]).to.be.a("string");
      expect(headers["content-security-policy"]).to.include("script-src 'self'");
      expect(headers["content-security-policy"]).to.include("object-src 'none'");
    });

    it("sets a Referrer-Policy", function () {
      expect(headers["referrer-policy"]).to.equal("same-origin");
    });

    it("does not advertise the framework", function () {
      expect(headers).to.not.have.property("x-powered-by");
    });
  });

  describe("session middleware", function () {
    it("issues a session cookie once a session is needed", async function () {
      const agent = anonymousAgent();
      // A protected page stores returnTo, which forces the session to persist.
      const res = await agent.get("/premade");
      expect(res.headers["set-cookie"]).to.be.an("array");
      expect(res.headers["set-cookie"].join(";")).to.include("synbio.sid");
    });

    it("hardens the session cookie it issues", async function () {
      // express-flash reads and clears the flash on every render, which writes
      // to the session, so even a plain page view gets a cookie. What matters
      // is that the cookie carries the protective attributes.
      const res = await req().get("/");
      const cookie = (res.headers["set-cookie"] || []).join(";");

      expect(cookie).to.include("synbio.sid");
      expect(cookie).to.match(/HttpOnly/i);
      expect(cookie).to.match(/SameSite=Lax/i);
    });

    it("does not reuse a session ID across two fresh visitors", async function () {
      const idOf = (res) =>
        (/synbio\.sid=([^;]+)/.exec((res.headers["set-cookie"] || []).join(";")) ||
          [])[1];

      const first = await req().get("/");
      const second = await req().get("/");

      expect(idOf(first)).to.not.equal(idOf(second));
    });
  });
});
