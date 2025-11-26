const Type = require("../models/type");
const renderError = require("../lib/renderError");
const Log = require("../lib/log");
const { r } = require("../lib/thinky");

const recentController = {};

/**
 * Fetches the most recent items that are marked as 'includeOnRecentlyAdded'.
 * Optimized to use database-level filtering and sorting.
 * @param {number} limit - The maximum number of items to return.
 * @returns {Promise<Array<object>>} A promise resolving with an array of item objects.
 */
async function getMostRecentIncludeRecentlyTypes(limit) {
  try {
    // Debug: Log the database connection info
    const dbName = r._poolMaster._options.db || "unknown";
    Log.info(`[RecentItems] Starting fetch with limit: ${limit}`);
    Log.info(`[RecentItems] Using database: ${dbName}`);

    // Debug: Check what tables exist
    const tableList = await r.tableList().run();
    Log.info(`[RecentItems] Available tables: ${JSON.stringify(tableList)}`);

    // Debug: Check if our target tables exist
    const targetTables = ["Type1", "Type2", "Type3"];
    const missingTables = targetTables.filter((t) => !tableList.includes(t));
    if (missingTables.length > 0) {
      Log.warn(
        `[RecentItems] Missing tables: ${JSON.stringify(missingTables)}`,
      );
    }

    // Query all three type tables (Type1, Type2, Type3)
    const typeResults = [];
    for (const tableName of targetTables) {
      if (!tableList.includes(tableName)) {
        Log.warn(`[RecentItems] Skipping missing table: ${tableName}`);
        continue;
      }

      try {
        // Debug: Count total items in table first
        const totalCount = await r.table(tableName).count().run();
        Log.info(
          `[RecentItems] Table ${tableName} has ${totalCount} total items`,
        );

        // Debug: Count items with includeOnRecentlyAdded field
        const withFieldCount = await r
          .table(tableName)
          .hasFields("includeOnRecentlyAdded")
          .count()
          .run();
        Log.info(
          `[RecentItems] Table ${tableName} has ${withFieldCount} items with includeOnRecentlyAdded field`,
        );

        // Debug: Check what values includeOnRecentlyAdded has
        const sampleItems = await r.table(tableName).limit(5).run();
        Log.info(
          `[RecentItems] Sample from ${tableName} - includeOnRecentlyAdded values: ${JSON.stringify(
            sampleItems.map((item) => ({
              id: item.id,
              name: item.name,
              includeOnRecentlyAdded: item.includeOnRecentlyAdded,
              typeOfField: typeof item.includeOnRecentlyAdded,
            })),
          )}`,
        );

        // Now do the actual filter
        const results = await r
          .table(tableName)
          .filter({ includeOnRecentlyAdded: true })
          .run();
        Log.info(
          `[RecentItems] Table ${tableName} filter for includeOnRecentlyAdded=true returned ${results.length} items`,
        );

        // Debug: If no results, try alternative filter approaches
        if (results.length === 0 && totalCount > 0) {
          // Try filtering with a function to catch type mismatches
          const altResults = await r
            .table(tableName)
            .filter(function (doc) {
              return doc("includeOnRecentlyAdded").eq(true);
            })
            .run();
          Log.info(
            `[RecentItems] Table ${tableName} alternative filter returned ${altResults.length} items`,
          );

          // Also try coercing to boolean
          const coercedResults = await r
            .table(tableName)
            .filter(function (doc) {
              return doc("includeOnRecentlyAdded").default(false).eq(true);
            })
            .run();
          Log.info(
            `[RecentItems] Table ${tableName} coerced filter returned ${coercedResults.length} items`,
          );
        }

        typeResults.push(...results);
      } catch (tableErr) {
        Log.error(`[RecentItems] Error querying table ${tableName}:`, tableErr);
        console.error(
          `[RecentItems] Table ${tableName} error details:`,
          tableErr,
        );
      }
    }

    const typesRaw = typeResults;
    Log.info(
      `[RecentItems] Total raw results across all tables: ${typesRaw.length}`,
    );

    if (!typesRaw || typesRaw.length === 0) {
      Log.info("[RecentItems] No items found with includeOnRecentlyAdded=true");
      return [];
    }

    // Convert to enhanced types with formatted dates
    const enhancedTypes = typesRaw.map((typeData) => {
      const creationDate = typeData.includeOnRecentlyAddedTimestamp
        ? new Date(typeData.includeOnRecentlyAddedTimestamp)
        : typeData.db && typeData.db.createdAt
          ? new Date(typeData.db.createdAt)
          : null;

      let humanFormattedDate = "Date unavailable";
      if (creationDate) {
        humanFormattedDate = `${creationDate.getDate()}/${creationDate.getMonth() + 1}/${creationDate.getFullYear()}`;
      }

      return {
        ...typeData,
        createdAt:
          typeData.includeOnRecentlyAddedTimestamp ||
          (typeData.db && typeData.db.createdAt) ||
          0,
        humanFormattedDate: humanFormattedDate,
      };
    });

    // Sort by timestamp and limit results
    const sortedTypes = enhancedTypes
      .sort(
        (a, b) =>
          (b.includeOnRecentlyAddedTimestamp || 0) -
          (a.includeOnRecentlyAddedTimestamp || 0),
      )
      .slice(0, limit);

    Log.info(
      `[RecentItems] Returning ${sortedTypes.length} items after sort and limit`,
    );
    return sortedTypes;
  } catch (err) {
    Log.error("[RecentItems] Error fetching or processing recent items:", err);
    console.error("[RecentItems] Full error details:", err);
    console.error("[RecentItems] Error stack:", err.stack);
    throw err;
  }
}

/**
 * Renders the 'recently added' items page.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
recentController.index = async (req, res, next) => {
  Log.info("[RecentItems] Index route called");
  try {
    const items = await getMostRecentIncludeRecentlyTypes(20);
    Log.info(
      `[RecentItems] Rendering page with ${items ? items.length : 0} items`,
    );
    // Always render the page, even if items is empty
    res.render("recent/index", { items: items || [] });
  } catch (err) {
    Log.error("[RecentItems] Issue with rendering recently-added items:", err);
    console.error("[RecentItems] Render error details:", err);
    // Render with empty items instead of failing
    res.render("recent/index", {
      items: [],
      error: "Unable to load recently added items. Please try again later.",
    });
  }
};

module.exports = recentController;
