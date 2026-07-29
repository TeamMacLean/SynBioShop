/**
 * Socket.IO authentication and cart handlers.
 *
 * Before hardening, sockets had no authentication at all and the cart handlers
 * took the username straight from the client payload. Anyone could connect
 * anonymously and stuff or empty another user's cart, and an empty payload
 * crashed the whole process — socket.io dispatches listeners inside a bare
 * process.nextTick with no try/catch.
 */

const { expect } = require("chai");
const ioClient = require("socket.io-client");
const request = require("supertest");
const { getApp } = require("../helpers/agent");
const testDb = require("../helpers/testDb");
const Cart = require("../../models/cart");

describe("Socket.IO", function () {
  this.timeout(30000);

  let server;
  let baseURL;
  let ids;

  before(async function () {
    ids = await testDb.reset();

    server = getApp();
    await new Promise((resolve) => {
      if (server.listening) return resolve();
      server.listen(0, "127.0.0.1", resolve);
    });
    baseURL = `http://127.0.0.1:${server.address().port}`;
  });

  after(function (done) {
    if (server && server.listening) return server.close(() => done());
    done();
  });

  /**
   * Signs in against the listening server and returns the raw Cookie header.
   *
   * Goes through the real HTTP server rather than supertest's per-request
   * ephemeral listener, so the cookie is the one this origin issued.
   */
  async function sessionCookie(username) {
    const res = await request(baseURL)
      .post("/signin")
      .set("Origin", baseURL)
      .type("form")
      .send({ username, password: "test-password" });

    expect(res.status, `sign-in for ${username} failed`).to.equal(302);

    const setCookie = res.headers["set-cookie"] || [];
    return setCookie.map((c) => c.split(";")[0]).join("; ");
  }

  /** Opens a socket, resolving on connect and rejecting on refusal. */
  function connect(cookie) {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseURL, {
        transports: ["websocket"],
        extraHeaders: cookie ? { Cookie: cookie } : {},
        reconnection: false,
        timeout: 5000,
      });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => {
        socket.close();
        reject(err);
      });
    });
  }

  describe("connection gate", function () {
    it("refuses an anonymous socket", async function () {
      let refused = false;
      try {
        const socket = await connect(null);
        socket.close();
      } catch (err) {
        refused = true;
        expect(err.message).to.match(/unauthorized/i);
      }
      expect(refused, "an anonymous socket should not connect").to.equal(true);
    });

    it("accepts a socket carrying a valid session", async function () {
      const cookie = await sessionCookie("deeks");
      const socket = await connect(cookie);
      expect(socket.connected).to.equal(true);
      socket.close();
    });
  });

  describe("cart handlers", function () {
    let socket;

    beforeEach(async function () {
      ids = await testDb.reset();
      const cookie = await sessionCookie("deeks");
      socket = await connect(cookie);
    });

    afterEach(function () {
      if (socket) socket.close();
    });

    it("adds an item to the session user's own cart", async function () {
      await new Promise((resolve, reject) => {
        socket.on("addedToCart", resolve);
        socket.on("error", reject);
        socket.emit("addToCart", { typeID: ids.type1 });
      });

      const carts = await Cart.filter({ username: "deeks" })
        .getJoin({ items: true })
        .run();
      expect(carts[0].items).to.have.lengthOf(1);
    });

    it("ignores a username supplied by the client", async function () {
      // The handler used to trust data.username, so an attacker could name any
      // account and have items added to that person's cart.
      await new Promise((resolve, reject) => {
        socket.on("addedToCart", resolve);
        socket.on("error", reject);
        socket.emit("addToCart", { typeID: ids.type1, username: "victim" });
      });

      const victimCarts = await Cart.filter({ username: "victim" }).run();
      expect(victimCarts, "no cart should exist for the named victim").to.have.lengthOf(
        0,
      );

      const ownCarts = await Cart.filter({ username: "deeks" })
        .getJoin({ items: true })
        .run();
      expect(ownCarts[0].items).to.have.lengthOf(1);
    });

    it("refuses to delete a cart item belonging to someone else", async function () {
      // Cart item IDs are rendered into the DOM, so one signed-in user can
      // read another's from a shared page.
      const otherCart = await new Cart({ username: "someone-else" }).save();
      const inserted = await testDb.r
        .table("CartItem")
        .insert(
          { cartID: otherCart.id, typeID: ids.type1, quantity: 1, largeScale: false },
          { returnChanges: true },
        )
        .run();
      const victimItemId = inserted.changes[0].new_val.id;

      await new Promise((resolve) => {
        socket.on("removedFromCart", resolve);
        socket.on("error", resolve);
        socket.emit("removeFromCart", { id: victimItemId });
      });

      const stillThere = await testDb.r.table("CartItem").get(victimItemId).run();
      expect(stillThere, "another user's item was deleted").to.not.equal(null);
    });

    it("refuses to change the quantity of someone else's item", async function () {
      const otherCart = await new Cart({ username: "someone-else" }).save();
      const inserted = await testDb.r
        .table("CartItem")
        .insert(
          { cartID: otherCart.id, typeID: ids.type1, quantity: 1, largeScale: false },
          { returnChanges: true },
        )
        .run();
      const victimItemId = inserted.changes[0].new_val.id;

      await new Promise((resolve) => {
        socket.on("quantityUpdated", resolve);
        socket.on("error", resolve);
        socket.emit("changeQuantity", { id: victimItemId, quantity: 25 });
      });

      const after = await testDb.r.table("CartItem").get(victimItemId).run();
      expect(after.quantity).to.equal(1);
    });

    it("changes the quantity of the user's own item", async function () {
      await new Promise((resolve, reject) => {
        socket.on("addedToCart", resolve);
        socket.on("error", reject);
        socket.emit("addToCart", { typeID: ids.type1 });
      });

      const carts = await Cart.filter({ username: "deeks" })
        .getJoin({ items: true })
        .run();
      const itemId = carts[0].items[0].id;

      const update = await new Promise((resolve, reject) => {
        socket.on("quantityUpdated", resolve);
        socket.on("error", reject);
        socket.emit("changeQuantity", { id: itemId, quantity: 5 });
      });

      expect(update.quantity).to.equal(5);
    });

    it("clamps an out-of-range quantity to the server's limit", async function () {
      await new Promise((resolve, reject) => {
        socket.on("addedToCart", resolve);
        socket.on("error", reject);
        socket.emit("addToCart", { typeID: ids.type1 });
      });

      const carts = await Cart.filter({ username: "deeks" })
        .getJoin({ items: true })
        .run();
      const itemId = carts[0].items[0].id;

      const update = await new Promise((resolve, reject) => {
        socket.on("quantityUpdated", resolve);
        socket.on("error", reject);
        socket.emit("changeQuantity", { id: itemId, quantity: 99999 });
      });

      expect(update.quantity).to.equal(25);
    });
  });

  describe("malformed payloads do not take the server down", function () {
    let socket;

    beforeEach(async function () {
      const cookie = await sessionCookie("deeks");
      socket = await connect(cookie);
    });

    afterEach(function () {
      if (socket) socket.close();
    });

    it("survives every handler being called with no payload", async function () {
      // `data.id` on undefined threw inside socket.io's nextTick dispatch,
      // which is an uncaughtException — it killed the process.
      for (const event of ["addToCart", "removeFromCart", "changeQuantity", "search"]) {
        socket.emit(event);
      }
      await global.testHelpers.sleep(300);

      // Still responsive afterwards.
      const results = await new Promise((resolve) => {
        socket.on("results", resolve);
        socket.emit("search", "pTEST");
      });
      expect(results).to.be.an("array");
    });

    it("survives junk payload types", async function () {
      socket.emit("removeFromCart", { id: 12345 });
      socket.emit("changeQuantity", { id: null, quantity: "abc" });
      socket.emit("addToCart", { typeID: { nested: true } });
      socket.emit("search", 42);
      await global.testHelpers.sleep(300);

      expect(socket.connected).to.equal(true);
    });
  });

  describe("search", function () {
    let socket;

    beforeEach(async function () {
      ids = await testDb.reset();
      const cookie = await sessionCookie("deeks");
      socket = await connect(cookie);
    });

    afterEach(function () {
      if (socket) socket.close();
    });

    it("returns matching premade items", async function () {
      const results = await new Promise((resolve) => {
        socket.on("results", resolve);
        socket.emit("search", "pTEST001");
      });

      expect(results).to.be.an("array");
      const premade = results.find((group) => group.heading === "Premade");
      expect(premade, "expected a Premade group").to.not.equal(undefined);
      expect(premade.items.map((i) => i.name)).to.include("pTEST001");
    });

    it("returns an empty result for an empty query", async function () {
      const results = await new Promise((resolve) => {
        socket.on("results", resolve);
        socket.emit("search", "");
      });
      expect(results).to.deep.equal([]);
    });

    it("treats regex metacharacters as literal text", async function () {
      const results = await new Promise((resolve) => {
        socket.on("results", resolve);
        socket.emit("search", ".*");
      });
      // Escaped, so it matches nothing rather than everything.
      expect(results).to.be.an("array");
    });
  });
});
