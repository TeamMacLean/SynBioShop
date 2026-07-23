const renderError = require("../lib/renderError");
const Order = require("../models/order");
const Email = require("../lib/email");
const Flash = require("../lib/flash");
const Util = require("../lib/util");
const thinky = require("../lib/thinky");
const ldap = require("../lib/ldap");
const config = require("../config");

const ordersController = {};

// --- Helper Functions ---

/**
 * Helper function to bulk fetch items for a list of orders
 * @param {Array} orders - Array of Order model instances
 * @returns {Array} - Orders with their .items populated
 */
async function attachItemsToOrders(orders) {
  if (!orders || orders.length === 0) return orders;

  const orderIDs = orders.map((o) => o.id);
  const chunkSize = 500;
  let allItems = [];

  for (let i = 0; i < orderIDs.length; i += chunkSize) {
    const chunk = orderIDs.slice(i, i + chunkSize);
    const chunkItems = await thinky.r
      .table("CartItem")
      .filter((item) => thinky.r.expr(chunk).contains(item("orderID")))
      .run();
    allItems = allItems.concat(chunkItems);
  }

  const itemsByOrder = {};
  allItems.forEach((item) => {
    if (!itemsByOrder[item.orderID]) {
      itemsByOrder[item.orderID] = [];
    }
    itemsByOrder[item.orderID].push(item);
  });

  return orders.map((order) => {
    order.items = itemsByOrder[order.id] || [];
    return order;
  });
}

/**
 * Helper function to bulk fetch types for items in a list of orders
 * @param {Array} orders - Array of Order model instances (with .items populated)
 * @returns {Array} - Orders with item types populated
 */
async function attachTypesToOrders(orders) {
  if (!orders || orders.length === 0) return orders;

  const typeIDs = new Set();
  orders.forEach((order) => {
    if (order.items) {
      order.items.forEach((item) => {
        if (item.typeID) typeIDs.add(item.typeID);
      });
    }
  });

  const uniqueTypeIds = Array.from(typeIDs);
  if (uniqueTypeIds.length === 0) return orders;

  const typeTableNames = ["Type1", "Type2", "Type3"];
  const typeResults = await Promise.all(
    typeTableNames.map((tableName) =>
      thinky.r
        .table(tableName)
        .getAll(...uniqueTypeIds)
        .run()
        .catch(() => []),
    ),
  );
  const typesData = [].concat(...typeResults);

  const typeNameMap = {};
  typesData.forEach((type) => {
    typeNameMap[type.id] = type;
  });

  orders.forEach((order) => {
    if (order.items) {
      order.items.forEach((item) => {
        item.type = typeNameMap[item.typeID] || {
          name: "type not found, possibly deleted",
        };
      });
    }
  });

  return orders;
}

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
      attachItemsToOrders(
        openOrdersRaw.map((orderData) => new Order(orderData)),
      ),
      attachItemsToOrders(
        closedOrdersRaw.map((orderData) => new Order(orderData)),
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
    // Use raw ReQL query for proper pagination support
    const paginatedOrdersRaw = await thinky.r
      .table("Order")
      .orderBy(thinky.r.desc("createdAt"))
      .slice((page - 1) * perPage, page * perPage)
      .run();

    // Convert to Order instances and fetch items and types in bulk
    let paginatedOrders = paginatedOrdersRaw.map(
      (orderData) => new Order(orderData),
    );
    paginatedOrders = await attachItemsToOrders(paginatedOrders);
    paginatedOrders = await attachTypesToOrders(paginatedOrders);

    const processedOrders = await Promise.all(
      paginatedOrders.map(async (orderWithTypes) => {
        try {
          // Skip LDAP lookup in devMode to avoid connection errors
          if (config.devMode) {
            orderWithTypes.fullName = orderWithTypes.username;
          } else {
            try {
              // Node v12 compatible checks (replaces user?.name)
              const users = await ldap.getNameFromUsername(
                orderWithTypes.username,
              );
              const firstUser = users && users.length > 0 ? users[0] : null;
              orderWithTypes.fullName =
                firstUser && firstUser.name
                  ? firstUser.name
                  : orderWithTypes.username;
            } catch (ldapErr) {
              console.warn(
                "LDAP lookup failed for " + orderWithTypes.username + ":",
                ldapErr.message,
              ); // Node v12 concat
              orderWithTypes.fullName = orderWithTypes.username;
            }
          }
          return orderWithTypes;
        } catch (typeErr) {
          console.error(
            "Error fetching types for order " + orderWithTypes.id + ":",
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

    console.log("Export orders - Date range:", { startDate, endDate });

    // First, get all orders in date range to see what we have
    const allOrdersInRange = await thinky.r
      .table("Order")
      .between(startDate, endDate, { index: "createdAt" })
      .run();

    console.log(`Found ${allOrdersInRange.length} orders in date range`);
    console.log(
      "Orders:",
      allOrdersInRange.map((o) => ({
        id: o.id,
        username: o.username,
        createdAt: o.createdAt,
        costCode: o.costCode,
        totalCost: o.totalCost,
        cancelled: o.cancelled,
      })),
    );

    // Use raw RethinkDB query with thinky.r
    const orders = await thinky.r
      .table("Order")
      .between(startDate, endDate, { index: "createdAt" })
      .filter((orderItem) =>
        orderItem("costCode")
          .ne(null)
          .and(orderItem("totalCost").ne(null))
          .and(orderItem("totalCost").ne(""))
          .and(orderItem("cancelled").eq(false)),
      )
      .orderBy(thinky.r.asc("createdAt"))
      .run();

    console.log(
      `After filtering: ${orders.length} orders with costCode and totalCost`,
    );

    // Bulk fetch items for all orders to prevent N+1 query issue
    const orderIDs = orders.map((o) => o.id);
    const chunkSize = 500;
    let allItems = [];

    for (let i = 0; i < orderIDs.length; i += chunkSize) {
      const chunk = orderIDs.slice(i, i + chunkSize);
      const chunkItems = await thinky.r
        .table("CartItem")
        .filter((item) => thinky.r.expr(chunk).contains(item("orderID")))
        .run();
      allItems = allItems.concat(chunkItems);
    }

    // Group items by orderID
    const itemsByOrder = {};
    allItems.forEach((item) => {
      if (!itemsByOrder[item.orderID]) {
        itemsByOrder[item.orderID] = [];
      }
      itemsByOrder[item.orderID].push(item);
    });

    // Attach items to orders
    const ordersWithItems = orders.map((order) => {
      order.items = itemsByOrder[order.id] || [];
      return order;
    });

    res.json(ordersWithItems);
  } catch (err) {
    console.error("Error in exportOrders middleware:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Exports ALL orders (including those without cost/costCode) as JSON for the given date range.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.exportAllOrders = async (req, res) => {
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

    console.log("Export all orders - Date range:", { startDate, endDate });

    // Get all orders in date range (excluding cancelled orders only)
    const orders = await thinky.r
      .table("Order")
      .between(startDate, endDate, { index: "createdAt" })
      .filter((orderItem) => orderItem("cancelled").eq(false))
      .orderBy(thinky.r.asc("createdAt"))
      .run();

    console.log(`Found ${orders.length} orders in date range`);

    // Bulk fetch items for all orders to prevent N+1 query issue
    const orderIDs = orders.map((o) => o.id);
    const chunkSize = 500;
    let allItems = [];

    for (let i = 0; i < orderIDs.length; i += chunkSize) {
      const chunk = orderIDs.slice(i, i + chunkSize);
      const chunkItems = await thinky.r
        .table("CartItem")
        .filter((item) => thinky.r.expr(chunk).contains(item("orderID")))
        .run();
      allItems = allItems.concat(chunkItems);
    }

    // Group items by orderID
    const itemsByOrder = {};
    allItems.forEach((item) => {
      if (!itemsByOrder[item.orderID]) {
        itemsByOrder[item.orderID] = [];
      }
      itemsByOrder[item.orderID].push(item);
    });

    // Attach items to orders
    const ordersWithItems = orders.map((order) => {
      order.items = itemsByOrder[order.id] || [];
      return order;
    });

    res.json(ordersWithItems);
  } catch (err) {
    console.error("Error in exportAllOrders middleware:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Returns summary data for a given date range including total orders, plasmids, and revenue.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.summaryData = async (req, res) => {
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

    console.log("Summary data - Date range:", { startDate, endDate });

    // Get all non-cancelled orders in date range
    const allOrders = await thinky.r
      .table("Order")
      .between(startDate, endDate, { index: "createdAt" })
      .filter((orderItem) => orderItem("cancelled").eq(false))
      .run();

    // Calculate costed vs non-costed orders
    const costedOrders = allOrders.filter(
      (order) =>
        order.costCode &&
        order.costCode.toLowerCase() !== "n/a" &&
        order.totalCost !== null &&
        order.totalCost !== "" &&
        order.totalCost > 0,
    );
    const nonCostedOrders = allOrders.length - costedOrders.length;

    // Fetch items for all orders to count plasmids
    let totalPlasmids = 0;
    for (const order of allOrders) {
      const items = await thinky.r
        .table("CartItem")
        .filter({ orderID: order.id })
        .run();
      totalPlasmids += items.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0,
      );
    }

    // Calculate total revenue from costed orders
    const totalRevenue = costedOrders.reduce(
      (sum, order) => sum + (Number(order.totalCost) || 0),
      0,
    );

    res.json({
      totalOrders: allOrders.length,
      costedOrders: costedOrders.length,
      nonCostedOrders: nonCostedOrders,
      totalPlasmids: totalPlasmids,
      totalRevenue: totalRevenue,
    });
  } catch (err) {
    console.error("Error in summaryData middleware:", err);
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
    console.log("Fetching orders and items from database...");

    // Use raw ReQL query to fetch orders with items in one go
    const ordersRaw = await thinky.r.table("Order").run();
    const itemsRaw = await thinky.r.table("CartItem").run();

    // Create a map of orderID -> items for faster lookup
    const itemsByOrderId = {};
    itemsRaw.forEach((item) => {
      if (!itemsByOrderId[item.orderID]) {
        itemsByOrderId[item.orderID] = [];
      }
      itemsByOrderId[item.orderID].push(item);
    });

    console.log(
      `Processing ${ordersRaw.length} orders and ${itemsRaw.length} items...`,
    );

    // Fetch all unique typeIDs to minimize database queries
    const uniqueTypeIds = [
      ...new Set(itemsRaw.map((item) => item.typeID).filter(Boolean)),
    ];
    console.log(`Fetching ${uniqueTypeIds.length} unique types...`);

    // Query all three type tables (Type1, Type2, Type3) since there is no single "Type" table
    const typeTableNames = ["Type1", "Type2", "Type3"];
    const typeResults = await Promise.all(
      typeTableNames.map((tableName) =>
        thinky.r
          .table(tableName)
          .getAll(...uniqueTypeIds)
          .run()
          .catch(() => []),
      ),
    );
    const typesData = [].concat(...typeResults);

    // Create a map of typeID -> type name for O(1) lookup
    const typeNameMap = {};
    typesData.forEach((type) => {
      typeNameMap[type.id] = type.name;
    });

    console.log("Processing order items...");

    // Process all orders and items
    ordersRaw.forEach((order) => {
      const orderItems = itemsByOrderId[order.id] || [];
      orderItems.forEach((item) => {
        const typeName = typeNameMap[item.typeID];
        if (typeName && order.username) {
          addItemCount(order.username, typeName);
        }
      });
    });

    console.log("Filtering duplicate orders...");

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

    res.render("orders/dupes", { itemsByUser });
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

    Flash.success(
      req,
      `Order marked as complete and notification sent to ${orderWithTypes.username}.`,
    );
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
    const order = await getOrderWithDetails(orderID, false);

    order.complete = false;
    order.completedAt = null;

    await order.save();
    Flash.info(req, `Order has been marked as incomplete.`);
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
    const order = await getOrderWithDetails(orderID, false);

    order.cancelled = true;

    await order.save();
    Flash.info(req, `Order has been cancelled.`);
    res.redirect(`/order/${orderID}`);
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Marks an order as not cancelled.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
ordersController.markAsUnCancelled = async (req, res) => {
  const { id: orderID } = req.params;
  try {
    const order = await getOrderWithDetails(orderID, false);

    order.cancelled = false;

    await order.save();
    Flash.info(req, `Order is no longer cancelled.`);
    res.redirect(`/order/${orderID}`);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = ordersController;
