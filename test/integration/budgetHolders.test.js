/**
 * Budget holder administration (HTTP layer).
 *
 * The existing budgetHolder.test.js exercises the model and the config helpers
 * directly but never issues a request, so the controller's validation,
 * duplicate handling and admin gate were untested.
 */

const { expect } = require("chai");
const { signedInAgent, anonymousAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const BudgetHolder = require("../../models/budgetHolder");

const GHOST = "00000000-0000-4000-8000-000000000000";

describe("Budget holder administration", function () {
  this.timeout(30000);

  let agent;

  beforeEach(async function () {
    await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  /** The seeded holder, looked up by its fixture username. */
  async function seeded() {
    const rows = await BudgetHolder.filter({ username: "testbudget" }).run();
    return rows[0];
  }

  describe("listing", function () {
    it("shows the seeded holders", async function () {
      const res = await agent.get("/budget");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("TEST Budget Holder");
      expect(res.text).to.include("OTHER Budget Holder");
    });

    it("renders the add form", async function () {
      const res = await agent.get("/budget/new");
      expect(res.status).to.equal(200);
    });

    it("renders the edit form for an existing holder", async function () {
      const holder = await seeded();
      const res = await agent.get(`/budget/${holder.id}/edit`);

      expect(res.status).to.equal(200);
      expect(res.text).to.include("testbudget");
    });

    it("handles the edit form for a holder that does not exist", async function () {
      const res = await agent.get(`/budget/${GHOST}/edit`);
      expect(res.status).to.not.equal(200);
    });
  });

  describe("creating", function () {
    it("creates a holder", async function () {
      await agent
        .post("/budget")
        .type("form")
        .send({ username: "newperson", description: "NEW Person [Department]" });

      const rows = await BudgetHolder.filter({ username: "newperson" }).run();
      expect(rows).to.have.lengthOf(1);
      expect(rows[0].description).to.equal("NEW Person [Department]");
    });

    it("rejects a missing username", async function () {
      const before = (await BudgetHolder.run()).length;

      const res = await agent
        .post("/budget")
        .type("form")
        .send({ username: "", description: "Valid description here" });

      expect(res.status).to.equal(200);
      expect(res.text).to.include("Username is required");
      expect((await BudgetHolder.run()).length).to.equal(before);
    });

    it("rejects a username that is too short or too long", async function () {
      for (const username of ["ab", "x".repeat(21)]) {
        const res = await agent
          .post("/budget")
          .type("form")
          .send({ username, description: "A perfectly valid description" });

        expect(res.text, `"${username}" was accepted`).to.include(
          "Username must be between 3 and 20 characters",
        );
      }
    });

    it("rejects a missing description", async function () {
      const res = await agent
        .post("/budget")
        .type("form")
        .send({ username: "someone", description: "" });

      expect(res.text).to.include("Description is required");
    });

    it("rejects a description that is too short or too long", async function () {
      for (const description of ["short", "x".repeat(151)]) {
        const res = await agent
          .post("/budget")
          .type("form")
          .send({ username: "someone", description });

        expect(res.text, `description of length ${description.length} was accepted`)
          .to.include("Description must be between 10 and 150 characters");
      }
    });

    it("reports every validation problem at once", async function () {
      const res = await agent
        .post("/budget")
        .type("form")
        .send({ username: "", description: "" });

      expect(res.text).to.include("Username is required");
      expect(res.text).to.include("Description is required");
    });

    it("refuses a duplicate username", async function () {
      const res = await agent
        .post("/budget")
        .type("form")
        .send({ username: "testbudget", description: "Another description here" });

      expect(res.status).to.equal(200);
      expect(res.text).to.include("already exists");

      const rows = await BudgetHolder.filter({ username: "testbudget" }).run();
      expect(rows, "no duplicate should have been created").to.have.lengthOf(1);
    });

    it("keeps the submitted values on the form after a rejection", async function () {
      const res = await agent
        .post("/budget")
        .type("form")
        .send({ username: "ab", description: "A perfectly valid description" });

      // So the admin does not have to retype everything.
      expect(res.text).to.include("A perfectly valid description");
    });
  });

  describe("updating", function () {
    it("updates a holder", async function () {
      const holder = await seeded();

      await agent
        .post(`/budget/${holder.id}`)
        .type("form")
        .send({ username: "testbudget", description: "UPDATED description text" });

      const updated = await BudgetHolder.get(holder.id);
      expect(updated.description).to.equal("UPDATED description text");
    });

    it("rejects an invalid update without changing the record", async function () {
      const holder = await seeded();
      const before = await BudgetHolder.get(holder.id);

      await agent
        .post(`/budget/${holder.id}`)
        .type("form")
        .send({ username: "testbudget", description: "tiny" });

      const after = await BudgetHolder.get(holder.id);
      expect(after.description).to.equal(before.description);
    });

    it("handles updating a holder that does not exist", async function () {
      const res = await agent
        .post(`/budget/${GHOST}`)
        .type("form")
        .send({ username: "ghost", description: "A valid description here" });

      expect(res.status).to.not.equal(500);
    });
  });

  describe("deleting", function () {
    it("deletes a holder", async function () {
      const holder = await seeded();

      await agent.post(`/budget/${holder.id}/delete`).type("form").send({});
      expect(await BudgetHolder.get(holder.id)).to.equal(null);
    });

    it("removes it from the cart dropdown options", async function () {
      const holder = await seeded();
      await agent.post(`/budget/${holder.id}/delete`).type("form").send({});

      const budgetHolders = require("../../config/budgetHolders");
      const options = await budgetHolders.getBudgetHoldersForSelect();
      expect(options.map((o) => o.value)).to.not.include("testbudget");
    });

    it("handles deleting a holder that does not exist", async function () {
      const res = await agent.post(`/budget/${GHOST}/delete`).type("form").send({});
      expect(res.status).to.not.equal(500);
    });
  });

  describe("order validation uses the live list", function () {
    it("rejects an order naming a holder that was deleted", async function () {
      const budgetHolders = require("../../config/budgetHolders");
      expect(await budgetHolders.isValidBudgetHolder("testbudget")).to.equal(true);

      const holder = await seeded();
      await agent.post(`/budget/${holder.id}/delete`).type("form").send({});

      expect(await budgetHolders.isValidBudgetHolder("testbudget")).to.equal(false);
    });
  });

  describe("access control", function () {
    it("requires authentication", async function () {
      const res = await anonymousAgent().get("/budget");
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });

    it("refuses a non-admin on every route", async function () {
      const nonAdmin = await signedInAgent("testuser");
      const holder = await seeded();

      for (const url of ["/budget", "/budget/new", `/budget/${holder.id}/edit`]) {
        const res = await nonAdmin.get(url);
        expect(res.status, `${url} was reachable`).to.be.oneOf([302, 403]);
      }

      for (const url of [
        "/budget",
        `/budget/${holder.id}`,
        `/budget/${holder.id}/delete`,
      ]) {
        const res = await nonAdmin
          .post(url)
          .type("form")
          .send({ username: "sneaky", description: "Trying to get in here" });
        expect(res.status, `POST ${url} was allowed`).to.be.oneOf([302, 403]);
      }

      // Nothing changed.
      expect(await BudgetHolder.get(holder.id)).to.not.equal(null);
      expect(await BudgetHolder.filter({ username: "sneaky" }).run()).to.have.lengthOf(
        0,
      );
    });
  });
});
