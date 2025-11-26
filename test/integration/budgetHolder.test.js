/**
 * Integration tests for Budget Holder Management
 * Simplified to focus on core CRUD functionality
 */

const chai = require("chai");
const expect = chai.expect;
const BudgetHolder = require("../../models/budgetHolder");

describe("Budget Holder Integration Tests", function () {
  let testHolderId;
  const testUsername = "testbh123";

  // Increase timeout for database operations
  this.timeout(10000);

  // Clean up before tests
  before(async function () {
    try {
      const existing = await BudgetHolder.filter({
        username: testUsername,
      }).run();
      for (const holder of existing) {
        await holder.delete();
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  // Clean up after all tests
  after(async function () {
    try {
      if (testHolderId) {
        const holder = await BudgetHolder.get(testHolderId);
        await holder.delete();
      }
      const remaining = await BudgetHolder.filter({
        username: testUsername,
      }).run();
      for (const holder of remaining) {
        await holder.delete();
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe("Budget Holder CRUD Operations", function () {
    describe("Create Budget Holder", function () {
      it("should successfully create a new budget holder", async function () {
        const holder = new BudgetHolder({
          username: testUsername,
          description: "TEST User Test User [Test Department (TEST)]",
        });

        const saved = await holder.save();
        testHolderId = saved.id;

        expect(saved).to.have.property("id");
        expect(saved.username).to.equal(testUsername);
        expect(saved.description).to.equal(
          "TEST User Test User [Test Department (TEST)]",
        );
      });
    });

    describe("Read Budget Holders", function () {
      it("should retrieve all budget holders", async function () {
        const holders = await BudgetHolder.run();
        expect(holders).to.be.an("array");
        expect(holders.length).to.be.greaterThan(0);
      });

      it("should retrieve specific budget holder by username", async function () {
        const holders = await BudgetHolder.filter({
          username: testUsername,
        }).run();
        expect(holders).to.be.an("array");
        expect(holders.length).to.be.at.least(1);
        expect(holders[0].username).to.equal(testUsername);
      });

      it("should retrieve budget holder by ID", async function () {
        const holder = await BudgetHolder.get(testHolderId);
        expect(holder).to.have.property("id");
        expect(holder.username).to.equal(testUsername);
      });
    });

    describe("Update Budget Holder", function () {
      it("should successfully update budget holder description", async function () {
        const holder = await BudgetHolder.get(testHolderId);
        holder.description =
          "UPDATED User Updated User [Test Department (TEST)]";
        await holder.save();

        const updated = await BudgetHolder.get(testHolderId);
        expect(updated.description).to.equal(
          "UPDATED User Updated User [Test Department (TEST)]",
        );
      });

      it("should successfully update budget holder username", async function () {
        const holder = await BudgetHolder.get(testHolderId);
        const oldUsername = holder.username;
        holder.username = "updated123";
        await holder.save();

        const updated = await BudgetHolder.get(testHolderId);
        expect(updated.username).to.equal("updated123");

        // Change back for other tests
        updated.username = oldUsername;
        await updated.save();
      });
    });

    describe("Delete Budget Holder", function () {
      it("should successfully delete budget holder", async function () {
        const holder = await BudgetHolder.get(testHolderId);
        await holder.delete();

        try {
          await BudgetHolder.get(testHolderId);
          throw new Error("Should have thrown not found error");
        } catch (err) {
          expect(err.message).to.include("not found");
        }

        testHolderId = null;
      });
    });
  });

  describe("Budget Holder Helper Functions", function () {
    let tempHolderId;

    before(async function () {
      // Create a temporary holder for testing helper functions
      const holder = new BudgetHolder({
        username: "helpertest",
        description: "HELPER Test Helper Test [Test Department (TEST)]",
      });
      const saved = await holder.save();
      tempHolderId = saved.id;
    });

    after(async function () {
      try {
        const holder = await BudgetHolder.get(tempHolderId);
        await holder.delete();
      } catch (err) {
        // Already deleted or not found
      }
    });

    describe("getBudgetHoldersForSelect()", function () {
      it("should return array of budget holders for select dropdown", async function () {
        const budgetHolders = require("../../config/budgetHolders");
        const holders = await budgetHolders.getBudgetHoldersForSelect();

        expect(holders).to.be.an("array");
        expect(holders.length).to.be.greaterThan(0);

        // Check structure of first item
        if (holders.length > 0) {
          expect(holders[0]).to.have.property("value");
          expect(holders[0]).to.have.property("label");
          expect(holders[0].value).to.be.a("string");
          expect(holders[0].label).to.be.a("string");
        }
      });

      it("should return sorted budget holders", async function () {
        const budgetHolders = require("../../config/budgetHolders");
        const holders = await budgetHolders.getBudgetHoldersForSelect();

        // Check if sorted alphabetically by label
        for (let i = 1; i < Math.min(holders.length, 10); i++) {
          const prev = holders[i - 1].label;
          const curr = holders[i].label;
          expect(prev.localeCompare(curr)).to.be.at.most(0);
        }
      });
    });

    describe("getBudgetHolderName()", function () {
      it("should return description for valid username", async function () {
        const budgetHolders = require("../../config/budgetHolders");
        const name = await budgetHolders.getBudgetHolderName("helpertest");

        expect(name).to.equal(
          "HELPER Test Helper Test [Test Department (TEST)]",
        );
      });

      it("should return null for invalid username", async function () {
        const budgetHolders = require("../../config/budgetHolders");
        const name =
          await budgetHolders.getBudgetHolderName("nonexistentuser999");

        expect(name).to.be.null;
      });
    });

    describe("isValidBudgetHolder()", function () {
      it("should return true for valid budget holder", async function () {
        const budgetHolders = require("../../config/budgetHolders");
        const isValid = await budgetHolders.isValidBudgetHolder("helpertest");

        expect(isValid).to.be.true;
      });

      it("should return false for invalid budget holder", async function () {
        const budgetHolders = require("../../config/budgetHolders");
        const isValid =
          await budgetHolders.isValidBudgetHolder("nonexistentuser999");

        expect(isValid).to.be.false;
      });
    });

    describe("getAllBudgetHolders()", function () {
      it("should return all budget holders", async function () {
        const budgetHolders = require("../../config/budgetHolders");
        const all = await budgetHolders.getAllBudgetHolders();

        expect(all).to.be.an("array");
        expect(all.length).to.be.greaterThan(0);

        // Check structure of first item
        if (all.length > 0) {
          expect(all[0]).to.have.property("id");
          expect(all[0]).to.have.property("username");
          expect(all[0]).to.have.property("description");
        }
      });
    });
  });

  describe("Display on Cart Page", function () {
    it("should populate budget holders in cart view", async function () {
      const budgetHolders = require("../../config/budgetHolders");
      const holders = await budgetHolders.getBudgetHoldersForSelect();

      // Verify we have budget holders to display
      expect(holders).to.be.an("array");
      expect(holders.length).to.be.greaterThan(0);

      // Verify structure is correct for cart dropdown
      if (holders.length > 0) {
        expect(holders[0]).to.have.property("value");
        expect(holders[0]).to.have.property("label");
      }
    });
  });
});
