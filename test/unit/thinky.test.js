/**
 * lib/thinky — the hand-rolled ORM every model is built on.
 *
 * 900+ lines with no direct coverage until now, including a custom type system,
 * relation loading and save hooks.
 */

const { expect } = require("chai");
const thinky = require("../../lib/thinky");
const testDb = require("../helpers/testDb");

const type = thinky.type;

describe("lib/thinky", function () {
  this.timeout(30000);

  describe("type validators", function () {
    describe("string", function () {
      it("accepts a string", function () {
        expect(type.string().validate("hello")).to.equal("hello");
      });

      it("rejects a non-string", function () {
        expect(() => type.string().validate(42)).to.throw(/must be a string/);
      });

      it("enforces required", function () {
        expect(() => type.string().required().validate(undefined)).to.throw(
          /required/,
        );
      });

      it("applies a default when absent", function () {
        expect(type.string().default("fallback").validate(undefined)).to.equal(
          "fallback",
        );
      });

      it("enforces min and max length", function () {
        expect(() => type.string().min(3).validate("ab")).to.throw(/at least 3/);
        expect(() => type.string().max(3).validate("abcd")).to.throw(/at most 3/);
      });

      it("enforces an enum", function () {
        const validator = type.string().enum(["a", "b"]);
        expect(validator.validate("a")).to.equal("a");
        expect(() => validator.validate("c")).to.throw(/must be one of/);
      });
    });

    describe("number", function () {
      it("coerces numeric form input", function () {
        expect(type.number().validate("42")).to.equal(42);
        expect(type.number().validate("3.5")).to.equal(3.5);
      });

      it("rejects text that is not a number", function () {
        expect(() => type.number().validate("abc")).to.throw(/must be a number/);
      });

      it("treats an empty string as absent", function () {
        expect(type.number().default(7).validate("")).to.equal(7);
      });

      it("enforces bounds", function () {
        expect(() => type.number().min(1).validate(0)).to.throw(/at least 1/);
        expect(() => type.number().max(10).validate(11)).to.throw(/at most 10/);
      });
    });

    describe("boolean", function () {
      it("accepts booleans and rejects anything else", function () {
        expect(type.boolean().validate(true)).to.equal(true);
        expect(() => type.boolean().validate("true")).to.throw(/must be a boolean/);
      });
    });

    describe("date", function () {
      it("parses a date string into a Date", function () {
        const result = type.date().validate("2026-01-15T00:00:00Z");
        expect(result).to.be.an.instanceOf(Date);
      });

      it("rejects a value that is neither a Date nor a string", function () {
        expect(() => type.date().validate(12345)).to.throw(/must be a date/);
      });
    });

    describe("array", function () {
      it("accepts arrays and rejects non-arrays", function () {
        expect(type.array().validate([1, 2])).to.deep.equal([1, 2]);
        expect(() => type.array().validate("nope")).to.throw(/must be an array/);
      });
    });

    describe("object", function () {
      it("rejects an array, which is technically an object", function () {
        expect(() => type.object().validate([])).to.throw(/must be an object/);
      });
    });
  });

  describe("model persistence", function () {
    let Widget;

    before(async function () {
      await testDb.provision();

      Widget = thinky.createModel("ThinkyTestWidget", {
        id: type.string(),
        name: type.string().required(),
        count: type.number().default(0),
        createdAt: type.date(),
      });
      await thinky.ready();
    });

    beforeEach(async function () {
      await thinky.r.table("ThinkyTestWidget").delete().run();
    });

    after(async function () {
      await thinky.r
        .db(thinky.dbName)
        .tableDrop("ThinkyTestWidget")
        .run()
        .catch(() => {});
    });

    it("inserts a new record and assigns an id", async function () {
      const widget = new Widget({ name: "first" });
      await widget.save();

      expect(widget.id).to.be.a("string");
      const stored = await thinky.r.table("ThinkyTestWidget").get(widget.id).run();
      expect(stored.name).to.equal("first");
    });

    it("updates an existing record rather than duplicating it", async function () {
      const widget = new Widget({ name: "first" });
      await widget.save();

      widget.name = "second";
      await widget.save();

      const all = await thinky.r.table("ThinkyTestWidget").run();
      expect(all).to.have.lengthOf(1);
      expect(all[0].name).to.equal("second");
    });

    it("applies schema defaults on save", async function () {
      const widget = new Widget({ name: "defaulted" });
      await widget.save();

      const stored = await thinky.r.table("ThinkyTestWidget").get(widget.id).run();
      expect(stored.count).to.equal(0);
    });

    it("returns null from get() for a missing id", async function () {
      // Callers rely on this being null rather than a rejection.
      const missing = await Widget.get("00000000-0000-4000-8000-000000000000");
      expect(missing).to.equal(null);
    });

    it("deletes a record", async function () {
      const widget = new Widget({ name: "doomed" });
      await widget.save();
      await widget.delete();

      expect(await Widget.get(widget.id)).to.equal(null);
    });

    it("refuses to delete a record with no id", async function () {
      const widget = new Widget({ name: "unsaved" });
      let threw = false;
      try {
        await widget.delete();
      } catch (err) {
        threw = true;
      }
      expect(threw).to.equal(true);
    });

    it("filters records", async function () {
      await new Widget({ name: "keep" }).save();
      await new Widget({ name: "drop" }).save();

      const found = await Widget.filter({ name: "keep" }).run();
      expect(found).to.have.lengthOf(1);
      expect(found[0].name).to.equal("keep");
    });

    it("counts records", async function () {
      await new Widget({ name: "a" }).save();
      await new Widget({ name: "b" }).save();

      expect(await Widget.count().run()).to.equal(2);
    });
  });

  describe("relations are not written back into the parent row", function () {
    let Parent;
    let Child;

    before(async function () {
      Parent = thinky.createModel("ThinkyTestParent", {
        id: type.string(),
        name: type.string(),
      });
      Child = thinky.createModel("ThinkyTestChild", {
        id: type.string(),
        parentID: type.string(),
        label: type.string(),
      });
      Parent.hasMany(Child, "children", "id", "parentID");
      await thinky.ready();
    });

    beforeEach(async function () {
      await thinky.r.table("ThinkyTestParent").delete().run();
      await thinky.r.table("ThinkyTestChild").delete().run();
    });

    after(async function () {
      await thinky.r.db(thinky.dbName).tableDrop("ThinkyTestParent").run().catch(() => {});
      await thinky.r.db(thinky.dbName).tableDrop("ThinkyTestChild").run().catch(() => {});
    });

    it("drops joined children before persisting", async function () {
      // save() writes every own property, so a record loaded with getJoin()
      // used to embed its whole object graph into its own row — the Order
      // table accumulated a copy of every item, type, database and category.
      const parent = new Parent({ name: "p" });
      await parent.save();
      await new Child({ parentID: parent.id, label: "c1" }).save();

      const joined = await Parent.get(parent.id).getJoin({ children: true });
      expect(joined.children, "fixture should have loaded children").to.have.lengthOf(
        1,
      );

      joined.name = "renamed";
      await joined.save();

      const raw = await thinky.r.table("ThinkyTestParent").get(parent.id).run();
      expect(raw.name).to.equal("renamed");
      expect(raw).to.not.have.property("children");
    });

    it("drops the ad-hoc `type` property too", async function () {
      // Attached by Order.getTypes() and populateCartItemTypes rather than
      // declared as a relation.
      const parent = new Parent({ name: "p" });
      parent.type = { huge: "object", nested: { more: "data" } };
      await parent.save();

      const raw = await thinky.r.table("ThinkyTestParent").get(parent.id).run();
      expect(raw).to.not.have.property("type");
    });
  });

  describe("query helpers", function () {
    // Its own table: the persistence block above drops ThinkyTestQuery in its
    // after hook, which runs before this describe starts.
    let Widget;

    before(async function () {
      Widget = thinky.createModel("ThinkyTestQuery", {
        id: type.string(),
        name: type.string(),
        count: type.number().default(0),
      });
      await thinky.ready();
    });

    after(async function () {
      await thinky.r
        .db(thinky.dbName)
        .tableDrop("ThinkyTestQuery")
        .run()
        .catch(() => {});
    });

    beforeEach(async function () {
      await thinky.r.table("ThinkyTestQuery").delete().run();
      await thinky.r
        .table("ThinkyTestQuery")
        .insert([
          { id: "w1", name: "alpha", count: 3 },
          { id: "w2", name: "beta", count: 1 },
          { id: "w3", name: "gamma", count: 2 },
        ])
        .run();
    });

    it("getAll fetches several records by primary key", async function () {
      const query = await Widget.getAll("w1", "w3");
      const rows = await query.run();

      expect(rows.map((r) => r.id).sort()).to.deep.equal(["w1", "w3"]);
    });

    it("orderBy sorts records", async function () {
      const rows = await Widget.orderBy("count").run();
      expect(rows.map((r) => r.count)).to.deep.equal([1, 2, 3]);
    });

    it("orderBy().limit() bounds the result set", async function () {
      const rows = await Widget.orderBy("count").limit(2).run();
      expect(rows).to.have.lengthOf(2);
      expect(rows[0].count).to.equal(1);
    });

    it("filter().orderBy() combines both", async function () {
      const rows = await Widget.filter((row) => row("count").gt(1))
        .orderBy("count")
        .run();

      expect(rows.map((r) => r.name)).to.deep.equal(["gamma", "alpha"]);
    });

    it("filter().count() counts without loading the rows", async function () {
      const total = await Widget.filter({ name: "alpha" }).count().run();
      expect(total).to.equal(1);
    });

    it("filter().update() writes to every match", async function () {
      await Widget.filter((row) => row("count").gt(1))
        .update({ name: "bulk-renamed" })
        .run();

      const renamed = await Widget.filter({ name: "bulk-renamed" }).run();
      expect(renamed).to.have.lengthOf(2);
    });

    it("filter().delete() removes every match", async function () {
      await Widget.filter((row) => row("count").lt(3))
        .delete()
        .run();

      const remaining = await Widget.run();
      expect(remaining).to.have.lengthOf(1);
      expect(remaining[0].name).to.equal("alpha");
    });

    it("filter() is awaitable directly as well as via run()", async function () {
      // Controllers use both forms.
      const viaRun = await Widget.filter({ name: "beta" }).run();
      const viaAwait = await Widget.filter({ name: "beta" });

      expect(viaRun).to.have.lengthOf(1);
      expect(viaAwait).to.have.lengthOf(1);
    });

    it("returns model instances, not raw rows", async function () {
      const [row] = await Widget.filter({ name: "alpha" }).run();
      expect(row.save).to.be.a("function");
      expect(row.delete).to.be.a("function");
    });

    it("Model.save() inserts from a plain object", async function () {
      const saved = await Widget.save({ name: "static-save", count: 9 });

      expect(saved.id).to.be.a("string");
      const stored = await thinky.r
        .table("ThinkyTestQuery")
        .get(saved.id)
        .run();
      expect(stored.name).to.equal("static-save");
    });

    it("Model.delete() removes by id", async function () {
      await Widget.delete("w1");
      expect(await Widget.get("w1")).to.equal(null);
    });
  });

  describe("save hooks", function () {
    let Hooked;
    const seen = [];

    before(async function () {
      Hooked = thinky.createModel("ThinkyTestHooked", {
        id: type.string(),
        name: type.string(),
        stamped: type.string(),
      });

      Hooked.pre("save", function (next) {
        seen.push("pre");
        this.stamped = "by-pre-hook";
        next();
      });

      Hooked.post("save", function (next) {
        seen.push("post");
        next();
      });

      await thinky.ready();
    });

    beforeEach(async function () {
      seen.length = 0;
      await thinky.r.table("ThinkyTestHooked").delete().run();
    });

    after(async function () {
      await thinky.r
        .db(thinky.dbName)
        .tableDrop("ThinkyTestHooked")
        .run()
        .catch(() => {});
    });

    it("runs the pre-save hook and persists what it set", async function () {
      const record = new Hooked({ name: "x" });
      await record.save();

      const stored = await thinky.r
        .table("ThinkyTestHooked")
        .get(record.id)
        .run();
      expect(stored.stamped).to.equal("by-pre-hook");
    });

    it("runs pre before post", async function () {
      await new Hooked({ name: "x" }).save();
      expect(seen).to.deep.equal(["pre", "post"]);
    });

    it("aborts the save when a pre-hook reports an error", async function () {
      // models/order.js relies on this: if a janCode cannot be reserved, the
      // order must not be written.
      const Failing = thinky.createModel("ThinkyTestFailing", {
        id: type.string(),
        name: type.string(),
      });
      Failing.pre("save", function (next) {
        next(new Error("refused by hook"));
      });
      await thinky.ready();

      let threw = false;
      try {
        await new Failing({ name: "should not persist" }).save();
      } catch (err) {
        threw = true;
        expect(err.message).to.equal("refused by hook");
      }

      expect(threw, "the save should have rejected").to.equal(true);
      expect(await thinky.r.table("ThinkyTestFailing").run()).to.have.lengthOf(0);

      await thinky.r
        .db(thinky.dbName)
        .tableDrop("ThinkyTestFailing")
        .run()
        .catch(() => {});
    });
  });

  describe("schema bootstrap", function () {
    it("resolves ready() once tables exist", async function () {
      // server.js awaits this before listening, so a cold start cannot serve
      // requests against tables that do not exist yet.
      await thinky.ready();
      const tables = await thinky.r.db(thinky.dbName).tableList().run();
      expect(tables).to.include("Order");
      expect(tables).to.include("CartItem");
    });
  });
});
