/**
 * LDAP filter escaping (RFC 4515).
 *
 * The filters in lib/ldap.js and controllers/auth.js interpolated the username
 * directly, using a privileged bind. `*` matched every account and
 * `x)(objectClass=*` rewrote the filter entirely.
 */

const { expect } = require("chai");
const { escapeFilterValue } = require("../../lib/ldap");

describe("lib/ldap escapeFilterValue", function () {
  it("leaves an ordinary username untouched", function () {
    expect(escapeFilterValue("deeks")).to.equal("deeks");
    expect(escapeFilterValue("jones.smith123")).to.equal("jones.smith123");
  });

  it("escapes the wildcard", function () {
    // Unescaped, "*" turns the filter into a match-everything query.
    expect(escapeFilterValue("*")).to.equal("\\2a");
  });

  it("escapes parentheses, which is what allows filter rewriting", function () {
    expect(escapeFilterValue("(")).to.equal("\\28");
    expect(escapeFilterValue(")")).to.equal("\\29");
  });

  it("escapes backslashes", function () {
    expect(escapeFilterValue("\\")).to.equal("\\5c");
  });

  it("neutralises a filter-injection payload", function () {
    const escaped = escapeFilterValue("x)(objectClass=*");
    expect(escaped).to.not.include("(");
    expect(escaped).to.not.include(")");
    expect(escaped).to.not.include("*");
  });

  it("produces a filter with balanced structure for hostile input", function () {
    const payloads = [
      "*",
      "*)(uid=*",
      "admin)(|(uid=*",
      "\\2a",
      "a)(&(objectClass=user",
    ];

    for (const payload of payloads) {
      const filter = `(sAMAccountName=${escapeFilterValue(payload)})`;
      const opens = (filter.match(/(?<!\\)\(/g) || []).length;
      const closes = (filter.match(/(?<!\\)\)/g) || []).length;

      expect(opens, `unbalanced for ${payload}: ${filter}`).to.equal(1);
      expect(closes, `unbalanced for ${payload}: ${filter}`).to.equal(1);
    }
  });

  it("coerces non-strings rather than throwing", function () {
    expect(() => escapeFilterValue(123)).to.not.throw();
    expect(() => escapeFilterValue(null)).to.not.throw();
  });
});
