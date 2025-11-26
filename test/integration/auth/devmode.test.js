const request = require("supertest");
const { expect } = require("chai");
const config = require("../../../config.json");

describe("Dev Mode Authentication", () => {
  let app;

  before(() => {
    // Ensure we're in dev mode for these tests
    expect(config.devMode).to.be.true;

    // Load the app
    app = require("../../../app");
  });

  describe("POST /signin", () => {
    it("should allow admin users to login with any non-empty password in dev mode", (done) => {
      request(app)
        .post("/signin")
        .send({
          username: "deeks",
          password: "any-password-123",
        })
        .expect(302) // Expecting redirect after successful login
        .expect("Location", "/")
        .end((err, res) => {
          if (err) return done(err);
          // Check that session cookie is set
          expect(res.headers["set-cookie"]).to.exist;
          done();
        });
    });

    it("should reject admin users with empty password even in dev mode", (done) => {
      request(app)
        .post("/signin")
        .send({
          username: "deeks",
          password: "",
        })
        .expect(200) // Returns error page (200 status)
        .expect((res) => {
          // Should show an error message in the response
          expect(res.text).to.match(/error|Error|failed|Failed/i);
        })
        .end(done);
    });

    it("should reject non-admin users even with valid password in dev mode", (done) => {
      request(app)
        .post("/signin")
        .send({
          username: "notanadmin",
          password: "password123",
        })
        .expect(200) // Returns error page (200 status)
        .expect((res) => {
          // Should show an error message in the response
          expect(res.text).to.match(/error|Error|authorized|not found/i);
        })
        .end(done);
    });

    it("should not use LDAP authentication in dev mode", (done) => {
      // This test verifies that we don't hit LDAP by using invalid LDAP credentials
      // but valid dev mode credentials
      request(app)
        .post("/signin")
        .send({
          username: "deeks",
          password: "definitely-not-the-real-ldap-password",
        })
        .expect(302) // Should succeed with redirect
        .expect("Location", "/")
        .end(done);
    });
  });

  describe("GET /signin", () => {
    it("should display dev mode warning on signin page", (done) => {
      request(app)
        .get("/signin")
        .expect(200)
        .expect((res) => {
          expect(res.text).to.include("DEV MODE");
          expect(res.text).to.include("deeks");
        })
        .end(done);
    });
  });

  describe("Protected Routes with Dev Auth", () => {
    let agent;
    let sessionCookie;

    before((done) => {
      // Login first to get session cookie
      request(app)
        .post("/signin")
        .send({
          username: "deeks",
          password: "test123",
        })
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);
          // Extract session cookie
          const cookies = res.headers["set-cookie"];
          if (cookies && cookies.length > 0) {
            sessionCookie = cookies[0].split(";")[0];
          }
          done();
        });
    });

    it("should allow access to protected routes after dev mode login", (done) => {
      request(app)
        .get("/cart")
        .set("Cookie", sessionCookie)
        .expect(200)
        .end(done);
    });

    it("should recognize user as admin after dev mode login", (done) => {
      request(app)
        .get("/admin/billboard")
        .set("Cookie", sessionCookie)
        .expect(200)
        .end(done);
    });

    it("should allow logout", (done) => {
      request(app)
        .get("/signout")
        .set("Cookie", sessionCookie)
        .expect(302)
        .expect("Location", "/")
        .end(done);
    });
  });

  describe("Email Handling in Dev Mode", () => {
    it("should log emails to console instead of sending them", (done) => {
      // We can't easily test console output, but we can verify the email service exists
      const emailService = require("../../../lib/email");
      expect(emailService.sendEmail).to.be.a("function");

      // Mock console.log to capture output
      const originalLog = console.log;
      let logOutput = "";
      console.log = (...args) => {
        logOutput += args.join(" ") + "\n";
      };

      // Send a test email
      emailService
        .sendEmail(
          "test-template",
          { test: "data" },
          { to: "test@example.com", subject: "Test Email" },
        )
        .then(() => {
          // Restore console.log
          console.log = originalLog;

          // Check that dev mode message was logged
          expect(logOutput).to.include("DEV MODE");
          expect(logOutput).to.include("Email would be sent");
          expect(logOutput).to.include("test@example.com");
          done();
        })
        .catch((err) => {
          console.log = originalLog;
          done(err);
        });
    });
  });

  describe("LDAP Check Endpoint in Dev Mode", () => {
    it("should check against admin list instead of LDAP (if endpoint exists)", (done) => {
      request(app)
        .post("/checkLDAPUser")
        .send({ username: "deeks" })
        .end((err, res) => {
          if (res.status === 404) {
            // Endpoint doesn't exist, skip test
            console.log(
              "    ⊘ checkLDAPUser endpoint not implemented, skipping",
            );
            return done();
          }
          expect(res.status).to.equal(200);
          expect(res.body.exists).to.be.true;
          done();
        });
    });

    it("should return false for non-admin users (if endpoint exists)", (done) => {
      request(app)
        .post("/checkLDAPUser")
        .send({ username: "unknownuser" })
        .end((err, res) => {
          if (res.status === 404) {
            // Endpoint doesn't exist, skip test
            console.log(
              "    ⊘ checkLDAPUser endpoint not implemented, skipping",
            );
            return done();
          }
          expect(res.status).to.equal(200);
          expect(res.body.exists).to.be.false;
          done();
        });
    });
  });
});
