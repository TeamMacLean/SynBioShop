/**
 * lib/ldap against a real (in-process) directory server.
 *
 * These paths used to terminate the whole application. An ldapjs client with
 * no 'error' listener throws on an unreachable host, and an unhandled 'error'
 * event on an EventEmitter exits the process — so a directory outage, which is
 * routine when this app runs off-VPN, took the shop down with it. The bind
 * callback also fell through to `client.search` after a failure, handing the
 * search callback an undefined result stream.
 */

const { expect } = require("chai");
const ldapjs = require("ldapjs");
const config = require("../../config");
const ldap = require("../../lib/ldap");

describe("lib/ldap", function () {
  this.timeout(30000);

  let server;
  let port;
  let originalUrl;
  let originalBindDn;
  let originalCredentials;
  let originalSearchBase;

  /** What the fake directory should do on the next request. */
  const behaviour = {
    bindSucceeds: true,
    searchErrors: false,
    entries: [],
    lastFilter: null,
  };

  before(async function () {
    originalUrl = config.ldap.url;
    originalBindDn = config.ldap.bindDn;
    originalCredentials = config.ldap.bindCredentials;
    originalSearchBase = config.ldap.searchBase;

    server = ldapjs.createServer();

    server.bind("dc=example,dc=test", (req, res, next) => {
      if (!behaviour.bindSucceeds) {
        return next(new ldapjs.InvalidCredentialsError("bad credentials"));
      }
      res.end();
      return next();
    });

    server.search("dc=example,dc=test", (req, res, next) => {
      behaviour.lastFilter = req.filter.toString();

      if (behaviour.searchErrors) {
        return next(new ldapjs.OperationsError("search exploded"));
      }

      for (const entry of behaviour.entries) {
        res.send({ dn: entry.dn, attributes: entry.attributes });
      }
      res.end();
      return next();
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;

    config.ldap.url = `ldap://127.0.0.1:${port}`;
    config.ldap.bindDn = "cn=root,dc=example,dc=test";
    config.ldap.bindCredentials = "secret";
    config.ldap.searchBase = "dc=example,dc=test";
  });

  after(function (done) {
    config.ldap.url = originalUrl;
    config.ldap.bindDn = originalBindDn;
    config.ldap.bindCredentials = originalCredentials;
    config.ldap.searchBase = originalSearchBase;

    if (server) return server.close(() => done());
    done();
  });

  beforeEach(function () {
    behaviour.bindSucceeds = true;
    behaviour.searchErrors = false;
    behaviour.entries = [];
    behaviour.lastFilter = null;
  });

  describe("successful lookups", function () {
    it("returns the matching entry", async function () {
      behaviour.entries = [
        {
          dn: "cn=deeks,dc=example,dc=test",
          attributes: { sAMAccountName: "deeks", name: "George Deeks" },
        },
      ];

      const entries = await ldap.getNameFromUsername("deeks");
      expect(entries).to.have.lengthOf(1);
      expect(entries[0].name).to.equal("George Deeks");
    });

    it("returns an empty list when nobody matches", async function () {
      const entries = await ldap.getNameFromUsername("nobody");
      expect(entries).to.deep.equal([]);
    });

    it("returns every matching entry", async function () {
      behaviour.entries = [
        { dn: "cn=a,dc=example,dc=test", attributes: { name: "A" } },
        { dn: "cn=b,dc=example,dc=test", attributes: { name: "B" } },
      ];

      const entries = await ldap.getNameFromUsername("shared");
      expect(entries).to.have.lengthOf(2);
    });
  });

  describe("filter construction", function () {
    it("queries on sAMAccountName", async function () {
      await ldap.getNameFromUsername("deeks");
      expect(behaviour.lastFilter.toLowerCase()).to.include("samaccountname=deeks");
    });

    it("escapes a wildcard so it cannot match every account", async function () {
      await ldap.getNameFromUsername("*");

      expect(
        behaviour.lastFilter.toLowerCase(),
        `filter was ${behaviour.lastFilter}`,
      ).to.not.equal("(samaccountname=*)");
      expect(behaviour.lastFilter).to.include("\\2a");
    });

    it("neutralises an injected sub-expression", async function () {
      await ldap.getNameFromUsername("x)(objectClass=*");

      // A single balanced equality filter, not a rewritten compound one.
      expect(behaviour.lastFilter.toLowerCase()).to.not.include("objectclass=*)");
    });
  });

  describe("failure paths do not crash the process", function () {
    it("rejects when the bind is refused", async function () {
      // The callback used to log the error and then call client.search anyway,
      // whose callback received an undefined result stream and threw inside an
      // ldapjs I/O callback — an uncaughtException.
      behaviour.bindSucceeds = false;

      let rejected = false;
      try {
        await ldap.getNameFromUsername("deeks");
      } catch (err) {
        rejected = true;
        // ldapjs errors are custom classes, so check the shape rather than
        // the prototype.
        expect(err).to.have.property("message");
      }
      expect(rejected, "a refused bind must reject").to.equal(true);
    });

    it("rejects when the search fails", async function () {
      behaviour.searchErrors = true;

      let rejected = false;
      try {
        await ldap.getNameFromUsername("deeks");
      } catch (err) {
        rejected = true;
      }
      expect(rejected, "a failed search must reject").to.equal(true);
    });

    it("rejects rather than hanging when the host is unreachable", async function () {
      const saved = config.ldap.url;
      // Port 1 is reserved and refuses immediately.
      config.ldap.url = "ldap://127.0.0.1:1";

      try {
        let rejected = false;
        try {
          await ldap.getNameFromUsername("deeks");
        } catch (err) {
          rejected = true;
        }
        expect(rejected, "an unreachable directory must reject").to.equal(true);
      } finally {
        config.ldap.url = saved;
      }
    });

    it("stays usable after a failure", async function () {
      behaviour.bindSucceeds = false;
      await ldap.getNameFromUsername("deeks").catch(() => {});

      behaviour.bindSucceeds = true;
      behaviour.entries = [
        { dn: "cn=deeks,dc=example,dc=test", attributes: { name: "George" } },
      ];

      const entries = await ldap.getNameFromUsername("deeks");
      expect(entries).to.have.lengthOf(1);
    });

    it("settles exactly once even when several failures race", async function () {
      behaviour.bindSucceeds = false;

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => ldap.getNameFromUsername("deeks")),
      );
      expect(results.every((r) => r.status === "rejected")).to.equal(true);
    });
  });

  describe("input handling", function () {
    it("returns an empty list for a blank username without querying", async function () {
      const entries = await ldap.getNameFromUsername("");
      expect(entries).to.deep.equal([]);
      expect(behaviour.lastFilter, "no query should have been sent").to.equal(null);
    });

    it("returns an empty list for a non-string username", async function () {
      expect(await ldap.getNameFromUsername(null)).to.deep.equal([]);
      expect(await ldap.getNameFromUsername(undefined)).to.deep.equal([]);
    });
  });
});
