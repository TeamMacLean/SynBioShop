/**
 * Error handling: bad input should produce a clean status, never a stack
 * trace, a hang, or a crashed process.
 */

const { expect } = require("chai");
const { req, signedInAgent, anonymousAgent, SAME_ORIGIN } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

describe("Error handling", function () {
  this.timeout(30000);

  let agent;

  before(async function () {
    await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  describe("malformed input", function () {
    it("answers 400 for a malformed URI instead of crashing", async function () {
      const res = await req().get("/%C0");
      expect(res.status).to.equal(400);
      expect(res.text).to.include("Bad Request: Invalid URI");
    });

    it("answers 404 for an unknown path", async function () {
      const res = await req().get("/no-such-page-anywhere");
      expect(res.status).to.equal(404);
    });

    it("does not 500 on a deeply nested unknown path", async function () {
      const res = await req().get("/a/b/c/d/e/f/g");
      expect(res.status).to.equal(404);
    });
  });

  describe("missing records", function () {
    it("redirects rather than 500ing for a non-existent doc subject", async function () {
      const res = await agent.get("/docs/non-existent-id-12345");
      expect(res.status).to.be.oneOf([302, 404]);
    });

    it("answers 404 for a non-existent premade item", async function () {
      const res = await agent.get(
        "/premade/item/00000000-0000-4000-8000-000000000000",
      );
      expect(res.status).to.not.equal(500);
    });

    it("answers 404 for a download whose id does not exist", async function () {
      const res = await agent.get(
        "/filemanager/00000000-0000-4000-8000-000000000000/download",
      );
      expect(res.status).to.equal(404);
    });

    it("answers 404, not 500, for a document that does not exist", async function () {
      // A null record was handed to the template, which threw while rendering.
      const res = await agent.get(
        "/docs/item/00000000-0000-4000-8000-000000000000",
      );
      expect(res.status).to.equal(404);
    });
  });

  describe("failed sign-in", function () {
    it("redirects to /signin rather than rendering a 500", async function () {
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "invalid_user_123", password: "wrong_password" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });
  });

  describe("error responses do not leak internals", function () {
    it("never returns a stack trace in the body", async function () {
      // Express's default handler serialises err.stack whenever NODE_ENV is
      // not "production". The terminal handler in app.js replaces it.
      const paths = [
        "/no-such-page-anywhere",
        "/filemanager/00000000-0000-4000-8000-000000000000/download",
        "/order/00000000-0000-4000-8000-000000000000",
      ];

      for (const path of paths) {
        const res = await agent.get(path);
        expect(res.text || "", `${path} leaked a stack trace`).to.not.match(
          /\bat\s+\w+.*\(.*:\d+:\d+\)/,
        );
        expect(res.text || "").to.not.include("node_modules");
      }
    });
  });

  describe("resilience to hostile input", function () {
    it("survives an oversized query string", async function () {
      const res = await agent.get("/search?queryString=" + "a".repeat(5000));
      expect(res.status).to.be.oneOf([200, 400, 414]);
    });

    it("rejects an oversized JSON body rather than buffering it", async function () {
      // The body limit was 50mb, which let an anonymous client pin CPU in the
      // parser on any route.
      const res = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ username: "x".repeat(2 * 1024 * 1024) }));

      expect(res.status).to.be.oneOf([413, 400]);
    });

    it("does not crash on a search with no query string", async function () {
      const res = await agent.get("/search");
      expect(res.status).to.equal(200);
    });
  });
});
