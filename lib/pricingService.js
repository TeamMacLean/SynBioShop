/**
 * Pricing Service
 *
 * Centralizes all pricing logic for the shopping cart system.
 * Handles TSL vs non-TSL pricing, calculations, and validation.
 */

const config = require("../config");

/**
 * Determines if a user needs to provide payment information
 *
 * @param {Object} user - The user object with company and username
 * @returns {boolean} True if user needs to pay (non-TSL, non-admin)
 */
function userNeedsPayment(user) {
  const isAdmin = config.admins.includes(user.username);
  const isTSLUser = user.company === "TSL";
  return !isTSLUser && !isAdmin;
}

/**
 * Determines if pricing should be displayed to the user
 *
 * @param {Object} user - The user object
 * @param {boolean} adminForceShowPricing - Admin override to show pricing
 * @returns {boolean} True if pricing should be displayed
 */
function shouldDisplayPricing(user, adminForceShowPricing = false) {
  const isTSLUser = user.company === "TSL";
  return !isTSLUser || adminForceShowPricing;
}

/**
 * Calculate totals for cart items
 *
 * @param {Array} items - Array of cart items with quantity property
 * @param {boolean} needsPayment - Whether to calculate cost
 * @returns {Object} Object with { totalQuantity, totalCost }
 */
function calculateCartTotals(items, needsPayment) {
  const pricePerUnit = parseFloat(config.pricePerUnit);

  // A mistyped pricePerUnit ("5.00 GBP", or the key removed) yields NaN, which
  // used to flow all the way into the stored order, the customer's
  // confirmation email as "£NaN", and the revenue export as £0.
  if (needsPayment && !Number.isFinite(pricePerUnit)) {
    throw new Error(
      `Configured pricePerUnit is not a number: ${JSON.stringify(config.pricePerUnit)}`,
    );
  }

  let totalQuantity = 0;
  let totalCost = 0;

  for (const item of items) {
    // Ensure quantity defaults to 1 if undefined/null
    const quantity = parseInt(item.quantity || 1) || 1;
    totalQuantity += quantity;

    if (needsPayment) {
      totalCost += quantity * pricePerUnit;
    }
  }

  return {
    totalQuantity,
    totalCost: needsPayment ? totalCost : null,
    pricePerUnit,
  };
}

/**
 * Validate a single item quantity
 *
 * @param {number} quantity - The quantity to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateQuantity(quantity) {
  // Only an absent quantity defaults to 1. `quantity || 1` also swallowed 0
  // and the string "0", so a zero-quantity item was silently reported as valid
  // and then ordered as one unit.
  const absent = quantity === undefined || quantity === null || quantity === "";
  const qty = absent ? 1 : parseInt(quantity, 10);

  if (isNaN(qty)) {
    return { valid: false, error: "Quantity must be a number" };
  }

  if (qty < 1) {
    return { valid: false, error: "Quantity must be at least 1" };
  }

  if (qty > 25) {
    return { valid: false, error: "Quantity cannot exceed 25" };
  }

  return { valid: true, error: null };
}

/**
 * Validate all cart items have valid quantities
 *
 * @param {Array} items - Array of cart items
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateCartQuantities(items) {
  const errors = [];

  if (!items || items.length === 0) {
    return { valid: false, errors: ["Cart is empty"] };
  }

  items.forEach((item, index) => {
    const validation = validateQuantity(item.quantity);
    if (!validation.valid) {
      errors.push(`Item ${index + 1}: ${validation.error}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format price for display
 *
 * @param {number} price - The price to format
 * @returns {string} Formatted price (e.g., "5.00")
 */
function formatPrice(price) {
  const value = parseFloat(price);
  // Never render the literal string "NaN" into a page or an email.
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

/**
 * Get pricing context for templates
 * Provides all pricing-related data needed for rendering
 *
 * @param {Object} user - The user object
 * @param {Array} items - Cart items
 * @param {boolean} adminForceShowPricing - Admin override
 * @returns {Object} Pricing context for templates
 */
function getPricingContext(user, items = [], adminForceShowPricing = false) {
  const isAdmin = config.admins.includes(user.username);
  const needsPayment = userNeedsPayment(user);
  const displayPricing = shouldDisplayPricing(user, adminForceShowPricing);
  const totals = calculateCartTotals(items, needsPayment);

  return {
    isAdmin,
    needsPayment,
    displayPricing,
    adminForceShowPricing,
    pricePerUnit: config.pricePerUnit,
    pricePerUnitFormatted: formatPrice(config.pricePerUnit),
    totalQuantity: totals.totalQuantity,
    totalCost: totals.totalCost,
    totalCostFormatted: totals.totalCost ? formatPrice(totals.totalCost) : null,
  };
}

module.exports = {
  userNeedsPayment,
  shouldDisplayPricing,
  calculateCartTotals,
  validateQuantity,
  validateCartQuantities,
  formatPrice,
  getPricingContext,
};
