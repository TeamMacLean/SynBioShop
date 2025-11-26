/**
 * Integration tests for Rearrange Page
 * Tests that the rearrange page loads correctly
 */

const chai = require("chai");
const request = require("supertest");
const expect = chai.expect;

describe("Rearrange Page Integration Test", function () {
  let app;

  before(function () {
    app = require("../../app.js");
  });

  it("should redirect unauthenticated users from rearrange page", function (done) {
    request(app)
      .get("/docs/rearrange")
      .expect(302)
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.header.location).to.include("/signin");
        done();
      });
  });
});
