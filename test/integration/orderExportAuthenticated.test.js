const chai = require("chai");
const request = require("supertest");
const expect = chai.expect;

describe("Order Export Authenticated Integration Tests", function () {
  let app;
  let sessionCookie;

  before(function (done) {
    app = require("../../app.js");

    // Login as admin first to get session cookie
    request(app)
      .post("/signin")
      .send({
        username: "deeks",
        password: "test123",
      })
      .expect(302)
      .end((err, res) => {
        if (err) return done(err);
        sessionCookie = res.headers["set-cookie"];
        done();
      });
  });

  describe("Authenticated Export All Orders (GET /order/export-all)", function () {
    it("should successfully return JSON of all orders without timing out", function (done) {
      request(app)
        .get("/order/export-all?start=2024-01-01&end=2026-12-31")
        .set("Cookie", sessionCookie)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);

          expect(res.body).to.be.an("array");

          if (res.body.length > 0) {
            // Verify structure has items populated instead of getTypes
            const firstOrder = res.body[0];
            expect(firstOrder).to.have.property("id");
            expect(firstOrder).to.have.property("items");
            expect(firstOrder.items).to.be.an("array");
          }

          done();
        });
    });
  });

  describe("Authenticated Export Costed Orders (GET /order/export)", function () {
    it("should successfully return JSON of costed orders", function (done) {
      request(app)
        .get("/order/export?start=2024-01-01&end=2026-12-31")
        .set("Cookie", sessionCookie)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);

          expect(res.body).to.be.an("array");

          if (res.body.length > 0) {
            // Verify structure has items populated instead of getTypes
            const firstOrder = res.body[0];
            expect(firstOrder).to.have.property("id");
            expect(firstOrder).to.have.property("items");
            expect(firstOrder.items).to.be.an("array");
          }

          done();
        });
    });
  });
});
