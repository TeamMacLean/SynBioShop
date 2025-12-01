/**
 * Shopping Cart Controller
 *
 * Handles all shopping cart operations including:
 * - Cart management (view, add, remove items)
 * - Order placement and validation
 * - Payment processing for non-TSL users
 */

const Cart = require("../models/cart");
const CartItem = require("../models/cartItem");
const Order = require("../models/order");
const Email = require("../lib/email");
const Csv = require("../lib/csv");
const Flash = require("../lib/flash");
const config = require("../config");
const pricingService = require("../lib/pricingService");
const budgetHolders = require("../config/budgetHolders");

const ShoppingCartController = {};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Send system error notification to admins
 */
async function notifyAdminsOfError(err, context) {
  const errorEmailRecipients = ["deeks@nbi.ac.uk"];
  const emailBody = `
    An error occurred in the SynBio ordering system:

    Context: ${context}
    Error: ${err.message}

    Stack Trace:
    ${err.stack}
  `;

  try {
    await Email.sendEmail(
      "system-error",
      { emailContent: emailBody },
      {
        to: errorEmailRecipients.join(", "),
        subject: `SynBio Order Error - ${context}`,
      },
    );
    console.log(`System error notification sent for: ${context}`);
  } catch (emailErr) {
    console.error(
      "CRITICAL: Failed to send system error email:",
      emailErr.message,
    );
    console.error("Original error:", err.message);
  }
}

/**
 * Handle cart-related errors with user-friendly messages
 */
function handleCartError(err, res, userMessage = null) {
  console.error("Cart error:", err);
  const message =
    userMessage ||
    "An unexpected error occurred while processing your shopping cart.";
  res.status(500).send(message);
}

/**
 * Populate type information for cart items
 * Also ensures quantity field exists with default of 1
 */
async function populateCartItemTypes(cartItems) {
  const itemPromises = cartItems.map(async (item) => {
    try {
      const type = await item.getType();
      item.type = type;
      // Ensure quantity exists, default to 1 if undefined/null
      if (!item.quantity || item.quantity < 1) {
        item.quantity = 1;
      }
      return item;
    } catch (err) {
      console.error(`Error fetching type for cart item ${item.id}:`, err);
      return null;
    }
  });

  const items = await Promise.all(itemPromises);
  return items.filter((item) => item !== null);
}

// ============================================================================
// CART MANAGEMENT
// ============================================================================

/**
 * Ensure a cart exists for the user
 * Creates one if it doesn't exist, returns existing cart otherwise
 */
ShoppingCartController.ensureCart = (username, joinOptions = {}) => {
  return new Promise((resolve, reject) => {
    Cart.filter({ username })
      .getJoin(joinOptions)
      .then((carts) => {
        if (carts.length === 0) {
          // Create new cart
          return new Cart({ username }).save().then(resolve).catch(reject);
        } else {
          // Return existing cart
          const cart = carts[0];
          if (joinOptions.items && !cart.items) {
            cart.items = [];
          }
          resolve(cart);
        }
      })
      .catch(reject);
  });
};

/**
 * Add an item to the user's cart
 * Checks for duplicates before adding
 */
ShoppingCartController.ensureAddItem = (username, typeID) => {
  return new Promise((resolve, reject) => {
    ShoppingCartController.ensureCart(username)
      .then((cart) => {
        // Check if item already in cart
        cart
          .contains(typeID)
          .then((alreadyInCart) => {
            if (alreadyInCart) {
              return reject({
                type: "warning",
                message: "Item is already in your cart!",
              });
            }

            // Add item to cart with explicit quantity and largeScale
            new CartItem({
              cartID: cart.id,
              typeID,
              quantity: 1,
              largeScale: false,
            })
              .save()
              .then(() => {
                resolve({
                  type: "success",
                  message: "Item added to cart!",
                  cart: cart,
                });
              })
              .catch((err) => {
                console.error("Error saving cart item:", err);
                reject({
                  type: "error",
                  message: "Failed to add item to cart.",
                  originalError: err,
                });
              });
          })
          .catch((err) => {
            console.error("Error checking cart contents:", err);
            reject({
              type: "error",
              message: "Failed to check cart contents.",
              originalError: err,
            });
          });
      })
      .catch((err) => {
        console.error("Error ensuring cart exists:", err);
        reject({
          type: "error",
          message: "Failed to access cart.",
          originalError: err,
        });
      });
  });
};

/**
 * POST /cart/add - Add item to cart
 */
ShoppingCartController.addViaPostRoute = async (req, res) => {
  const { typeID } = req.body;
  const username = req.user.username;

  try {
    if (!typeID || !username) {
      Flash.error(req, "Missing required information.");
      return res.redirect("back");
    }

    await ShoppingCartController.ensureAddItem(username, typeID);
    Flash.success(req, "Item added to cart!");
    return res.redirect("back");
  } catch (err) {
    if (err && err.type && err.message) {
      Flash[err.type](req, err.message);
    } else {
      Flash.error(req, "An unexpected error occurred");
      console.error("Error in add to cart:", err);
    }
    return res.redirect("back");
  }
};

/**
 * GET /cart - View shopping cart
 */
ShoppingCartController.index = async (req, res) => {
  const { user } = req;
  const { username } = user;
  const orderId = req.query.orderId;
  const orderJanCode = req.query.orderJanCode;
  const adminForceShowPricing = req.query.adminForceShowPricing === "true";

  try {
    // Load cart with items
    const cart = await ShoppingCartController.ensureCart(username, {
      items: true,
    });

    if (!cart.items) {
      cart.items = [];
    }

    // Populate type information for each item
    cart.items = await populateCartItemTypes(cart.items);

    // Get pricing context
    const pricingContext = pricingService.getPricingContext(
      user,
      cart.items,
      adminForceShowPricing,
    );

    // Get budget holders for dropdown
    const budgetHoldersList = await budgetHolders.getBudgetHoldersForSelect();

    // Render cart page
    return res.render("cart/index", {
      cart,
      ...pricingContext,
      budgetHolders: budgetHoldersList,
      orderId,
      orderJanCode,
    });
  } catch (err) {
    console.error("Error loading cart:", err);
    return handleCartError(err, res);
  }
};

// ============================================================================
// ORDER PLACEMENT
// ============================================================================

/**
 * Validate order submission data
 */
async function validateOrderData(user, cart, formData) {
  const errors = [];
  const needsPayment = pricingService.userNeedsPayment(user);

  // Check cart not empty
  if (!cart.items || cart.items.length === 0) {
    errors.push("Cart is empty");
    return { valid: false, errors };
  }

  // Validate quantities
  const quantityValidation = pricingService.validateCartQuantities(cart.items);
  if (!quantityValidation.valid) {
    errors.push(...quantityValidation.errors);
  }

  // Validate payment information if required
  if (needsPayment) {
    if (!formData.costCode || formData.costCode.trim() === "") {
      errors.push("Cost centre is required");
    }

    if (!formData.signatory || formData.signatory.trim() === "") {
      errors.push("Budget holder selection is required");
    } else {
      const isValid = await budgetHolders.isValidBudgetHolder(
        formData.signatory,
      );
      if (!isValid) {
        errors.push("Invalid budget holder selected");
      }
    }
  } else if (formData.signatory) {
    // If signatory is provided (e.g., adminForcePricing), validate it
    const isValid = await budgetHolders.isValidBudgetHolder(formData.signatory);
    if (!isValid) {
      errors.push("Invalid budget holder selected");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate order totals server-side for security
 */
async function calculateOrderTotals(cart, needsPayment) {
  const totals = pricingService.calculateCartTotals(cart.items, needsPayment);

  // Validate we have valid totals
  if (!totals.totalQuantity || (needsPayment && totals.totalCost === 0)) {
    throw new Error("Invalid order totals calculated");
  }

  return totals;
}

/**
 * Create order in database
 */
async function createOrder(user, cart, formData, totals) {
  const needsPayment = pricingService.userNeedsPayment(user);

  const orderData = {
    username: user.username,
    costCode: needsPayment ? formData.costCode : null,
    // Save signatory if provided (includes adminForcePricing scenarios)
    signatory: formData.signatory || null,
    totalQuantity: String(totals.totalQuantity),
    totalCost: totals.totalCost !== null ? String(totals.totalCost) : null,
    pricePerUnit: config.pricePerUnit,
  };

  const newOrder = new Order(orderData);
  return await newOrder.save();
}

/**
 * Associate cart items with the order
 */
async function associateItemsWithOrder(cart, orderId) {
  const updatePromises = cart.items.map(async (item) => {
    item.orderID = orderId;
    return item.save();
  });

  await Promise.all(updatePromises);
}

/**
 * Send order confirmations (CSV and email)
 * These are fire-and-forget operations that log errors but don't block order completion
 */
function sendOrderConfirmations(order, user) {
  const orderData = Object.assign({}, order, {
    items: order.items || [],
    user: user,
    baseURL: config.baseURL,
  });

  // Generate CSV (async, errors logged)
  Csv.newOrder(orderData).catch((err) => {
    console.error("CSV generation error:", err);
    notifyAdminsOfError(err, `CSV Generation Failed - Order ${order.id}`);
  });

  // Send customer email (async, errors logged)
  Email.newOrder(orderData).catch((err) => {
    console.error("Customer email error:", err);
    notifyAdminsOfError(err, `Customer Email Failed - Order ${order.id}`);
  });
}

/**
 * POST /cart/order - Place order
 */
ShoppingCartController.placeOrder = async (req, res) => {
  const { user } = req;
  const { username } = user;
  const formData = {
    costCode: req.body.costCode,
    signatory: req.body.signatory,
    totalQuantity: req.body.totalQuantity,
    totalCost: req.body.totalCost,
  };

  try {
    // Step 1: Load cart with items
    const cart = await ShoppingCartController.ensureCart(username, {
      items: true,
    });

    // Step 2: Validate order data
    const validation = await validateOrderData(user, cart, formData);
    if (!validation.valid) {
      Flash.warning(req, validation.errors.join(". "));
      return redirectToCart(res);
    }

    // Step 3: Populate item types
    cart.items = await populateCartItemTypes(cart.items);

    // Step 4: Calculate totals server-side (security)
    const needsPayment = pricingService.userNeedsPayment(user);
    const totals = await calculateOrderTotals(cart, needsPayment);

    // Step 5: Create order
    const savedOrder = await createOrder(user, cart, formData, totals);
    console.log("Order created successfully:", savedOrder.id);

    // Step 6: Associate items with order
    await associateItemsWithOrder(cart, savedOrder.id);

    // Step 7: Attach items to order for emails/CSV
    savedOrder.items = cart.items;

    // Step 8: Send confirmations (async, fire-and-forget)
    sendOrderConfirmations(savedOrder, user);

    // Step 9: Empty cart
    await cart.empty();

    // Step 10: Redirect to cart with success message
    req.session.reload((err) => {
      if (err) {
        console.error("Session reload error:", err);
      }
      return redirectToCart(res, {
        orderId: savedOrder.id,
        orderJanCode: savedOrder.janCode,
      });
    });
  } catch (err) {
    console.error("Order placement error:", err);

    // Determine user-friendly error message
    let userMessage =
      "An unexpected error occurred. Your order could not be placed.";
    if (err.message.includes("Invalid order totals")) {
      userMessage = "Unable to calculate order totals. Please try again.";
    } else if (err.message.includes("not found")) {
      userMessage =
        "An item in your cart was not found. Please review your cart.";
    }

    Flash.error(req, userMessage);
    await notifyAdminsOfError(
      err,
      `Order Placement Failed - User: ${username}`,
    );

    req.session.reload((reloadErr) => {
      if (reloadErr) {
        console.error("Session reload error after failure:", reloadErr);
      }
      return redirectToCart(res);
    });
  }
};

/**
 * Helper to redirect to cart with proper cache headers
 */
function redirectToCart(res, queryParams = {}) {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  const queryString = Object.keys(queryParams)
    .map((key) => `${key}=${encodeURIComponent(queryParams[key])}`)
    .join("&");

  const url = queryString ? `/cart?${queryString}` : "/cart";
  return res.redirect(url);
}

module.exports = ShoppingCartController;
