/**
 * Budget Holder Controller
 *
 * Admin-only controller for managing budget holders.
 * Provides CRUD operations for the budget holder database.
 */

const BudgetHolder = require("../models/budgetHolder");
const Flash = require("../lib/flash");
const config = require("../config.json");

const BudgetHolderController = {};

/**
 * Middleware to ensure user is admin
 */
BudgetHolderController.ensureAdmin = (req, res, next) => {
  if (!req.user) {
    Flash.error(req, "You must be logged in to access this page.");
    return res.redirect("/");
  }

  if (!config.admins.includes(req.user.username)) {
    Flash.error(req, "Access denied. Admin privileges required.");
    return res.redirect("/");
  }

  next();
};

/**
 * GET /budget - List all budget holders
 */
BudgetHolderController.index = async (req, res) => {
  try {
    const budgetHolders = await BudgetHolder.orderBy({ index: "username" }).run();

    res.render("budget/index", {
      budgetHolders,
      title: "Budget Holders Management"
    });
  } catch (err) {
    console.error("Error loading budget holders:", err);
    Flash.error(req, "Failed to load budget holders.");
    res.redirect("/");
  }
};

/**
 * GET /budget/new - Show form to create new budget holder
 */
BudgetHolderController.new = (req, res) => {
  res.render("budget/form", {
    title: "Add Budget Holder",
    budgetHolder: null,
    action: "/budget",
    method: "POST"
  });
};

/**
 * GET /budget/:id/edit - Show form to edit budget holder
 */
BudgetHolderController.edit = async (req, res) => {
  try {
    const budgetHolder = await BudgetHolder.get(req.params.id);

    res.render("budget/form", {
      title: "Edit Budget Holder",
      budgetHolder,
      action: `/budget/${budgetHolder.id}`,
      method: "POST"
    });
  } catch (err) {
    console.error("Error loading budget holder:", err);
    Flash.error(req, "Budget holder not found.");
    res.redirect("/budget");
  }
};

/**
 * POST /budget - Create new budget holder
 */
BudgetHolderController.create = async (req, res) => {
  const { username, description } = req.body;

  // Validation
  const errors = [];

  if (!username || username.trim() === "") {
    errors.push("Username is required.");
  } else if (username.length < 3 || username.length > 20) {
    errors.push("Username must be between 3 and 20 characters.");
  }

  if (!description || description.trim() === "") {
    errors.push("Description is required.");
  } else if (description.length < 10 || description.length > 150) {
    errors.push("Description must be between 10 and 150 characters.");
  }

  if (errors.length > 0) {
    Flash.error(req, errors.join(" "));
    return res.render("budget/form", {
      title: "Add Budget Holder",
      budgetHolder: { username, description },
      action: "/budget",
      method: "POST"
    });
  }

  try {
    // Check if username already exists
    const existing = await BudgetHolder.filter({ username: username.trim() }).run();

    if (existing.length > 0) {
      Flash.error(req, `Username "${username}" already exists.`);
      return res.render("budget/form", {
        title: "Add Budget Holder",
        budgetHolder: { username, description },
        action: "/budget",
        method: "POST"
      });
    }

    // Create new budget holder
    const holder = new BudgetHolder({
      username: username.trim(),
      description: description.trim()
    });

    await holder.save();

    Flash.success(req, `Budget holder "${username}" created successfully.`);
    res.redirect("/budget");

  } catch (err) {
    console.error("Error creating budget holder:", err);
    Flash.error(req, "Failed to create budget holder. Please try again.");
    res.render("budget/form", {
      title: "Add Budget Holder",
      budgetHolder: { username, description },
      action: "/budget",
      method: "POST"
    });
  }
};

/**
 * POST /budget/:id - Update budget holder
 */
BudgetHolderController.update = async (req, res) => {
  const { username, description } = req.body;
  const holderId = req.params.id;

  // Validation
  const errors = [];

  if (!username || username.trim() === "") {
    errors.push("Username is required.");
  } else if (username.length < 3 || username.length > 20) {
    errors.push("Username must be between 3 and 20 characters.");
  }

  if (!description || description.trim() === "") {
    errors.push("Description is required.");
  } else if (description.length < 10 || description.length > 150) {
    errors.push("Description must be between 10 and 150 characters.");
  }

  if (errors.length > 0) {
    Flash.error(req, errors.join(" "));
    return res.redirect(`/budget/${holderId}/edit`);
  }

  try {
    // Get the budget holder
    const holder = await BudgetHolder.get(holderId);

    // Check if username is being changed and if new username already exists
    if (holder.username !== username.trim()) {
      const existing = await BudgetHolder.filter({ username: username.trim() }).run();
      if (existing.length > 0) {
        Flash.error(req, `Username "${username}" already exists.`);
        return res.redirect(`/budget/${holderId}/edit`);
      }
    }

    // Update the budget holder
    holder.username = username.trim();
    holder.description = description.trim();
    await holder.save();

    Flash.success(req, `Budget holder "${username}" updated successfully.`);
    res.redirect("/budget");

  } catch (err) {
    console.error("Error updating budget holder:", err);
    Flash.error(req, "Failed to update budget holder. Please try again.");
    res.redirect(`/budget/${holderId}/edit`);
  }
};

/**
 * POST /budget/:id/delete - Delete budget holder
 */
BudgetHolderController.delete = async (req, res) => {
  const holderId = req.params.id;

  try {
    const holder = await BudgetHolder.get(holderId);
    const username = holder.username;

    await holder.delete();

    Flash.success(req, `Budget holder "${username}" deleted successfully.`);
    res.redirect("/budget");

  } catch (err) {
    console.error("Error deleting budget holder:", err);
    Flash.error(req, "Failed to delete budget holder. Please try again.");
    res.redirect("/budget");
  }
};

module.exports = BudgetHolderController;
