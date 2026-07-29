/**
 * Order lifecycle: placement, fulfillment, and exports.
 *
 * Replaces orderPlacementEndpoint / orderFulfillmentEndpoint /
 * orderExportAuthenticated, which between them deleted every order belonging
 * to a real admin account, depended on whichever Type row happened to be first
 * in the live database, and asserted `expect(res.text).to.be.a("string")`.
 */

const { expect } = require("chai");
const { signedInAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const Order = require("../../models/order");
const email = require("../../lib/email");

const ADMIN = "deeks";

describe("Orders", function () {
  this.timeout(30000);

  let agent;
  let ids;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent(ADMIN);
    email.clearOutbox();
  });

  /** Puts a type in the admin's cart and returns the cart item rows. */
  async function addToCart(typeID) {
    const res = await agent.post("/cart/add").type("form").send({ typeID });
    expect(res.status).to.equal(302);
  }

  describe("POST /cart/order", function () {
    it("creates an order, moves the items onto it, and clears the cart", async function () {
      await addToCart(ids.type1);

      const res = await agent.post("/cart/order").type("form").send({});
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.match(/^\/cart\?orderId=/);

      const orders = await Order.filter({ username: ADMIN }).run();
      expect(orders).to.have.lengthOf(1);

      const items = await testDb.r
        .table("CartItem")
        .filter({ orderID: orders[0].id })
        .run();
      expect(items, "items should be attached to the order").to.have.lengthOf(1);
      expect(items[0].typeID).to.equal(ids.type1);

      // And they must no longer be in the cart. Leaving them there let a
      // second checkout re-point their orderID, stripping the first order.
      expect(items[0].cartID).to.equal("");
    });

    it("refuses to place an order from an empty cart", async function () {
      const res = await agent.post("/cart/order").type("form").send({});
      expect(res.status).to.equal(302);

      const orders = await Order.filter({ username: ADMIN }).run();
      expect(orders).to.have.lengthOf(0);
    });

    it("sends a confirmation email", async function () {
      await addToCart(ids.type1);
      await agent.post("/cart/order").type("form").send({});

      // Confirmations are fire-and-forget, so give them a moment to land.
      await global.testHelpers.sleep(300);
      expect(email.outbox.map((m) => m.template)).to.include("new-order");
    });

    it("still completes the order when the CSV mount is unavailable", async function () {
      // The CSV write stream had no 'error' listener; an unwritable mount
      // emitted an unhandled 'error' event and killed the process mid-order.
      const csv = require("../../lib/csv");
      const original = csv.newOrder;
      csv.newOrder = () => Promise.reject(new Error("ENOSPC: mount full"));

      try {
        await addToCart(ids.type1);
        const res = await agent.post("/cart/order").type("form").send({});
        expect(res.status).to.equal(302);

        const orders = await Order.filter({ username: ADMIN }).run();
        expect(orders, "order should still be recorded").to.have.lengthOf(1);
      } finally {
        csv.newOrder = original;
      }
    });

    it("clears an unorderable item rather than wedging the cart forever", async function () {
      // A cart holding only an item whose type was deleted used to fail
      // validation on every attempt, with the row invisible in the UI.
      await addToCart(ids.type1);
      await testDb.r.table("Type1").get(ids.type1).delete().run();

      const first = await agent.post("/cart/order").type("form").send({});
      expect(first.status).to.equal(302);

      // The orphan must be gone, so the cart is usable again.
      const remaining = await testDb.r.table("CartItem").run();
      const stillOrphaned = remaining.filter(
        (row) => row.typeID === ids.type1 && row.cartID,
      );
      expect(stillOrphaned).to.have.lengthOf(0);
    });
  });

  describe("janCode assignment", function () {
    it("assigns sequential numeric codes", async function () {
      await addToCart(ids.type1);
      await agent.post("/cart/order").type("form").send({});
      await addToCart(ids.type1b);
      await agent.post("/cart/order").type("form").send({});

      const orders = await Order.filter({ username: ADMIN }).run();
      expect(orders).to.have.lengthOf(2);

      const codes = orders.map((o) => Number(o.janCode)).sort((a, b) => a - b);
      expect(codes[0]).to.be.a("number").and.to.be.finite;
      expect(codes[1]).to.equal(codes[0] + 1);
    });

    it("starts from 1 on an empty database rather than -Infinity", async function () {
      // Math.max() with no arguments is -Infinity, so the first order used to
      // get janCode "-Infinity" — after which parseInt gave NaN and every
      // later order was permanently stamped "NaN".
      const janCode = await Order.nextJanCode();
      expect(Number(janCode)).to.be.finite;
      expect(Number(janCode)).to.be.greaterThan(0);
    });

    it("is not poisoned by a non-numeric code already in the table", async function () {
      await testDb.r
        .table("Order")
        .insert({
          username: "legacy",
          janCode: "not-a-number",
          complete: false,
          cancelled: false,
          createdAt: new Date(),
        })
        .run();

      const janCode = await Order.nextJanCode();
      expect(Number(janCode), `got ${janCode}`).to.be.finite;
    });

    it("never issues the same code twice under concurrency", async function () {
      // The old read-then-write generator handed the same number to two
      // simultaneous checkouts, and lib/csv names the printer file after it,
      // so one order's tube labels silently overwrote the other's.
      const codes = await Promise.all(
        Array.from({ length: 20 }, () => Order.nextJanCode()),
      );

      expect(new Set(codes).size, `duplicates in ${codes.join(",")}`).to.equal(
        codes.length,
      );
    });
  });

  describe("fulfillment", function () {
    let orderId;

    beforeEach(async function () {
      const inserted = await testDb.r
        .table("Order")
        .insert(
          {
            username: "someone",
            janCode: "7001",
            complete: false,
            cancelled: false,
            createdAt: new Date(),
          },
          { returnChanges: true },
        )
        .run();
      orderId = inserted.changes[0].new_val.id;
    });

    it("marks an order complete", async function () {
      const res = await agent.post(`/order/${orderId}/complete`).type("form").send({});
      expect(res.status).to.equal(302);

      const order = await Order.get(orderId);
      expect(order.complete).to.equal(true);
    });

    it("records completedAt as a date, not an epoch number", async function () {
      // A raw Date.now() left the column as NUMBER on some rows and TIME on
      // others, which breaks any later orderBy/between on completedAt.
      await agent.post(`/order/${orderId}/complete`).type("form").send({});

      const raw = await testDb.r.table("Order").get(orderId).run();
      expect(raw.completedAt).to.be.an.instanceOf(Date);
    });

    it("does not embed joined relations into the order row", async function () {
      // save() persists every own property, so completing an order used to
      // write its items, their types, and those types' parent DB and category
      // into the Order document itself.
      await agent.post(`/order/${orderId}/complete`).type("form").send({});

      const raw = await testDb.r.table("Order").get(orderId).run();
      expect(raw).to.not.have.property("items");
    });

    it("reverses completion", async function () {
      await agent.post(`/order/${orderId}/complete`).type("form").send({});
      await agent.post(`/order/${orderId}/incomplete`).type("form").send({});

      const order = await Order.get(orderId);
      expect(order.complete).to.equal(false);
    });

    it("cancels and un-cancels", async function () {
      await agent.post(`/order/${orderId}/cancel`).type("form").send({});
      expect((await Order.get(orderId)).cancelled).to.equal(true);

      await agent.post(`/order/${orderId}/uncancel`).type("form").send({});
      expect((await Order.get(orderId)).cancelled).to.equal(false);
    });

    it("answers 404, not 500, for an order that does not exist", async function () {
      const res = await agent.get("/order/00000000-0000-4000-8000-000000000000");
      expect(res.status).to.equal(404);
    });
  });

  describe("exports", function () {
    beforeEach(async function () {
      await testDb.r
        .table("Order")
        .insert([
          {
            username: "someone",
            janCode: "7100",
            complete: true,
            cancelled: false,
            costCode: "ABC123",
            totalCost: "25",
            totalQuantity: "5",
            createdAt: new Date("2026-03-01T10:00:00Z"),
          },
          {
            username: "another",
            janCode: "7101",
            complete: false,
            cancelled: false,
            totalQuantity: "2",
            createdAt: new Date("2026-03-02T10:00:00Z"),
          },
        ])
        .run();
    });

    it("rejects an export with no start date", async function () {
      // The old suite named nine tests after this 400 and asserted 302 on all
      // of them, so the validation branch was never once executed.
      const res = await agent.get("/order/export?end=2026-12-31");
      expect(res.status).to.equal(400);
    });

    it("rejects an export with no end date", async function () {
      const res = await agent.get("/order/export?start=2026-01-01");
      expect(res.status).to.equal(400);
    });

    it("returns the costed orders for a valid range", async function () {
      // The endpoint returns JSON; views/orders/summary.ejs turns it into a
      // CSV download client-side.
      const res = await agent.get("/order/export?start=2026-01-01&end=2026-12-31");
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an("array");

      // Only the costed, non-cancelled order qualifies.
      expect(res.body).to.have.lengthOf(1);
      expect(res.body[0].janCode).to.equal("7100");
      expect(res.body[0].items, "items should be attached").to.be.an("array");
    });

    it("excludes orders outside the requested range", async function () {
      const res = await agent.get("/order/export?start=2020-01-01&end=2020-12-31");
      expect(res.status).to.equal(200);
      expect(res.body).to.have.lengthOf(0);
    });

    it("returns summary data as JSON for a valid range", async function () {
      const res = await agent.get(
        "/order/summary-data?start=2026-01-01&end=2026-12-31",
      );
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an("object");
    });

    it("counts costed and non-costed orders separately", async function () {
      const res = await agent.get(
        "/order/summary-data?start=2026-01-01&end=2026-12-31",
      );

      expect(res.body.totalOrders).to.equal(2);
      expect(res.body.costedOrders).to.equal(1);
      expect(res.body.nonCostedOrders).to.equal(1);
    });

    it("totals revenue from the costed orders only", async function () {
      const res = await agent.get(
        "/order/summary-data?start=2026-01-01&end=2026-12-31",
      );
      expect(res.body.totalRevenue).to.equal(25);
    });

    it("counts plasmids across the range without one query per order", async function () {
      // This was a sequential query per order inside a loop; a multi-year range
      // meant thousands of serial round-trips holding a connection open.
      const orders = await testDb.r.table("Order").run();
      await testDb.r
        .table("CartItem")
        .insert([
          { orderID: orders[0].id, typeID: ids.type1, quantity: 3, cartID: "" },
          { orderID: orders[1].id, typeID: ids.type1b, quantity: 4, cartID: "" },
        ])
        .run();

      const res = await agent.get(
        "/order/summary-data?start=2026-01-01&end=2026-12-31",
      );
      expect(res.body.totalPlasmids).to.equal(7);
    });

    it("returns zeroes for a range with no orders", async function () {
      const res = await agent.get(
        "/order/summary-data?start=2020-01-01&end=2020-12-31",
      );

      expect(res.body.totalOrders).to.equal(0);
      expect(res.body.totalRevenue).to.equal(0);
      expect(res.body.totalPlasmids).to.equal(0);
    });

    it("exports all orders, including the non-costed ones", async function () {
      const res = await agent.get(
        "/order/export-all?start=2026-01-01&end=2026-12-31",
      );

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an("array").with.lengthOf(2);

      const janCodes = res.body.map((o) => o.janCode).sort();
      expect(janCodes).to.deep.equal(["7100", "7101"]);
    });

    it("rejects an export-all with no date range", async function () {
      const res = await agent.get("/order/export-all");
      expect(res.status).to.equal(400);
    });
  });

  describe("order listing", function () {
    beforeEach(async function () {
      await testDb.r
        .table("Order")
        .insert([
          {
            username: "someone",
            janCode: "7200",
            complete: false,
            cancelled: false,
            createdAt: new Date("2026-04-01T10:00:00Z"),
          },
          {
            username: "another",
            janCode: "7201",
            complete: true,
            cancelled: false,
            completedAt: new Date("2026-04-05T10:00:00Z"),
            createdAt: new Date("2026-04-02T10:00:00Z"),
          },
          {
            username: "third",
            janCode: "7202",
            complete: false,
            cancelled: true,
            createdAt: new Date("2026-04-03T10:00:00Z"),
          },
        ])
        .run();
    });

    it("renders the orders page", async function () {
      const res = await agent.get("/orders");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("7200");
    });

    it("accepts a page parameter", async function () {
      const res = await agent.get("/orders?page=2");
      expect(res.status).to.equal(200);
    });

    it("treats a nonsense page parameter as page one", async function () {
      for (const page of ["0", "-5", "abc", ""]) {
        const res = await agent.get(`/orders?page=${page}`);
        expect(res.status, `page=${page} returned ${res.status}`).to.equal(200);
      }
    });

    it("renders an individual order", async function () {
      const orders = await Order.filter({ janCode: "7200" }).run();
      const res = await agent.get(`/order/${orders[0].id}`);

      expect(res.status).to.equal(200);
      expect(res.text).to.include("7200");
    });

    it("renders the summary page", async function () {
      const res = await agent.get("/order/summary");
      expect(res.status).to.equal(200);
    });

    it("renders the repeat-orders report", async function () {
      const res = await agent.get("/dupes");
      expect(res.status).to.equal(200);
    });

    it("reports repeat orders of the same item by the same person", async function () {
      const orders = await Order.filter({ username: "someone" }).run();
      const second = await testDb.r
        .table("Order")
        .insert(
          {
            username: "someone",
            janCode: "7203",
            complete: false,
            cancelled: false,
            createdAt: new Date("2026-04-10T10:00:00Z"),
          },
          { returnChanges: true },
        )
        .run();

      // The same type ordered twice by the same user.
      await testDb.r
        .table("CartItem")
        .insert([
          { orderID: orders[0].id, typeID: ids.type1, quantity: 1, cartID: "" },
          {
            orderID: second.changes[0].new_val.id,
            typeID: ids.type1,
            quantity: 1,
            cartID: "",
          },
        ])
        .run();

      const res = await agent.get("/dupes");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("someone");
    });
  });

  describe("error handling on state changes", function () {
    it("answers 404 for state changes on a missing order", async function () {
      const ghost = "00000000-0000-4000-8000-000000000000";

      for (const action of ["complete", "incomplete", "cancel", "uncancel"]) {
        const res = await agent
          .post(`/order/${ghost}/${action}`)
          .type("form")
          .send({});
        expect(res.status, `${action} returned ${res.status}`).to.equal(404);
      }
    });

    it("still marks the order complete when the notification email fails", async function () {
      // The order is already complete at that point; a mail outage must not
      // undo it or surface as a failed request.
      const emailLib = require("../../lib/email");
      const original = emailLib.orderReady;
      emailLib.orderReady = () => Promise.reject(new Error("SMTP unavailable"));

      try {
        const inserted = await testDb.r
          .table("Order")
          .insert(
            {
              username: "someone",
              janCode: "7300",
              complete: false,
              cancelled: false,
              createdAt: new Date(),
            },
            { returnChanges: true },
          )
          .run();
        const orderId = inserted.changes[0].new_val.id;

        const res = await agent
          .post(`/order/${orderId}/complete`)
          .type("form")
          .send({});

        expect(res.status).to.equal(302);
        expect((await Order.get(orderId)).complete).to.equal(true);
      } finally {
        emailLib.orderReady = original;
      }
    });
  });
});
