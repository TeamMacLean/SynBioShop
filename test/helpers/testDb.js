/**
 * Test database lifecycle.
 *
 * Provisions an isolated RethinkDB database, exposes a fast truncate so each
 * spec starts from a known state, and seeds a small, deterministic fixture set.
 *
 * Every function here asserts it is operating on the test database. The suite
 * deletes rows wholesale, so pointing it at production would be catastrophic.
 */

const config = require("../../config");

// Requiring lib/thinky opens the connection pool and kicks off table creation.
const thinky = require("../../lib/thinky");
const r = thinky.r;

const TABLES = [
  "Billboard",
  "BudgetHolder",
  "Cart",
  "CartItem",
  "Category",
  "DB",
  "Document",
  "File",
  "Order",
  "SequenceFile",
  "Subject",
  "Type1",
  "Type2",
  "Type3",
  "counters",
  "sessions",
];

/** Throws unless we are pointed at a clearly disposable database. */
function assertTestDatabase() {
  if (!/test/i.test(config.dbName)) {
    throw new Error(
      `Refusing to modify database "${config.dbName}": not a test database.`,
    );
  }
}

/** Creates the database and every table the app expects, idempotently. */
async function provision() {
  assertTestDatabase();

  // Let lib/thinky finish its own bootstrap first, otherwise the two race to
  // create the same database and one loses with "already exists".
  await thinky.ready();

  const dbs = await r.dbList().run();
  if (!dbs.includes(config.dbName)) {
    await r
      .dbCreate(config.dbName)
      .run()
      .catch((err) => {
        if (!/already exists/i.test(err.message)) throw err;
      });
  }

  const existing = await r.db(config.dbName).tableList().run();
  await Promise.all(
    TABLES.filter((t) => !existing.includes(t)).map((t) =>
      r
        .db(config.dbName)
        .tableCreate(t)
        .run()
        // Two parallel runs can race to create the same table; that is benign.
        .catch((err) => {
          if (!/already exists/i.test(err.message)) throw err;
        }),
    ),
  );

  // BudgetHolder.orderBy({index: "username"}) requires a secondary index.
  await ensureIndex("BudgetHolder", "username");
  await ensureIndex("Order", "createdAt");
}

async function ensureIndex(table, indexName) {
  const indexes = await r.db(config.dbName).table(table).indexList().run();
  if (!indexes.includes(indexName)) {
    await r.db(config.dbName).table(table).indexCreate(indexName).run();
    await r.db(config.dbName).table(table).indexWait(indexName).run();
  }
}

/** Removes every row from every table. Fast enough to run per-spec. */
async function truncate(tables = TABLES) {
  assertTestDatabase();
  await Promise.all(
    tables.map((t) => r.db(config.dbName).table(t).delete().run()),
  );
}

/**
 * Inserts a deterministic fixture set and returns the created records.
 *
 * IDs are fixed so specs can reference them directly without ordering
 * dependencies between tests.
 */
const IDS = {
  db: "11111111-1111-4111-8111-111111111111",
  // Databases of type 2 and 3, so the Type2/Type3 code paths are reachable.
  db2: "11111111-1111-4111-8111-111111111112",
  db3: "11111111-1111-4111-8111-111111111113",
  category: "22222222-2222-4222-8222-222222222222",
  category2: "22222222-2222-4222-8222-222222222223",
  category3: "22222222-2222-4222-8222-222222222224",
  type1: "33333333-3333-4333-8333-333333333333",
  type1b: "33333333-3333-4333-8333-333333333334",
  type2: "33333333-3333-4333-8333-333333333335",
  type3: "33333333-3333-4333-8333-333333333336",
  subject: "44444444-4444-4444-8444-444444444444",
  document: "55555555-5555-4555-8555-555555555555",
};

/** Fixed timestamps for the "recently added" ordering assertions. */
const RECENT_TIMESTAMPS = {
  type1b: Date.UTC(2026, 0, 10),
  type2: Date.UTC(2026, 2, 20),
  type3: Date.UTC(2026, 5, 30),
};

async function seed() {
  assertTestDatabase();

  const now = new Date();

  await r
    .db(config.dbName)
    .table("DB")
    .insert(
      [
        {
          id: IDS.db,
          name: "Test Database",
          description: "Fixture database",
          // `type` selects which Type model (Type1/2/3) this database holds.
          // Controllers resolve it via Type.getByTypeNumber(db.type); without
          // it every item and category page 404s.
          type: 1,
          position: 0,
          disabled: false,
          createdAt: now,
        },
        {
          id: IDS.db2,
          name: "Test Database Two",
          description: "Fixture database (type 2)",
          type: 2,
          position: 1,
          disabled: false,
          createdAt: now,
        },
        {
          id: IDS.db3,
          name: "Test Database Three",
          description: "Fixture database (type 3)",
          type: 3,
          position: 2,
          disabled: false,
          createdAt: now,
        },
      ],
      { conflict: "replace" },
    )
    .run();

  await r
    .db(config.dbName)
    .table("Category")
    .insert(
      [
        {
          id: IDS.category,
          name: "Test Category",
          description: "Fixture category",
          dbID: IDS.db,
          position: 0,
          disabled: false,
          createdAt: now,
        },
        {
          id: IDS.category2,
          name: "Test Category Two",
          description: "Fixture category (type 2)",
          dbID: IDS.db2,
          position: 0,
          disabled: false,
          createdAt: now,
        },
        {
          id: IDS.category3,
          name: "Test Category Three",
          description: "Fixture category (type 3)",
          dbID: IDS.db3,
          position: 0,
          disabled: false,
          createdAt: now,
        },
      ],
      { conflict: "replace" },
    )
    .run();

  const baseType = {
    comments: "",
    description: "Fixture type",
    dbID: IDS.db,
    superSize: false,
    disabled: false,
    categoryID: IDS.category,
    concentration: 100,
    documentation: "",
    position: 0,
    level: "0",
    includeOnRecentlyAdded: false,
    includeOnRecentlyAddedTimestamp: 0,
    citations: [],
    note: "",
    insideOverhangLeft: "AATG",
    insideOverhangRight: "GCTT",
    outsideOverhangLeft: "CGCT",
    outsideOverhangRight: "AGCG",
    resistance: "Kanamycin",
    whoMadeIt: "Fixture Author",
    createdAt: now,
  };

  await r
    .db(config.dbName)
    .table("Type1")
    .insert(
      [
        { ...baseType, id: IDS.type1, name: "pTEST001", synBioID: "1001" },
        {
          ...baseType,
          id: IDS.type1b,
          name: "pTEST002",
          synBioID: "1002",
          // Flagged for the recently-added page, oldest of the three.
          includeOnRecentlyAdded: true,
          includeOnRecentlyAddedTimestamp: RECENT_TIMESTAMPS.type1b,
        },
      ],
      { conflict: "replace" },
    )
    .run();

  // Type2 and Type3 rows, so the multi-table code paths (the recently-added
  // page, catalogue export, type-specific field rendering) are reachable.
  const sharedTypeFields = {
    comments: "",
    description: "Fixture type",
    superSize: false,
    disabled: false,
    concentration: 100,
    documentation: "",
    position: 0,
    level: "1",
    citations: [],
    note: "",
    createdAt: now,
  };

  await r
    .db(config.dbName)
    .table("Type2")
    .insert(
      [
        {
          ...sharedTypeFields,
          id: IDS.type2,
          name: "pTEST-T2",
          synBioID: "2001",
          dbID: IDS.db2,
          categoryID: IDS.category2,
          code: "T2CODE",
          speciesOfOrigin: "Nicotiana benthamiana",
          whoMadeIt: "Fixture Author",
          includeOnRecentlyAdded: true,
          includeOnRecentlyAddedTimestamp: RECENT_TIMESTAMPS.type2,
        },
      ],
      { conflict: "replace" },
    )
    .run();

  await r
    .db(config.dbName)
    .table("Type3")
    .insert(
      [
        {
          ...sharedTypeFields,
          id: IDS.type3,
          name: "pTEST-T3",
          synBioID: "3001",
          dbID: IDS.db3,
          categoryID: IDS.category3,
          FiveOH: "AATG",
          ThreeOH: "GCTT",
          levelOne: "1",
          selection: "Kanamycin",
          source: "Fixture Source",
          includeOnRecentlyAdded: true,
          includeOnRecentlyAddedTimestamp: RECENT_TIMESTAMPS.type3,
        },
      ],
      { conflict: "replace" },
    )
    .run();

  await r
    .db(config.dbName)
    .table("Subject")
    .insert(
      {
        id: IDS.subject,
        name: "Test Subject",
        safeName: "test_subject",
        position: 0,
        disabled: false,
        createdAt: now,
      },
      { conflict: "replace" },
    )
    .run();

  await r
    .db(config.dbName)
    .table("Document")
    .insert(
      {
        id: IDS.document,
        // The Document model stores its heading as `title`, not `name`.
        title: "Test Document",
        safeName: "test_document",
        content: "<p>Fixture document body</p>",
        subjectID: IDS.subject,
        position: 0,
        disabled: false,
        createdAt: now,
      },
      { conflict: "replace" },
    )
    .run();

  await r
    .db(config.dbName)
    .table("BudgetHolder")
    .insert(
      [
        {
          id: "66666666-6666-4666-8666-666666666666",
          username: "testbudget",
          description: "TEST Budget Holder [Fixtures]",
          createdAt: now,
        },
        {
          id: "66666666-6666-4666-8666-666666666667",
          username: "otherbudget",
          description: "OTHER Budget Holder [Fixtures]",
          createdAt: now,
        },
      ],
      { conflict: "replace" },
    )
    .run();

  return { ...IDS, recentTimestamps: { ...RECENT_TIMESTAMPS } };
}

/** Truncate + reseed. The usual per-spec `beforeEach`. */
async function reset() {
  await truncate();
  return seed();
}

async function teardown() {
  // Close the connection pool so mocha can exit cleanly without --exit.
  try {
    await r.getPoolMaster().drain();
  } catch (err) {
    // Pool may already be closed; nothing useful to do.
  }
}

module.exports = {
  IDS,
  RECENT_TIMESTAMPS,
  TABLES,
  provision,
  truncate,
  seed,
  reset,
  teardown,
  r,
};
