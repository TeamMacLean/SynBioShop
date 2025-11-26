/**
 * Integration tests for Order Placement
 * Simplified to test core order placement functionality
 */

const chai = require("chai");
const expect = chai.expect;
const Cart = require("../../models/cart");
const CartItem = require("../../models/cartItem");
const Order = require("../../models/order");
const BudgetHolder = require("../../models/budgetHolder");

describe("Order Placement Integration Tests", function () {
  let testCart;
  let testCartItems = [];
  let testBudgetHolder;
  const testUsername = "testorderuser";

  // Increase timeout for database operations
  this.timeout(10000);

  // Setup test data before all tests
  before(async function () {
    try {
      // Clean up any existing test data
      const existingCarts = await Cart.filter({ username: testUsername }).run();
      for (const cart of existingCarts) {
        await cart.delete();
      }

      const existingOrders = await Order.filter({
        username: testUsername,
      }).run();
      for (const order of existingOrders) {
        await order.delete();
      }

      const existingHolders = await BudgetHolder.filter({
        username: "testbudget",
      }).run();
      for (const holder of existingHolders) {
        await holder.delete();
      }

      // Create test budget holder
      testBudgetHolder = new BudgetHolder({
        username: "testbudget",
        description: "TEST Budget Test Budget [Test Department (TEST)]",
      });
      await testBudgetHolder.save();

      // Create test cart
      testCart = new Cart({
        username: testUsername,
      });
      await testCart.save();

      // Create test cart items with explicit quantities
      const item1 = new CartItem({
        cartID: testCart.id,
        typeID: "test-type-1",
        quantity: 2,
        largeScale: false,
      });
      await item1.save();
      testCartItems.push(item1);

      const item2 = new CartItem({
        cartID: testCart.id,
        typeID: "test-type-2",
        quantity: 3,
        largeScale: false,
      });
      await item2.save();
      testCartItems.push(item2);

      console.log("Test setup complete: cart and items created");
    } catch (err) {
      console.error("Error in test setup:", err);
      throw err;
    }
  });

  // Cleanup after all tests
  after(async function () {
    try {
      // Clean up test cart items
      for (const item of testCartItems) {
        try {
          const foundItem = await CartItem.get(item.id);
          await foundItem.delete();
        } catch (err) {
          // Item might already be deleted
        }
      }

      // Clean up test cart
      try {
        const foundCart = await Cart.get(testCart.id);
        await foundCart.delete();
      } catch (err) {
        // Cart might already be deleted
      }

      // Clean up test orders
      const testOrders = await Order.filter({ username: testUsername }).run();
      for (const order of testOrders) {
        await order.delete();
      }

      // Clean up test budget holder
      try {
        const foundHolder = await BudgetHolder.get(testBudgetHolder.id);
        await foundHolder.delete();
      } catch (err) {
        // Holder might already be deleted
      }

      console.log("Test cleanup complete");
    } catch (err) {
      console.error("Error in test cleanup:", err);
    }
  });

  describe("Cart Item Quantities", function () {
    it("should have cart items with explicit quantities", async function () {
      const cart = await Cart.get(testCart.id).getJoin({ items: true });

      expect(cart.items).to.be.an("array");
      expect(cart.items.length).to.equal(2);

      cart.items.forEach((item) => {
        expect(item).to.have.property("quantity");
        expect(item.quantity).to.be.a("number");
        expect(item.quantity).to.be.at.least(1);
      });
    });

    it("should persist quantity when cart item is saved", async function () {
      const item = testCartItems[0];
      const originalQuantity = item.quantity;

      // Update quantity
      item.quantity = 5;
      await item.save();

      // Reload from database
      const reloadedItem = await CartItem.get(item.id);
      expect(reloadedItem.quantity).to.equal(5);

      // Restore original quantity
      reloadedItem.quantity = originalQuantity;
      await reloadedItem.save();
    });
  });

  describe("Pricing Service Validation", function () {
    it("should validate cart quantities correctly", async function () {
      const pricingService = require("../../lib/pricingService");
      const cart = await Cart.get(testCart.id).getJoin({ items: true });

      const validation = pricingService.validateCartQuantities(cart.items);

      expect(validation).to.have.property("valid");
      expect(validation).to.have.property("errors");
      expect(validation.valid).to.be.true;
      expect(validation.errors).to.be.an("array");
      expect(validation.errors.length).to.equal(0);
    });

    it("should calculate totals correctly with quantities", async function () {
      const pricingService = require("../../lib/pricingService");
      const cart = await Cart.get(testCart.id).getJoin({ items: true });

      // Items have quantities: 2 and 3
      const totals = pricingService.calculateCartTotals(cart.items, true);

      expect(totals).to.have.property("totalQuantity");
      expect(totals).to.have.property("totalCost");
      expect(totals.totalQuantity).to.equal(5); // 2 + 3
      expect(totals.totalCost).to.be.a("number");
      expect(totals.totalCost).to.be.greaterThan(0);
    });

    it("should handle undefined quantities gracefully", async function () {
      const pricingService = require("../../lib/pricingService");

      // Create items with undefined quantity
      const itemsWithUndefined = [
        { quantity: undefined },
        { quantity: null },
        { quantity: 2 },
      ];

      const totals = pricingService.calculateCartTotals(
        itemsWithUndefined,
        false,
      );

      // Should default undefined/null to 1, so total = 1 + 1 + 2 = 4
      expect(totals.totalQuantity).to.equal(4);
    });

    it("should accept valid quantities", function () {
      const pricingService = require("../../lib/pricingService");

      const validQuantities = [1, 5, 10, 25];

      validQuantities.forEach((qty) => {
        const validation = pricingService.validateQuantity(qty);
        expect(validation.valid).to.be.true;
        expect(validation.error).to.be.null;
      });
    });
  });

  describe("Order Creation with Quantities", function () {
    it("should validate order data before creation", async function () {
      const cart = await Cart.get(testCart.id).getJoin({ items: true });

      // Mock user data
      const mockUser = {
        username: testUsername,
        company: "JIC", // Non-TSL user
      };

      const formData = {
        costCode: "12345-678-9",
        signatory: testBudgetHolder.username,
      };

      const pricingService = require("../../lib/pricingService");
      const budgetHolders = require("../../config/budgetHolders");

      // Validate quantities
      const quantityValidation = pricingService.validateCartQuantities(
        cart.items,
      );
      expect(quantityValidation.valid).to.be.true;

      // Validate budget holder
      const isValidBudgetHolder = await budgetHolders.isValidBudgetHolder(
        formData.signatory,
      );
      expect(isValidBudgetHolder).to.be.true;
    });
  });

  describe("Complete Order Flow", function () {
    it("should handle TSL user order (no payment)", async function () {
      const pricingService = require("../../lib/pricingService");

      const tslUser = {
        username: "tsluser",
        company: "TSL",
      };

      const needsPayment = pricingService.userNeedsPayment(tslUser);
      expect(needsPayment).to.be.false;

      const cart = await Cart.get(testCart.id).getJoin({ items: true });
      const totals = pricingService.calculateCartTotals(cart.items, false);

      expect(totals.totalQuantity).to.equal(5);
      expect(totals.totalCost).to.be.null; // TSL users don't pay
    });

    it("should handle non-TSL user order (with payment)", async function () {
      const pricingService = require("../../lib/pricingService");

      const nonTslUser = {
        username: "jicuser",
        company: "JIC",
      };

      const needsPayment = pricingService.userNeedsPayment(nonTslUser);
      expect(needsPayment).to.be.true;

      const cart = await Cart.get(testCart.id).getJoin({ items: true });
      const totals = pricingService.calculateCartTotals(cart.items, true);

      expect(totals.totalQuantity).to.equal(5);
      expect(totals.totalCost).to.be.a("number");
      expect(totals.totalCost).to.be.greaterThan(0);
      expect(totals.totalCost).to.equal(25); // 5 items * £5 each
    });
  });

  describe("Error Handling", function () {
    it("should handle empty cart gracefully", async function () {
      const pricingService = require("../../lib/pricingService");

      const emptyCart = { items: [] };
      const validation = pricingService.validateCartQuantities(emptyCart.items);

      expect(validation.valid).to.be.false;
      expect(validation.errors).to.include("Cart is empty");
    });

    it("should handle missing quantity field", async function () {
      const pricingService = require("../../lib/pricingService");

      // Items without quantity field should default to 1
      const items = [{ typeID: "test-1" }, { typeID: "test-2" }];

      const totals = pricingService.calculateCartTotals(items, false);
      expect(totals.totalQuantity).to.equal(2); // Defaults to 1 each
    });

    it("should prevent placing order with invalid data", async function () {
      const budgetHolders = require("../../config/budgetHolders");

      const invalidBudgetHolder = "nonexistent_user_999";
      const isValid =
        await budgetHolders.isValidBudgetHolder(invalidBudgetHolder);

      expect(isValid).to.be.false;
    });
  });

  describe("Quantity Boundaries", function () {
    it("should accept minimum quantity (1)", function () {
      const pricingService = require("../../lib/pricingService");
      const validation = pricingService.validateQuantity(1);
      expect(validation.valid).to.be.true;
    });

    it("should accept maximum quantity (25)", function () {
      const pricingService = require("../../lib/pricingService");
      const validation = pricingService.validateQuantity(25);
      expect(validation.valid).to.be.true;
    });

    it("should reject quantity above maximum (26)", function () {
      const pricingService = require("../../lib/pricingService");
      const validation = pricingService.validateQuantity(26);
      expect(validation.valid).to.be.false;
      expect(validation.error).to.include("cannot exceed 25");
    });
  });
});
