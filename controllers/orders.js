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
 * Optimized with pagination and separate queries for open/closed orders.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.showAll = async (req, res) => {
  const { username } = req.user;
  const isAdmin = Util.isAdmin(username);

  // Pagination parameters
  const perPage = 50; // Limit to 50 orders per page
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  try {
    // Build filter conditions using raw ReQL for better control
    const buildOpenFilter = (order) => {
      let condition = thinky.r.and(
        order("complete").eq(false),
        order("cancelled").eq(false),
      );
      if (!isAdmin) {
        condition = thinky.r.and(condition, order("username").eq(username));
      }
      return condition;
    };

    const buildClosedFilter = (order) => {
      let condition = thinky.r.or(
        order("complete").eq(true),
        order("cancelled").eq(true),
      );
      if (!isAdmin) {
        condition = thinky.r.and(condition, order("username").eq(username));
      }
      return condition;
    };

    // Use raw ReQL queries for full control
    const openOrdersRaw = await thinky.r
      .table("Order")
      .filter(buildOpenFilter)
      .orderBy(thinky.r.desc("createdAt"))
      .limit(perPage)
      .run();

    const closedOrdersRaw = await thinky.r
      .table("Order")
      .filter(buildClosedFilter)
      .orderBy(thinky.r.desc("createdAt"))
      .slice((page - 1) * perPage, page * perPage)
      .run();

    // Convert to model instances and fetch joined data
    const [openOrders, closedOrders] = await Promise.all([
      Promise.all(
        openOrdersRaw.map(async (orderData) => {
          const order = new Order(orderData);
          // Manually fetch items
          const items = await thinky.r
            .table("CartItem")
            .filter({ orderID: order.id })
            .run();
          order.items = items;
          return order;
        }),
      ),
      Promise.all(
        closedOrdersRaw.map(async (orderData) => {
          const order = new Order(orderData);
          // Manually fetch items
          const items = await thinky.r
            .table("CartItem")
            .filter({ orderID: order.id })
            .run();
          order.items = items;
          return order;
        }),
      ),
    ]);

    // Count total closed orders for pagination
    const closedCountQuery = Order.filter((order) => {
      let condition = thinky.r.or(
        order("complete").eq(true),
        order("cancelled").eq(true),
      );
      if (!isAdmin) {
        condition = thinky.r.and(condition, order("username").eq(username));
      }
      return condition;
    });

    const closedCount = await closedCountQuery.count().execute();

    const sortedOrders = {
      open: openOrders,
      closed: closedOrders,
    };

    res.render("orders/all", {
      orders: sortedOrders,
      page,
      perPage,
      closedCount,
      totalPages: Math.ceil(closedCount / perPage),
    });
  } catch (err) {
    handleError(err, res);
  }
};

// --- Helper Functions for EJS (Moved here from EJS for server-side access) ---
function formatJsDateForEJS(dateStr) {
  if (!dateStr) return "N/A";
  var d = new Date(dateStr);
  var day = d.getDate();
  var monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  var month = monthNames[d.getMonth()];
  var year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatJsTotalCostForEJS(cost) {
  // Ensure cost is a number, default to 0, and format to 2 decimal places
  return Number(cost || 0).toFixed(2);
}
// --- END Helper Functions ---

ordersController.simonSummary = async (req, res) => {
  const perPage = 50;
  let page = parseInt(req.query.page, 10) || 1;
  page = Math.max(1, page);

  try {
    const paginatedOrders = await Order.orderBy(thinky.r.desc("createdAt"))
      .slice((page - 1) * perPage, page * perPage)
      .getJoin({ items: true })
      .run();

    const processedOrders = await Promise.all(
      paginatedOrders.map(async (order) => {
        try {
          const orderWithTypes = await order.getTypes();
          try {
            // Node v12 compatible checks (replaces user?.name)
            const users = await ldap.getNameFromUsername(order.username);
            orderWithTypes.fullName =
              users && users.length > 0 && users[0].name
                ? users[0].name
                : order.username;
          } catch (ldapErr) {
            console.warn(
              "LDAP lookup failed for " + order.username + ":",
              ldapErr.message,
            ); // Node v12 concat
            orderWithTypes.fullName = order.username;
          }
          return orderWithTypes;
        } catch (typeErr) {
          console.error(
            "Failed to get types for order " + order.id + ":",
            typeErr,
          ); // Node v12 concat
          return null;
        }
      }),
    );

    const validOrders = processedOrders.filter((order) => order !== null);
    const totalCount = await Order.count().execute();

    res.render("orders/summary", {
      orders: validOrders,
      count: totalCount,
      page: page,
      perPage: perPage,
      // --- NEW: Pass helper functions to EJS locals ---
      formatDate: formatJsDateForEJS,
      formatTotalCost: formatJsTotalCostForEJS,
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
    return res
      .status(400)
      .json({ error: "Please provide both start and end dates." });
  }

  try {
    const startDate = new Date(startParam);
    const endDate = new Date(endParam);
    endDate.setHours(23, 59, 59, 999);

    const orders = await Order.between(startDate, endDate, {
      index: "createdAt",
      leftBound: "closed",
      rightBound: "closed",
    })
      .orderBy({ index: "createdAt" })
      .filter(
        (
          orderItem, // Changed 'order' to 'orderItem' to avoid conflict with Order model name.
        ) =>
          orderItem("costCode")
            .ne(null)
            .and(orderItem("totalCost").ne(null))
            .and(orderItem("totalCost").ne(""))
            .and(orderItem("cancelled").eq(false)), // <<< NEW: Filter out cancelled orders >>>
      )
      .getJoin({ items: true })
      .run();

    const ordersWithTypes = await Promise.all(
      orders.map((order) => order.getTypes()),
    );

    res.json(ordersWithTypes);
  } catch (err) {
    console.error("Error in exportOrders middleware:", err);
    res.status(500).json({ error: "Internal server error" });
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
    itemsByUser[username][itemName] =
      (itemsByUser[username][itemName] || 0) + 1;
  };

  try {
    const orders = await Order.getJoin({ items: true }).run();
    const typeFetchPromises = [];

    for (const order of orders) {
      for (const item of order.items) {
        // Fetch type for each item to get its name
        typeFetchPromises.push(
          item
            .getType()
            .then((type) => ({ username: order.username, itemName: type.name }))
            .catch((err) => {
              console.warn(
                `Could not get type for item ${item.id} in order ${order.id}:`,
                err.message,
              );
              return null; // Return null if type fetching fails
            }),
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
    order.costCode = null; // Ensure 'costCode' is null if cancelled
    order.totalCost = null; // Ensure 'totalCost' is null if cancelled
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
