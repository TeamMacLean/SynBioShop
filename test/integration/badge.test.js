const request = require("supertest");
const { expect } = require("chai");

describe("Navigation Badge", () => {
  let app;
  let adminSessionCookie;
  let normalSessionCookie;

  before((done) => {
    // Load the app
    app = require("../../app");

    // Login as admin first
    request(app)
      .post("/signin")
      .send({
        username: "deeks",
        password: "testpassword",
      })
      .expect(302)
      .end((err, res) => {
        if (err) return done(err);
        const cookies = res.headers["set-cookie"];
        if (cookies && cookies.length > 0) {
          adminSessionCookie = cookies[0].split(";")[0];
        }

        // Login as non-admin
        request(app)
          .post("/signin")
          .send({
            username: "testuser",
            password: "testpassword",
          })
          .expect(302)
          .end((err2, res2) => {
            if (err2) return done(err2);
            const normalCookies = res2.headers["set-cookie"];
            if (normalCookies && normalCookies.length > 0) {
              normalSessionCookie = normalCookies[0].split(";")[0];
            }
            done();
          });
      });
  });

  it("should render the notification badge for admins", (done) => {
    request(app)
      .get("/")
      .set("Cookie", adminSessionCookie)
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);

        // Assert that the HTML contains the badge class inside the user div
        expect(res.text).to.include('<span class="badge">');
        done();
      });
  });

  it("should NOT render the notification badge for regular users", (done) => {
    request(app)
      .get("/")
      .set("Cookie", normalSessionCookie)
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);

        // Assert that the HTML does NOT contain the badge class
        expect(res.text).to.not.include('<span class="badge">');
        done();
      });
  });
});
