/**
 * CSRF protection, end to end.
 *
 * Before hardening there was none: no token, no origin check, and a session
 * cookie with no SameSite attribute. Any page on any site could auto-submit a
 * form that deleted a premade item or placed an order against a victim's cost
 * code, and it would go through the moment an admin visited.
 */

const { expect } = require("chai");
const { signedInAgent, req, csrfToken, SAME_ORIGIN } = require("../helpers/agent");
const testDb = require("../helpers/testDb");

const EVIL = "https://evil.example.com";

describe("CSRF protection", function () {
  this.timeout(30000);

  let agent;
  let ids;
  let cookie;

  beforeEach(async function () {
    ids = await testDb.reset();
    agent = await signedInAgent("deeks");

    // Grab the raw cookie so we can replay this session with hostile headers.
    const res = await agent.get("/");
    cookie = (res.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) {
      const login = await req()
        .post("/signin")
        .set("Origin", SAME_ORIGIN)
        .type("form")
        .send({ username: "deeks", password: "x" });
      cookie = (login.headers["set-cookie"] || [])
        .map((c) => c.split(";")[0])
        .join("; ");
    }
  });

  describe("cross-origin requests are refused", function () {
    it("refuses a POST carrying a foreign Origin", async function () {
      const res = await req()
        .post("/cart/add")
        .set("Cookie", cookie)
        .set("Origin", EVIL)
        .type("form")
        .send({ typeID: ids.type1 });

      expect(res.status).to.equal(403);
    });

    it("refuses a POST carrying a foreign Referer", async function () {
      const res = await req()
        .post("/cart/add")
        .set("Cookie", cookie)
        .set("Referer", `${EVIL}/attack.html`)
        .type("form")
        .send({ typeID: ids.type1 });

      expect(res.status).to.equal(403);
    });

    it("does not perform the action it refused", async function () {
      await req()
        .post("/cart/add")
        .set("Cookie", cookie)
        .set("Origin", EVIL)
        .type("form")
        .send({ typeID: ids.type1 });

      const items = await testDb.r.table("CartItem").run();
      expect(items, "the cross-origin add should not have happened").to.have.lengthOf(
        0,
      );
    });

    it("protects destructive admin routes", async function () {
      const res = await req()
        .post(`/premade/item/${ids.type1}/delete`)
        .set("Cookie", cookie)
        .set("Origin", EVIL)
        .type("form")
        .send({});

      expect(res.status).to.equal(403);

      const stillThere = await testDb.r.table("Type1").get(ids.type1).run();
      expect(stillThere, "the item was deleted cross-origin").to.not.equal(null);
    });

    it("protects order state changes", async function () {
      const inserted = await testDb.r
        .table("Order")
        .insert(
          {
            username: "someone",
            janCode: "7900",
            complete: false,
            cancelled: false,
            createdAt: new Date(),
          },
          { returnChanges: true },
        )
        .run();
      const orderId = inserted.changes[0].new_val.id;

      const res = await req()
        .post(`/order/${orderId}/cancel`)
        .set("Cookie", cookie)
        .set("Origin", EVIL)
        .type("form")
        .send({});

      expect(res.status).to.equal(403);

      const after = await testDb.r.table("Order").get(orderId).run();
      expect(after.cancelled).to.equal(false);
    });
  });

  describe("header-less requests need a token", function () {
    it("refuses a POST with neither Origin nor Referer nor token", async function () {
      const res = await req()
        .post("/cart/add")
        .set("Cookie", cookie)
        .type("form")
        .send({ typeID: ids.type1 });

      expect(res.status).to.equal(403);
    });

    it("accepts a POST carrying the session's token", async function () {
      const token = await csrfToken(agent);
      const res = await agent
        .post("/cart/add")
        .unset("Origin")
        .type("form")
        .send({ typeID: ids.type1, _csrf: token });

      expect(res.status).to.equal(302);
    });

    it("refuses a POST carrying another session's token", async function () {
      const otherAgent = await signedInAgent("testuser");
      const foreignToken = await csrfToken(otherAgent);

      const res = await req()
        .post("/cart/add")
        .set("Cookie", cookie)
        .type("form")
        .send({ typeID: ids.type1, _csrf: foreignToken });

      expect(res.status).to.equal(403);
    });
  });

  describe("same-origin requests still work", function () {
    it("accepts a normal form post", async function () {
      const res = await agent
        .post("/cart/add")
        .type("form")
        .send({ typeID: ids.type1 });

      expect(res.status).to.equal(302);
    });

    it("accepts a same-origin post that also carries the token", async function () {
      const token = await csrfToken(agent);
      const res = await agent
        .post("/cart/add")
        .type("form")
        .send({ typeID: ids.type1, _csrf: token });

      expect(res.status).to.equal(302);
    });

    it("leaves GET requests alone", async function () {
      const res = await req()
        .get("/")
        .set("Cookie", cookie)
        .set("Origin", EVIL);

      expect(res.status).to.equal(200);
    });
  });

  describe("forms carry a token", function () {
    it("renders a token into the sign-in form", async function () {
      const res = await req().get("/signin");
      expect(res.text).to.include('name="_csrf"');
      expect(res.text).to.match(/name="_csrf" value="[0-9a-f]{64}"/);
    });

    it("renders a token into the order form", async function () {
      // The order form only renders once the cart has something in it.
      await agent.post("/cart/add").type("form").send({ typeID: ids.type1 });

      const res = await agent.get("/cart");
      expect(res.status).to.equal(200);
      expect(res.text).to.include('action="/cart/order"');
      expect(res.text).to.include('name="_csrf"');
    });

    it("renders a token into every POST form on the file manager", async function () {
      const res = await agent.get("/filemanager");
      expect(res.status).to.equal(200);

      const postForms = (res.text.match(/<form[^>]*method=["']?post/gi) || []).length;
      const tokens = (res.text.match(/name="_csrf"/g) || []).length;
      expect(tokens, "every POST form should carry a token").to.be.at.least(
        postForms,
      );
    });
  });
});
