const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');
const Category = require('../models/category');
const File = require('../models/file');
const SequenceFile = require('../models/sequenceFile');
const config = require('../config.json');
const path = require('path');
const fs = require('fs').promises; // Use promises API for fs
const Flash = require('../lib/flash');
const Log = require('../lib/log');
const mkdirp = require('mkdirp'); // Assuming mkdirp is still the preferred async mkdir function
const Util = require('../lib/util'); // Assuming Util is used for isAdmin

const premadeController = {};

// --- Helper Functions ---

/**
 * Fetches all DBs and sorts them by creation date.
 * @returns {Promise<Array<DB>>} A promise resolving with sorted DB objects.
 */
async function getSortedDBs() {
    try {
        const dbs = await DB.run();
        return dbs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } catch (err) {
        console.error('Error fetching sorted DBs:', err);
        throw err; // Re-throw to be caught by calling function
    }
}

/**
 * A consistent way to handle errors in premade-related operations.
 * @param {Error} err - The error object.
 * @param {Object} res - The Express response object.
 */
const handleError = (err, res) => {
    console.error('Premade controller error:', err);
    renderError('An error occurred in the Premade section.', res);
};

/**
 * Safely stringifies JSON, escaping script tags and comments.
 * @param {any} obj - The object to stringify.
 * @returns {string} The safely stringified JSON.
 */
function safeJSONStringify(obj) {
    return JSON.stringify(obj)
        .replace(/<\/script/g, '<\\/script')
        .replace(/<!--/g, '<\\!--');
}

/**
 * Processes file uploads for Type models.
 * @param {Type} savedType - The saved Type object.
 * @param {Object} req - Express request object containing files.
 * @returns {Promise<void>} A promise resolving when the file is processed.
 */
async function processMapFile(savedType, req) {
    if (!req.files || !req.files.mapFile) {
        return Promise.resolve(); // No file to process
    }

    const file = req.files.mapFile;
    const newPath = path.join(config.uploadRoot, file.name);

    try {
        // Ensure upload directory exists
        await mkdirp(config.uploadRoot);

        // Move the uploaded file to its final destination
        await fs.rename(file.path, newPath);

        // Save file metadata to the database
        await new File({
            path: newPath,
            name: file.name,
            originalName: file.originalname,
            typeID: savedType.id
        }).save();
    } catch (err) {
        console.error(`Error processing map file for type ${savedType.id}:`, err);
        throw err; // Re-throw to be caught by caller
    }
}

/**
 * Gets the appropriate item level string based on predefined levels.
 * @param {string} level - The raw level value from the data.
 * @returns {string} The formatted level string.
 */
const possibleLevels = ['0', '1', '2', 'M', 'P', '-1 (pUAP)'];
const getItemLevelStr = (level) => {
    return possibleLevels.includes(level) ? level : 'Unknown';
};

// --- Controller Actions ---

/**
 * Renders the main premade index page, showing all databases.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
premadeController.index = async (req, res) => {
    try {
        const dbs = await DB.getJoin({ categories: true });
        res.render('premade/index', { dbs });
    } catch (err) {
        handleError(err, res);
    }
};

/**
 * Exports premade items as a CSV file.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
premadeController.export = async (req, res) => {
    try {
        const categories = await Category.getJoin({ db: true });
        const outputData = await Promise.all(categories.map(async (category) => {
            const types = await Type.getByCategory(category.id);
            // Ensure Type.getByTypeNumber is safe if category.db or category.db.type is null/undefined
            const typeDefinition = category.db && category.db.type ? Type.getByTypeNumber(category.db.type) : null;

            const items = types.map(t => {
                // Safely get 'whoMadeIt' or 'source'
                const whoMadeIt = t.whoMadeIt || t.source || ''; // Default to empty string

                // Construct data row using definition fields
                const rowData = [
                    whoMadeIt,
                    t.description || '',
                ];
                if (typeDefinition) {
                    typeDefinition.fields.forEach(fieldDef => {
                        // Add fields from definition, excluding those already added, or use empty string if value missing
                        if (!['whoMadeIt', 'description', 'source'].includes(fieldDef.name)) {
                            rowData.push(t[fieldDef.name] || '');
                        }
                    });
                }

                return {
                    name: t.name || 'Unnamed Item',
                    data: rowData, // Array of item data
                    position: t.position || 0
                };
            });

            return {
                category: category.name || 'Unnamed Category',
                position: (category.db?.position || 0) * 100 + (category.position || 0), // Safely access nested properties
                items: items
            };
        }));

        // Sort categories and then items within categories
        outputData.sort((a, b) => a.position - b.position);
        outputData.forEach(cat => cat.items.sort((a, b) => a.position - b.position));

        let csvContent = '';
        outputData.forEach(catData => {
            csvContent += `${catData.category}\n`;
            catData.items.forEach(item => {
                // Ensure all data points are strings for proper CSV joining
                const rowString = [item.name, ...item.data.map(String)].join(', ');
                csvContent += `${rowString}\n`;
            });
            csvContent += '\n';
        });

        res.contentType('text/csv');
        res.set("Content-Disposition", "attachment;filename=premade_items.csv");
        res.send(csvContent);

    } catch (err) {
        handleError(err, res);
    }
};

/**
 * Renders the form for rearranging DBs and Categories/Items.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
premadeController.rearrange = async (req, res) => {
    try {
        const dbs = await DB.getJoin({ categories: true });

        // Fetch types for all categories across all DBs efficiently
        const categoriesWithTypes = [];
        for (const db of dbs) {
            for (const category of db.categories) {
                try {
                    const types = await Type.getByCategory(category.id);
                    // Add type info (id, position, name) to category object
                    const enrichedCategory = {
                        ...category,
                        items: types.map(t => ({ id: t.id, position: t.position || 0, name: t.name || 'Unnamed' }))
                    };
                    categoriesWithTypes.push(enrichedCategory);
                } catch (err) {
                    console.error(`Failed to fetch types for category ${category.id}:`, err);
                    // Optionally push category with empty items or handle error differently
                    categoriesWithTypes.push({ ...category, items: [] });
                }
            }
        }

        // Reconstruct dbs with enriched categories, ensuring correct association
        const fullDbs = dbs.map(db => ({
            ...db,
            categories: db.categories.map(dbCat =>
                categoriesWithTypes.find(cat => cat.id === dbCat.id) || dbCat // Use enriched data if found, else original
            )
        }));

        const safeDbsStr = safeJSONStringify(fullDbs);
        // Validate JSON parsing
        const safeDbs = JSON.parse(safeDbsStr);

        res.render('premade/rearrange', { dbs: safeDbs });
    } catch (err) {
        handleError(err, res);
    }
};

/**
 * Saves the rearranged order of DBs, Categories, and Types.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
premadeController.rearrangeSave = async (req, res) => {
    try {
        const newOrderData = JSON.parse(req.body.newOrder);
        const savePromises = [];

        for (const dbData of newOrderData) {
            // Save DB position
            savePromises.push(
                DB.get(dbData.id).then(doc => {
                    doc.position = dbData.position;
                    return doc.save();
                })
            );

            // Save Category positions and their items' positions
            for (const categoryData of dbData.categories) {
                savePromises.push(
                    Category.get(categoryData.id).then(doc => {
                        doc.position = categoryData.position;
                        return doc.save();
                    })
                );
                for (const itemData of categoryData.items) {
                    savePromises.push(
                        Type.getByID(itemData.id).then(doc => {
                            doc.position = itemData.position;
                            return doc.save();
                        })
                    );
                }
            }
        }

        await Promise.all(savePromises);
        Flash.success(req, 'Rearrangement saved successfully.');
        Log.info(`Rearrangement saved by user ${req.user.username}.`); // Log success with user
        res.sendStatus(200);
    } catch (err) {
        Flash.error(req, `Failed to save rearrangement: ${err.message}`);
        Log.error(`Error saving rearrangement: ${err.message}`, err); // Log the error
        res.status(400).json({ error: err.message });
    }
};

// --- DB Management ---

premadeController.db = {};

premadeController.db.new = async (req, res) => {
    try {
        const dbs = await getSortedDBs();
        res.render('premade/db/edit', { types: Type.TYPES, dbs }); // Assuming Type.TYPES is available and correct
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.save = async (req, res) => {
    const { id, name, type, description } = req.body;
    try {
        if (id) {
            const db = await DB.get(id);
            db.name = name;
            // db.type = type; // Discouraged to change type after creation
            db.description = description;
            await db.save();
            Flash.success(req, `DB "${name}" updated.`);
        } else {
            const newDb = new DB({ name, type, description });
            await newDb.save();
            Flash.success(req, `DB "${name}" created.`);
        }
        res.redirect('/premade');
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.show = async (req, res) => {
    const { id } = req.params;
    try {
        const db = await DB.get(id).getJoin({ categories: true });
        const dbs = await getSortedDBs();
        res.render('premade/db/show', { db, dbs });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.disable = async (req, res) => {
    const { id } = req.params;
    try {
        const db = await DB.get(id);
        db.disabled = true;
        await db.save();
        Flash.info(req, `DB "${db.name}" disabled.`);
        res.redirect(`/premade/${id}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.enable = async (req, res) => {
    const { id } = req.params;
    try {
        const db = await DB.get(id);
        db.disabled = false;
        await db.save();
        Flash.info(req, `DB "${db.name}" enabled.`);
        res.redirect(`/premade/${id}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.delete = async (req, res) => {
    const { id } = req.params;
    try {
        const db = await DB.get(id);
        const dbName = db.name; // Store name before deletion
        await db.delete();
        Flash.success(req, `DB "${dbName}" deleted.`);
        res.redirect('/premade/');
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.edit = async (req, res) => {
    const { id } = req.params;
    try {
        const db = await DB.get(id);
        const dbs = await getSortedDBs();
        const types = Type.TYPES; // Assuming this is a static list of available types
        // Find the selected type based on db.type (adjust index if needed)
        const selectedType = types.find(t => t.type === db.type);

        // We don't want user to change type, so only pass the selected type to view
        const data = { db, dbs, types: selectedType ? [selectedType] : [], selectedType };
        res.render('premade/db/edit', data);
    } catch (err) {
        handleError(err, res);
    }
};

// --- Category Management ---

premadeController.category = {};

premadeController.category.new = async (req, res) => {
    const { id: dbID } = req.params; // Category new is usually nested under a DB
    try {
        const db = await DB.get(dbID);
        const dbs = await getSortedDBs();
        res.render('premade/category/edit', { dbs, db });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.save = async (req, res) => {
    const { id, name, description } = req.body;
    const { id: dbID } = req.params; // dbID is from the route, e.g., /premade/db/:id/category/save
    try {
        let savedCategory;
        if (id) {
            const category = await Category.get(id);
            category.name = name;
            category.description = description;
            savedCategory = await category.save();
            Flash.success(req, `Category "${name}" updated.`);
        } else {
            const newCategory = new Category({ name, description, dbID });
            savedCategory = await newCategory.save();
            Flash.success(req, `Category "${name}" created.`);
        }
        res.redirect(`/premade/category/${savedCategory.id}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.edit = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID).getJoin({ db: true });
        const dbs = await getSortedDBs();
        res.render('premade/category/edit', { category, dbs, db: category.db });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.show = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID).getJoin({ db: true });
        const types = await Type.getByCategory(categoryID);
        const typeDefinition = category.db?.type ? Type.getByTypeNumber(category.db.type) : null;

        if (!typeDefinition) {
            throw new Error(`Type definition not found for DB type: ${category.db?.type}`);
        }

        const headings = ['Description', 'Comments'];
        typeDefinition.fields.forEach(field => headings.push(field.text));

        const items = [];
        for (const t of types) {
            const itemData = {
                items: [t.description || '', t.comments || ''],
                id: t.id,
                name: t.name,
                disabled: t.disabled,
                file: t.file,
                position: t.position || 0
            };
            typeDefinition.fields.map(fieldDef => {
                if (t[fieldDef.name]) {
                    itemData.items.push(t[fieldDef.name]);
                }
            });
            // Only push if there's actual data in the items array (beyond placeholders)
            if (itemData.items.some(val => val !== '' && val !== null && val !== undefined)) {
                items.push(itemData);
            }
        }

        const dbs = await getSortedDBs();
        res.render('premade/category/show', { db: category.db, dbs, headings, items, category });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.enable = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID);
        category.disabled = false;
        await category.save();
        Flash.info(req, `Category "${category.name}" enabled.`);
        res.redirect(`/premade/category/${categoryID}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.disable = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID);
        category.disabled = true;
        await category.save();
        Flash.info(req, `Category "${category.name}" disabled.`);
        res.redirect(`/premade/category/${categoryID}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.delete = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID);
        const dbID = category.dbID; // Store before deletion
        await category.delete();
        Flash.success(req, `Category "${category.name}" deleted.`);
        res.redirect(`/premade/${dbID}`);
    } catch (err) {
        handleError(err, res);
    }
};

// --- Item (Type) Management ---

premadeController.item = {};

premadeController.item.new = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID).getJoin({ db: true });
        const typeDefinition = category.db?.type ? Type.getByTypeNumber(category.db.type) : null;
        if (!typeDefinition) {
            throw new Error(`Type definition not found for DB type: ${category.db?.type}`);
        }
        const dbs = await getSortedDBs();
        res.render('premade/item/edit', { dbs, db: category.db, category, type: typeDefinition });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.save = async (req, res) => {
    const { categoryID } = req.params;
    const { id, dbID, name, comments, description, concentration, synBioID, documentation, note, level, includeonrecentlyadded, linkurl, linkdesc } = req.body;

    try {
        const db = await DB.get(dbID); // Need DB to get type definition
        const typeDefinition = Type.getByTypeNumber(db.type);
        if (!typeDefinition) {
            throw new Error(`Type definition not found for DB type: ${db.type}`);
        }

        let savedType;
        if (id) { // Editing existing type
            const typeInstance = await Type.getByID(id);
            typeInstance.name = name;
            typeDefinition.fields.forEach(field => {
                typeInstance[field.name] = req.body[field.name];
            });
            typeInstance.comments = comments;
            typeInstance.description = description;
            typeInstance.concentration = concentration;
            typeInstance.synBioID = synBioID;
            typeInstance.documentation = documentation;
            typeInstance.note = note;
            typeInstance.level = level;
            typeInstance.includeOnRecentlyAdded = (includeonrecentlyadded === 'on');
            // Include timestamp only if checkbox state changes or if explicitly set? Or always update?
            // If always updating: typeInstance.includeOnRecentlyAddedTimestamp = Date.now();
            // For simplicity, if it's 'on', set timestamp. If it's 'off' or absent, don't touch.
            if (typeInstance.includeOnRecentlyAdded) {
                 typeInstance.includeOnRecentlyAddedTimestamp = Date.now();
            }

            // Process citations
            if (linkurl && Array.isArray(linkurl)) {
                typeInstance.citations = linkurl.map((url, index) => ({
                    url: url || '',
                    description: (linkdesc && linkdesc[index]) || ''
                })).filter(cit => cit.url !== '' && cit.description !== ''); // Filter out empty citations
            } else {
                typeInstance.citations = [];
            }

            savedType = await typeInstance.save();
            Flash.success(req, `Item "${name}" updated.`);

        } else { // Creating new type
            const newTypeData = {
                dbID,
                categoryID,
                name,
                comments,
                description,
                concentration,
                synBioID,
                documentation,
                note,
                level,
                includeOnRecentlyAdded: (includeonrecentlyadded === 'on'),
                citations: [],
            };

            if (linkurl && Array.isArray(linkurl)) {
                newTypeData.citations = linkurl.map((url, index) => ({
                    url: url || '',
                    description: (linkdesc && linkdesc[index]) || ''
                })).filter(cit => cit.url !== '' && cit.description !== '');
            }

            // Dynamically create instance based on type definition
            const newType = typeDefinition.model(newTypeData);
            newType.name = name; // Ensure name is set on the model instance

            savedType = await newType.save();
            Flash.success(req, `Item "${name}" created.`);
        }

        // Process any uploaded map file
        await processMapFile(savedType, req);

        res.redirect(`/premade/item/${savedType.id}`);

    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.uploadSequenceFile = async (req, res) => {
    const { itemID } = req.params;
    const seqFile = req.files?.file; // Use optional chaining

    if (!seqFile) {
        Flash.error(req, 'No sequence file uploaded.');
        return res.redirect(`/premade/item/${itemID}`);
    }

    const newPath = path.join(config.uploadRoot, seqFile.name);

    try {
        await mkdirp(config.uploadRoot);
        await fs.rename(seqFile.path, newPath);

        const newSequenceFile = new SequenceFile({
            path: newPath,
            name: seqFile.name,
            originalName: seqFile.originalname,
            typeID: itemID
        });
        await newSequenceFile.save();
        Flash.success(req, `Sequence file "${seqFile.originalname}" uploaded.`);
        res.redirect(`/premade/item/${itemID}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.deleteSequenceFile = async (req, res) => {
    const { sequenceFileID, itemID } = req.params; // Assuming itemID is also in params for redirect
    try {
        const sequenceFile = await SequenceFile.get(sequenceFileID);
        if (!sequenceFile) throw new Error('Sequence file not found.');

        await sequenceFile.delete();
        Flash.success(req, `${sequenceFile.originalName} deleted successfully.`);
        res.redirect(`/premade/item/${itemID}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.show = async (req, res) => {
    const { itemID } = req.params;
    try {
        const item = await Type.getByID(itemID);
        if (!item) throw new Error(`Item with ID ${itemID} not found.`);

        const typeDefinition = item.db?.type ? Type.getByTypeNumber(item.db.type) : null;
        if (!typeDefinition) {
            throw new Error(`Type definition not found for item's DB type: ${item.db?.type}`);
        }

        const headings = ['Description', 'Level', 'Comments'];
        typeDefinition.fields.forEach(field => headings.push(field.text));

        const values = [
            item.description || '',
            getItemLevelStr(item.level), // Use helper for level formatting
            item.comments || ''
        ];

        typeDefinition.fields.forEach(fieldDef => {
            if (item[fieldDef.name]) {
                values.push(item[fieldDef.name]);
            }
        });

        // Get map files, select most recent
        if (item.mapFile && Array.isArray(item.mapFile) && item.mapFile.length > 0) {
            item.mapFile = item.mapFile.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        } else {
            item.mapFile = null;
        }

        const dbs = await getSortedDBs();
        res.render('premade/item/show', { headings, values, dbs, item });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.enable = async (req, res) => {
    const { itemID } = req.params;
    try {
        const type = await Type.getByID(itemID);
        type.disabled = false;
        await type.save();
        Flash.info(req, `Item "${type.name}" enabled.`);
        res.redirect(`/premade/item/${itemID}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.disable = async (req, res) => {
    const { itemID } = req.params;
    try {
        const type = await Type.getByID(itemID);
        type.disabled = true;
        await type.save();
        Flash.info(req, `Item "${type.name}" disabled.`);
        res.redirect(`/premade/item/${itemID}`);
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.edit = async (req, res) => {
    const { itemID } = req.params;
    try {
        const type = await Type.getByID(itemID);
        if (!type) throw new Error(`Item with ID ${itemID} not found.`);

        // Add type definition fields to the type object for easy access in the view
        const typeDefinition = Type.getByTypeNumber(type.db.type); // This might need adjustment based on how type definitions are stored/retrieved
        if (!typeDefinition) {
            throw new Error(`Type definition not found for item's DB type: ${type.db?.type}`);
        }
        type.fields = typeDefinition.fields;

        // Get map files, select most recent
        if (type.mapFile && Array.isArray(type.mapFile) && type.mapFile.length > 0) {
            type.mapFile = type.mapFile.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        } else {
            type.mapFile = null;
        }

        // Format level for display in edit form
        type.level = getItemLevelStr(type.level);

        const category = await Category.get(type.categoryID);
        const dbs = await getSortedDBs();

        res.render('premade/item/edit.ejs', { type, dbs, category, db: type.db });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.delete = async (req, res) => {
    const { itemID } = req.params;
    try {
        const type = await Type.getByID(itemID);
        if (!type) throw new Error(`Item with ID ${itemID} not found.`);

        const categoryID = type.categoryID; // Store before deletion
        await type.delete();
        Flash.success(req, `Item "${type.name}" deleted.`);
        res.redirect(`/premade/category/${categoryID}`);
    } catch (err) {
        handleError(err, res);
    }
};

module.exports = premadeController;