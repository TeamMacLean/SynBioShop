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
    // Use direct ReQL query for optimal performance
    const typesRaw = await r
      .table("Type")
      .filter({ includeOnRecentlyAdded: true })
      .orderBy(r.desc("includeOnRecentlyAddedTimestamp"))
      .limit(limit)
      .run();

    if (!typesRaw || typesRaw.length === 0) {
      return [];
    }

    // Convert to Type model instances and enhance with formatted dates
    const enhancedTypes = typesRaw.map((typeData) => {
      const type = new Type(typeData);

      const creationDate = type.includeOnRecentlyAddedTimestamp
        ? new Date(type.includeOnRecentlyAddedTimestamp)
        : type.db && type.db.createdAt
          ? new Date(type.db.createdAt)
          : null;

      let humanFormattedDate = "Date unavailable";
      if (creationDate) {
        humanFormattedDate = `${creationDate.getDate()}/${creationDate.getMonth() + 1}/${creationDate.getFullYear()}`;
      }

      return {
        ...type,
        createdAt:
          type.includeOnRecentlyAddedTimestamp ||
          (type.db && type.db.createdAt) ||
          0,
        humanFormattedDate: humanFormattedDate,
      };
    });

    return enhancedTypes;
  } catch (err) {
    Log.error("Error fetching or processing recent items:", err);
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
  try {
    const items = await getMostRecentIncludeRecentlyTypes(20);
    // Always render the page, even if items is empty
    res.render("recent/index", { items: items || [] });
  } catch (err) {
    Log.error("Issue with rendering recently-added items:", err);
    console.error("Error details:", err);
    // Render with empty items instead of failing
    res.render("recent/index", {
      items: [],
      error: "Unable to load recently added items. Please try again later.",
    });
  }
};

module.exports = recentController;
