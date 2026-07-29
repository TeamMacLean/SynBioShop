const config = require("../config");
const rethinkdbdash = require("rethinkdbdash");

// Create rethinkdb connection with explicit database
const r = rethinkdbdash({
  host: config.dbHost || "localhost",
  port: config.dbPort || 28015,
  db: config.dbName || "synbioshop",
  silent: false, // Show connection logs for debugging
});

const DB_NAME = config.dbName || "synbioshop";

/**
 * "Already exists" races are expected: several models bootstrap concurrently,
 * and in a multi-process deployment several workers do too. Any other failure
 * is real and must propagate.
 */
function ignoreAlreadyExists(err) {
  if (err && /already exists/i.test(err.message || "")) return;
  throw err;
}

// Schema bootstrap. Every table/index creation registers its promise here so
// callers can await the whole thing via `ready()`. Previously these were
// fire-and-forget, which let the HTTP server begin accepting requests before
// its tables existed — the first requests after a cold start would 500.
const pendingSchema = [];

const databaseReady = r
  .dbList()
  .contains(DB_NAME)
  .do((dbExists) => r.branch(dbExists, { created: 0 }, r.dbCreate(DB_NAME)))
  .run()
  .catch(ignoreAlreadyExists);

pendingSchema.push(databaseReady);

/**
 * Resolves once the database, every table and every index this process has
 * declared exist. Await before serving traffic.
 * @returns {Promise<void>}
 */
async function ready() {
  // Models are registered as their modules are required, so the list can grow
  // while we await. Loop until it stops growing.
  let seen = 0;
  while (pendingSchema.length > seen) {
    const batch = pendingSchema.slice(seen);
    seen = pendingSchema.length;
    await Promise.all(batch);
  }
}

// Type system similar to thinky's
const type = {
  string: () => ({
    _type: "string",
    _required: false,
    _default: undefined,
    _min: undefined,
    _max: undefined,
    _enum: undefined,
    required: function () {
      this._required = true;
      return this;
    },
    default: function (val) {
      this._default = val;
      return this;
    },
    min: function (val) {
      this._min = val;
      return this;
    },
    max: function (val) {
      this._max = val;
      return this;
    },
    enum: function (values) {
      this._enum = values;
      return this;
    },
    validate: function (value) {
      if (value === undefined || value === null) {
        if (this._required) throw new Error("Value is required");
        return this._default;
      }
      if (typeof value !== "string") {
        throw new Error("Value must be a string");
      }
      if (this._min !== undefined && value.length < this._min) {
        throw new Error(`String length must be at least ${this._min}`);
      }
      if (this._max !== undefined && value.length > this._max) {
        throw new Error(`String length must be at most ${this._max}`);
      }
      if (this._enum !== undefined && !this._enum.includes(value)) {
        throw new Error(`Value must be one of: ${this._enum.join(", ")}`);
      }
      return value;
    },
  }),

  number: () => ({
    _type: "number",
    _required: false,
    _default: undefined,
    _min: undefined,
    _max: undefined,
    _enum: undefined,
    required: function () {
      this._required = true;
      return this;
    },
    default: function (val) {
      this._default = val;
      return this;
    },
    min: function (val) {
      this._min = val;
      return this;
    },
    max: function (val) {
      this._max = val;
      return this;
    },
    enum: function (values) {
      this._enum = values;
      return this;
    },
    validate: function (value) {
      // Handle empty/undefined values
      if (value === undefined || value === null || value === "") {
        if (this._required) throw new Error("Value is required");
        return this._default;
      }
      // Convert string to number if needed (handles form input)
      let numValue = value;
      if (typeof value === "string") {
        numValue = parseFloat(value);
      }
      if (typeof numValue !== "number" || isNaN(numValue)) {
        throw new Error("Value must be a number");
      }
      if (this._min !== undefined && numValue < this._min) {
        throw new Error(`Number must be at least ${this._min}`);
      }
      if (this._max !== undefined && numValue > this._max) {
        throw new Error(`Number must be at most ${this._max}`);
      }
      if (this._enum !== undefined && !this._enum.includes(numValue)) {
        throw new Error(`Value must be one of: ${this._enum.join(", ")}`);
      }
      return numValue;
    },
  }),

  boolean: () => ({
    _type: "boolean",
    _required: false,
    _default: undefined,
    required: function () {
      this._required = true;
      return this;
    },
    default: function (val) {
      this._default = val;
      return this;
    },
    min: function (val) {
      // Not applicable for boolean, but added for consistency
      return this;
    },
    max: function (val) {
      // Not applicable for boolean, but added for consistency
      return this;
    },
    enum: function (values) {
      // Not applicable for boolean, but added for consistency
      return this;
    },
    validate: function (value) {
      if (value === undefined || value === null) {
        if (this._required) throw new Error("Value is required");
        return this._default;
      }
      if (typeof value !== "boolean") {
        throw new Error("Value must be a boolean");
      }
      return value;
    },
  }),

  date: () => ({
    _type: "date",
    _required: false,
    _default: undefined,
    _min: undefined,
    _max: undefined,
    required: function () {
      this._required = true;
      return this;
    },
    default: function (val) {
      this._default = val;
      return this;
    },
    min: function (val) {
      this._min = val;
      return this;
    },
    max: function (val) {
      this._max = val;
      return this;
    },
    enum: function (values) {
      // Not typically used for dates
      return this;
    },
    validate: function (value) {
      if (value === undefined || value === null) {
        if (this._required) throw new Error("Value is required");
        if (typeof this._default === "function") {
          return this._default();
        }
        return this._default;
      }
      if (!(value instanceof Date) && typeof value !== "string") {
        throw new Error("Value must be a date");
      }
      const dateValue = value instanceof Date ? value : new Date(value);
      if (this._min !== undefined && dateValue < this._min) {
        throw new Error(`Date must be after ${this._min}`);
      }
      if (this._max !== undefined && dateValue > this._max) {
        throw new Error(`Date must be before ${this._max}`);
      }
      return dateValue;
    },
  }),

  array: () => ({
    _type: "array",
    _required: false,
    _default: undefined,
    _min: undefined,
    _max: undefined,
    required: function () {
      this._required = true;
      return this;
    },
    default: function (val) {
      this._default = val;
      return this;
    },
    min: function (val) {
      this._min = val;
      return this;
    },
    max: function (val) {
      this._max = val;
      return this;
    },
    enum: function (values) {
      // Not typically used for arrays
      return this;
    },
    validate: function (value) {
      if (value === undefined || value === null) {
        if (this._required) throw new Error("Value is required");
        return this._default;
      }
      if (!Array.isArray(value)) {
        throw new Error("Value must be an array");
      }
      if (this._min !== undefined && value.length < this._min) {
        throw new Error(`Array must have at least ${this._min} elements`);
      }
      if (this._max !== undefined && value.length > this._max) {
        throw new Error(`Array must have at most ${this._max} elements`);
      }
      return value;
    },
  }),

  object: () => ({
    _type: "object",
    _required: false,
    _default: undefined,
    required: function () {
      this._required = true;
      return this;
    },
    default: function (val) {
      this._default = val;
      return this;
    },
    min: function (val) {
      // Not applicable for objects, but added for consistency
      return this;
    },
    max: function (val) {
      // Not applicable for objects, but added for consistency
      return this;
    },
    enum: function (values) {
      // Not applicable for objects, but added for consistency
      return this;
    },
    validate: function (value) {
      if (value === undefined || value === null) {
        if (this._required) throw new Error("Value is required");
        return this._default;
      }
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Value must be an object");
      }
      return value;
    },
  }),
};

// Model registry
const models = {};

// Helper function to process joins for a single instance
async function processJoins(instance, relations, Model) {
  if (!Model.relationships) return;

  for (const [relationName, relationConfig] of Object.entries(relations)) {
    // Handle nested relations (e.g., {subjects: {documents: true}})
    const nestedRelations =
      typeof relationConfig === "object" && !Array.isArray(relationConfig)
        ? relationConfig
        : null;

    // Find the relationship definition
    let relationDef = null;
    let relationType = null;

    if (Model.relationships.hasMany) {
      relationDef = Model.relationships.hasMany.find((rel) => {
        // Match by the relationName
        return rel.relationName === relationName;
      });
      if (relationDef) relationType = "hasMany";
    }

    if (!relationDef && Model.relationships.belongsTo) {
      relationDef = Model.relationships.belongsTo.find((rel) => {
        return rel.relationName === relationName;
      });
      if (relationDef) relationType = "belongsTo";
    }

    if (!relationDef && Model.relationships.hasOne) {
      relationDef = Model.relationships.hasOne.find((rel) => {
        return rel.relationName === relationName;
      });
      if (relationDef) relationType = "hasOne";
    }

    if (!relationDef) {
      console.warn(
        `No relationship found for ${relationName} in ${Model.tableName}`,
      );
      continue;
    }

    const relatedModel = relationDef.model;
    const localKey = relationDef.localKey;
    const foreignKey = relationDef.foreignKey;

    try {
      if (relationType === "hasMany") {
        // Load related documents where foreignKey matches instance[localKey]
        // For hasMany: find related docs where foreignKey in related table matches localKey in this instance
        // Example: Subject.hasMany(Document, 'documents', 'id', 'subjectID')
        // means: find Documents where Document.subjectID === Subject.id
        const relatedDocs = await r
          .table(relatedModel.tableName)
          .filter({ [foreignKey]: instance[localKey] })
          .run();

        instance[relationName] = relatedDocs.map(
          (doc) => new relatedModel(doc),
        );

        // Process nested relations
        if (nestedRelations) {
          for (const relatedInstance of instance[relationName]) {
            await processJoins(relatedInstance, nestedRelations, relatedModel);
          }
        }
      } else if (relationType === "belongsTo" || relationType === "hasOne") {
        // Load a single related document
        const relatedDoc = await r
          .table(relatedModel.tableName)
          .get(instance[foreignKey])
          .run();

        instance[relationName] = relatedDoc
          ? new relatedModel(relatedDoc)
          : null;

        // Process nested relations
        if (nestedRelations && instance[relationName]) {
          await processJoins(
            instance[relationName],
            nestedRelations,
            relatedModel,
          );
        }
      }
    } catch (err) {
      console.error(
        `Error loading relation ${relationName} for ${Model.tableName}:`,
        err,
      );
    }
  }
}

// Create a model-like interface similar to thinky
function createModel(tableName, schema) {
  // Ensure table exists in the correct database. Chained off databaseReady so
  // we never attempt tableCreate against a database that does not exist yet.
  const tableReady = databaseReady
    .then(() =>
      r
        .db(DB_NAME)
        .tableList()
        .contains(tableName)
        .do((tableExists) =>
          r.branch(
            tableExists,
            { created: 0 },
            r.db(DB_NAME).tableCreate(tableName),
          ),
        )
        .run(),
    )
    .catch(ignoreAlreadyExists);

  pendingSchema.push(tableReady);

  // Create a constructor function for the model
  function Model(data = {}) {
    const instance = Object.create(Model.prototype);

    // Validate and set default values based on schema
    Object.keys(schema).forEach((key) => {
      if (schema[key] && typeof schema[key].validate === "function") {
        try {
          instance[key] = schema[key].validate(data[key]);
        } catch (err) {
          // Only log validation errors in production, not during normal dev operations
          if (process.env.NODE_ENV === "production") {
            console.warn(`Validation error for ${key}:`, err.message);
          }
          instance[key] = data[key];
        }
      } else {
        instance[key] = data[key];
      }
    });

    // Add any extra fields not in schema
    Object.keys(data).forEach((key) => {
      if (!(key in instance)) {
        instance[key] = data[key];
      }
    });

    return instance;
  }

  // Static methods
  Model.tableName = tableName;
  Model.schema = schema;

  Model.run = async function () {
    const docs = await r.table(tableName).run();
    return docs.map((doc) => new Model(doc));
  };

  Model.execute = Model.run; // Alias for compatibility

  Model.get = function (id) {
    const runFn = async () => {
      const doc = await r.table(tableName).get(id).run();
      return doc ? new Model(doc) : null;
    };

    const query = {
      then: (resolve, reject) => {
        return runFn().then(resolve, reject);
      },
      catch: (reject) => {
        return runFn().catch(reject);
      },
      getJoin: (relations) => {
        const getJoinRunFn = async () => {
          const doc = await r.table(tableName).get(id).run();
          if (!doc) return null;

          const instance = new Model(doc);

          // Process joins
          if (relations && Object.keys(relations).length > 0) {
            await processJoins(instance, relations, Model);
          }

          return instance;
        };

        return {
          run: getJoinRunFn,
          execute: getJoinRunFn,
          then: (resolve, reject) => {
            return getJoinRunFn().then(resolve, reject);
          },
          catch: (reject) => {
            return getJoinRunFn().catch(reject);
          },
        };
      },
    };

    return query;
  };

  Model.getAll = async function (...args) {
    const query = r.table(tableName).getAll(...args);
    return {
      run: async () => {
        const docs = await query.run();
        return docs.map((doc) => new Model(doc));
      },
    };
  };

  Model.filter = function (predicate) {
    const query = r.table(tableName).filter(predicate);
    const runFn = async () => {
      const docs = await query.run();
      return docs.map((doc) => new Model(doc));
    };

    return {
      run: runFn,
      execute: runFn,
      then: (resolve, reject) => {
        // Make filter thenable so it can be used like a promise
        return runFn().then(resolve, reject);
      },
      catch: (reject) => {
        return runFn().catch(reject);
      },
      update: (updates) => ({
        run: () => query.update(updates).run(),
        execute: () => query.update(updates).run(),
      }),
      delete: () => ({
        run: () => query.delete().run(),
        execute: () => query.delete().run(),
      }),
      orderBy: (field) => {
        const orderByQuery = query.orderBy(field);
        const orderByRunFn = async () => {
          const docs = await orderByQuery.run();
          return docs.map((doc) => new Model(doc));
        };
        return {
          run: orderByRunFn,
          execute: orderByRunFn,
          then: (resolve, reject) => {
            return orderByRunFn().then(resolve, reject);
          },
          catch: (reject) => {
            return orderByRunFn().catch(reject);
          },
        };
      },
      count: () => ({
        run: () => query.count().run(),
        execute: () => query.count().run(),
      }),
      getJoin: (relations) => {
        const getJoinRunFn = async () => {
          // Get the main documents
          const docs = await query.run();
          const instances = docs.map((doc) => new Model(doc));

          // Process joins for each relation
          if (relations && Object.keys(relations).length > 0) {
            for (const instance of instances) {
              await processJoins(instance, relations, Model);
            }
          }

          return instances;
        };

        return {
          run: getJoinRunFn,
          execute: getJoinRunFn,
          then: (resolve, reject) => {
            // Make it thenable so it can be used like a promise
            return getJoinRunFn().then(resolve, reject);
          },
          catch: (reject) => {
            return getJoinRunFn().catch(reject);
          },
        };
      },
    };
  };

  Model.orderBy = function (...args) {
    const query = r.table(tableName).orderBy(...args);
    return {
      run: async () => {
        const docs = await query.run();
        return docs.map((doc) => new Model(doc));
      },
      execute: async () => {
        const docs = await query.run();
        return docs.map((doc) => new Model(doc));
      },
      limit: (n) => ({
        run: async () => {
          const docs = await query.limit(n).run();
          return docs.map((doc) => new Model(doc));
        },
        execute: async () => {
          const docs = await query.limit(n).run();
          return docs.map((doc) => new Model(doc));
        },
      }),
    };
  };

  Model.save = async function (doc) {
    const instance = new Model(doc);

    // Execute pre-save hooks
    await Model.executePreHooks("save", instance);

    const persistable = toPersistable(instance, Model);

    if (instance.id) {
      // Update existing document
      await r.table(tableName).get(instance.id).update(persistable).run();
    } else {
      // Insert new document
      const result = await r.table(tableName).insert(persistable).run();
      if (result.generated_keys && result.generated_keys.length > 0) {
        instance.id = result.generated_keys[0];
      }
    }

    // Execute post-save hooks
    await Model.executePostHooks("save", instance);

    return instance;
  };

  Model.delete = async function (id) {
    return r.table(tableName).get(id).delete().run();
  };

  Model.count = function () {
    const query = r.table(tableName).count();
    return {
      run: () => query.run(),
      execute: () => query.run(), // Alias for compatibility
    };
  };

  // Add ensureIndex method for creating indexes
  Model.ensureIndex = function (indexName, indexFunction) {
    // Sequenced after this model's tableCreate, and awaited by ready(), so
    // queries that use the index cannot run before it is available.
    pendingSchema.push(
      tableReady
        .then(() =>
          r
            .db(DB_NAME)
            .table(tableName)
            .indexList()
            .contains(indexName)
            .do((hasIndex) =>
              r.branch(
                hasIndex,
                { created: 0 },
                r
                  .db(DB_NAME)
                  .table(tableName)
                  .indexCreate(indexName, indexFunction),
              ),
            )
            .run(),
        )
        .then(() => r.db(DB_NAME).table(tableName).indexWait(indexName).run())
        .catch(ignoreAlreadyExists),
    );
    return Model;
  };

  // Relationship methods
  Model.belongsTo = function (otherModel, relationName, foreignKey, localKey) {
    // Store relationship info for later use
    if (!Model.relationships) Model.relationships = {};
    Model.relationships.belongsTo = Model.relationships.belongsTo || [];
    Model.relationships.belongsTo.push({
      model: otherModel,
      relationName: relationName,
      foreignKey: foreignKey,
      localKey: localKey || "id",
    });
    return Model;
  };

  Model.hasOne = function (otherModel, relationName, foreignKey, localKey) {
    // Store relationship info for later use
    if (!Model.relationships) Model.relationships = {};
    Model.relationships.hasOne = Model.relationships.hasOne || [];
    Model.relationships.hasOne.push({
      model: otherModel,
      relationName: relationName,
      foreignKey: foreignKey,
      localKey: localKey || "id",
    });
    return Model;
  };

  Model.hasMany = function (otherModel, relationName, localKey, foreignKey) {
    // Store relationship info for later use
    if (!Model.relationships) Model.relationships = {};
    Model.relationships.hasMany = Model.relationships.hasMany || [];
    Model.relationships.hasMany.push({
      model: otherModel,
      relationName: relationName,
      localKey: localKey || "id",
      foreignKey: foreignKey || localKey || "id",
    });
    return Model;
  };

  Model.getJoin = function (relations) {
    // Get all documents and process joins
    const query = r.table(tableName);

    const runFn = async () => {
      const docs = await query.run();
      const instances = docs.map((doc) => new Model(doc));

      // Process joins for each instance
      if (relations && Object.keys(relations).length > 0) {
        for (const instance of instances) {
          await processJoins(instance, relations, Model);
        }
      }

      return instances;
    };

    return {
      run: runFn,
      execute: runFn,
      then: (resolve, reject) => {
        return runFn().then(resolve, reject);
      },
      catch: (reject) => {
        return runFn().catch(reject);
      },
      filter: function (predicate) {
        const filteredQuery = query.filter(predicate);
        return {
          run: async () => {
            const docs = await filteredQuery.run();
            const instances = docs.map((doc) => new Model(doc));

            // Process joins for filtered results
            if (relations && Object.keys(relations).length > 0) {
              for (const instance of instances) {
                await processJoins(instance, relations, Model);
              }
            }

            return instances;
          },
        };
      },
    };
  };

  // Define method for virtual properties/methods
  Model.define = function (propertyName, fn) {
    // Add as a method on the prototype, not as a getter
    Model.prototype[propertyName] = fn;
  };

  // Hook methods for pre/post operations
  Model.hooks = {
    pre: {},
    post: {},
  };

  Model.pre = function (operation, fn) {
    if (!Model.hooks.pre[operation]) {
      Model.hooks.pre[operation] = [];
    }
    Model.hooks.pre[operation].push(fn);
    return Model;
  };

  Model.post = function (operation, fn) {
    if (!Model.hooks.post[operation]) {
      Model.hooks.post[operation] = [];
    }
    Model.hooks.post[operation].push(fn);
    return Model;
  };

  // Execute pre hooks
  Model.executePreHooks = async function (operation, context) {
    const hooks = Model.hooks.pre[operation] || [];
    for (const hook of hooks) {
      await new Promise((resolve, reject) => {
        if (hook.length === 1) {
          // Hook expects a 'next' callback
          hook.call(context, (err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          // Hook returns a promise or is synchronous
          try {
            const result = hook.call(context);
            if (result && typeof result.then === "function") {
              result.then(resolve).catch(reject);
            } else {
              resolve();
            }
          } catch (err) {
            reject(err);
          }
        }
      });
    }
  };

  // Execute post hooks
  Model.executePostHooks = async function (operation, context) {
    const hooks = Model.hooks.post[operation] || [];
    for (const hook of hooks) {
      await new Promise((resolve, reject) => {
        if (hook.length === 1) {
          // Hook expects a 'next' callback
          hook.call(context, (err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          // Hook returns a promise or is synchronous
          try {
            const result = hook.call(context);
            if (result && typeof result.then === "function") {
              result.then(resolve).catch(reject);
            } else {
              resolve();
            }
          } catch (err) {
            reject(err);
          }
        }
      });
    }
  };

  // Instance methods
  Model.prototype.save = async function () {
    // Execute pre-save hooks
    await Model.executePreHooks("save", this);

    // Apply default values for fields that are undefined
    // This is especially important for r.now() defaults on createdAt
    Object.keys(schema).forEach((key) => {
      if (
        (this[key] === undefined || this[key] === null) &&
        schema[key]._default !== undefined
      ) {
        if (typeof schema[key]._default === "function") {
          // For r.now() or other ReQL expressions, we can't call them directly
          // Instead, we'll set it to current time for date fields
          if (schema[key]._type === "date") {
            this[key] = new Date();
          }
        } else {
          this[key] = schema[key]._default;
        }
      }
    });

    const persistable = toPersistable(this, Model);

    if (this.id) {
      // Update existing document
      await r.table(tableName).get(this.id).update(persistable).run();
    } else {
      // Insert new document
      const result = await r.table(tableName).insert(persistable).run();
      if (result.generated_keys && result.generated_keys.length > 0) {
        this.id = result.generated_keys[0];
      }
    }

    // Execute post-save hooks
    await Model.executePostHooks("save", this);

    return this;
  };

  Model.prototype.delete = async function () {
    if (this.id) {
      return Model.delete(this.id);
    }
    throw new Error("Cannot delete document without id");
  };

  Model.prototype.validate = function () {
    Object.keys(schema).forEach((key) => {
      if (schema[key] && typeof schema[key].validate === "function") {
        this[key] = schema[key].validate(this[key]);
      }
    });
    return true;
  };

  // Register model
  models[tableName] = Model;

  return Model;
}

/**
 * Names of the properties a model uses to hold joined records.
 *
 * @param {object} Model
 * @returns {Set<string>}
 */
function relationNames(Model) {
  const names = new Set();
  const rels = Model.relationships;
  if (!rels) return names;

  for (const kind of ["hasMany", "belongsTo", "hasOne"]) {
    for (const rel of rels[kind] || []) {
      names.add(rel.relationName);
    }
  }
  return names;
}

/**
 * Copies a document for persistence, dropping joined relations.
 *
 * `save()` writes every own property, so a record loaded with getJoin() wrote
 * its joined children straight back into its own row. Completing an order
 * embedded its items, each item's type, and that type's parent database,
 * category and file lists into the Order document — growing on every save and
 * re-read on every listing page.
 *
 * @param {object} instance
 * @param {object} Model
 * @returns {object} A plain object safe to write.
 */
function toPersistable(instance, Model) {
  const skip = relationNames(Model);
  const out = {};

  for (const key of Object.keys(instance)) {
    if (skip.has(key)) continue;
    // `type` is attached ad hoc by Order.getTypes() and
    // populateCartItemTypes() rather than declared as a relation, so it has to
    // be named explicitly.
    if (key === "type") continue;
    out[key] = instance[key];
  }
  return out;
}

// Export the thinky-compatible interface
module.exports = {
  r,
  type,
  createModel,
  models,
  ready,
  dbName: DB_NAME,
};
