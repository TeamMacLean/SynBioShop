/**
 * Shopping cart: adding, viewing, quantities, and the guards around them.
 *
 * Consolidates the old cartOperationsEndpoint.test.js, which crashed in its
 * setup (`Type1.run` — Type1 is a wrapper, the model is `Type1.model`) and
 * asserted against whatever row happened to be first in the live database.
 */

const { expect } = require("chai");
const { signedInAgent, anonymousAgent } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const Cart = require("../../models/cart");
const CartItem = require("../../models/cartItem");

const USER = "deeks";

describe("Shopping cart", function () {
  this.timeout(30000);

  let agent;
  let ids;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent(USER);
  });

  /** The signed-in user's cart, with items joined. */
  async function currentCart() {
    const carts = await Cart.filter({ username: USER })
      .getJoin({ items: true })
      .run();
    return carts[0] || null;
  }

  describe("POST /cart/add", function () {
    it("adds the item and redirects back to the referring page", async function () {
      const res = await agent
        .post("/cart/add")
        .set("Referrer", "/premade")
        .type("form")
        .send({ typeID: ids.type1 });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/premade");

      const cart = await currentCart();
      expect(cart, "a cart should have been created").to.not.equal(null);
      expect(cart.items).to.have.lengthOf(1);
      expect(cart.items[0].typeID).to.equal(ids.type1);
      expect(cart.items[0].quantity).to.equal(1);
    });

    it("does not add the same item twice", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });

      const cart = await currentCart();
      expect(cart.items).to.have.lengthOf(1);
    });

    it("keeps distinct items separate", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1b });

      const cart = await currentCart();
      expect(cart.items).to.have.lengthOf(2);
    });

    it("rejects a request with no typeID instead of creating a broken row", async function () {
      const res = await agent.post("/cart/add").type("form").send({});

      expect(res.status).to.equal(302);
      const cart = await currentCart();
      expect(cart === null || cart.items.length === 0).to.equal(true);
    });

    it("redirects to / when the referrer points off-site", async function () {
      // Open-redirect guard: the handler used to echo the Referrer header
      // straight into res.redirect, so a form posted from another origin
      // bounced the authenticated user back to it.
      const res = await agent
        .post("/cart/add")
        .set("Referrer", "https://evil.example.com/phish")
        .type("form")
        .send({ typeID: ids.type1 });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/");
    });

    it("requires authentication", async function () {
      const res = await anonymousAgent()
        .post("/cart/add")
        .type("form")
        .send({ typeID: ids.type1 });

      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal("/signin");
    });
  });

  describe("GET /cart", function () {
    it("renders the items currently in the cart", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });

      const res = await agent.get("/cart");
      expect(res.status).to.equal(200);
      // pTEST001 is a fixture name, so this cannot pass incidentally.
      expect(res.text).to.include("pTEST001");
    });

    it("renders an empty cart without erroring", async function () {
      const res = await agent.get("/cart");
      expect(res.status).to.equal(200);
    });

    it("survives an item whose type has been deleted", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });
      await testDb.r.table("Type1").get(ids.type1).delete().run();

      const res = await agent.get("/cart");
      expect(res.status).to.equal(200);
    });
  });

  describe("cart isolation between users", function () {
    it("does not show one user's items to another", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });

      const otherAgent = await signedInAgent("testuser");
      const res = await otherAgent.get("/cart");

      expect(res.status).to.equal(200);
      expect(res.text).to.not.include("pTEST001");

      const otherCarts = await Cart.filter({ username: "testuser" })
        .getJoin({ items: true })
        .run();
      expect(otherCarts.length === 0 || otherCarts[0].items.length === 0).to.equal(
        true,
      );
    });
  });

  describe("Cart.empty()", function () {
    it("detaches every item from the cart", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1b });

      const cart = await currentCart();
      await cart.empty();

      const after = await currentCart();
      expect(after.items).to.have.lengthOf(0);
    });

    it("only detaches the items it was given", async function () {
      // Order placement passes the exact IDs it captured, so an item added
      // mid-checkout is not silently discarded without ever being ordered.
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });
      const cart = await currentCart();
      const firstItemId = cart.items[0].id;

      await agent.post("/cart/add").type("form").send({ typeID: ids.type1b });

      await cart.empty([firstItemId]);

      const after = await currentCart();
      expect(after.items).to.have.lengthOf(1);
      expect(after.items[0].typeID).to.equal(ids.type1b);
    });

    it("resolves rather than hanging when the cart has no items", async function () {
      const cart = await require("../../controllers/shoppingCart").ensureCart(USER);
      // Regression: the old implementation had no catch on its outer chain, so
      // any failure left the promise permanently unsettled and hung the
      // request that awaited it.
      await cart.empty();
    });
  });

  describe("concurrency", function () {
    it("does not leave the user with two carts", async function () {
      // ensureCart reads then writes and RethinkDB has no unique secondary
      // index, so two concurrent first-time requests both saw zero carts and
      // both inserted. The header badge requires exactly one cart and silently
      // reported 0 items forever afterwards.
      const shoppingCart = require("../../controllers/shoppingCart");

      await Promise.all(
        Array.from({ length: 5 }, () => shoppingCart.ensureCart("racer")),
      );
      // Whoever notices duplicates merges them, so converge and re-read.
      await shoppingCart.ensureCart("racer");

      const carts = await Cart.filter({ username: "racer" }).run();
      expect(carts, `expected one cart, found ${carts.length}`).to.have.lengthOf(1);
    });

    it("preserves items when merging duplicate carts", async function () {
      const shoppingCart = require("../../controllers/shoppingCart");

      const first = await new Cart({ username: "merger" }).save();
      const second = await new Cart({ username: "merger" }).save();

      await testDb.r
        .table("CartItem")
        .insert([
          { cartID: first.id, typeID: ids.type1, quantity: 1, largeScale: false },
          { cartID: second.id, typeID: ids.type1b, quantity: 2, largeScale: false },
        ])
        .run();

      const merged = await shoppingCart.ensureCart("merger", { items: true });

      const carts = await Cart.filter({ username: "merger" }).run();
      expect(carts).to.have.lengthOf(1);
      expect(merged.items, "both items should survive the merge").to.have.lengthOf(2);
    });

    it("does not add the same item twice when requests race", async function () {
      // A double-click, or the POST route firing alongside the socket handler,
      // could insert the same type twice — and calculateCartTotals then bills
      // the customer for both.
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          agent.post("/cart/add").type("form").send({ typeID: ids.type1 }),
        ),
      );
      expect(results.some((r) => r.status === "fulfilled")).to.equal(true);

      // Duplicates are repaired on the next cart access, so converge first.
      await agent.get("/cart");

      // The invariant that matters is what the user sees and is billed for:
      // exactly one row for the type, in their actual cart.
      const cart = await currentCart();
      const rowsForType = cart.items.filter((item) => item.typeID === ids.type1);
      expect(
        rowsForType,
        `expected one row in the cart, found ${rowsForType.length}`,
      ).to.have.lengthOf(1);
    });
  });

  describe("Cart.contains()", function () {
    it("reports membership accurately", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });
      const cart = await currentCart();

      expect(await cart.contains(ids.type1)).to.equal(true);
      expect(await cart.contains(ids.type1b)).to.equal(false);
    });
  });

  describe("quantities", function () {
    it("persists a quantity change across a reload", async function () {
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });
      const cart = await currentCart();

      const item = await CartItem.get(cart.items[0].id);
      item.quantity = 7;
      await item.save();

      const reloaded = await CartItem.get(cart.items[0].id);
      expect(reloaded.quantity).to.equal(7);
    });
  });
});
