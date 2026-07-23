const chai = require("chai");
const request = require("supertest");
const expect = chai.expect;

describe("Robust Error Handling & UX Improvements", function () {
  let app;
  let sessionCookie;

  before(function(done) {
    app = require("../../app.js");
    // Login to get a valid session for authenticated routes
    request(app)
      .post("/signin")
      .send({ username: "deeks", password: "test123" })
      .end((err, res) => {
        if (err) return done(err);
        sessionCookie = res.headers["set-cookie"];
        done();
      });
  });

  describe("1. Malformed URI Handling", function () {
    it("should return 400 Bad Request instead of crashing on URIError", function (done) {
      request(app)
        .get("/%C0")
        .expect(400)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.text).to.include("Bad Request: Invalid URI");
          done();
        });
    });
  });

  describe("2. Graceful Subject Not Found", function () {
    it("should redirect to /documents and flash error for non-existent subject", function (done) {
      request(app)
        .get("/documents/subject/non-existent-id-12345")
        .set("Cookie", sessionCookie)
        .expect(302) // Should redirect, not throw 500
        .expect("Location", "/documents")
        .end(done);
    });
  });

  describe("3. Graceful Failed Login", function () {
    it("should redirect to /signin on invalid credentials instead of 500 error", function (done) {
      request(app)
        .post("/signin")
        .send({ username: "invalid_user_123", password: "wrong_password" })
        .expect(302) // Should redirect back to signin
        .expect("Location", "/signin")
        .end(done);
    });
  });
});
