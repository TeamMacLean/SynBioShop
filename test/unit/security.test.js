/**
 * Unit tests for lib/security.js.
 *
 * The previous version of this file re-implemented escapeHtml, getGravatarUrl
 * and isImage inside the test and asserted against those copies, so deleting
 * the real implementations would not have failed a single assertion.
 */

const { expect } = require("chai");
const security = require("../../lib/security");
const config = require("../../config");

/** Minimal Express request stand-in. */
function makeReq({ method = "GET", headers = {}, body = {}, session = {} } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

  return {
    method,
    body,
    session,
    originalUrl: "/test",
    get(name) {
      return lower[String(name).toLowerCase()];
    },
    accepts() {
      return true;
    },
  };
}

/** Minimal Express response stand-in that records what was sent. */
function makeRes() {
  const res = {
    locals: {},
    statusCode: 200,
    headers: {},
    sent: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
    },
    send(body) {
      res.sent = body;
      return res;
    },
    json(body) {
      res.sent = body;
      return res;
    },
  };
  return res;
}

const HOST = "127.0.0.1:3000";

describe("lib/security", function () {
  describe("safeRedirectTarget", function () {
    it("returns the path of a same-origin referrer", function () {
      const req = makeReq({
        headers: { host: HOST, Referrer: `http://${HOST}/premade/item/42` },
      });
      expect(security.safeRedirectTarget(req)).to.equal("/premade/item/42");
    });

    it("preserves the query string", function () {
      const req = makeReq({
        headers: { host: HOST, Referrer: `http://${HOST}/search?q=abc` },
      });
      expect(security.safeRedirectTarget(req)).to.equal("/search?q=abc");
    });

    it("falls back for an off-site referrer", function () {
      const req = makeReq({
        headers: { host: HOST, Referrer: "https://evil.example.com/phish" },
      });
      expect(security.safeRedirectTarget(req)).to.equal("/");
    });

    it("falls back for a protocol-relative referrer", function () {
      // "//evil.com" is a full URL to the browser, not a path.
      const req = makeReq({
        headers: { host: HOST, Referrer: "//evil.example.com/phish" },
      });
      expect(security.safeRedirectTarget(req)).to.equal("/");
    });

    it("falls back when there is no referrer", function () {
      const req = makeReq({ headers: { host: HOST } });
      expect(security.safeRedirectTarget(req, "/cart")).to.equal("/cart");
    });

    it("keeps a garbled referrer on-site rather than following it", function () {
      // Nonsense that is not a valid absolute URL resolves as a relative path
      // against this host, which is safe; what matters is that it can never
      // point at another origin.
      const req = makeReq({ headers: { host: HOST, Referrer: "ht!tp://%%%" } });
      expect(security.safeRedirectTarget(req)).to.match(/^\/(?!\/)/);
    });

    it("accepts the configured baseURL origin", function () {
      const req = makeReq({
        headers: {
          host: "other-host:9999",
          Referrer: new URL("/cart", config.baseURL).href,
        },
      });
      expect(security.safeRedirectTarget(req)).to.equal("/cart");
    });

    it("never returns something that could redirect off-site", function () {
      const hostile = [
        "https://evil.example.com",
        "//evil.example.com",
        "http://127.0.0.1:3000@evil.example.com/",
        "https://127.0.0.1:3000.evil.example.com/",
      ];

      for (const referrer of hostile) {
        const req = makeReq({ headers: { host: HOST, Referrer: referrer } });
        const target = security.safeRedirectTarget(req);
        expect(target, `${referrer} produced ${target}`).to.match(/^\/(?!\/)/);
      }
    });
  });

  describe("csrfProtection", function () {
    /** Runs the middleware and reports whether it called next(). */
    function run(req, res) {
      let called = false;
      security.csrfProtection(req, res, () => {
        called = true;
      });
      return called;
    }

    it("lets safe methods through", function () {
      const req = makeReq({ method: "GET", headers: { host: HOST } });
      expect(run(req, makeRes())).to.equal(true);
    });

    it("exposes a token to templates", function () {
      const req = makeReq({ method: "GET", headers: { host: HOST } });
      const res = makeRes();
      run(req, res);
      expect(res.locals.csrfToken).to.be.a("string").with.length.greaterThan(20);
    });

    it("issues the same token for the life of a session", function () {
      const session = {};
      const first = makeRes();
      run(makeReq({ headers: { host: HOST }, session }), first);
      const second = makeRes();
      run(makeReq({ headers: { host: HOST }, session }), second);

      expect(first.locals.csrfToken).to.equal(second.locals.csrfToken);
    });

    it("issues different tokens to different sessions", function () {
      const a = makeRes();
      run(makeReq({ headers: { host: HOST }, session: {} }), a);
      const b = makeRes();
      run(makeReq({ headers: { host: HOST }, session: {} }), b);

      expect(a.locals.csrfToken).to.not.equal(b.locals.csrfToken);
    });

    it("does not create a token unless something reads it", function () {
      // Writing to the session on every request would force a cookie for
      // anonymous visitors who never needed one.
      const session = {};
      const req = makeReq({ headers: { host: HOST }, session });
      run(req, makeRes());
      expect(session.csrfToken).to.equal(undefined);
    });

    it("accepts a POST from this origin", function () {
      const req = makeReq({
        method: "POST",
        headers: { host: HOST, Origin: `http://${HOST}` },
      });
      expect(run(req, makeRes())).to.equal(true);
    });

    it("rejects a POST from another origin", function () {
      const req = makeReq({
        method: "POST",
        headers: { host: HOST, Origin: "https://evil.example.com" },
      });
      const res = makeRes();
      expect(run(req, res)).to.equal(false);
      expect(res.statusCode).to.equal(403);
    });

    it("rejects a POST whose Referer is another origin", function () {
      const req = makeReq({
        method: "POST",
        headers: { host: HOST, Referer: "https://evil.example.com/page" },
      });
      const res = makeRes();
      expect(run(req, res)).to.equal(false);
      expect(res.statusCode).to.equal(403);
    });

    it("rejects a header-less POST that carries no token", function () {
      const req = makeReq({ method: "POST", headers: { host: HOST } });
      const res = makeRes();
      expect(run(req, res)).to.equal(false);
      expect(res.statusCode).to.equal(403);
    });

    it("accepts a header-less POST carrying the right token", function () {
      const session = { csrfToken: "a".repeat(64) };
      const req = makeReq({
        method: "POST",
        headers: { host: HOST },
        body: { _csrf: "a".repeat(64) },
        session,
      });
      expect(run(req, makeRes())).to.equal(true);
    });

    it("rejects a header-less POST carrying the wrong token", function () {
      const session = { csrfToken: "a".repeat(64) };
      const req = makeReq({
        method: "POST",
        headers: { host: HOST },
        body: { _csrf: "b".repeat(64) },
        session,
      });
      const res = makeRes();
      expect(run(req, res)).to.equal(false);
      expect(res.statusCode).to.equal(403);
    });

    it("rejects a same-origin POST whose token does not match", function () {
      const session = { csrfToken: "a".repeat(64) };
      const req = makeReq({
        method: "POST",
        headers: { host: HOST, Origin: `http://${HOST}` },
        body: { _csrf: "wrong" },
        session,
      });
      const res = makeRes();
      expect(run(req, res)).to.equal(false);
      expect(res.statusCode).to.equal(403);
    });

    it("guards DELETE and PUT as well as POST", function () {
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        const req = makeReq({
          method,
          headers: { host: HOST, Origin: "https://evil.example.com" },
        });
        const res = makeRes();
        expect(run(req, res), `${method} was not guarded`).to.equal(false);
      }
    });
  });

  describe("securityHeaders", function () {
    it("sets the baseline headers", function () {
      const res = makeRes();
      security.securityHeaders(makeReq(), res, () => {});

      expect(res.headers["x-content-type-options"]).to.equal("nosniff");
      expect(res.headers["x-frame-options"]).to.equal("SAMEORIGIN");
      expect(res.headers["referrer-policy"]).to.equal("same-origin");
      expect(res.headers["content-security-policy"]).to.be.a("string");
    });

    it("forbids plugin content and restricts form submissions", function () {
      const res = makeRes();
      security.securityHeaders(makeReq(), res, () => {});

      const csp = res.headers["content-security-policy"];
      expect(csp).to.include("object-src 'none'");
      expect(csp).to.include("form-action 'self'");
      expect(csp).to.include("base-uri 'self'");
    });

    it("always calls next", function () {
      let called = false;
      security.securityHeaders(makeReq(), makeRes(), () => {
        called = true;
      });
      expect(called).to.equal(true);
    });
  });

  describe("rateLimit", function () {
    it("is disabled under test so suites can hammer endpoints", function () {
      const limiter = security.rateLimit({ windowMs: 1000, max: 1 });
      let allowed = 0;

      for (let i = 0; i < 10; i++) {
        limiter(makeReq({ headers: { host: HOST } }), makeRes(), () => {
          allowed++;
        });
      }
      expect(allowed).to.equal(10);
    });
  });
});
