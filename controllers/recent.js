const Type = require('../models/type');
const renderError = require('../lib/renderError'); // Assuming you have this for consistent error handling
const Log = require('../lib/log'); // Assuming you have a logging utility

const recentController = {};

/**
 * Fetches the most recent items that are marked as 'includeOnRecentlyAdded'.
 * @param {number} limit - The maximum number of items to return.
 * @returns {Promise<Array<object>>} A promise resolving with an array of item objects.
 */
async function getMostRecentIncludeRecentlyTypes(limit) {
    try {
        const types = await Type.getAll();

        if (!types || types.length === 0) {
            return []; // Return empty array if no types found
        }

        // Filter for types marked for recent inclusion
        const filteredTypes = types.filter(type => type.includeOnRecentlyAdded);

        // Sort by timestamp, falling back to DB creation date if timestamp is missing
        const sortedTypes = filteredTypes.sort((a, b) => {
            const timestampA = a.includeOnRecentlyAddedTimestamp || new Date(a.db.createdAt);
            const timestampB = b.includeOnRecentlyAddedTimestamp || new Date(b.db.createdAt);
            // Ensure comparison is numeric
            return Number(timestampB) - Number(timestampA);
        });

        // Slice to the limit
        const slicedTypes = sortedTypes.slice(0, limit);

        // Enhance items with human-readable dates and ensure necessary properties exist
        const enhancedTypes = slicedTypes.map(item => {
            const creationDate = item.includeOnRecentlyAddedTimestamp
                ? new Date(item.includeOnRecentlyAddedTimestamp)
                : (item.db?.createdAt ? new Date(item.db.createdAt) : null);

            let humanFormattedDate = 'Date unavailable';
            if (creationDate) {
                humanFormattedDate = `${creationDate.getDate()}/${creationDate.getMonth() + 1}/${creationDate.getFullYear()}`;
            }

            return {
                ...item,
                // Provide a default timestamp if none exists for sorting consistency, or ensure it's always present
                createdAt: item.includeOnRecentlyAddedTimestamp || item.db?.createdAt || 0,
                humanFormattedDate: humanFormattedDate,
            };
        });

        return enhancedTypes;

    } catch (err) {
        Log.error('Error fetching or processing recent items:', err);
        // Re-throw or return empty array, depending on desired error handling flow
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
        res.render('recent/index', { items });
    } catch (err) {
        // Use a consistent error handler if available
        // renderError(err, res);
        // Or just log and proceed/render an error page
        console.error('Issue with rendering recently-added items:', err);
        res.status(500).send('Failed to load recently added items.');
    }
};

module.exports = recentController;