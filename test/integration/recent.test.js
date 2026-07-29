/**
 * Recently-added items page.
 *
 * This controller had almost no coverage: the fixtures carried no items
 * flagged for the page, so every request short-circuited on the empty check
 * and the whole gather/sort/format path was never executed.
 */

const { expect } = require("chai");
const { signedInAgent, anonymousAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

describe("Recently added items", function () {
  this.timeout(30000);

  let agent;
  let ids;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent("deeks");
  });

  describe("access", function () {
    it("requires authentication", async function () {
      const res = await anonymousAgent().get("/recently-added-items");
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });

    it("renders for a signed-in user", async function () {
      const res = await agent.get("/recently-added-items");
      expect(res.status).to.equal(200);
    });
  });

  describe("item selection", function () {
    it("shows only items flagged for the page", async function () {
      const res = await agent.get("/recently-added-items");

      // pTEST002, pTEST-T2 and pTEST-T3 carry the flag; pTEST001 does not.
      expect(res.text).to.include("pTEST002");
      expect(res.text).to.not.include("pTEST001");
    });

    it("gathers items from all three type tables", async function () {
      // Each type lives in its own table and they are queried separately, so a
      // regression could easily drop one.
      const res = await agent.get("/recently-added-items");

      expect(res.text, "Type1 item missing").to.include("pTEST002");
      expect(res.text, "Type2 item missing").to.include("pTEST-T2");
      expect(res.text, "Type3 item missing").to.include("pTEST-T3");
    });

    it("drops an item once its flag is cleared", async function () {
      await testDb.r
        .table("Type2")
        .get(ids.type2)
        .update({ includeOnRecentlyAdded: false })
        .run();

      const res = await agent.get("/recently-added-items");
      expect(res.text).to.not.include("pTEST-T2");
      expect(res.text).to.include("pTEST002");
    });

    it("renders an empty page when nothing is flagged", async function () {
      for (const table of ["Type1", "Type2", "Type3"]) {
        await testDb.r.table(table).update({ includeOnRecentlyAdded: false }).run();
      }

      const res = await agent.get("/recently-added-items");
      expect(res.status).to.equal(200);
      expect(res.text).to.not.include("pTEST-T2");
    });
  });

  describe("ordering", function () {
    it("lists the most recently added first", async function () {
      const res = await agent.get("/recently-added-items");

      // Fixture timestamps: type3 (June) > type2 (March) > type1b (January).
      const posT3 = res.text.indexOf("pTEST-T3");
      const posT2 = res.text.indexOf("pTEST-T2");
      const posT1 = res.text.indexOf("pTEST002");

      expect(posT3, "pTEST-T3 not rendered").to.be.greaterThan(-1);
      expect(posT3).to.be.lessThan(posT2);
      expect(posT2).to.be.lessThan(posT1);
    });

    it("reorders when a timestamp changes", async function () {
      // Push the oldest item to the front.
      await testDb.r
        .table("Type1")
        .get(ids.type1b)
        .update({ includeOnRecentlyAddedTimestamp: Date.UTC(2026, 11, 31) })
        .run();

      const res = await agent.get("/recently-added-items");
      expect(res.text.indexOf("pTEST002")).to.be.lessThan(
        res.text.indexOf("pTEST-T3"),
      );
    });

    it("places an item with no timestamp last rather than dropping it", async function () {
      await testDb.r
        .table("Type1")
        .get(ids.type1)
        .update({ includeOnRecentlyAdded: true, includeOnRecentlyAddedTimestamp: 0 })
        .run();

      const res = await agent.get("/recently-added-items");
      expect(res.text).to.include("pTEST001");
      expect(res.text.indexOf("pTEST001")).to.be.greaterThan(
        res.text.indexOf("pTEST-T3"),
      );
    });
  });

  describe("limit", function () {
    it("shows at most 20 items", async function () {
      const rows = [];
      for (let i = 0; i < 30; i++) {
        rows.push({
          name: `pBULK${String(i).padStart(3, "0")}`,
          comments: "",
          description: "Bulk fixture",
          dbID: ids.db,
          categoryID: ids.category,
          superSize: false,
          disabled: false,
          concentration: 10,
          synBioID: `9${i}`,
          documentation: "",
          position: 0,
          level: "0",
          citations: [],
          note: "",
          insideOverhangLeft: "AATG",
          insideOverhangRight: "GCTT",
          outsideOverhangLeft: "CGCT",
          outsideOverhangRight: "AGCG",
          resistance: "Kan",
          whoMadeIt: "Bulk",
          createdAt: new Date(),
          includeOnRecentlyAdded: true,
          // Newer than every seeded fixture, so these fill the page.
          includeOnRecentlyAddedTimestamp: Date.UTC(2027, 0, 1) + i * 1000,
        });
      }
      await testDb.r.table("Type1").insert(rows).run();

      const res = await agent.get("/recently-added-items");
      expect(res.status).to.equal(200);

      const shown = (res.text.match(/pBULK\d{3}/g) || []).length;
      expect(shown, `expected at most 20 items, found ${shown}`).to.be.at.most(20);

      // The oldest seeded item is pushed off the end by the 30 newer ones.
      expect(res.text).to.not.include("pTEST002");
    });
  });

  describe("rendering", function () {
    it("never renders NaN, even for an item with no usable timestamp", async function () {
      await testDb.r
        .table("Type1")
        .get(ids.type1)
        .update({
          includeOnRecentlyAdded: true,
          includeOnRecentlyAddedTimestamp: 0,
        })
        .run();

      const res = await agent.get("/recently-added-items");
      expect(res.text).to.not.include("NaN");
      expect(res.text).to.not.include("Invalid Date");
    });

    it("escapes item names rather than rendering them as markup", async function () {
      // Names are admin-authored free text and were rendered raw here.
      await testDb.r
        .table("Type1")
        .get(ids.type1b)
        .update({ name: '<img src=x onerror="alert(1)">' })
        .run();

      const res = await agent.get("/recently-added-items");
      expect(res.status).to.equal(200);
      expect(res.text).to.not.match(/<img[^>]*onerror/i);
      expect(res.text).to.include("&lt;img");
    });

    it("escapes item descriptions", async function () {
      await testDb.r
        .table("Type3")
        .get(ids.type3)
        .update({ description: "<script>alert(1)</script>" })
        .run();

      const res = await agent.get("/recently-added-items");
      expect(res.status).to.equal(200);
      expect(res.text).to.not.include("<script>alert(1)</script>");
    });

    it("truncates a very long name instead of overflowing the table", async function () {
      await testDb.r
        .table("Type1")
        .get(ids.type1b)
        .update({ name: "p" + "X".repeat(100) })
        .run();

      const res = await agent.get("/recently-added-items");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("...");
      expect(res.text).to.not.include("p" + "X".repeat(100));
    });
  });

  describe("resilience", function () {
    it("still renders when one type table cannot be queried", async function () {
      // The three tables are queried independently; a failure in one must not
      // lose the results from the others.
      const thinky = require("../../lib/thinky");
      const originalTable = thinky.r.table.bind(thinky.r);

      thinky.r.table = function (name, ...rest) {
        if (name === "Type2") {
          return {
            filter() {
              return {
                run: () => Promise.reject(new Error("simulated table failure")),
              };
            },
          };
        }
        return originalTable(name, ...rest);
      };

      try {
        const res = await agent.get("/recently-added-items");
        expect(res.status).to.equal(200);
        expect(res.text, "surviving tables should still render").to.include(
          "pTEST-T3",
        );
        expect(res.text).to.not.include("pTEST-T2");
      } finally {
        thinky.r.table = originalTable;
      }
    });

    it("renders a friendly message rather than 500ing on a total failure", async function () {
      const thinky = require("../../lib/thinky");
      const originalTableList = thinky.r.tableList.bind(thinky.r);

      thinky.r.tableList = () => ({
        run: () => Promise.reject(new Error("simulated outage")),
      });

      try {
        const res = await agent.get("/recently-added-items");
        expect(res.status).to.equal(200);
        expect(res.text).to.include("Unable to load recently added items");
      } finally {
        thinky.r.tableList = originalTableList;
      }
    });
  });
});
