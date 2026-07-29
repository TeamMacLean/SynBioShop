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
    const targetTables = ["Type1", "Type2", "Type3"];

    // This function previously issued five extra queries per table — a count,
    // a hasFields count, a sample read and two alternative filters — purely to
    // produce debug log lines. That was 15 additional round-trips on every
    // page view. Only the query that produces the answer remains.
    const tableList = await r.tableList().run();

    const missingTables = targetTables.filter((t) => !tableList.includes(t));
    if (missingTables.length > 0) {
      Log.warn(`[RecentItems] Missing tables: ${JSON.stringify(missingTables)}`);
    }

    const present = targetTables.filter((t) => tableList.includes(t));

    // The three tables are independent, so query them together rather than in
    // sequence. A failure in one must not lose the results from the others.
    const perTable = await Promise.all(
      present.map((tableName) =>
        r
          .table(tableName)
          .filter({ includeOnRecentlyAdded: true })
          .run()
          .catch((tableErr) => {
            Log.error(
              `[RecentItems] Error querying table ${tableName}: ${tableErr.message}`,
            );
            return [];
          }),
      ),
    );

    const typesRaw = [].concat(...perTable);

    if (typesRaw.length === 0) {
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
      // UTC accessors, not local ones: timestamps are stored as UTC epoch
      // values, so getDate()/getMonth() shifted the displayed day by one for
      // anyone west of UTC. Also guards against an unparseable stored value
      // rendering as "NaN/NaN/NaN".
      if (creationDate && !Number.isNaN(creationDate.getTime())) {
        humanFormattedDate = `${creationDate.getUTCDate()}/${
          creationDate.getUTCMonth() + 1
        }/${creationDate.getUTCFullYear()}`;
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
