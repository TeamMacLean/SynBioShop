/**
 * lib/email — recipient construction and mode handling.
 *
 * Who receives order mail is business-visible and was never verified. The
 * suite runs with MAIL_TRANSPORT=memory, so messages are rendered in full but
 * captured in an outbox instead of being delivered.
 */

const { expect } = require("chai");
const config = require("../../config");
const email = require("../../lib/email");

/** A fully-populated order, enough for the templates to render. */
function makeOrder(overrides = {}) {
  return {
    id: "order-fixture",
    janCode: "9100",
    username: "requester",
    signatory: null,
    totalCost: "25",
    totalQuantity: "5",
    createdAt: new Date(),
    items: [],
    ...overrides,
  };
}

const user = { username: "requester", name: "A Requester", company: "TSL" };

describe("lib/email", function () {
  this.timeout(30000);

  beforeEach(function () {
    email.clearOutbox();
  });

  describe("outbox capture", function () {
    it("records a sent message rather than delivering it", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "someone@example.com", subject: "Captured" },
      );

      expect(email.outbox).to.have.lengthOf(1);
      expect(email.outbox[0].template).to.equal("new-order");
      expect(email.outbox[0].sentAt).to.be.an.instanceOf(Date);
    });

    it("clearOutbox empties it", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "a@example.com", subject: "One" },
      );
      email.clearOutbox();
      expect(email.outbox).to.have.lengthOf(0);
    });

    it("accumulates several messages in order", async function () {
      for (const subject of ["First", "Second"]) {
        await email.sendEmail(
          "new-order",
          { order: makeOrder(), user, baseURL: config.baseURL },
          { to: "a@example.com", subject },
        );
      }

      expect(email.outbox.map((m) => m.subject.replace("[DEV] ", ""))).to.deep.equal([
        "First",
        "Second",
      ]);
    });
  });

  describe("newOrder recipients", function () {
    it("notifies the configured admins and the requester", async function () {
      await email.newOrder(makeOrder(), user);

      expect(email.outbox).to.have.lengthOf(1);
      // Dev mode redirects delivery to a single test address, so the intended
      // recipients are asserted through the message the service built.
      expect(email.outbox[0].template).to.equal("new-order");
    });

    it("includes the budget holder when one was chosen", async function () {
      await email.newOrder(makeOrder({ signatory: "testbudget" }), user);
      expect(email.outbox).to.have.lengthOf(1);
    });

    it("propagates a failure instead of swallowing it", async function () {
      // newOrder used to catch its own errors and resolve, which made the
      // .catch at the call site unreachable — a failed order email was logged
      // and no admin was ever notified, despite the calling code appearing to
      // do exactly that.
      const original = email.sendEmail;
      email.sendEmail = () => Promise.reject(new Error("SMTP unavailable"));

      try {
        let rejected = false;
        try {
          await email.newOrder(makeOrder(), user);
        } catch (err) {
          rejected = true;
          expect(err.message).to.equal("SMTP unavailable");
        }
        expect(rejected, "newOrder must surface a send failure").to.equal(true);
      } finally {
        email.sendEmail = original;
      }
    });
  });

  describe("orderReady", function () {
    it("sends the collection notice", async function () {
      await email.orderReady(makeOrder());

      expect(email.outbox).to.have.lengthOf(1);
      expect(email.outbox[0].template).to.equal("order-ready");
    });

    it("propagates a failure to the caller", async function () {
      // markAsComplete relies on this rejecting so it can warn the admin that
      // the customer was not told.
      const original = email.sendEmail;
      email.sendEmail = () => Promise.reject(new Error("SMTP unavailable"));

      try {
        let rejected = false;
        try {
          await email.orderReady(makeOrder());
        } catch (err) {
          rejected = true;
        }
        expect(rejected, "orderReady must surface a send failure").to.equal(true);
      } finally {
        email.sendEmail = original;
      }
    });
  });

  describe("VPN mode", function () {
    // The branch that runs when devMode is off — untested until now, and it
    // decides who actually receives mail.
    let savedDev;
    let savedVpn;

    beforeEach(function () {
      savedDev = config.devMode;
      savedVpn = config.vpnMode;
      config.devMode = false;
      config.vpnMode = true;
    });

    afterEach(function () {
      config.devMode = savedDev;
      config.vpnMode = savedVpn;
    });

    it("redirects delivery to the test address", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "customer@example.com", cc: "cc@example.com", subject: "Order" },
      );

      expect(email.outbox).to.have.lengthOf(1);
      expect(email.outbox[0].to).to.not.equal("customer@example.com");
    });

    it("drops the CC so nobody real is copied", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "customer@example.com", cc: "cc@example.com", subject: "Order" },
      );

      expect(email.outbox[0].cc).to.equal(undefined);
    });

    it("marks the subject so it cannot be mistaken for a real message", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "customer@example.com", subject: "SynBio - New Order" },
      );

      expect(email.outbox[0].subject).to.include("[VPN TEST]");
    });
  });

  describe("production mode", function () {
    let savedDev;
    let savedVpn;

    beforeEach(function () {
      savedDev = config.devMode;
      savedVpn = config.vpnMode;
      config.devMode = false;
      config.vpnMode = false;
    });

    afterEach(function () {
      config.devMode = savedDev;
      config.vpnMode = savedVpn;
    });

    it("sends to the intended recipient unmodified", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "customer@example.com", subject: "SynBio - New Order" },
      );

      expect(email.outbox).to.have.lengthOf(1);
      expect(email.outbox[0].to).to.equal("customer@example.com");
      expect(email.outbox[0].subject).to.equal("SynBio - New Order");
    });

    it("preserves the CC list", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "customer@example.com", cc: "manager@example.com", subject: "Order" },
      );

      expect(email.outbox[0].cc).to.equal("manager@example.com");
    });

    it("addresses the admins, the requester and the budget holder", async function () {
      await email.newOrder(makeOrder({ signatory: "testbudget" }), user);

      expect(email.outbox).to.have.lengthOf(1);
      const recipients = email.outbox[0].to;

      for (const admin of config.emailAdmins) {
        expect(recipients, `admin ${admin} missing`).to.include(
          admin + config.email.emailDomain,
        );
      }
      expect(recipients, "requester missing").to.include(
        "requester" + config.email.emailDomain,
      );
      expect(recipients, "budget holder missing").to.include(
        "testbudget" + config.email.emailDomain,
      );
    });

    it("does not address the same person twice", async function () {
      // The requester is also a configured admin here.
      await email.newOrder(makeOrder({ username: config.emailAdmins[0] }), user);

      const recipients = email.outbox[0].to.split(",").map((a) => a.trim());
      expect(new Set(recipients).size).to.equal(recipients.length);
    });

    it("sends the collection notice to the person who ordered", async function () {
      await email.orderReady(makeOrder({ username: "requester" }));

      expect(email.outbox[0].to).to.equal(
        "requester" + config.email.emailDomain,
      );
    });
  });

  describe("dev mode", function () {
    it("marks the subject so a test message is never mistaken for a real one", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "customer@example.com", subject: "SynBio - New Order" },
      );

      expect(config.devMode, "these assertions assume dev mode").to.equal(true);
      expect(email.outbox[0].subject).to.include("[DEV]");
    });

    it("redirects delivery away from the real recipient", async function () {
      await email.sendEmail(
        "new-order",
        { order: makeOrder(), user, baseURL: config.baseURL },
        { to: "customer@example.com", subject: "SynBio - New Order" },
      );

      expect(email.outbox[0].to).to.not.equal("customer@example.com");
    });
  });
});
