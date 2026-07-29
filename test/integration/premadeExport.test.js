/**
 * Premade catalogue CSV export.
 *
 * The previous version asserted `expect(res.text).to.be.a("string")` — which
 * supertest guarantees for any text response — so it verified nothing about
 * the CSV's contents.
 */

const { expect } = require("chai");
const { signedInAgent, anonymousAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

describe("Premade export", function () {
  this.timeout(30000);

  let agent;

  before(async function () {
    await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  it("requires authentication", async function () {
    const res = await anonymousAgent().get("/premade/export");
    expect(res.status).to.equal(302);
    expect(res.headers.location).to.equal("/signin");
  });

  it("returns a CSV response", async function () {
    const res = await agent.get("/premade/export");
    expect(res.status).to.equal(200);
    expect(res.headers["content-type"]).to.match(/csv/);
  });

  it("includes a header row and the seeded items", async function () {
    const res = await agent.get("/premade/export");

    const lines = res.text.trim().split("\n");
    expect(lines.length, "expected a header plus at least one row").to.be.greaterThan(
      1,
    );

    // Fixture names, so this cannot pass on an unrelated catalogue.
    expect(res.text).to.include("pTEST001");
    expect(res.text).to.include("pTEST002");
  });

  it("offers the file as a download", async function () {
    const res = await agent.get("/premade/export");
    expect(res.headers["content-disposition"] || "").to.match(/attachment/i);
  });
});
