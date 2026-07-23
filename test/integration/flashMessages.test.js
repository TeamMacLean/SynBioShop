const chai = require("chai");
const request = require("supertest");
const expect = chai.expect;

describe("Visual Flash Messages Integration Test", function () {
  let app;
  let sessionCookie;

  before(function (done) {
    app = require("../../app.js");
    request(app)
      .get("/") // Just hitting the homepage to establish a basic session
      .end((err, res) => {
        if (err) return done(err);
        sessionCookie = res.headers["set-cookie"];
        done();
      });
  });

  describe("Failed Login Flash Message", function () {
    it("should display the 'Invalid username/password' flash message on the signin page after a failed attempt", async function () {
      // Step 1: Attempt to sign in with invalid credentials
      const loginAttemptRes = await request(app)
        .post("/signin")
        .set("Cookie", sessionCookie)
        .send({ username: "invalid_user", password: "wrong_password" })
        .expect(302)
        .expect("Location", "/signin");

      // Extract the updated session cookie which now contains the flash message
      const updatedSessionCookie = loginAttemptRes.headers["set-cookie"];

      // Step 2: Follow the redirect back to the signin page and verify the HTML
      const renderRes = await request(app)
        .get("/signin")
        .set("Cookie", updatedSessionCookie)
        .expect(200);

      // Verify the HTML contains the visual flash message container and text
      expect(renderRes.text).to.include('class="flash error"');
      expect(renderRes.text).to.include("Invalid username/password");

      // Specifically assert that the message is NOT duplicated (e.g. "Invalid username/password, Invalid username/password")
      expect(renderRes.text).to.not.include(
        "Invalid username/password, Invalid username/password",
      );
      expect(renderRes.text).to.not.include(
        "Invalid username/password, Missing credentials",
      );
    });
  });
});
