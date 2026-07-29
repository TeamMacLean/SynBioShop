/**
 * Admin notification badge.
 *
 * views/head.ejs shows the open-order count only to admins, so this is a
 * positive/negative pair over an authorization-dependent piece of UI.
 */

const { expect } = require("chai");
const { signedInAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

describe("Navigation badge", function () {
  this.timeout(30000);

  before(async function () {
    await testDb.reset();

    // One open order, so the badge has something to report.
    await testDb.r
      .table("Order")
      .insert({
        username: "someone",
        janCode: "7500",
        complete: false,
        cancelled: false,
        createdAt: new Date(),
      })
      .run();
  });

  it("renders the badge for an admin", async function () {
    const agent = await signedInAgent("deeks");
    const res = await agent.get("/");

    expect(res.status).to.equal(200);
    expect(res.text).to.include('<span class="badge">');
  });

  it("does not render the badge for a non-admin", async function () {
    const agent = await signedInAgent("testuser");
    const res = await agent.get("/");

    expect(res.status).to.equal(200);
    expect(res.text).to.not.include('<span class="badge">');
  });

  it("does not render the badge for an anonymous visitor", async function () {
    const { req } = require("../helpers/agent");
    const res = await req().get("/");

    expect(res.status).to.equal(200);
    expect(res.text).to.not.include('<span class="badge">');
  });
});
