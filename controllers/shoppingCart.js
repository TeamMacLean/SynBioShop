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
const thinky = require("../lib/thinky");
const security = require("../lib/security");

const ShoppingCartController = {};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Send system error notification to admins
 */
async function notifyAdminsOfError(err, context) {
  // Derived from config rather than hardcoded, so error mail follows the
  // configured admin list instead of one person's address.
  const errorEmailRecipients = (config.emailAdmins || []).map(
    (username) => username + config.email.emailDomain,
  );
  if (errorEmailRecipients.length === 0) {
    console.error(`No emailAdmins configured; cannot report: ${context}`);
    return;
  }
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
  if (!Array.isArray(cartItems)) return [];

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
 * Collapses duplicate carts for a user onto the oldest one.
 *
 * `ensureCart` reads then writes, and RethinkDB has no unique secondary index,
 * so two concurrent requests for a first-time user — a page load racing a
 * socket `addToCart`, which is easy to trigger — both saw zero carts and both
 * inserted. The result was a user with two carts: the header badge requires
 * exactly one and silently reported 0 items forever, while items landed in
 * whichever cart the query returned first.
 *
 * Rather than trying to make the insert atomic, this converges: whoever
 * notices the duplicates merges them. Concurrent mergers pick the same
 * survivor (lowest id), so the operation is idempotent.
 *
 * @param {Array} carts - Every cart found for the user, length > 1.
 * @returns {Promise<object>} The surviving cart.
 */
async function mergeDuplicateCarts(carts) {
  const ordered = [...carts].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const survivor = ordered[0];
  const doomed = ordered.slice(1);
  const doomedIDs = doomed.map((c) => c.id);

  console.warn(
    `Merging ${doomed.length} duplicate cart(s) for "${survivor.username}" into ${survivor.id}`,
  );

  await thinky.r
    .table("CartItem")
    .filter((item) => thinky.r.expr(doomedIDs).contains(item("cartID")))
    .update({ cartID: survivor.id })
    .run();

  await thinky.r
    .table("Cart")
    .getAll(...doomedIDs)
    .delete()
    .run();

  // A still-in-flight request can insert into a doomed cart between the move
  // above and this delete, which would strand the row against a cart that no
  // longer exists — invisible in the UI and impossible to clear. Sweep again
  // now that the carts are gone.
  await thinky.r
    .table("CartItem")
    .filter((item) => thinky.r.expr(doomedIDs).contains(item("cartID")))
    .update({ cartID: survivor.id })
    .run();

  // Each racing cart may have held its own copy of the same type.
  await dedupeCartItems(survivor.id);

  return survivor;
}

/**
 * Ensure a cart exists for the user
 * Creates one if it doesn't exist, returns existing cart otherwise
 */
ShoppingCartController.ensureCart = async (username, joinOptions = {}) => {
  let carts = await Cart.filter({ username }).getJoin(joinOptions).run();

  if (carts.length === 0) {
    return new Cart({ username }).save();
  }

  if (carts.length > 1) {
    const survivor = await mergeDuplicateCarts(carts);
    // Re-read so the caller sees the merged item list.
    carts = await Cart.filter({ id: survivor.id }).getJoin(joinOptions).run();
  }

  let cart = carts[0];

  // Repair duplicates whenever the items are actually being read.
  //
  // The dedupe in `ensureAddItem` runs per request, so with several adds in
  // flight it is not guaranteed to run last. Checking here — the point where
  // the cart is displayed or checked out — means the user never sees, or is
  // billed for, a duplicate regardless of how the writes interleaved.
  if (joinOptions.items && Array.isArray(cart.items)) {
    const distinctTypes = new Set(cart.items.map((item) => item.typeID));
    if (distinctTypes.size !== cart.items.length) {
      await dedupeCartItems(cart.id);
      const reread = await Cart.filter({ id: cart.id }).getJoin(joinOptions).run();
      cart = reread[0] || cart;
    }
  }

  if (joinOptions.items && !cart.items) {
    cart.items = [];
  }
  return cart;
};

/**
 * Collapses a cart to one row per type.
 *
 * The duplicate check in `ensureAddItem` is check-then-act, so a double-click
 * (or the POST route firing alongside the socket handler) could insert the same
 * type twice. calculateCartTotals then counts it twice, so the customer is
 * billed for an item they added once. Duplicates also appear after two racing
 * carts are merged, since each held its own copy.
 *
 * Deterministic survivor selection (lowest id per type) means concurrent
 * callers converge instead of deleting each other's rows.
 *
 * @param {string} cartID
 * @returns {Promise<number>} How many rows were removed.
 */
async function dedupeCartItems(cartID) {
  const rows = await thinky.r.table("CartItem").filter({ cartID }).run();

  const byType = new Map();
  for (const row of rows) {
    const existing = byType.get(row.typeID);
    if (!existing || String(row.id) < String(existing.id)) {
      byType.set(row.typeID, row);
    }
  }

  const survivors = new Set([...byType.values()].map((row) => row.id));
  const doomed = rows.filter((row) => !survivors.has(row.id)).map((row) => row.id);

  if (doomed.length === 0) return 0;

  console.warn(`Removing ${doomed.length} duplicate item(s) from cart ${cartID}`);
  await thinky.r
    .table("CartItem")
    .getAll(...doomed)
    .delete()
    .run();

  return doomed.length;
}

/**
 * Add an item to the user's cart
 * Checks for duplicates before adding
 */
ShoppingCartController.ensureAddItem = async (username, typeID) => {
  let cart;
  try {
    cart = await ShoppingCartController.ensureCart(username);
  } catch (err) {
    console.error("Error ensuring cart exists:", err);
    throw { type: "error", message: "Failed to access cart.", originalError: err };
  }

  let alreadyInCart;
  try {
    alreadyInCart = await cart.contains(typeID);
  } catch (err) {
    console.error("Error checking cart contents:", err);
    throw {
      type: "error",
      message: "Failed to check cart contents.",
      originalError: err,
    };
  }

  if (alreadyInCart) {
    throw { type: "warning", message: "Item is already in your cart!" };
  }

  try {
    await new CartItem({
      cartID: cart.id,
      typeID,
      quantity: 1,
      largeScale: false,
    }).save();

    // Closes the check-then-act window above.
    await dedupeCartItems(cart.id);
  } catch (err) {
    console.error("Error saving cart item:", err);
    throw {
      type: "error",
      message: "Failed to add item to cart.",
      originalError: err,
    };
  }

  return { type: "success", message: "Item added to cart!", cart };
};

/**
 * POST /cart/add - Add item to cart
 */
ShoppingCartController.addViaPostRoute = async (req, res) => {
  const { typeID } = req.body;
  const username = req.user.username;

  // The Referrer header is attacker-controlled. safeRedirectTarget collapses
  // it to a same-site path and falls back to "/" for anything else, so a form
  // posted from another origin cannot bounce the user off-site.
  const back = security.safeRedirectTarget(req, "/");

  try {
    if (!typeID || typeof typeID !== "string" || !username) {
      Flash.error(
        req,
        "We couldn't add this item. Some information is missing.",
      );
      return res.redirect(back);
    }

    await ShoppingCartController.ensureAddItem(username, typeID);
    Flash.success(req, "Item added to cart!");
    return res.redirect(back);
  } catch (err) {
    if (err && err.type && err.message && typeof Flash[err.type] === "function") {
      Flash[err.type](req, err.message);
    } else {
      Flash.error(req, "An unexpected error occurred. Please try again.");
      console.error("Error in add to cart:", err);
    }
    return res.redirect(back);
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
    const costCode = (formData.costCode || "").trim();

    if (costCode === "") {
      errors.push("Cost centre is required");
    } else if (costCode.length < 3 || costCode.length > 20) {
      // The Order schema declares min(3).max(20), but this ORM does not
      // enforce schema constraints on write, so a one-character cost code went
      // straight into the finance export. Checked explicitly here instead.
      errors.push("Cost centre must be between 3 and 20 characters");
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
 * Moves the given items out of the cart and onto the order, atomically.
 *
 * Stamping orderID and clearing cartID in one update means there is no window
 * where an item belongs to both, or to neither.
 *
 * @param {string[]} itemIds - The exact items being ordered.
 * @param {string} orderId
 */
async function claimItemsForOrder(itemIds, orderId) {
  if (!itemIds || itemIds.length === 0) return;

  await thinky.r
    .table("CartItem")
    .getAll(...itemIds)
    .update({ orderID: orderId, cartID: "" })
    .run();
}

/**
 * Deletes cart rows whose type no longer resolves.
 *
 * Without this a single dangling reference makes the cart permanently
 * un-orderable, and the offending row is invisible in the UI because the cart
 * page filters it out too.
 */
async function removeOrphanedItems(cart, username) {
  const live = await thinky.r.table("CartItem").filter({ cartID: cart.id }).run();

  const orphanIds = [];
  for (const row of live) {
    const stillValid = cart.items.some((item) => item.id === row.id);
    if (!stillValid) orphanIds.push(row.id);
  }

  if (orphanIds.length === 0) return;

  console.warn(
    `Removing ${orphanIds.length} orphaned cart item(s) for ${username}:`,
    orphanIds,
  );
  await thinky.r
    .table("CartItem")
    .getAll(...orphanIds)
    .delete()
    .run();
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

  // Send customer email (async, errors logged).
  // `user` is passed explicitly: the second argument was previously omitted,
  // so templateData.user was undefined and the template only rendered a name
  // because it fell back through order.user and order.username.
  Email.newOrder(orderData, user).catch((err) => {
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

    // A cart with no items joins as undefined rather than [].
    if (!cart.items) cart.items = [];

    // Step 2: Resolve item types BEFORE validating.
    //
    // populateCartItemTypes silently drops items whose type no longer exists.
    // Running it after validation meant a cart holding only a deleted item
    // passed the "not empty" check, then produced an empty item list and threw
    // "Invalid order totals" on every attempt — permanently, with no way for
    // the user to see or clear the offending row.
    const rawItemCount = (cart.items || []).length;
    cart.items = await populateCartItemTypes(cart.items);
    const droppedCount = rawItemCount - cart.items.length;

    if (droppedCount > 0) {
      // Remove the orphans so the cart cannot get stuck in this state again.
      await removeOrphanedItems(cart, username);
      Flash.warning(
        req,
        `${droppedCount} item${droppedCount === 1 ? " was" : "s were"} removed from ` +
          `your cart because ${droppedCount === 1 ? "it is" : "they are"} no longer available. ` +
          `Please review your cart and try again.`,
      );
      return redirectToCart(res);
    }

    // Step 3: Validate order data
    const validation = await validateOrderData(user, cart, formData);
    if (!validation.valid) {
      Flash.warning(req, validation.errors.join(". "));
      return redirectToCart(res);
    }

    // Capture the exact items being ordered. Anything the user adds from
    // another tab after this point stays in the cart rather than being
    // silently detached without ever appearing on an order.
    const orderedItemIds = cart.items.map((item) => item.id);

    // Step 4: Calculate totals server-side (security)
    const needsPayment = pricingService.userNeedsPayment(user);
    const totals = await calculateOrderTotals(cart, needsPayment);

    // Step 5: Create order
    const savedOrder = await createOrder(user, cart, formData, totals);
    console.log("Order created successfully:", savedOrder.id);

    // Step 6: Claim the items for this order and clear them from the cart in a
    // single write. Previously these were two steps with the confirmation
    // emails in between: if the second failed, the items stayed in the cart
    // and a second checkout re-pointed their orderID, leaving the first order
    // with no items at all.
    await claimItemsForOrder(orderedItemIds, savedOrder.id);

    // Step 7: Attach items to order for emails/CSV
    savedOrder.items = cart.items;

    // Step 8: Send confirmations (async, fire-and-forget)
    sendOrderConfirmations(savedOrder, user);

    // Step 9: Redirect to cart with success message
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

    // Not every rejection here is an Error: models/type/index.js rejects with a
    // bare string and ensureAddItem with a plain object, so reading err.message
    // directly threw a TypeError from inside this catch block — which escaped
    // the handler entirely and hung the request.
    const errMessage =
      (err && err.message) || (typeof err === "string" ? err : String(err));

    let userMessage =
      "An unexpected error occurred. Your order could not be placed.";
    if (errMessage.includes("Invalid order totals")) {
      userMessage = "Unable to calculate order totals. Please try again.";
    } else if (errMessage.includes("not found")) {
      userMessage =
        "An item in your cart was not found. Please review your cart.";
    }

    Flash.error(req, userMessage);
    await notifyAdminsOfError(
      err instanceof Error ? err : new Error(errMessage),
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
