const chai = require("chai");
const request = require("supertest");
const expect = chai.expect;
const Cart = require("../../models/cart");
const CartItem = require("../../models/cartItem");
const Order = require("../../models/order");

describe("Order Placement Endpoint Integration Test", function () {
  let app;
  let sessionCookie;
  let testCart;
  let testCartItem;
  const testUsername = "deeks"; // Admin user, used in devMode login

  before(async function () {
    app = require("../../app.js");

    // Login as admin first to get session cookie
    await new Promise((resolve, reject) => {
      request(app)
        .post("/signin")
        .send({
          username: testUsername,
          password: "test123",
        })
        .expect(302)
        .end((err, res) => {
          if (err) return reject(err);
          sessionCookie = res.headers["set-cookie"];
          resolve();
        });
    });

    // Setup a cart for the logged-in user
    const BudgetHolder = require("../../models/budgetHolder");

    // Clean up first
    const existingCarts = await Cart.filter({ username: testUsername }).run();
    for (const c of existingCarts) {
      await c.delete();
    }

    testCart = new Cart({ username: testUsername });
    await testCart.save();

    testCartItem = new CartItem({
      cartID: testCart.id,
      typeID: (await require("../../models/type").getAll())[0].id,
      quantity: 2,
      largeScale: false,
    });
    await testCartItem.save();

    // Create test budget holder if needed
    try {
      const bh = new BudgetHolder({
        username: "testbudget",
        description: "Test",
      });
      await bh.save();
    } catch (e) {}
  });

  after(async function () {
    // Clean up
    if (testCartItem) {
      try {
        const item = await CartItem.get(testCartItem.id);
        await item.delete();
      } catch (e) {}
    }
    if (testCart) {
      try {
        const cart = await Cart.get(testCart.id);
        await cart.delete();
      } catch (e) {}
    }
    const orders = await Order.filter({ username: testUsername }).run();
    for (const order of orders) {
      await order.delete();
    }
  });

  it.only("should successfully place an order and update cart items", function (done) {
    request(app)
      .post("/cart/order")
      .set("Cookie", sessionCookie)
      .send({
        costCode: "12345-678",
        signatory: "testbudget",
      })
      .expect(302) // Should redirect to /orders after successful placement
      .end(async function (err, res) {
        if (err) return done(err);
        console.log("Redirected to:", res.headers.location);

        try {
          // Verify that the cart was emptied
          const cartAfter = await Cart.get(testCart.id).getJoin({
            items: true,
          });
          expect(cartAfter.items).to.be.an("array");
          expect(cartAfter.items.length).to.equal(0);

          // Verify that the item now has an orderID associated with it
          const itemAfter = await CartItem.get(testCartItem.id);
          expect(itemAfter.orderID).to.exist;
          expect(itemAfter.orderID).to.be.a("string");

          // Verify that the order was created
          const order = await Order.get(itemAfter.orderID);
          expect(order.username).to.equal(testUsername);

          done();
        } catch (dbErr) {
          done(dbErr);
        }
      });
  });
});
