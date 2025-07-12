const renderError = require("../lib/renderError");
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
        'deeks@nbi.ac.uk',
        'youlesm@nbi.ac.uk'
    ];
    const emailBody = `An error occurred in the SynBio ordering system:\n\nSubject: ${subject}\n\nError: ${err.message}\n\nStack Trace:\n${err.stack}`;

    try {
        // Assuming Email.send takes subject, body, and recipients
        await Email.send(subject, emailBody, errorEmailRecipients);
        console.log(`Sent system error email to ${errorEmailRecipients.join(', ')}`);
    } catch (emailErr) {
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

ShoppingCartController.ensureAddItem = (username, typeID) =>
  new Promise((resolve, reject) => {
    ShoppingCartController.ensureCart(username)
      .then((cart) => {
        new CartItem({ cartID: cart.id, typeID })
          .save()
          .then(() => resolve(cart))
          .catch(reject);
      })
      .catch(reject);
  });

ShoppingCartController.index = (req, res) => {
  const { user } = req;
  const { username } = user;

  ShoppingCartController.ensureCart(username, { items: true })
    .then(async (cart) => {
      if (!cart.items) {
        cart.items = [];
      }

      const itemsWithTypes = await Promise.all(
        cart.items.map(async (item) => {
          try {
            const type = await item.getType();
            item.type = type;
            return item;
          } catch (err) {
            console.error(`Error fetching type for item ${item.id}:`, err);
            return null;
          }
        })
      );

      cart.items = itemsWithTypes.filter(item => item !== null);

      const isAdmin = config.admins.includes(username);
      const isTSLUser = user.company === 'TSL';
      const queryAdminForceShowPricing = req && req.query && req.query.adminForceShowPricing ? true : false;
      const displayPricing = !isTSLUser || queryAdminForceShowPricing ; 

      //console.log('queryAdminForceShowPricing', queryAdminForceShowPricing, 'displayPricing', displayPricing)

      res.render('cart/index', {
        cart,
        pricePerUnit: basePricePerUnit,
        isAdmin,
        displayPricing,
        adminForceShowPricing: queryAdminForceShowPricing,
      });
    })
    .catch(err => handleCartError(err, res));
};

ShoppingCartController.placeOrder = async (req, res) => {
  const { user } = req;
  const { username } = user;
  const { costCode, signatory, totalQuantity: reqTotalQuantity, totalCost: reqTotalCost } = req.body;

  let totalQuantity = parseInt(reqTotalQuantity);
  let totalCost = parseFloat(reqTotalCost); // Will be null if not applicable or not provided

  try {
    const cart = await ShoppingCartController.ensureCart(username, { items: true });

    if (!cart.items || cart.items.length === 0) {
      Flash.warning(req, 'Your shopping cart is empty. No order placed.');
      return res.redirect("/cart");
    }

    const isAdmin = config.admins.includes(username);
    const isTSLUser = user.company === 'TSL';
    const needsPayment = !isTSLUser && !isAdmin;

    // --- Enhanced Validation ---
    // 1. Check for essential details if payment is required
    if (needsPayment) {
        if (!costCode || costCode.trim() === "") {
            Flash.warning(req, 'A cost centre is required for non-TSL orders.');
            return res.redirect('/cart');
        }
        // The signatory check is handled by the `required` attribute in EJS now,
        // but a server-side check can be added if needed:
        // if (!signatory || signatory.trim() === "") { ... }
    }

    // 2. Validate quantities and recalculate totals server-side
    let calculatedQuantity = 0;
    let calculatedCost = 0;
    const itemSavePromises = [];
    const fetchedItems = []; // To hold items with type info for CSV/Email

    for (const item of cart.items) {
        const quantity = parseInt(item.quantity) || 1;
        if (isNaN(quantity) || quantity < 1) {
            // This error should be caught by EJS client-side validation first
            await sendSystemErrorEmail(new Error(`Invalid item quantity found for user ${username}: Item ${item.id}, Quantity ${item.quantity}`), 'SynBio Order - Invalid Quantity');
            Flash.error(req, 'System error: Invalid item quantity detected. Your order could not be placed.');
            return res.redirect('/cart');
        }
        calculatedQuantity += quantity;

        if (needsPayment) {
            // Use basePricePerUnit for calculation
            calculatedCost += quantity * basePricePerUnit;
        }

        // Prepare item for saving with orderID and fetch type info for later use
        item.orderID = null; // To be set after order is saved
        const itemWithTypePromise = item.getType()
            .then(type => {
                item.type = type; // Attach type info
                fetchedItems.push(item); // Store item with type info
                return item.save(); // Prepare for saving with orderID
            });
        itemSavePromises.push(itemWithTypePromise);
    }

    // Final check on calculated totals
    if (!calculatedQuantity || (needsPayment && calculatedCost === 0)) {
        // This state indicates no items or an issue with calculation, leading to an "empty" order
        await sendSystemErrorEmail(new Error(`Calculated zero quantity or cost for user ${username}. Potential cart issue.`), 'SynBio Order - Zero Total Calculation');
        Flash.error(req, 'System error: Could not calculate order details. Your order could not be placed.');
        return res.redirect('/cart');
    }

    // Use calculated values if provided values are missing/invalid (especially for quantity/cost)
    totalQuantity = parseInt(reqTotalQuantity) || calculatedQuantity;
    if (needsPayment) {
        totalCost = parseFloat(reqTotalCost) || calculatedCost;
        // If reqTotalCost was provided but NaN, fall back to calculatedCost
        if (isNaN(totalCost)) totalCost = calculatedCost;
    } else {
        totalCost = null; // Explicitly null for TSL users/admins if not paying
    }

    // Final server-side check on totals before order creation
    if (!totalQuantity || (needsPayment && isNaN(totalCost))) {
        await sendSystemErrorEmail(new Error(`Final order totals invalid after calculation for user ${username}. Quantity: ${totalQuantity}, Cost: ${totalCost}`), 'SynBio Order - Final Total Invalid');
        Flash.error(req, 'System error: Invalid order totals. Your order could not be placed.');
        return res.redirect('/cart');
    }

    // Consent checks (ensure they are present and checked)
    const costConsentGiven = req.body['cost-consent'] === 'on' || req.body['cost-consent'] === true;
    const nonCommercialConsentGiven = req.body['non-commerical-consent'] === 'on' || req.body['non-commerical-consent'] === true;

    if (needsPayment && !costConsentGiven) {
        Flash.warning(req, 'You must confirm you have authority to spend.');
        return res.redirect('/cart');
    }
    if (!nonCommercialConsentGiven) {
        Flash.warning(req, 'You must confirm the materials will be used for non-commercial purposes only.');
        return res.redirect('/cart');
    }

    // --- Create Order ---
    const newOrder = new Order({
      username,
      costCode: needsPayment ? costCode : null, // Only assign costCode if payment is needed
      signatory: needsPayment ? signatory : null, // Only assign signatory if payment is needed
      totalQuantity,
      totalCost,
      pricePerUnit: basePricePerUnit,
      // orderDate: new Date() // You might want to add this
    });

    const savedOrder = await newOrder.save();

    // Associate CartItems with the new Order
    await Promise.all(cart.items.map(item => {
      item.orderID = savedOrder.id;
      return item.save();
    }));

    // --- Processing for Email/CSV ---
    // Use the fetchedItems which already have type data
    const orderDetailsForProcessing = {
        ...savedOrder,
        items: fetchedItems,
        user: user
    };

    // Attempt to send emails and generate CSV
    try {
        // Fire-and-forget for CSV generation
        Csv.newOrder(orderDetailsForProcessing)
          .catch(err => {
            console.error("CSV Generation Error:", err);
            sendSystemErrorEmail(err, `SynBio Order - CSV Gen Failed (Order ID: ${savedOrder.id})`);
          });

        // Fire-and-forget for customer confirmation email
        Email.newOrder(orderDetailsForProcessing)
          .catch(err => {
            console.error("Customer Email Error:", err);
            sendSystemErrorEmail(err, `SynBio Order - Customer Email Failed (Order ID: ${savedOrder.id})`);
          });

    } catch (processingErr) {
        // This catch block might not be hit if promises are handled individually,
        // but it's a safeguard.
        console.error("Error during email/CSV processing:", processingErr);
        sendSystemErrorEmail(processingErr, `SynBio Order - Processing Pipeline Error (Order ID: ${savedOrder.id})`);
    }

    // Empty the cart
    await cart.empty();

    Flash.success(req, "Order successfully placed.");
    res.redirect("/cart");

  } catch (err) {
    // Catch any unexpected errors during the whole process
    console.error('Caught error in placeOrder:', err);
    await sendSystemErrorEmail(err, `SynBio Order - Uncaught Exception (User: ${username})`);
    Flash.error(req, 'An unexpected system error occurred. Your order could not be placed. Please try again or contact support.');
    res.redirect('/cart');
  }
};

module.exports = ShoppingCartController;