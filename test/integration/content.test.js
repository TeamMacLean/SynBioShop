/**
 * Content management: documentation, the premade catalogue, the billboard,
 * budget holders, and the read-only browse pages.
 *
 * These controllers had no tests at all. documents.js, premade.js,
 * budgetHolder.js and admin.js between them own every destructive route in the
 * app — delete, disable, rearrange — and not one was exercised.
 */

const { expect } = require("chai");
const { signedInAgent, anonymousAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const Subject = require("../../models/subject");
const Document = require("../../models/document");
const BudgetHolder = require("../../models/budgetHolder");

describe("Content management", function () {
  this.timeout(30000);

  let agent;
  let ids;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  describe("documentation", function () {
    it("lists subjects", async function () {
      const res = await agent.get("/docs");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Subject");
    });

    it("shows a subject", async function () {
      const res = await agent.get(`/docs/${ids.subject}`);
      expect(res.status).to.equal(200);
    });

    it("shows a document", async function () {
      const res = await agent.get(`/docs/item/${ids.document}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Document");
    });

    it("creates a subject", async function () {
      const res = await agent
        .post("/docs/new")
        .type("form")
        .send({ name: "Cloning Protocols" });

      expect(res.status).to.be.oneOf([200, 302]);

      const subjects = await Subject.filter({ name: "Cloning Protocols" }).run();
      expect(subjects).to.have.lengthOf(1);
    });

    it("disables and re-enables a subject", async function () {
      await agent.post(`/docs/${ids.subject}/disable`).type("form").send({});
      expect((await Subject.get(ids.subject)).disabled).to.equal(true);

      await agent.post(`/docs/${ids.subject}/enable`).type("form").send({});
      expect((await Subject.get(ids.subject)).disabled).to.equal(false);
    });

    it("deletes a document", async function () {
      await agent.post(`/docs/item/${ids.document}/delete`).type("form").send({});
      expect(await Document.get(ids.document)).to.equal(null);
    });

    it("requires admin to delete a document", async function () {
      const nonAdmin = await signedInAgent("testuser");
      const res = await nonAdmin
        .post(`/docs/item/${ids.document}/delete`)
        .type("form")
        .send({});

      expect(res.status).to.equal(403);
      expect(await Document.get(ids.document)).to.not.equal(null);
    });

    describe("rearrange", function () {
      it("saves new positions", async function () {
        const res = await agent
          .post("/docs/rearrange")
          .type("form")
          .send({
            newOrder: JSON.stringify([
              { id: ids.subject, position: 3, documents: [] },
            ]),
          });

        expect(res.status).to.equal(200);
        expect((await Subject.get(ids.subject)).position).to.equal(3);
      });

      it("rejects a malformed payload with 400, not a stack trace", async function () {
        // JSON.parse sat outside any try/catch, so this threw synchronously
        // and Express returned the raw stack.
        const res = await agent
          .post("/docs/rearrange")
          .type("form")
          .send({ newOrder: "{not valid json" });

        expect(res.status).to.equal(400);
        expect(res.text).to.not.include("SyntaxError");
      });

      it("rejects a payload that is not a list", async function () {
        const res = await agent
          .post("/docs/rearrange")
          .type("form")
          .send({ newOrder: JSON.stringify({ nope: true }) });

        expect(res.status).to.equal(400);
      });

      it("completes even when a referenced record was deleted", async function () {
        // The old code did `.catch((err) => bad)`, returning the reject
        // function instead of calling it — the promise never settled and the
        // request hung forever with the layout half-saved.
        const res = await agent
          .post("/docs/rearrange")
          .type("form")
          .send({
            newOrder: JSON.stringify([
              { id: ids.subject, position: 1, documents: [] },
              {
                id: "00000000-0000-4000-8000-000000000000",
                position: 2,
                documents: [],
              },
            ]),
          });

        expect(res.status).to.equal(200);
        expect((await Subject.get(ids.subject)).position).to.equal(1);
      });
    });
  });

  describe("premade catalogue", function () {
    it("lists databases", async function () {
      const res = await agent.get("/premade");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Database");
    });

    it("shows a database", async function () {
      const res = await agent.get(`/premade/${ids.db}`);
      expect(res.status).to.equal(200);
    });

    it("shows a category", async function () {
      const res = await agent.get(`/premade/category/${ids.category}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Category");
    });

    it("shows an item", async function () {
      const res = await agent.get(`/premade/item/${ids.type1}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("pTEST001");
    });

    it("answers 404 for an item that does not exist", async function () {
      const res = await agent.get(
        "/premade/item/00000000-0000-4000-8000-000000000000",
      );
      expect(res.status).to.equal(404);
    });

    it("disables and re-enables an item", async function () {
      await agent.post(`/premade/item/${ids.type1}/disable`).type("form").send({});
      let row = await testDb.r.table("Type1").get(ids.type1).run();
      expect(row.disabled).to.equal(true);

      await agent.post(`/premade/item/${ids.type1}/enable`).type("form").send({});
      row = await testDb.r.table("Type1").get(ids.type1).run();
      expect(row.disabled).to.equal(false);
    });

    it("deletes an item", async function () {
      await agent.post(`/premade/item/${ids.type1}/delete`).type("form").send({});
      const row = await testDb.r.table("Type1").get(ids.type1).run();
      expect(row).to.equal(null);
    });

    it("does not embed joined relations when saving an item", async function () {
      // getByID joins db, category, mapFile and sequenceFiles, and save() used
      // to write all of it back into the Type row.
      await agent.post(`/premade/item/${ids.type1}/disable`).type("form").send({});

      const row = await testDb.r.table("Type1").get(ids.type1).run();
      expect(row).to.not.have.property("db");
      expect(row).to.not.have.property("category");
      expect(row).to.not.have.property("sequenceFiles");
    });
  });

  describe("billboard", function () {
    it("renders the edit form", async function () {
      const res = await agent.get("/admin/billboard");
      expect(res.status).to.equal(200);
    });

    it("saves billboard text and shows it site-wide", async function () {
      const res = await agent
        .post("/admin/billboard")
        .type("form")
        .send({ text: "Scheduled maintenance on Friday", enabled: "on" });

      expect(res.status).to.be.oneOf([200, 302]);

      const home = await agent.get("/");
      expect(home.text).to.include("Scheduled maintenance on Friday");
    });

    it("requires admin", async function () {
      const nonAdmin = await signedInAgent("testuser");
      const res = await nonAdmin
        .post("/admin/billboard")
        .type("form")
        .send({ text: "hijacked", enabled: "on" });

      expect(res.status).to.equal(403);
    });
  });

  describe("budget holders", function () {
    it("lists them", async function () {
      const res = await agent.get("/budget");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("TEST Budget Holder");
    });

    it("creates one", async function () {
      const res = await agent
        .post("/budget")
        .type("form")
        .send({ username: "newholder", description: "NEW Holder [Dept]" });

      expect(res.status).to.be.oneOf([200, 302]);

      const holders = await BudgetHolder.filter({ username: "newholder" }).run();
      expect(holders).to.have.lengthOf(1);
      expect(holders[0].description).to.equal("NEW Holder [Dept]");
    });

    it("updates one", async function () {
      const [holder] = await BudgetHolder.filter({ username: "testbudget" }).run();

      await agent
        .post(`/budget/${holder.id}`)
        .type("form")
        .send({ username: "testbudget", description: "RENAMED Holder [Dept]" });

      const updated = await BudgetHolder.get(holder.id);
      expect(updated.description).to.equal("RENAMED Holder [Dept]");
    });

    it("deletes one", async function () {
      const [holder] = await BudgetHolder.filter({ username: "testbudget" }).run();

      await agent.post(`/budget/${holder.id}/delete`).type("form").send({});
      expect(await BudgetHolder.get(holder.id)).to.equal(null);
    });

    it("is admin-only", async function () {
      const nonAdmin = await signedInAgent("testuser");
      const res = await nonAdmin
        .post("/budget")
        .type("form")
        .send({ username: "sneaky", description: "x" });

      expect(res.status).to.be.oneOf([302, 403]);
      expect(await BudgetHolder.filter({ username: "sneaky" }).run()).to.have.lengthOf(
        0,
      );
    });

    it("supplies the dropdown options the cart page renders", async function () {
      // Asserted through the helper rather than the page: every user the dev
      // mode strategy can create is company "TSL", and TSL staff are not
      // charged, so the dropdown never renders in this environment.
      const budgetHolders = require("../../config/budgetHolders");
      const options = await budgetHolders.getBudgetHoldersForSelect();

      expect(options).to.have.lengthOf(2);
      expect(options.map((o) => o.value)).to.have.members([
        "testbudget",
        "otherbudget",
      ]);
      expect(options[0]).to.have.keys(["value", "label"]);
    });

    it("returns the dropdown options sorted by display name", async function () {
      const budgetHolders = require("../../config/budgetHolders");
      const options = await budgetHolders.getBudgetHoldersForSelect();

      const labels = options.map((o) => o.label);
      expect(labels).to.deep.equal([...labels].sort((a, b) => a.localeCompare(b)));
    });

    it("validates a budget holder that exists and rejects one that does not", async function () {
      const budgetHolders = require("../../config/budgetHolders");

      expect(await budgetHolders.isValidBudgetHolder("testbudget")).to.equal(true);
      expect(await budgetHolders.isValidBudgetHolder("not-a-holder")).to.equal(false);
    });
  });

  describe("browse pages", function () {
    it("renders the search page for a matching term", async function () {
      const res = await agent.get("/search?queryString=pTEST001");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("pTEST001");
    });

    it("renders the search page for a term with no matches", async function () {
      const res = await agent.get("/search?queryString=zzzznomatch");
      expect(res.status).to.equal(200);
    });

    it("escapes the search term rather than reflecting it as markup", async function () {
      // The heading used <%- %>, so a crafted link executed script on this
      // origin for whoever followed it.
      const payload = "<img src=x onerror=alert(1)>";
      const res = await agent.get(
        `/search?queryString=${encodeURIComponent(payload)}`,
      );

      expect(res.status).to.equal(200);
      expect(res.text).to.not.include("<img src=x onerror=");
      expect(res.text).to.include("&lt;img src=x onerror=");
    });

    it("treats regex metacharacters in search as literal text", async function () {
      const res = await agent.get("/search?queryString=" + encodeURIComponent(".*"));
      expect(res.status).to.equal(200);
    });

    it("renders the recently-added page", async function () {
      const res = await agent.get("/recently-added-items");
      expect(res.status).to.equal(200);
    });

    it("renders the custom page", async function () {
      const res = await agent.get("/custom");
      expect(res.status).to.equal(200);
    });

    it("requires authentication for all browse pages", async function () {
      for (const url of ["/search", "/recently-added-items", "/custom"]) {
        const res = await anonymousAgent().get(url);
        expect(res.status, `${url} was reachable anonymously`).to.equal(302);
        expect(res.headers.location).to.equal("/signin");
      }
    });
  });
});
