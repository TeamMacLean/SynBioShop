const chai = require("chai");
const request = require("supertest");
const expect = chai.expect;

describe("Premade Export Integration Test", function () {
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

  describe("Authenticated Premade Export (GET /premade/export)", function () {
    it("should successfully return CSV data", function (done) {
      request(app)
        .get("/premade/export")
        .set("Cookie", sessionCookie)
        .expect(200)
        .end(function (err, res) {
          if (err) return done(err);

          expect(res.header['content-type']).to.include('text/csv');
          expect(res.text).to.be.a('string');

          done();
        });
    });
  });
});
