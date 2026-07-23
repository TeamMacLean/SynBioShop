const chai = require("chai");
const request = require("supertest");
const expect = chai.expect;
const Cart = require("../../models/cart");
const CartItem = require("../../models/cartItem");
const Type1 = require("../../models/type/type1");

describe("Cart Operations Endpoint Integration Test", function () {
  let app;
  let sessionCookie;
  let testType;
  const testUsername = "deeks"; // Admin user

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

    // Clean up existing cart
    const existingCarts = await Cart.filter({ username: testUsername }).run();
    for (const c of existingCarts) {
      await c.delete();
    }

    // Grab or create a type to add to cart
    const types = await Type1.run();
    if (types.length > 0) {
      testType = types[0];
    } else {
      testType = new Type1({ name: "Dummy Type", categoryID: "dummy-cat" });
      await testType.save();
    }
  });

  after(async function () {
    // Clean up
    const existingCarts = await Cart.filter({ username: testUsername }).run();
    for (const c of existingCarts) {
      await c.delete();
    }
  });

  it("should successfully add an item to the cart via POST /cart/add", function (done) {
    request(app)
      .post("/cart/add")
      .set("Cookie", sessionCookie)
      .set("Referrer", "/documents") // Mock referrer so it redirects back
      .send({
        typeID: testType.id
      })
      .expect(302)
      .expect("Location", "/documents")
      .end(async function (err, res) {
        if (err) return done(err);

        try {
          // Verify that the cart has the item
          const carts = await Cart.filter({ username: testUsername }).getJoin({ items: true }).run();
          expect(carts.length).to.equal(1);
          expect(carts[0].items).to.be.an("array");
          expect(carts[0].items.length).to.equal(1);
          expect(carts[0].items[0].typeID).to.equal(testType.id);

          done();
        } catch (dbErr) {
          done(dbErr);
        }
      });
  });

  it("should correctly render the cart page via GET /cart", function (done) {
    request(app)
      .get("/cart")
      .set("Cookie", sessionCookie)
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);

        expect(res.text).to.include(testType.name || "Unnamed");
        done();
      });
  });
});
