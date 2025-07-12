const Type = require('../models/type');
const Document = require('../models/document');
const renderError = require('../lib/renderError'); // Assuming this exists for error handling
const Log = require('../lib/log'); // Assuming this exists for logging

const searchController = {};

/**
 * Escapes special characters for use in a Regular Expression.
 * @param {string} str - The input string.
 * @returns {string} The escaped string.
 */
function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/{}()*+?.\\\^$|]/g, '\\$&');
}

/**
 * Fetches and processes search results from Type and Document models.
 * @param {string} queryString - The user's search query.
 * @returns {Promise<object>} A promise resolving with an object containing categorized search results.
 */
async function getSearchResults(queryString) {
    if (!queryString) {
        return {
            documents: [],
            premadeLevelUnknown: [],
            premadeLevel0: [],
            premadeLevel1: [],
            premadeLevel2: [],
            premadeLevelM: [],
            premadeLevelP: [],
            premadeLevelMinus1: [],
        };
    }

    const mongoQueryString = escapeRegExp(queryString);
    const results = {};

    try {
        // --- Search Premade Types ---
        // Fetch enabled types matching name or description, and flatten/deduplicate
        const typesByName = await Type.filterAll('name', `(?i)${mongoQueryString}`);
        const typesByDescription = await Type.filterAll('description', `(?i)${mongoQueryString}`);
        const allTypes = [...typesByName, ...typesByDescription].filter(t => !t.disabled);

        // Deduplicate based on 'id'
        const uniqueTypes = Object.values(
            allTypes.reduce((uniqueMap, type) => {
                if (!uniqueMap[type.id]) {
                    uniqueMap[type.id] = type;
                }
                return uniqueMap;
            }, {})
        );

        // Categorize unique types by level
        const premadeResults = {
            levelUnknown: [],
            level0: [], level1: [], level2: [],
            levelM: [], levelP: [], levelMinus1: [],
        };

        uniqueTypes.forEach(type => {
            const finalObj = {
                name: type.name || 'Unnamed Item',
                link: `/docs/item/${type.id}`, // Assuming link path is /docs/item/
                id: type.id,
                description: type.description || '',
                level: type.level,
            };

            // Map level to categories
            switch (type.level) {
                case '0': case 0: premadeResults.level0.push(finalObj); break;
                case '1': case 1: premadeResults.level1.push(finalObj); break;
                case '2': case 2: premadeResults.level2.push(finalObj); break;
                case 'M': case 3: premadeResults.levelM.push(finalObj); break;
                case 'P': case 4: premadeResults.levelP.push(finalObj); break;
                case '-1 (pUAP)': case '-1': case -1: case 5: premadeResults.levelMinus1.push(finalObj); break;
                default: premadeResults.levelUnknown.push(finalObj); break;
            }
        });
        results.premade = premadeResults;

        // --- Search Documents ---
        // Fetch enabled documents matching title
        const documents = await Document.filter(doc => doc('title').match(`(?i)${mongoQueryString}`));
        const filteredDocuments = documents.filter(doc => !doc.disabled);

        if (filteredDocuments.length > 0) {
            results.documents = filteredDocuments.map(doc => ({
                name: doc.title || 'Untitled Document',
                link: `/docs/item/${doc.id}`, // Assuming link path is /docs/item/
                id: doc.id,
                content: doc.content // Displaying content directly might be heavy, consider truncating or linking to it
            }));
        }

        return results;

    } catch (err) {
        Log.error('Error during getSearchResults:', err);
        throw err; // Propagate error
    }
}

/**
 * Handles the search request and renders the search results page.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
searchController.index = async (req, res, next) => {
    const { queryString } = req.query;

    try {
        const searchResults = await getSearchResults(queryString);

        res.render('search/index', {
            queryString,
            documentation: searchResults.documents || [],
            premadeLevelUnknown: searchResults.premade?.levelUnknown || [],
            premadeLevel0: searchResults.premade?.level0 || [],
            premadeLevel1: searchResults.premade?.level1 || [],
            premadeLevel2: searchResults.premade?.level2 || [],
            premadeLevelM: searchResults.premade?.levelM || [],
            premadeLevelP: searchResults.premade?.levelP || [],
            premadeLevelMinus1: searchResults.premade?.levelMinus1 || [],
        });
    } catch (err) {
        // Use a consistent error handler
        console.error('Issue with rendering search results:', err);
        // renderError(err, res); // Or handle error gracefully
        res.status(500).send('An error occurred during the search.');
    }
};

module.exports = searchController;