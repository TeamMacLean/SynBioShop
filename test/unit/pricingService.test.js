/**
 * lib/pricingService — the module that decides what a customer is charged.
 */

const { expect } = require("chai");
const pricing = require("../../lib/pricingService");
const config = require("../../config");

describe("lib/pricingService", function () {
  describe("userNeedsPayment", function () {
    it("exempts TSL staff", function () {
      expect(pricing.userNeedsPayment({ username: "someone", company: "TSL" })).to
        .equal(false);
    });

    it("exempts admins regardless of company", function () {
      expect(
        pricing.userNeedsPayment({ username: config.admins[0], company: "Other" }),
      ).to.equal(false);
    });

    it("charges an external, non-admin user", function () {
      expect(
        pricing.userNeedsPayment({ username: "outsider", company: "QIB" }),
      ).to.equal(true);
    });

    it("charges a user with no company set", function () {
      expect(pricing.userNeedsPayment({ username: "outsider" })).to.equal(true);
    });
  });

  describe("validateQuantity", function () {
    it("accepts the documented range", function () {
      for (const qty of [1, 2, 12, 24, 25]) {
        expect(pricing.validateQuantity(qty).valid, `qty ${qty}`).to.equal(true);
      }
    });

    it("rejects zero and negatives", function () {
      expect(pricing.validateQuantity(0).valid).to.equal(false);
      expect(pricing.validateQuantity(-1).valid).to.equal(false);
      expect(pricing.validateQuantity(-999).valid).to.equal(false);
    });

    it("rejects anything above 25", function () {
      expect(pricing.validateQuantity(26).valid).to.equal(false);
      expect(pricing.validateQuantity(1e9).valid).to.equal(false);
    });

    it("treats a missing quantity as 1", function () {
      expect(pricing.validateQuantity(undefined).valid).to.equal(true);
      expect(pricing.validateQuantity(null).valid).to.equal(true);
    });

    it("rejects non-numeric text", function () {
      expect(pricing.validateQuantity("abc").valid).to.equal(false);
    });

    it("explains why it rejected", function () {
      expect(pricing.validateQuantity(0).error).to.match(/at least 1/i);
      expect(pricing.validateQuantity(26).error).to.match(/exceed 25/i);
    });
  });

  describe("calculateCartTotals", function () {
    it("sums quantities", function () {
      const totals = pricing.calculateCartTotals(
        [{ quantity: 2 }, { quantity: 3 }],
        false,
      );
      expect(totals.totalQuantity).to.equal(5);
    });

    it("returns a null cost when no payment is due", function () {
      const totals = pricing.calculateCartTotals([{ quantity: 2 }], false);
      expect(totals.totalCost).to.equal(null);
    });

    it("multiplies quantity by the configured unit price", function () {
      const totals = pricing.calculateCartTotals(
        [{ quantity: 2 }, { quantity: 3 }],
        true,
      );
      expect(totals.totalCost).to.equal(5 * parseFloat(config.pricePerUnit));
    });

    it("defaults a missing quantity to 1", function () {
      const totals = pricing.calculateCartTotals(
        [{ quantity: undefined }, {}],
        false,
      );
      expect(totals.totalQuantity).to.equal(2);
    });

    it("handles an empty cart", function () {
      const totals = pricing.calculateCartTotals([], true);
      expect(totals.totalQuantity).to.equal(0);
      expect(totals.totalCost).to.equal(0);
    });

    it("refuses to price against a non-numeric pricePerUnit", function () {
      // A mistyped price used to yield NaN, which passed the `=== 0` guard,
      // was stored as the string "NaN", and reached the customer's
      // confirmation email as "£NaN".
      const original = config.pricePerUnit;
      config.pricePerUnit = "not-a-price";
      try {
        expect(() =>
          pricing.calculateCartTotals([{ quantity: 1 }], true),
        ).to.throw(/pricePerUnit/);
      } finally {
        config.pricePerUnit = original;
      }
    });

    it("does not throw for a non-numeric price when nothing is charged", function () {
      const original = config.pricePerUnit;
      config.pricePerUnit = "free";
      try {
        const totals = pricing.calculateCartTotals([{ quantity: 2 }], false);
        expect(totals.totalQuantity).to.equal(2);
      } finally {
        config.pricePerUnit = original;
      }
    });
  });

  describe("validateCartQuantities", function () {
    it("rejects an empty cart", function () {
      const result = pricing.validateCartQuantities([]);
      expect(result.valid).to.equal(false);
      expect(result.errors[0]).to.match(/empty/i);
    });

    it("rejects a null cart", function () {
      expect(pricing.validateCartQuantities(null).valid).to.equal(false);
    });

    it("accepts a cart of valid items", function () {
      expect(
        pricing.validateCartQuantities([{ quantity: 1 }, { quantity: 25 }]).valid,
      ).to.equal(true);
    });

    it("names the offending item by position", function () {
      const result = pricing.validateCartQuantities([
        { quantity: 1 },
        { quantity: 99 },
      ]);
      expect(result.valid).to.equal(false);
      expect(result.errors[0]).to.include("Item 2");
    });

    it("reports every invalid item, not just the first", function () {
      const result = pricing.validateCartQuantities([
        { quantity: 0 },
        { quantity: 99 },
      ]);
      expect(result.errors).to.have.lengthOf(2);
    });
  });

  describe("formatPrice", function () {
    it("formats to two decimal places", function () {
      expect(pricing.formatPrice(5)).to.equal("5.00");
      expect(pricing.formatPrice("12.5")).to.equal("12.50");
      expect(pricing.formatPrice(1234.567)).to.equal("1234.57");
    });

    it("never renders the literal string NaN", function () {
      // This value goes straight into pages and emails.
      expect(pricing.formatPrice(undefined)).to.equal("0.00");
      expect(pricing.formatPrice(null)).to.equal("0.00");
      expect(pricing.formatPrice("not a price")).to.equal("0.00");
      expect(pricing.formatPrice(Infinity)).to.equal("0.00");
    });
  });

  describe("getPricingContext", function () {
    it("hides pricing from TSL staff by default", function () {
      const ctx = pricing.getPricingContext({ username: "x", company: "TSL" }, []);
      expect(ctx.displayPricing).to.equal(false);
      expect(ctx.needsPayment).to.equal(false);
    });

    it("shows pricing to external users", function () {
      const ctx = pricing.getPricingContext(
        { username: "outsider", company: "QIB" },
        [],
      );
      expect(ctx.displayPricing).to.equal(true);
      expect(ctx.needsPayment).to.equal(true);
    });

    it("lets an admin force pricing into view", function () {
      const ctx = pricing.getPricingContext(
        { username: "x", company: "TSL" },
        [],
        true,
      );
      expect(ctx.displayPricing).to.equal(true);
    });
  });
});
