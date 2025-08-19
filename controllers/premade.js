const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');
const Category = require('../models/category');
const File = require('../models/file'); // Used for processMapFile
const config = require('../config.json');
const path = require('path');
const fs = require('fs').promises;
const Flash = require('../lib/flash');
const Log = require('../lib/log');
const mkdirp = require('mkdirp');
const Cart = require('../models/cart');

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
        throw err;
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
 * Processes file uploads for Type models (specifically map files).
 * @param {Type} savedType - The saved Type object.
 * @param {Object} req - Express request object containing files.
 * @returns {Promise<void>} A promise resolving when the file is processed.
 */
async function processMapFile(savedType, req) {
    if (!req.files || !req.files.mapFile) {
        return Promise.resolve();
    }

    const file = req.files.mapFile;
    const newPath = path.join(config.uploadRoot, file.name);

    try {
        await mkdirp(config.uploadRoot);
        await fs.rename(file.path, newPath);

        await new File({
            path: newPath,
            name: file.name,
            originalName: file.originalname,
            typeID: savedType.id
        }).save();
    } catch (err) {
        console.error('Error processing map file for type ' + savedType.id + ':', err); // Changed to concatenate string
        throw err;
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
    }
    catch (err) {
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

            const typesForCategory = await Type.getByCategory(category.id); // <-- This is where 'types' comes from

            const typeDefinition = (category.db && category.db.type) ? Type.getByTypeNumber(category.db.type) : null;

            const items = typesForCategory.map(t => {
                const whoMadeIt = t.whoMadeIt || t.source || '';

                const rowData = [
                    whoMadeIt,
                    t.description || '',
                ];
                if (typeDefinition) {
                    typeDefinition.fields.forEach(fieldDef => {
                        if (!['whoMadeIt', 'description', 'source'].includes(fieldDef.name)) {
                            rowData.push(t[fieldDef.name] || '');
                        }
                    });
                }

                return {
                    name: t.name || 'Unnamed Item',
                    data: rowData,
                    position: t.position || 0
                };
            });

            // Safely access category.db.position (replaces category.db?.position)
            const dbPosition = (category.db && category.db.position) || 0;
            return {
                category: category.name || 'Unnamed Category',
                position: dbPosition * 100 + (category.position || 0),
                items: items
            };
        }));

        outputData.sort((a, b) => a.position - b.position);
        outputData.forEach(cat => cat.items.sort((a, b) => a.position - b.position));

        let csvContent = '';
        outputData.forEach(catData => {
            csvContent += catData.category + '\n';
            catData.items.forEach(item => {
                const rowString = [item.name].concat(item.data.map(String)).join(', '); // Concat for initial array
                csvContent += rowString + '\n';
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

        const categoriesWithTypes = [];
        for (const db of dbs) {
            for (const category of db.categories) {
                try {
                    const types = await Type.getByCategory(category.id);
                    // Manually create new object to avoid modifying original objects from DB directly.
                    const enrichedCategory = Object.assign({}, category, {
                        items: (types || []).map(t => ({ id: t.id, position: t.position || 0, name: t.name || 'Unnamed' }))
                    });
                    categoriesWithTypes.push(enrichedCategory);
                } catch (err) {
                    console.error('Failed to fetch types for category ' + category.id + ':', err); // Changed to concatenate string
                    categoriesWithTypes.push(Object.assign({}, category, { items: [] }));
                }
            }
        }

        const fullDbs = dbs.map(db => Object.assign({}, db, { // Manually create new object
            categories: (db.categories || []).map(dbCat =>
                categoriesWithTypes.find(cat => cat.id === dbCat.id) || dbCat
            )
        }));

        const safeDbsStr = safeJSONStringify(fullDbs);
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
            savePromises.push(
                DB.get(dbData.id).then(doc => {
                    if (doc) { // Check if doc exists
                        doc.position = dbData.position;
                        return doc.save();
                    }
                    return Promise.resolve();
                })
            );

            for (const categoryData of (dbData.categories || [])) { // Ensure categories is array
                savePromises.push(
                    Category.get(categoryData.id).then(doc => {
                        if (doc) {
                            doc.position = categoryData.position;
                            return doc.save();
                        }
                        return Promise.resolve();
                    })
                );
                for (const itemData of (categoryData.items || [])) { // Ensure items is array
                    savePromises.push(
                        Type.getByID(itemData.id).then(doc => {
                            if (doc) {
                                doc.position = itemData.position;
                                return doc.save();
                            }
                            return Promise.resolve();
                        })
                    );
                }
            }
        }

        await Promise.all(savePromises);
        Flash.success(req, 'Rearrangement saved successfully.');
        Log.info('Rearrangement saved by user ' + req.user.username + '.'); // Changed to concatenate string
        res.sendStatus(200);
    } catch (err) {
        Flash.error(req, 'Failed to save rearrangement: ' + err.message); // Changed to concatenate string
        Log.error('Error saving rearrangement: ' + err.message, err); // Changed to concatenate string
        res.status(400).json({ error: err.message });
    }
};

// --- DB Management ---

premadeController.db = {};

premadeController.db.new = async (req, res) => {
    try {
        const dbs = await getSortedDBs();
        res.render('premade/db/edit', { types: Type.TYPES, dbs });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.save = async (req, res) => {
    const { id, name, type, description } = req.body;
    try {
        if (id) {
            const db = await DB.get(id);
            if (!db) throw new Error('DB not found for update.');
            db.name = name;
            db.description = description;
            await db.save();
            Flash.success(req, 'DB "' + name + '" updated.'); // Changed to concatenate string
        } else {
            const newDb = new DB({ name, type, description });
            await newDb.save();
            Flash.success(req, 'DB "' + name + '" created.'); // Changed to concatenate string
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
        if (!db) throw new Error('DB not found for disabling.');
        db.disabled = true;
        await db.save();
        Flash.info(req, 'DB "' + db.name + '" disabled.'); // Changed to concatenate string
        res.redirect('/premade/' + id); // Changed to concatenate string
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.enable = async (req, res) => {
    const { id } = req.params;
    try {
        const db = await DB.get(id);
        if (!db) throw new Error('DB not found for enabling.');
        db.disabled = false;
        await db.save();
        Flash.info(req, 'DB "' + db.name + '" enabled.'); // Changed to concatenate string
        res.redirect('/premade/' + id); // Changed to concatenate string
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.delete = async (req, res) => {
    const { id } = req.params;
    try {
        const db = await DB.get(id);
        if (!db) throw new Error('DB not found for deletion.');
        const dbName = db.name;
        await db.delete();
        Flash.success(req, 'DB "' + dbName + '" deleted.'); // Changed to concatenate string
        res.redirect('/premade/');
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.db.edit = async (req, res) => {
    const { id } = req.params;
    try {
        const db = await DB.get(id);
        if (!db) throw new Error('DB not found for editing.');
        const dbs = await getSortedDBs();
        const types = Type.TYPES;
        const selectedType = types.find(t => t.type === db.type);

        const data = { db, dbs, types: selectedType ? [selectedType] : [], selectedType };
        res.render('premade/db/edit', data);
    } catch (err) {
        handleError(err, res);
    }
};

// --- Category Management ---

premadeController.category = {};

premadeController.category.new = async (req, res) => {
    const { id: dbID } = req.params;
    try {
        const db = await DB.get(dbID);
        if (!db) throw new Error('Parent DB not found for new category.');
        const dbs = await getSortedDBs();
        res.render('premade/category/edit', { dbs, db });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.save = async (req, res) => {
    const { id, name, description } = req.body;
    const { id: dbID } = req.params;
    try {
        let savedCategory;
        if (id) {
            const category = await Category.get(id);
            if (!category) throw new Error('Category not found for update.');
            category.name = name;
            category.description = description;
            savedCategory = await category.save();
            Flash.success(req, 'Category "' + name + '" updated.'); // Changed to concatenate string
        } else {
            const newCategory = new Category({ name, description, dbID });
            savedCategory = await newCategory.save();
            Flash.success(req, 'Category "' + name + '" created.'); // Changed to concatenate string
        }
        res.redirect('/premade/category/' + savedCategory.id); // Changed to concatenate string
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.edit = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID).getJoin({ db: true });
        if (!category) throw new Error('Category not found for editing.');
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
        if (!category) throw new Error('Category not found.');
        const types = await Type.getByCategory(categoryID);
        // Safely access category.db.type (replaces category.db?.type)
        const typeDefinition = (category.db && category.db.type) ? Type.getByTypeNumber(category.db.type) : null;

        if (!typeDefinition) {
            // Safely access category.db.type (replaces category.db?.type)
            throw new Error('Type definition not found for DB type: ' + (category.db && category.db.type || '(unknown)')); // Changed to concatenate string
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
        if (!category) throw new Error('Category not found for enabling.');
        category.disabled = false;
        await category.save();
        Flash.info(req, 'Category "' + category.name + '" enabled.'); // Changed to concatenate string
        res.redirect('/premade/category/' + categoryID); // Changed to concatenate string
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.disable = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID);
        if (!category) throw new Error('Category not found for disabling.');
        category.disabled = true;
        await category.save();
        Flash.info(req, 'Category "' + category.name + '" disabled.'); // Changed to concatenate string
        res.redirect('/premade/category/' + categoryID); // Changed to concatenate string
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.category.delete = async (req, res) => {
    const { categoryID } = req.params;
    try {
        const category = await Category.get(categoryID);
        if (!category) throw new Error('Category not found for deletion.');
        const dbID = category.dbID;
        await category.delete();
        Flash.success(req, 'Category "' + category.name + '" deleted.'); // Changed to concatenate string
        res.redirect('/premade/' + dbID); // Changed to concatenate string
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
        if (!category) throw new Error('Parent category not found for new item.');
        const typeDefinition = (category.db && category.db.type) ? Type.getByTypeNumber(category.db.type) : null;
        if (!typeDefinition) {
            throw new Error('Type definition not found for DB type: ' + (category.db && category.db.type || '(unknown)')); // Changed to concatenate string
        }
        const dbs = await getSortedDBs();
        res.render('premade/item/edit', { dbs, db: category.db, category, type: typeDefinition });
    } catch (err) {
        handleError(err, res);
    }
};

// In controllers/premade.js

premadeController.item.save = async (req, res) => {
    const { categoryID } = req.params;
    // Destructure explicit fields from req.body (keep these)
    const { id, dbID, name, comments, description, concentration, synBioID, documentation, note, level, includeonrecentlyadded, linkurl, linkdesc } = req.body;

    try {
        const db = await DB.get(dbID);
        if (!db) throw new Error('Related DB not found for item save.');
        const typeDefinition = Type.getByTypeNumber(db.type); // Get the dynamic type definition
        if (!typeDefinition) {
            throw new Error('Type definition not found for DB type: ' + db.type);
        }

        let savedType;
        if (id) { // Editing existing item
            const typeInstance = await Type.getByID(id);
            if (!typeInstance) throw new Error('Item not found for update.');

            typeInstance.name = name;
            // Populate dynamic fields from req.body based on typeDefinition
            typeDefinition.fields.forEach(field => {
                // Ensure field.name exists in req.body, default to empty string if not provided
                typeInstance[field.name] = req.body[field.name] || '';
            });
            typeInstance.comments = comments;
            typeInstance.description = description;
            typeInstance.concentration = concentration;
            typeInstance.synBioID = synBioID;
            typeInstance.documentation = documentation;
            typeInstance.note = note;
            typeInstance.level = level;
            typeInstance.includeOnRecentlyAdded = (includeonrecentlyadded === 'on');
            if (typeInstance.includeOnRecentlyAdded) {
                typeInstance.includeOnRecentlyAddedTimestamp = Date.now();
            }

            if (linkurl && Array.isArray(linkurl)) {
                typeInstance.citations = linkurl.map((url, index) => ({
                    url: url || '',
                    description: (linkdesc && linkdesc[index]) || ''
                })).filter(cit => cit.url !== '' && cit.description !== '');
            } else {
                typeInstance.citations = [];
            }

            savedType = await typeInstance.save();
            Flash.success(req, 'Item "' + name + '" updated.');

        } else { // Creating a NEW item
            const newTypeData = {
                dbID,
                categoryID,
                name,
                comments: comments || '', // Default to empty string if not provided
                description: description || '',
                concentration: concentration || '',
                synBioID: synBioID || '',
                documentation: documentation || '',
                note: note || '',
                level: level, // Level can be 'null' or a valid value, no default empty string
                includeOnRecentlyAdded: (includeonrecentlyadded === 'on'),
                citations: [],
            };

            // CRITICAL FIX: Populate dynamic fields for NEW items from req.body
            typeDefinition.fields.forEach(field => {
                // Assign value from req.body or default to empty string if not found
                newTypeData[field.name] = req.body[field.name] || '';
            });

            if (linkurl && Array.isArray(linkurl)) {
                newTypeData.citations = linkurl.map((url, index) => ({
                    url: url || '',
                    description: (linkdesc && linkdesc[index]) || ''
                })).filter(cit => cit.url !== '' && cit.description !== '');
            }

            const newType = typeDefinition.model(newTypeData);
            // newType.name is already set if `name` is part of newTypeData, but ensures it.
            // (If model constructor uses `name`, this line might be redundant but safe)
            newType.name = name; 

            savedType = await newType.save(); // This is where the ValidationError happens
            Flash.success(req, 'Item "' + name + '" created.');
        }

        await processMapFile(savedType, req);

        res.redirect('/premade/item/' + savedType.id);

    } catch (err) {
        // More specific error handling if it's a validation error
        if (err.name === 'ValidationError') {
            console.error('Validation Error during item save:', err.message, err.errors);
            Flash.error(req, 'Validation Error: ' + err.message + '. Please check all required fields.');
        } else {
            handleError(err, res);
        }
    }
};

// Removed premadeController.item.uploadSequenceFile and premadeController.item.deleteSequenceFile
// as these are now correctly handled by uploadController (upload.js)

premadeController.item.show = async (req, res) => {
    const { itemID } = req.params;
    try {
        const item = await Type.getByID(itemID);
        if (!item) throw new Error('Item with ID ' + itemID + ' not found.');

        const typeDefinition = (item.db && item.db.type) ? Type.getByTypeNumber(item.db.type) : null;
        if (!typeDefinition) {
            throw new Error('Type definition not found for item\'s DB type: ' + (item.db && item.db.type || '(unknown)'));
        }

        // Initialize base headings and values
        const headings = ['Description', 'Level', 'Comments'];
        const values = [
            item.description || '',
            getItemLevelStr(item.level),
            item.comments || ''
        ];

        // Dynamically add fields based on typeDefinition.fields and actual item properties
        typeDefinition.fields.forEach(fieldDef => {
            // Check if the item actually has this property and it's not null/undefined
            if (item[fieldDef.name] !== undefined && item[fieldDef.name] !== null) {
                headings.push(fieldDef.text);
                values.push(item[fieldDef.name]); 
            }
        });

        if (item.mapFile && Array.isArray(item.mapFile) && item.mapFile.length > 0) {
            item.mapFile = item.mapFile.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        } else {
            item.mapFile = null;
        }

        const dbs = await getSortedDBs();

        let isInCart = false;
        if (req.user) {
            try {
                const cart = await Cart.filter({ username: req.user.username }).getJoin({ items: true }).run();
                if (cart && cart.length > 0 && cart[0].items) {
                    isInCart = cart[0].items.some(cartItem => cartItem.typeID === item.id);
                }
            } catch (cartErr) {
                console.error('Error checking if item is in cart for premade/item/show:', cartErr);
            }
        }

        res.render('premade/item/show', { headings, values, dbs, item, isInCart });
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.enable = async (req, res) => {
    const { itemID } = req.params;
    try {
        const type = await Type.getByID(itemID);
        if (!type) throw new Error('Item not found for enabling.');
        type.disabled = false;
        await type.save();
        Flash.info(req, 'Item "' + type.name + '" enabled.'); // Changed to concatenate string
        res.redirect('/premade/item/' + itemID); // Changed to concatenate string
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.disable = async (req, res) => {
    const { itemID } = req.params;
    try {
        const type = await Type.getByID(itemID);
        if (!type) throw new Error('Item not found for disabling.');
        type.disabled = true;
        await type.save();
        Flash.info(req, 'Item "' + type.name + '" disabled.'); // Changed to concatenate string
        res.redirect('/premade/item/' + itemID); // Changed to concatenate string
    } catch (err) {
        handleError(err, res);
    }
};

premadeController.item.edit = async (req, res) => {
    const { itemID } = req.params;
    try {
        const type = await Type.getByID(itemID);
        if (!type) throw new Error('Item with ID ' + itemID + ' not found.'); // Changed to concatenate string

        const typeDefinition = Type.getByTypeNumber(type.db.type);
        if (!typeDefinition) {
            throw new Error('Type definition not found for item\'s DB type: ' + (type.db && type.db.type || '(unknown)')); // Changed to concatenate string
        }
        type.fields = typeDefinition.fields;

        if (type.mapFile && Array.isArray(type.mapFile) && type.mapFile.length > 0) {
            type.mapFile = type.mapFile.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        } else {
            type.mapFile = null;
        }

        type.level = getItemLevelStr(type.level);

        const category = await Category.get(type.categoryID);
        if (!category) throw new Error('Parent category not found for item editing.'); // Added check
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
        if (!type) throw new Error('Item with ID ' + itemID + ' not found.'); // Changed to concatenate string

        const categoryID = type.categoryID;
        await type.delete();
        Flash.success(req, 'Item "' + type.name + '" deleted.'); // Changed to concatenate string
        res.redirect('/premade/category/' + categoryID); // Changed to concatenate string
    } catch (err) {
        handleError(err, res);
    }
};

module.exports = premadeController;