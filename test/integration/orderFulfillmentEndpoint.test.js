const chai = require("chai");
const request = require("supertest");
const expect = chai.expect;
const Order = require("../../models/order");

describe("Order Fulfillment Endpoint Integration Test", function () {
  let app;
  let sessionCookie;
  let testOrder;
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

    // Create a dummy order
    testOrder = new Order({
      username: "testuser",
      janCode: "9999",
      complete: false,
      cancelled: false
    });
    await testOrder.save();
  });

  after(async function () {
    // Clean up
    if (testOrder) {
      try {
        const order = await Order.get(testOrder.id);
        await order.delete();
      } catch(e) {}
    }
  });

  it("should successfully mark an order as complete via POST /order/:id/complete", function (done) {
    request(app)
      .post(`/order/${testOrder.id}/complete`)
      .set("Cookie", sessionCookie)
      .expect(302)
      .expect("Location", "/orders")
      .end(async function (err, res) {
        if (err) return done(err);

        try {
          // Verify that the order was marked complete
          const order = await Order.get(testOrder.id);
          expect(order.complete).to.be.true;
          done();
        } catch (dbErr) {
          done(dbErr);
        }
      });
  });

  it("should successfully mark an order as cancelled via POST /order/:id/cancel", function (done) {
    request(app)
      .post(`/order/${testOrder.id}/cancel`)
      .set("Cookie", sessionCookie)
      .expect(302)
      .expect("Location", "/orders")
      .end(async function (err, res) {
        if (err) return done(err);

        try {
          // Verify that the order was marked cancelled
          const order = await Order.get(testOrder.id);
          expect(order.cancelled).to.be.true;
          done();
        } catch (dbErr) {
          done(dbErr);
        }
      });
  });
});
