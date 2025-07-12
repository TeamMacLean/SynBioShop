const Cart = require("../models/cart");
const CartItem = require("../models/cartItem");
const Order = require("../models/order");
const Email = require("../lib/email");
const Csv = require("../lib/csv");
const Flash = require("../lib/flash");
const config = require("../config.json");

const basePricePerUnit = config.pricePerUnit;

const ShoppingCartController = {};

function handleCartError(err, res) {
  console.error('Error processing cart:', err);
  res.status(500).send('An unexpected error occurred while processing your shopping cart.');
}

async function sendSystemErrorEmail(err, subject) {
    const errorEmailRecipients = [
        'deeks@nbi.ac.uk'
        // 'youlesm@nbi.ac.uk'
    ];
    const emailBody = `An error occurred in the SynBio ordering system:\n\nSubject: ${subject}\n\nError: ${err.message}\n\nStack Trace:\n${err.stack}`;

    try {
        // --- CRITICAL FIX: Call Email.sendEmail, not Email.send ---
        await Email.sendEmail(
            'system-error', // Use a generic template name, or just null if your sendEmail takes raw HTML
            { emailContent: emailBody }, // Template data for the email content
            { to: errorEmailRecipients.join(', '), subject: subject } // Mail options
        );
        console.log(`Sent system error email to ${errorEmailRecipients.join(', ')}`);
    } catch (emailErr) {
        // --- CRITICAL FIX: Add specific error logging for the failure to send system email ---
        console.error(`FATAL: Failed to send system error email: ${emailErr.message}`);
        console.error(`Original error that triggered this: ${err.message}`);
    }
}


ShoppingCartController.ensureCart = (username, joinOptions = {}) =>
  new Promise((resolve, reject) => {
    Cart.filter({ username })
      .getJoin(joinOptions)
      .then((carts) => {
        if (carts.length === 0) {
          return new Cart({ username }).save()
            .then(resolve)
            .catch(reject);
        } else {
          if (joinOptions.items && !carts[0].items) {
            carts[0].items = [];
          }
          resolve(carts[0]);
        }
      })
      .catch(reject);
  });

/**
 * Handles adding an item to the cart. This function is designed to be called
 * by another controller method (like an Express route handler).
 * It will resolve a promise on success, or reject on error.
 * It also now handles checking if an item is already in the cart.
 *
 * @param {string} username - The username of the user.
 * @param {string} typeID - The ID of the item type to add.
 * @returns {Promise<Cart>} A promise that resolves with the updated cart or rejects on error.
 */
ShoppingCartController.ensureAddItem = (username, typeID) =>
  new Promise((resolve, reject) => {
    // --- Step 1: Ensure cart exists ---
    ShoppingCartController.ensureCart(username)
      .then((cart) => {
        // --- Step 2: Check if item is already in cart ---
        // This requires the Cart model to have a .contains(typeID) method.
        // Assuming it resolves with true/false.
        cart.contains(typeID)
          .then((alreadyInCart) => {
            if (alreadyInCart) {
              // If already in cart, reject the promise with a specific message
              // The calling Express route handler will catch this and use Flash/redirect.
              console.log('Item ' + typeID + ' is already in cart for user ' + username);
              // Reject with an object that contains a message, for better error handling in caller
              return reject({ type: 'warning', message: 'Item is already in your cart!' });
            } else {
              // --- Step 3: Add the item if not already in cart ---
              new CartItem({ cartID: cart.id, typeID })
                .save()
                .then(() => {
                  // Resolve the promise, possibly passing the cart itself or a success object.
                  // The calling Express route handler will then use Flash/redirect.
                  console.log('Item ' + typeID + ' successfully added to cart for user ' + username);
                  return resolve({ type: 'success', message: 'Item added to cart!', cart: cart });
                })
                .catch((err) => {
                  // Reject if saving the CartItem fails
                  console.error('Error saving new CartItem:', err);
                  return reject({ type: 'error', message: 'Failed to save new cart item.', originalError: err });
                });
            }
          })
          .catch((err) => {
            // Reject if cart.contains check fails
            console.error('Error checking if item is in cart:', err);
            return reject({ type: 'error', message: 'Failed to check existing cart items.', originalError: err });
          });
      })
      .catch((err) => {
        // Reject if ensureCart fails
        console.error('Error ensuring cart exists:', err);
        return reject({ type: 'error', message: 'Failed to ensure cart exists.', originalError: err });
      });
  });

/**
 * Express route handler for POST /cart/add.
 * It uses ShoppingCartController.ensureAddItem to add the item and handles Flash messages/redirects.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ShoppingCartController.addViaPostRoute = async (req, res) => {
    const { typeID } = req.body; // Item ID comes from the hidden input in the form
    const username = req.user.username; // User info from Passport session

    try {
        if (!typeID || !username) {
            Flash.error(req, 'Missing item ID or user information for cart addition.');
            return res.redirect('back'); // Redirect back if data is incomplete
        }

        // Call the Promise-based helper function
        const result = await ShoppingCartController.ensureAddItem(username, typeID);

        Flash.success(req, result.message); // Flash success message
        // Instead of res.redirect('/cart'), redirect back to the previous page
        return res.redirect('back'); // This will reload the current page
    } catch (err) {
        // If the promise rejects, it's an error/warning
        if (err && err.type && err.message) {
            // Use the specific type and message from the rejected object
            Flash[err.type](req, err.message);
        } else {
            // Generic error if rejection object is not well-formed
            Flash.error(req, 'An unexpected error occurred: ' + (err.message || err));
        }
        console.error('Error in POST /cart/add route handler:', err.originalError || err); // Log the original error
        return res.redirect('back'); // Redirect back to the previous page (item details)
    }
};

ShoppingCartController.index = (req, res) => {
  const {user} = req;
  const {username} = user;
  // --- NEW: Retrieve orderId and orderJanCode from query parameters ---
  const orderId = req.query.orderId;
  const orderJanCode = req.query.orderJanCode;

  ShoppingCartController.ensureCart(username, { items: true })
    .then(async (cart) => {
      if (!cart.items) {
        cart.items = [];
      }

      // Populate item.type for rendering
      const itemPromises = cart.items.map(async (item) => {
        try {
          const type = await item.getType();
          item.type = type;
          return item;
        } catch (err) {
          console.error('Error fetching type for cart item ' + item.id + ':', err); // Node v12 string concat
          return null;
        }
      });
      
      const updatedItems = await Promise.all(itemPromises);
      cart.items = updatedItems.filter(item => item !== null); // Filter out any items that failed type lookup

      const isAdmin = config.admins.includes(username);
      const isTSLUser = user.company === 'TSL';
      const displayPricing = !isTSLUser || (req.query.adminForceShowPricing === 'true'); // Check string 'true' for Node v12

      // Render cart/index, passing the orderId and orderJanCode
      return res.render('cart/index', {
        cart,
        pricePerUnit: config.pricePerUnit, // Use base price from config
        isAdmin,
        displayPricing,
        adminForceShowPricing: req.query.adminForceShowPricing === 'true',
        // --- NEW: Pass orderId and orderJanCode to EJS ---
        orderId: orderId,
        orderJanCode: orderJanCode
      });
    })
    .catch((err) => handleError(err, res)); // Using handleError from premade controller pattern
};

// In controllers/shoppingCart.js

// ... (existing imports, ensuring Cart, Order, Csv, Email, Flash, config, and sendSystemErrorEmail are available) ...

ShoppingCartController.placeOrder = async (req, res) => {
  const { user } = req;
  const { username } = user;
  const { costCode, signatory, totalQuantity: reqTotalQuantityStr, totalCost: reqTotalCostStr } = req.body;

  console.log('--- Order Placement Request Initiated ---');
  console.log('User:', username);
  console.log('Received Total Quantity String:', reqTotalQuantityStr);
  console.log('Received Total Cost String:', reqTotalCostStr);

  let totalQuantity;
  let totalCost;

  try {
    // Step 1: Ensure cart exists and is populated
    console.log('Step 1: Ensuring cart exists and is loaded...');
    const cart = await ShoppingCartController.ensureCart(username, { items: true });

    if (!cart.items || cart.items.length === 0) {
      console.log('Validation: Cart is empty. Setting Flash warning and redirecting.');
      Flash.warning(req, 'Your shopping cart is empty. No order placed.');
      // Add no-cache headers to the redirect for a fresh /cart page.
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      return res.redirect("/cart");
    }
    console.log('Cart loaded with ' + cart.items.length + ' items. Proceeding to step 2.');

    const isAdmin = config.admins.includes(username);
    const isTSLUser = user.company === 'TSL';
    const needsPayment = !isTSLUser && !isAdmin;

    // Step 2: Validate essential details for payment (if required)
    console.log('Step 2: Checking payment requirements...');
    if (needsPayment) {
        console.log('Validation: Order requires payment. Checking cost code and signatory...');
        if (!costCode || costCode.trim() === "") {
            Flash.warning(req, 'A cost centre is required for non-TSL orders.');
            // Add no-cache headers to the redirect.
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
            return res.redirect('/cart');
        }
        console.log('Cost code valid. Proceeding.');
    } else {
        console.log('Payment not required for this user type (TSL staff/Admin).');
    }
    console.log('Proceeding to step 3.');

    // Step 3: Validate quantities and recalculate totals server-side
    console.log('Step 3: Recalculating totals server-side for security...');
    let calculatedQuantity = 0;
    let calculatedCost = 0;
    const fetchedItems = []; // To hold items with type info for CSV/Email

    const itemProcessingPromises = cart.items.map(async (item) => {
        const quantity = parseInt(item.quantity) || 1;
        
        if (isNaN(quantity) || quantity < 1) {
             console.error('SERVER-SIDE VALIDATION ERROR: Invalid quantity for item ID: ' + item.id + ', Qty: ' + item.quantity);
             await sendSystemErrorEmail(new Error(`Server-side: Invalid quantity for item ${item.id} (User: ${username}, Qty: ${item.quantity})`), 'SynBio Order - Invalid Qty Detected');
             Flash.error(req, 'System error: Invalid item quantity detected. Your order could not be placed. Please check your cart.');
             throw new Error('Invalid item quantity detected during server-side validation.');
        }
        calculatedQuantity += quantity;

        if (needsPayment) {
            calculatedCost += quantity * basePricePerUnit;
        }

        const type = await item.getType(); // Fetch Type concurrently
        item.type = type;
        fetchedItems.push(item);
        return item; // Item with type attached
    });

    await Promise.all(itemProcessingPromises);
    console.log('Server-side item processing complete. Calculated Quantity: ' + calculatedQuantity + ', Calculated Cost: ' + calculatedCost);

    if (!calculatedQuantity || (needsPayment && calculatedCost === 0)) {
        console.error('SERVER-SIDE VALIDATION ERROR: Calculated zero quantity/cost for order. Qty:' + calculatedQuantity + ', Cost:' + calculatedCost);
        await sendSystemErrorEmail(new Error(`Server-side: Zero quantity/cost detected for order (User: ${username})`), 'SynBio Order - Zero Total Calculated');
        Flash.error(req, 'System error: Could not calculate order details. Your order could not be placed.');
        // Add no-cache headers.
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        return res.redirect('/cart');
    }

    // Use calculated values for the order object, overriding/validating client-provided totals
    totalQuantity = calculatedQuantity;
    totalCost = needsPayment ? calculatedCost : null;

    console.log('skip step 4, consent checks');
    // Step 4: Validate consent checks
    // console.log('Step 4: Validating consent checkboxes...');
    // const costConsentGiven = req.body['cost-consent'] === 'on' || req.body['cost-consent'] === true;
    // const nonCommercialConsentGiven = req.body['non-commerical-consent'] === 'on' || req.body['non-commerical-consent'] === true;

    // if (needsPayment && !costConsentGiven) {
    //     Flash.warning(req, 'You must confirm you have authority to spend.');
    //     res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    //     res.set('Pragma', 'no-cache');
    //     res.set('Expires', '0');
    //     return res.redirect('/cart');
    // }
    // if (!nonCommercialConsentGiven) {
    //     Flash.warning(req, 'You must confirm the materials will be used for non-commercial purposes only.');
    //     res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    //     res.set('Pragma', 'no-cache');
    //     res.set('Expires', '0');
    //     return res.redirect('/cart');
    // }
    // console.log('Consent checks passed. Proceeding to step 5.');

    // Step 5: Create the Order in the database
    console.log('Step 5: Creating Order in database with Total Quantity: ' + totalQuantity + ' and Total Cost: ' + totalCost + '...');
    const finalTotalQuantity = totalQuantity !== null ? String(totalQuantity) : null; // Convert to string or keep null
    const finalTotalCost = totalCost !== null ? String(totalCost) : null; // Convert to string or keep null

    const newOrderInstance = new Order({
      username,
      costCode: needsPayment ? costCode : null,
      signatory: needsPayment ? signatory : null,
      totalQuantity: finalTotalQuantity, // <<< Use the converted value <<<
      totalCost: finalTotalCost,         // <<< Use the converted value <<<
      pricePerUnit: basePricePerUnit, // Assuming pricePerUnit can be number or string as needed by model
      // orderDate: new Date() // Add if needed
    });
    const savedOrder = await newOrderInstance.save();
    console.log('Order created successfully with ID:', savedOrder.id + '. Proceeding to step 6.');

        // Step 6: Associate CartItems with the new Order
    console.log('Step 6: Associating ' + cart.items.length + ' cart items with order ID ' + savedOrder.id + '...');
    const updateItemOrderPromises = cart.items.map(async (item) => {
      item.orderID = savedOrder.id;
      return item.save();
    });
    await Promise.all(updateItemOrderPromises);
    console.log('Cart items associated with order. Proceeding to step 7.');

    // Step 7: Process CSV and Email (fire-and-forget, but with error logging)
    console.log('Step 7: Initiating CSV generation and email sending (asynchronously, fire-and-forget)...');
    
    // --- CRITICAL FIX: Explicitly assign 'items' to orderDetailsForProcessing ---
    // The previous `...savedOrder` would not automatically include the items.
    const orderDetailsForProcessing = Object.assign({}, savedOrder, { // Use Object.assign for Node v12 compatibility
        items: fetchedItems // <<< Assign the collected fetchedItems here <<<
    });
    // Add user and baseURL directly to the top-level object for email/CSV template context
    orderDetailsForProcessing.user = user;
    orderDetailsForProcessing.baseURL = config.baseURL;

    Csv.newOrder(orderDetailsForProcessing)
      .catch(err => {
        console.error("CSV Generation Error (fire-and-forget):", err);
        sendSystemErrorEmail(err, `SynBio Order - CSV Gen Failed (Order ID: ${savedOrder.id})`);
      });

    Email.newOrder(orderDetailsForProcessing)
      .catch(err => {
        console.error("Customer Email Error (fire-and-forget):", err);
        sendSystemErrorEmail(err, `SynBio Order - Customer Email Failed (Order ID: ${savedOrder.id})`);
      });

    console.log('CSV/Email processes initiated. Proceeding to step 8.');

    // Step 8: Empty the cart
    console.log('Step 8: Emptying cart in the database...');
    await cart.empty();
    console.log('Cart emptied in database. Finalizing request.');

    // Final Success: Flash message and redirect
    // Flash.success(req, "Order successfully placed."); // Removing general flash success
    console.log('Order successfully placed. Redirecting to /cart with order ID.');
    
    // --- NEW: Redirect to cart with orderId as query parameter ---
    req.session.reload(function(err) {
        if (err) {
            console.error('Error reloading session before final redirect:', err);
        }
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        // Redirect to /cart with the order ID as a query parameter
        return res.redirect("/cart?orderId=" + savedOrder.id + "&orderJanCode=" + savedOrder.janCode); // Pass both ID and janCode
    });

  } catch (err) {
    console.error('--- CAUGHT UNEXPECTED ERROR IN placeOrder HANDLER ---');
    console.error('Error details:', err);

    // Provide a user-friendly error message based on the type of error.
    let userMessage = 'An unexpected system error occurred. Your order could not be placed. Please try again or contact support.';
    if (err && err.message) {
        if (err.message.includes('Item with ID') && err.message.includes('not found')) {
            userMessage = 'An item in your cart was not found. Please review your cart and try again.';
        } else if (err.message.includes('Validation Error')) {
            userMessage = 'Order validation failed. Please check all details and required fields.';
        } else if (err.message.includes('Invalid item quantity detected')) { // Custom error thrown by us
            userMessage = 'System error: Invalid item quantity detected. Your order could not be placed. Please check your cart.';
        } else if (err.message.includes('Could not calculate order details')) { // Custom error thrown by us
            userMessage = 'System error: Could not calculate order details. Your order could not be placed.';
        }
    }

    Flash.error(req, userMessage);
    await sendSystemErrorEmail(err, `SynBio Order - Uncaught Exception (User: ${username})`);

    // Ensure session reload and redirect even on error.
    req.session.reload(function(reloadErr) {
        if (reloadErr) {
            console.error('Error reloading session after error during order placement:', reloadErr);
        }
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        return res.redirect('/cart'); // Redirect to cart page with error
    });

  } finally {
      console.log('--- Order Placement Request Finished (SUCCESS or ERROR) ---');
  }
};

module.exports = ShoppingCartController;