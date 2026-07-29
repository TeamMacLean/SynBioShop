/**
 * lib/sessionStore — the custom express-session store.
 *
 * 220 lines holding every authenticated session in the app, with no direct
 * tests until now. A defect here logs everyone out, or worse, hands one user's
 * session to another.
 */

const { expect } = require("chai");
const session = require("express-session");
const CustomRethinkStore = require("../../lib/sessionStore");
const config = require("../../config");
const testDb = require("../helpers/testDb");

/** Promisified wrapper, since the Store API is callback-based. */
function call(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

describe("lib/sessionStore", function () {
  this.timeout(30000);

  let store;

  before(async function () {
    await testDb.provision();
    store = new CustomRethinkStore(session, {
      db: config.dbName,
      table: "sessions",
      sessionTimeout: 86400000,
      // No background sweeper: it would hold the event loop open and fire
      // mid-assertion.
      flushInterval: 0,
    });
  });

  after(function () {
    if (store) store.stopCleanup();
  });

  beforeEach(async function () {
    await testDb.r.table("sessions").delete().run();
  });

  const sampleSession = () => ({
    cookie: { maxAge: 86400000, expires: new Date(Date.now() + 86400000) },
    passport: { user: { username: "deeks" } },
  });

  describe("set and get", function () {
    it("stores a session and reads it back intact", async function () {
      await call(store, "set", "sid-1", sampleSession());

      const loaded = await call(store, "get", "sid-1");
      expect(loaded).to.be.an("object");
      expect(loaded.passport.user.username).to.equal("deeks");
    });

    it("returns undefined for an unknown session id", async function () {
      const loaded = await call(store, "get", "no-such-session");
      expect(loaded).to.equal(undefined);
    });

    it("overwrites rather than duplicating on re-save", async function () {
      await call(store, "set", "sid-1", sampleSession());

      const updated = sampleSession();
      updated.passport.user.username = "someone-else";
      await call(store, "set", "sid-1", updated);

      const rows = await testDb.r.table("sessions").run();
      expect(rows).to.have.lengthOf(1);

      const loaded = await call(store, "get", "sid-1");
      expect(loaded.passport.user.username).to.equal("someone-else");
    });

    it("keeps separate sessions separate", async function () {
      const a = sampleSession();
      const b = sampleSession();
      b.passport.user.username = "testuser";

      await call(store, "set", "sid-a", a);
      await call(store, "set", "sid-b", b);

      expect((await call(store, "get", "sid-a")).passport.user.username).to.equal(
        "deeks",
      );
      expect((await call(store, "get", "sid-b")).passport.user.username).to.equal(
        "testuser",
      );
    });
  });

  describe("expiry", function () {
    it("does not return an expired session", async function () {
      const expired = sampleSession();
      expired.cookie.expires = new Date(Date.now() - 1000);

      await call(store, "set", "sid-expired", expired);
      expect(await call(store, "get", "sid-expired")).to.equal(undefined);
    });

    it("removes the expired row as a side effect of reading it", async function () {
      const expired = sampleSession();
      expired.cookie.expires = new Date(Date.now() - 1000);
      await call(store, "set", "sid-expired", expired);

      await call(store, "get", "sid-expired");
      // The destroy is fire-and-forget, so allow it a moment to land.
      await global.testHelpers.sleep(200);

      expect(await testDb.r.table("sessions").get("sid-expired").run()).to.equal(
        null,
      );
    });

    it("falls back to the configured timeout when the cookie has no expiry", async function () {
      const noExpiry = { cookie: {}, passport: { user: { username: "deeks" } } };
      await call(store, "set", "sid-no-expiry", noExpiry);

      const row = await testDb.r.table("sessions").get("sid-no-expiry").run();
      expect(row.expires).to.be.a("number");
      expect(row.expires).to.be.greaterThan(Date.now());
    });
  });

  describe("touch", function () {
    it("extends the expiry without altering the session data", async function () {
      const original = sampleSession();
      original.cookie.expires = new Date(Date.now() + 1000);
      await call(store, "set", "sid-touch", original);

      const before = (await testDb.r.table("sessions").get("sid-touch").run()).expires;

      const extended = sampleSession();
      extended.cookie.expires = new Date(Date.now() + 86400000);
      await call(store, "touch", "sid-touch", extended);

      const after = await testDb.r.table("sessions").get("sid-touch").run();
      expect(after.expires).to.be.greaterThan(before);
      expect(after.session.passport.user.username).to.equal("deeks");
    });
  });

  describe("destroy", function () {
    it("removes the session", async function () {
      await call(store, "set", "sid-doomed", sampleSession());
      await call(store, "destroy", "sid-doomed");

      expect(await call(store, "get", "sid-doomed")).to.equal(undefined);
    });

    it("does not error when destroying a session that is already gone", async function () {
      await call(store, "destroy", "never-existed");
    });
  });

  describe("length, all and clear", function () {
    it("counts stored sessions", async function () {
      await call(store, "set", "sid-1", sampleSession());
      await call(store, "set", "sid-2", sampleSession());

      expect(await call(store, "length")).to.equal(2);
    });

    it("returns every live session keyed by id", async function () {
      await call(store, "set", "sid-1", sampleSession());
      await call(store, "set", "sid-2", sampleSession());

      const all = await call(store, "all");
      expect(Object.keys(all)).to.have.members(["sid-1", "sid-2"]);
    });

    it("omits expired sessions from all()", async function () {
      await call(store, "set", "sid-live", sampleSession());

      const expired = sampleSession();
      expired.cookie.expires = new Date(Date.now() - 1000);
      await call(store, "set", "sid-dead", expired);

      const all = await call(store, "all");
      expect(Object.keys(all)).to.deep.equal(["sid-live"]);
    });

    it("clears every session", async function () {
      await call(store, "set", "sid-1", sampleSession());
      await call(store, "set", "sid-2", sampleSession());

      await call(store, "clear");
      expect(await call(store, "length")).to.equal(0);
    });
  });

  describe("cleanup timer", function () {
    it("sweeps expired sessions and leaves live ones", async function () {
      const sweeper = new CustomRethinkStore(session, {
        db: config.dbName,
        table: "sessions",
        flushInterval: 50,
      });

      try {
        await call(sweeper, "set", "sid-live", sampleSession());

        const expired = sampleSession();
        expired.cookie.expires = new Date(Date.now() - 5000);
        await call(sweeper, "set", "sid-dead", expired);

        await global.testHelpers.sleep(300);

        expect(
          await testDb.r.table("sessions").get("sid-dead").run(),
          "expired session should have been swept",
        ).to.equal(null);
        expect(
          await testDb.r.table("sessions").get("sid-live").run(),
          "live session must survive",
        ).to.not.equal(null);
      } finally {
        sweeper.stopCleanup();
      }
    });

    it("stopCleanup is idempotent", function () {
      const s = new CustomRethinkStore(session, {
        db: config.dbName,
        flushInterval: 1000,
      });
      s.stopCleanup();
      s.stopCleanup();
      expect(s.cleanupTimer).to.equal(null);
    });
  });
});
