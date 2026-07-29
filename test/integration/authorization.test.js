/**
 * Authorization matrix.
 *
 * Walks every route in routes.js and asserts that anonymous users cannot reach
 * anything protected, and that non-admins cannot reach admin-only routes.
 *
 * This is the test that catches a route being added without its middleware —
 * which is exactly how `/filemanager/:id/download` and
 * `/sequencefilemanager/:id/download` ended up publicly readable.
 */

const { expect } = require("chai");
const { signedInAgent, anonymousAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

// Routes any signed-in user may reach.
const AUTHENTICATED_ROUTES = [
  ["GET", "/premade"],
  ["GET", "/premade/export"],
  ["GET", "/custom"],
  ["GET", "/recently-added-items"],
  ["GET", "/search"],
  ["GET", "/cart"],
];

// Routes that additionally require admin.
const ADMIN_ROUTES = [
  ["GET", "/admin/billboard"],
  ["GET", "/docs/rearrange"],
  ["GET", "/docs/new"],
  ["GET", "/premade/rearrange"],
  ["GET", "/premade/new"],
  ["GET", "/filemanager"],
  ["GET", "/orders"],
  ["GET", "/order/summary"],
  ["GET", "/order/export"],
  ["GET", "/order/export-all"],
  ["GET", "/order/summary-data"],
  ["GET", "/dupes"],
  ["GET", "/budget"],
  ["GET", "/budget/new"],
];

// State-changing admin routes. Checked for anonymous rejection only; driving
// them for real is covered by the per-feature specs.
const ADMIN_POST_ROUTES = [
  "/admin/billboard",
  "/docs/new",
  "/docs/rearrange",
  "/premade/new",
  "/premade/rearrange",
  "/upload",
  "/imageupload",
  "/budget",
];

/** True when the response is a redirect to the sign-in page. */
function redirectsToSignin(res) {
  return res.status === 302 && /\/signin/.test(res.headers.location || "");
}

describe("Authorization", function () {
  this.timeout(30000);

  let ids;

  before(async function () {
    ids = await testDb.reset();
  });

  describe("anonymous users", function () {
    for (const [method, url] of [...AUTHENTICATED_ROUTES, ...ADMIN_ROUTES]) {
      it(`redirects ${method} ${url} to /signin`, async function () {
        const res = await anonymousAgent().get(url);
        expect(
          redirectsToSignin(res),
          `expected a redirect to /signin, got ${res.status} ${res.headers.location || ""}`,
        ).to.equal(true);
      });
    }

    for (const url of ADMIN_POST_ROUTES) {
      it(`refuses POST ${url}`, async function () {
        const res = await anonymousAgent().post(url).type("form").send({});
        expect(res.status, `POST ${url} should not succeed anonymously`).to.not.be.oneOf([
          200, 201,
        ]);
        // Either bounced to sign-in or refused outright.
        expect(redirectsToSignin(res) || res.status === 403 || res.status === 401).to.equal(
          true,
        );
      });
    }
  });

  describe("file downloads", function () {
    // Regression: both of these previously had no auth middleware at all, so
    // anyone who knew or guessed an id could pull down uploaded files.
    let fileId;
    let sequenceFileId;

    before(async function () {
      const file = await testDb.r
        .table("File")
        .insert(
          {
            name: "fixture.txt",
            originalName: "fixture.txt",
            path: "test/.tmp/fixture.txt",
            createdAt: new Date(),
          },
          { returnChanges: true },
        )
        .run();
      fileId = file.changes[0].new_val.id;

      const seq = await testDb.r
        .table("SequenceFile")
        .insert(
          {
            name: "fixture.ab1",
            originalName: "fixture.ab1",
            path: "test/.tmp/fixture.ab1",
            typeID: ids.type1,
            createdAt: new Date(),
          },
          { returnChanges: true },
        )
        .run();
      sequenceFileId = seq.changes[0].new_val.id;
    });

    it("does not serve a managed file to an anonymous client", async function () {
      const res = await anonymousAgent().get(`/filemanager/${fileId}/download`);
      expect(res.status).to.not.equal(200);
      expect(redirectsToSignin(res) || res.status === 403).to.equal(true);
    });

    it("does not serve a sequence file to an anonymous client", async function () {
      const res = await anonymousAgent().get(
        `/sequencefilemanager/${sequenceFileId}/download`,
      );
      expect(res.status).to.not.equal(200);
      expect(redirectsToSignin(res) || res.status === 403).to.equal(true);
    });
  });

  describe("signed-in non-admin", function () {
    let agent;

    before(async function () {
      // "testuser" authenticates in devMode but is not in config.admins.
      agent = await signedInAgent("testuser");
    });

    it("can reach ordinary authenticated pages", async function () {
      const res = await agent.get("/cart");
      expect(res.status).to.equal(200);
    });

    for (const [method, url] of ADMIN_ROUTES) {
      it(`is refused ${method} ${url}`, async function () {
        const res = await agent.get(url);
        expect(
          res.status,
          `${url} should be admin-only but returned ${res.status}`,
        ).to.not.equal(200);
        expect(res.status).to.be.oneOf([302, 403]);
      });
    }

    it("cannot delete a premade item", async function () {
      const res = await agent
        .post(`/premade/item/${ids.type1}/delete`)
        .type("form")
        .send({});
      expect(res.status).to.equal(403);

      // And the record must still be there.
      const stillThere = await testDb.r.table("Type1").get(ids.type1).run();
      expect(stillThere).to.not.equal(null);
    });

    it("cannot mark an order complete", async function () {
      const inserted = await testDb.r
        .table("Order")
        .insert(
          {
            username: "someone-else",
            janCode: "8001",
            complete: false,
            cancelled: false,
            createdAt: new Date(),
          },
          { returnChanges: true },
        )
        .run();
      const orderId = inserted.changes[0].new_val.id;

      const res = await agent.post(`/order/${orderId}/complete`).type("form").send({});
      expect(res.status).to.equal(403);

      const after = await testDb.r.table("Order").get(orderId).run();
      expect(after.complete).to.equal(false);
    });
  });

  describe("signed-in admin", function () {
    let agent;

    before(async function () {
      agent = await signedInAgent("deeks");
    });

    for (const [method, url] of ADMIN_ROUTES) {
      it(`can reach ${method} ${url}`, async function () {
        const res = await agent.get(url);
        // Some of these require query parameters and answer 400; what matters
        // is that authorization did not block them.
        expect(
          res.status,
          `${url} returned ${res.status} for an admin`,
        ).to.not.be.oneOf([401, 403]);
        expect(redirectsToSignin(res)).to.equal(false);
      });
    }
  });
});
