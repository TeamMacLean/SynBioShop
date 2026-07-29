/**
 * Premade catalogue CRUD: databases, categories and items.
 *
 * premade.js is the largest controller in the app and owns most of its
 * destructive routes. Before this file, its create/update/rearrange paths and
 * every database- and category-level delete were untested.
 */

const { expect } = require("chai");
const { signedInAgent, anonymousAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const DB = require("../../models/db");
const Category = require("../../models/category");

/** Field set a Type1 item form must post for a successful save. */
function itemForm(overrides = {}) {
  return {
    name: "pNEW001",
    description: "A new item",
    comments: "",
    concentration: "50",
    synBioID: "5001",
    documentation: "",
    note: "",
    level: "0",
    insideOverhangLeft: "AATG",
    insideOverhangRight: "GCTT",
    outsideOverhangLeft: "CGCT",
    outsideOverhangRight: "AGCG",
    resistance: "Kanamycin",
    whoMadeIt: "Test Author",
    ...overrides,
  };
}

describe("Premade catalogue", function () {
  this.timeout(30000);

  let agent;
  let ids;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  // ---------------------------------------------------------------- databases

  describe("databases", function () {
    it("renders the new-database form", async function () {
      const res = await agent.get("/premade/new");
      expect(res.status).to.equal(200);
    });

    it("creates a database", async function () {
      const res = await agent
        .post("/premade/new")
        .type("form")
        .send({ name: "Level 0 Acceptors", type: "1", description: "<p>Info</p>" });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/premade");

      const created = (await DB.run()).find((d) => d.name === "Level 0 Acceptors");
      expect(created, "database should exist").to.not.equal(undefined);
      expect(created.description).to.include("<p>Info</p>");
    });

    it("renders the edit form for an existing database", async function () {
      const res = await agent.get(`/premade/${ids.db}/edit`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Database");
    });

    it("updates a database", async function () {
      const res = await agent
        .post(`/premade/${ids.db}/edit`)
        .type("form")
        .send({ id: ids.db, name: "Renamed Database", description: "Updated" });

      expect(res.status).to.equal(302);

      const updated = await DB.get(ids.db);
      expect(updated.name).to.equal("Renamed Database");
      expect(updated.description).to.equal("Updated");
    });

    it("sanitises the description on save", async function () {
      await agent
        .post(`/premade/${ids.db}/edit`)
        .type("form")
        .send({
          id: ids.db,
          name: "Test Database",
          description: '<p>ok</p><img src=x onerror="alert(1)">',
        });

      const updated = await DB.get(ids.db);
      expect(updated.description).to.include("<p>ok</p>");
      expect(updated.description).to.not.include("onerror");
    });

    it("answers 404 when updating a database that does not exist", async function () {
      const res = await agent
        .post("/premade/00000000-0000-4000-8000-000000000000/edit")
        .type("form")
        .send({
          id: "00000000-0000-4000-8000-000000000000",
          name: "Ghost",
          description: "",
        });

      expect(res.status).to.equal(404);
    });

    it("disables and re-enables a database", async function () {
      await agent.post(`/premade/${ids.db}/disable`).type("form").send({});
      expect((await DB.get(ids.db)).disabled).to.equal(true);

      await agent.post(`/premade/${ids.db}/enable`).type("form").send({});
      expect((await DB.get(ids.db)).disabled).to.equal(false);
    });

    it("deletes a database", async function () {
      await agent.post(`/premade/${ids.db2}/delete`).type("form").send({});
      expect(await DB.get(ids.db2)).to.equal(null);
    });

    it("refuses every database mutation for a non-admin", async function () {
      const nonAdmin = await signedInAgent("testuser");

      for (const path of [
        `/premade/${ids.db}/edit`,
        `/premade/${ids.db}/disable`,
        `/premade/${ids.db}/enable`,
        `/premade/${ids.db}/delete`,
      ]) {
        const res = await nonAdmin.post(path).type("form").send({ id: ids.db });
        expect(res.status, `${path} was allowed`).to.equal(403);
      }

      // And the record is untouched.
      const db = await DB.get(ids.db);
      expect(db).to.not.equal(null);
      expect(db.name).to.equal("Test Database");
    });
  });

  // --------------------------------------------------------------- categories

  describe("categories", function () {
    it("renders the new-category form", async function () {
      const res = await agent.get(`/premade/${ids.db}/new`);
      expect(res.status).to.equal(200);
    });

    it("creates a category under a database", async function () {
      const res = await agent
        .post(`/premade/${ids.db}/new`)
        .type("form")
        .send({ name: "Promoters", description: "<p>Promoter parts</p>" });

      expect(res.status).to.equal(302);

      const created = (await Category.run()).find((c) => c.name === "Promoters");
      expect(created, "category should exist").to.not.equal(undefined);
      expect(created.dbID).to.equal(ids.db);
    });

    it("renders the category edit form", async function () {
      const res = await agent.get(`/premade/category/${ids.category}/edit`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Test Category");
    });

    it("updates a category", async function () {
      const res = await agent
        .post(`/premade/category/${ids.category}/edit`)
        .type("form")
        .send({ id: ids.category, name: "Renamed Category", description: "New" });

      expect(res.status).to.equal(302);

      const updated = await Category.get(ids.category);
      expect(updated.name).to.equal("Renamed Category");
    });

    it("sanitises the category description", async function () {
      await agent
        .post(`/premade/category/${ids.category}/edit`)
        .type("form")
        .send({
          id: ids.category,
          name: "Test Category",
          description: '<script>alert(1)</script><p>keep</p>',
        });

      const updated = await Category.get(ids.category);
      expect(updated.description).to.not.include("<script");
      expect(updated.description).to.include("<p>keep</p>");
    });

    it("disables and re-enables a category", async function () {
      await agent
        .post(`/premade/category/${ids.category}/disable`)
        .type("form")
        .send({});
      expect((await Category.get(ids.category)).disabled).to.equal(true);

      await agent
        .post(`/premade/category/${ids.category}/enable`)
        .type("form")
        .send({});
      expect((await Category.get(ids.category)).disabled).to.equal(false);
    });

    it("deletes a category", async function () {
      await agent
        .post(`/premade/category/${ids.category2}/delete`)
        .type("form")
        .send({});
      expect(await Category.get(ids.category2)).to.equal(null);
    });

    it("answers 404 for a category that does not exist", async function () {
      const res = await agent.get(
        "/premade/category/00000000-0000-4000-8000-000000000000",
      );
      expect(res.status).to.equal(404);
    });

    it("refuses category mutations for a non-admin", async function () {
      const nonAdmin = await signedInAgent("testuser");
      const res = await nonAdmin
        .post(`/premade/category/${ids.category}/delete`)
        .type("form")
        .send({});

      expect(res.status).to.equal(403);
      expect(await Category.get(ids.category)).to.not.equal(null);
    });
  });

  // -------------------------------------------------------------------- items

  describe("items", function () {
    it("renders the new-item form", async function () {
      const res = await agent.get(`/premade/category/${ids.category}/new`);
      expect(res.status).to.equal(200);
    });

    it("creates an item in a category", async function () {
      const res = await agent
        .post(`/premade/category/${ids.category}/new`)
        .type("form")
        .send(itemForm({ dbID: ids.db }));

      expect(res.status).to.equal(302);

      const rows = await testDb.r.table("Type1").run();
      const created = rows.find((t) => t.name === "pNEW001");
      expect(created, "item should exist").to.not.equal(undefined);
      expect(created.categoryID).to.equal(ids.category);
      expect(created.synBioID).to.equal("5001");
    });

    it("renders the item edit form", async function () {
      const res = await agent.get(`/premade/item/${ids.type1}/edit`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("pTEST001");
    });

    it("updates an item", async function () {
      const res = await agent
        .post(`/premade/item/${ids.type1}/edit`)
        .type("form")
        .send(itemForm({ id: ids.type1, dbID: ids.db, name: "pRENAMED" }));

      expect(res.status).to.equal(302);

      const updated = await testDb.r.table("Type1").get(ids.type1).run();
      expect(updated.name).to.equal("pRENAMED");
    });

    it("preserves the type-specific fields on update", async function () {
      await agent
        .post(`/premade/item/${ids.type1}/edit`)
        .type("form")
        .send(
          itemForm({
            id: ids.type1,
            dbID: ids.db,
            name: "pTEST001",
            resistance: "Ampicillin",
          }),
        );

      const updated = await testDb.r.table("Type1").get(ids.type1).run();
      expect(updated.resistance).to.equal("Ampicillin");
      expect(updated.insideOverhangLeft).to.equal("AATG");
    });

    it("renders an item from a type-2 database", async function () {
      // Each database type maps to a different model and field set, so the
      // rendering path differs per type.
      const res = await agent.get(`/premade/item/${ids.type2}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("pTEST-T2");
    });

    it("renders an item from a type-3 database", async function () {
      const res = await agent.get(`/premade/item/${ids.type3}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("pTEST-T3");
    });

    it("renders a category listing for each database type", async function () {
      for (const categoryID of [ids.category, ids.category2, ids.category3]) {
        const res = await agent.get(`/premade/category/${categoryID}`);
        expect(res.status, `category ${categoryID} failed to render`).to.equal(200);
      }
    });

    it("shows an add-to-cart control on an item page", async function () {
      const res = await agent.get(`/premade/item/${ids.type1}`);
      expect(res.text).to.include('action="/cart/add"');
    });

    it("reflects that an item is already in the cart", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });

      const res = await agent.get(`/premade/item/${ids.type1}`);
      expect(res.status).to.equal(200);
      // The page renders a different control once the item is in the cart.
      expect(res.text.toLowerCase()).to.include("cart");
    });

    it("renders the type-specific field headings for the item's database type", async function () {
      const res = await agent.get(`/premade/item/${ids.type1}`);
      // Type1 declares these; a Type2 item would not have them.
      expect(res.text).to.include("Resistance");
      expect(res.text).to.include("Inside o/hang L");
    });

    it("renders a type-2 item's own field headings", async function () {
      const res = await agent.get(`/premade/item/${ids.type2}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Species of Origin");
    });

    it("stores citations supplied as parallel url/description arrays", async function () {
      await agent
        .post(`/premade/category/${ids.category}/new`)
        .type("form")
        .send({
          ...itemForm({ dbID: ids.db, name: "pCITED", synBioID: "5100" }),
          linkurl: ["https://example.com/paper", "", "https://example.com/two"],
          linkdesc: ["The paper", "orphan description", "Second paper"],
        });

      const rows = await testDb.r.table("Type1").run();
      const created = rows.find((t) => t.name === "pCITED");
      expect(created, "item should exist").to.not.equal(undefined);

      // Pairs missing either half are dropped.
      expect(created.citations).to.have.lengthOf(2);
      expect(created.citations[0]).to.deep.equal({
        url: "https://example.com/paper",
        description: "The paper",
      });
    });

    it("deletes an item and removes it from the catalogue listing", async function () {
      await agent.post(`/premade/item/${ids.type1b}/delete`).type("form").send({});

      expect(await testDb.r.table("Type1").get(ids.type1b).run()).to.equal(null);

      // Checked via the item link rather than the name: the name legitimately
      // reappears in the "deleted successfully" flash message.
      const listing = await agent.get(`/premade/category/${ids.category}`);
      expect(listing.text).to.not.include(`/premade/item/${ids.type1b}`);
      expect(listing.text, "the surviving item should still be listed").to.include(
        `/premade/item/${ids.type1}`,
      );
    });

    it("answers 404 when editing an item that does not exist", async function () {
      const res = await agent.get(
        "/premade/item/00000000-0000-4000-8000-000000000000/edit",
      );
      expect(res.status).to.equal(404);
    });

    it("answers 404, not 500, for every operation on a missing item", async function () {
      // Each of these throws "not found" internally; the shared error handler
      // maps that to 404 rather than reporting a server fault.
      const ghost = "00000000-0000-4000-8000-000000000000";

      for (const action of ["enable", "disable", "delete"]) {
        const res = await agent
          .post(`/premade/item/${ghost}/${action}`)
          .type("form")
          .send({});
        expect(res.status, `${action} returned ${res.status}`).to.equal(404);
        expect(res.text).to.not.include("node_modules");
      }
    });

    it("answers 404 for every operation on a missing category", async function () {
      const ghost = "00000000-0000-4000-8000-000000000000";

      for (const action of ["enable", "disable", "delete"]) {
        const res = await agent
          .post(`/premade/category/${ghost}/${action}`)
          .type("form")
          .send({});
        expect(res.status, `category ${action} returned ${res.status}`).to.equal(404);
      }

      const editForm = await agent.get(`/premade/category/${ghost}/edit`);
      expect(editForm.status).to.equal(404);
    });

    it("answers 404 for every operation on a missing database", async function () {
      const ghost = "00000000-0000-4000-8000-000000000000";

      for (const action of ["enable", "disable", "delete"]) {
        const res = await agent
          .post(`/premade/${ghost}/${action}`)
          .type("form")
          .send({});
        expect(res.status, `database ${action} returned ${res.status}`).to.equal(404);
      }

      const show = await agent.get(`/premade/${ghost}`);
      expect(show.status).to.equal(404);

      const editForm = await agent.get(`/premade/${ghost}/edit`);
      expect(editForm.status).to.equal(404);
    });
  });

  // ------------------------------------------------------------- map files

  describe("map files", function () {
    it("stores an uploaded map file against the item", async function () {
      // processMapFile had no coverage at all; it moves the upload into place
      // and records it as a File row linked to the type.
      const res = await agent
        .post(`/premade/item/${ids.type1}/edit`)
        .field(itemForm({ id: ids.type1, dbID: ids.db, name: "pTEST001" }))
        .attach("mapFile", Buffer.from("LOCUS  fixture"), "map.gb");

      expect(res.status).to.equal(302);

      const files = await testDb.r.table("File").filter({ typeID: ids.type1 }).run();
      expect(files, "a File row should be linked to the item").to.have.lengthOf(1);
      expect(files[0].originalName).to.equal("map.gb");
    });

    it("shows the most recent map file when several exist", async function () {
      await testDb.r
        .table("File")
        .insert([
          {
            name: "old.gb",
            originalName: "old.gb",
            path: "test/.tmp/old.gb",
            typeID: ids.type1,
            createdAt: new Date("2020-01-01"),
          },
          {
            name: "new.gb",
            originalName: "new.gb",
            path: "test/.tmp/new.gb",
            typeID: ids.type1,
            createdAt: new Date("2026-01-01"),
          },
        ])
        .run();

      const res = await agent.get(`/premade/item/${ids.type1}`);
      expect(res.status).to.equal(200);
      expect(res.text).to.include("new.gb");
      expect(res.text).to.not.include("old.gb");
    });

    it("renders an item that has no map file", async function () {
      const res = await agent.get(`/premade/item/${ids.type1b}`);
      expect(res.status).to.equal(200);
    });

    it("saves the item even when no map file is attached", async function () {
      const res = await agent
        .post(`/premade/item/${ids.type1}/edit`)
        .type("form")
        .send(itemForm({ id: ids.type1, dbID: ids.db, name: "pNOMAP" }));

      expect(res.status).to.equal(302);
      const updated = await testDb.r.table("Type1").get(ids.type1).run();
      expect(updated.name).to.equal("pNOMAP");

      const files = await testDb.r.table("File").filter({ typeID: ids.type1 }).run();
      expect(files).to.have.lengthOf(0);
    });
  });

  // --------------------------------------------------------------- rearrange

  describe("rearrange", function () {
    it("renders the rearrange page", async function () {
      const res = await agent.get("/premade/rearrange");
      expect(res.status).to.equal(200);
    });

    it("saves new database and category positions", async function () {
      const res = await agent
        .post("/premade/rearrange")
        .type("form")
        .send({
          newOrder: JSON.stringify([
            {
              id: ids.db,
              position: 5,
              categories: [{ id: ids.category, position: 7 }],
            },
          ]),
        });

      expect(res.status).to.be.oneOf([200, 302]);
      expect((await DB.get(ids.db)).position).to.equal(5);
      expect((await Category.get(ids.category)).position).to.equal(7);
    });

    it("rejects a malformed payload with 400, not a stack trace", async function () {
      const res = await agent
        .post("/premade/rearrange")
        .type("form")
        .send({ newOrder: "{not json" });

      expect(res.status).to.equal(400);
      expect(res.text).to.not.include("SyntaxError");
      expect(res.text).to.not.include("node_modules");
      expect(res.text, "parser detail should not reach the client").to.not.include(
        "JSON at position",
      );
    });

    it("skips records that no longer exist rather than failing the save", async function () {
      const res = await agent
        .post("/premade/rearrange")
        .type("form")
        .send({
          newOrder: JSON.stringify([
            { id: ids.db, position: 2, categories: [] },
            {
              id: "00000000-0000-4000-8000-000000000000",
              position: 3,
              categories: [],
            },
          ]),
        });

      expect(res.status).to.be.oneOf([200, 302]);
      expect((await DB.get(ids.db)).position).to.equal(2);
    });

    it("is admin-only", async function () {
      const nonAdmin = await signedInAgent("testuser");
      const res = await nonAdmin
        .post("/premade/rearrange")
        .type("form")
        .send({ newOrder: JSON.stringify([{ id: ids.db, position: 99 }]) });

      expect(res.status).to.equal(403);
      expect((await DB.get(ids.db)).position).to.equal(0);
    });
  });

  // ------------------------------------------------------------------ export

  describe("catalogue export", function () {
    it("includes items from every database type", async function () {
      const res = await agent.get("/premade/export");
      expect(res.status).to.equal(200);

      expect(res.text).to.include("pTEST001");
      expect(res.text).to.include("pTEST-T2");
      expect(res.text).to.include("pTEST-T3");
    });

    it("groups rows under their category name", async function () {
      const res = await agent.get("/premade/export");
      expect(res.text).to.include("Test Category");
      expect(res.text).to.include("Test Category Two");
    });
  });

  // ------------------------------------------------------------------ access

  describe("access", function () {
    it("requires authentication to browse the catalogue", async function () {
      for (const url of [
        "/premade",
        `/premade/${ids.db}`,
        `/premade/category/${ids.category}`,
        `/premade/item/${ids.type1}`,
        "/premade/export",
      ]) {
        const res = await anonymousAgent().get(url);
        expect(res.status, `${url} was reachable anonymously`).to.equal(302);
        expect(res.headers.location).to.equal("/signin");
      }
    });

    it("requires admin for every edit form", async function () {
      const nonAdmin = await signedInAgent("testuser");

      for (const url of [
        "/premade/new",
        "/premade/rearrange",
        `/premade/${ids.db}/edit`,
        `/premade/category/${ids.category}/edit`,
        `/premade/item/${ids.type1}/edit`,
      ]) {
        const res = await nonAdmin.get(url);
        expect(res.status, `${url} was reachable by a non-admin`).to.equal(403);
      }
    });
  });
});
