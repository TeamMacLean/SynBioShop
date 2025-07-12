const renderError = require("../lib/renderError");
const Order = require("../models/order");
const Email = require("../lib/email");
const Flash = require("../lib/flash");
const Util = require("../lib/util");
const thinky = require("../lib/thinky");
const ldap = require("../lib/ldap");

const ordersController = {};

// --- Helper Functions ---

/**
 * A consistent way to handle errors in order-related operations.
 * @param {Error} err - The error object.
 * @param {Object} res - The Express response object.
 */
const handleError = (err, res) => {
  console.error("Order processing error:", err);
  // Consider a more specific error message or rendering an error page.
  renderError("An error occurred while processing your request.", res);
};

/**
 * Safely retrieves an order by ID, optionally joining items and types.
 * @param {string} orderID - The ID of the order to retrieve.
 * @param {boolean} withItemsAndTypes - Whether to fetch joined items and their types.
 * @returns {Promise<Order>} A promise resolving with the order object.
 */
const getOrderWithDetails = async (orderID, withItemsAndTypes = false) => {
  let query = Order.get(orderID);
  if (withItemsAndTypes) {
    query = query.getJoin({ items: true });
    // getTypes() should be called after getJoin for efficiency if needed,
    // but here we defer it to where it's used.
  }
  const order = await query;
  if (!order) {
    throw new Error(`Order with ID ${orderID} not found.`);
  }
  return order;
};

// --- Controller Actions ---

/**
 * Renders the details of a specific order.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.show = async (req, res) => {
  const { id: orderID } = req.params;
  try {
    const order = await getOrderWithDetails(orderID, true);
    const orderWithTypes = await order.getTypes(); // Fetch types for display
    res.render("orders/show", { order: orderWithTypes });
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Placeholder for displaying orders belonging to the current user.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.mine = async (req, res) => {
  // Implementation needed: Fetch orders for req.user.username
  // Example:
  // const username = req.user.username;
  // const userOrders = await Order.filter({ username }).getJoin({ items: true }).run();
  // res.render('orders/my_orders', { orders: userOrders });
  handleError(new Error("Not implemented"), res); // Placeholder
};

/**
 * Renders a list of all orders, filtered by user if not an admin.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.showAll = async (req, res) => {
  const { username } = req.user;
  const isAdmin = Util.isAdmin(username); // Assuming Util.isAdmin checks config or user roles

  const filter = isAdmin ? {} : { username };

  try {
    const orders = await Order.filter(filter).getJoin({ items: true }).run();

    const sortedOrders = { open: [], closed: [] };
    for (const order of orders) {
      if (order.complete || order.cancelled) {
        sortedOrders.closed.push(order);
      } else {
        sortedOrders.open.push(order);
      }
    }
    res.render("orders/all", { orders: sortedOrders });
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Renders a paginated summary of orders, including user full names from LDAP.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.simonSummary = async (req, res) => {
  const perPage = 50;
  // Ensure page is a positive integer, defaulting to 1.
  let page = parseInt(req.query.page, 10) || 1;
  page = Math.max(1, page); // Ensure page is at least 1

  try {
    // Fetch orders for the current page, joined with items
    const paginatedOrders = await Order
      .orderBy(thinky.r.desc("createdAt"))
      .slice((page - 1) * perPage, page * perPage)
      .getJoin({ items: true })
      .run();

    // Fetch item types and user full names concurrently
    const processedOrders = await Promise.all(
      paginatedOrders.map(async (order) => {
        try {
          const orderWithTypes = await order.getTypes();
          // Fetch user name from LDAP, falling back to username if LDAP fails
          try {
            const users = await ldap.getNameFromUsername(order.username);
            orderWithTypes.fullName = users.length > 0 ? users[0].name : order.username;
          } catch (ldapErr) {
            console.warn(`LDAP lookup failed for ${order.username}:`, ldapErr.message);
            orderWithTypes.fullName = order.username; // Fallback
          }
          return orderWithTypes;
        } catch (typeErr) {
          console.error(`Failed to get types for order ${order.id}:`, typeErr);
          // Decide how to handle: skip order, render with partial data, etc.
          // For now, return order with partial data or null if critical
          return null; // Or return order, omitting type info
        }
      })
    );

    // Filter out any orders that failed type fetching if necessary
    const validOrders = processedOrders.filter(order => order !== null);

    // Get total count of all orders
    const totalCount = await Order.count().execute();

    res.render("orders/summary", {
      orders: validOrders,
      count: totalCount,
      page: page,
      perPage: perPage,
    });
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Exports orders within a specified date range, filtering for completed orders with cost codes.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
ordersController.exportOrders = async (req, res, next) => {
  const { start: startParam, end: endParam } = req.query;

  if (!startParam || !endParam) {
    return res.status(400).json({ error: 'Please provide both start and end dates.' });
  }

  try {
    const startDate = new Date(startParam);
    const endDate = new Date(endParam);
    endDate.setHours(23, 59, 59, 999); // Include the entire end date

    // Validate dates if needed (e.g., ensure startDate <= endDate)

    const orders = await Order
      .between(startDate, endDate, {
        index: "createdAt",
        leftBound: "closed",
        rightBound: "closed"
      })
      .orderBy({ index: "createdAt" })
      // Filter for orders that are not null/empty in costCode and totalCost
      .filter(order =>
        order("costCode").ne(null)
          .and(order("totalCost").ne(null))
          .and(order("totalCost").ne(""))
      )
      .getJoin({ items: true })
      .run();

    // Fetch types for all retrieved orders concurrently
    const ordersWithTypes = await Promise.all(orders.map(order => order.getTypes()));

    res.json(ordersWithTypes); // Assuming JSON output is desired for export
  } catch (err) {
    console.error('Error in exportOrders:', err);
    res.status(500).json({ error: 'Internal server error during order export.' });
  }
};

/**
 * Analyzes orders to find users who have ordered the same item type multiple times.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.simonRepeatOrders = async (req, res) => {
  const itemsByUser = {}; // Structure: { username: { itemName: count, ... }, ... }

  // Helper to safely add item counts
  const addItemCount = (username, itemName) => {
    if (!itemsByUser[username]) {
      itemsByUser[username] = {};
    }
    itemsByUser[username][itemName] = (itemsByUser[username][itemName] || 0) + 1;
  };

  try {
    const orders = await Order.getJoin({ items: true }).run();
    const typeFetchPromises = [];

    for (const order of orders) {
      for (const item of order.items) {
        // Fetch type for each item to get its name
        typeFetchPromises.push(
          item.getType()
            .then(type => ({ username: order.username, itemName: type.name }))
            .catch(err => {
              console.warn(`Could not get type for item ${item.id} in order ${order.id}:`, err.message);
              return null; // Return null if type fetching fails
            })
        );
      }
    }

    const resolvedTypeData = await Promise.all(typeFetchPromises);

    // Process the fetched type data to populate itemsByUser
    for (const data of resolvedTypeData) {
      if (data && data.username && data.itemName) {
        addItemCount(data.username, data.itemName);
      }
    }

    // Filter out items ordered less than twice per user
    for (const username in itemsByUser) {
      if (Object.hasOwnProperty.call(itemsByUser, username)) {
        const userItems = itemsByUser[username];
        for (const itemName in userItems) {
          if (Object.hasOwnProperty.call(userItems, itemName)) {
            if (userItems[itemName] < 2) {
              delete userItems[itemName]; // Remove item if count is less than 2
            }
          }
        }
        // If a user has no items left after filtering, remove the user entry
        if (Object.keys(userItems).length === 0) {
          delete itemsByUser[username];
        }
      }
    }

    res.json(itemsByUser);
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Marks an order as complete and sends a notification email.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.markAsComplete = async (req, res) => {
  const { id: orderID } = req.params;
  try {
    const order = await getOrderWithDetails(orderID, true); // Fetch with items
    const orderWithTypes = await order.getTypes(); // Fetch types for email

    orderWithTypes.complete = true;
    orderWithTypes.completedAt = Date.now();

    await orderWithTypes.save();
    await Email.orderReady(orderWithTypes); // Send notification email

    Flash.success(req, `Completion email sent to ${orderWithTypes.username}.`);
    res.redirect(`/order/${orderID}`);
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Marks an order as incomplete (removes completion status).
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.markAsIncomplete = async (req, res) => {
  const { id: orderID } = req.params;
  try {
    const order = await Order.get(orderID); // No need for join here
    order.complete = false;
    await order.save();
    Flash.info(req, `Order ${orderID} marked as incomplete.`);
    res.redirect(`/order/${orderID}`);
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Marks an order as cancelled.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.markAsCancelled = async (req, res) => {
  const { id: orderID } = req.params;
  try {
    const order = await Order.get(orderID);
    order.cancelled = true;
    order.complete = false; // Ensure 'complete' is false if cancelled
    await order.save();
    Flash.info(req, `Order ${orderID} marked as cancelled.`);
    res.redirect(`/order/${orderID}`);
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Marks an order as un-cancelled (restores it).
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.markAsUnCancelled = async (req, res) => {
  const { id: orderID } = req.params;
  try {
    const order = await Order.get(orderID);
    order.cancelled = false;
    await order.save();
    Flash.info(req, `Order ${orderID} marked as not cancelled.`);
    res.redirect(`/order/${orderID}`);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = ordersController;