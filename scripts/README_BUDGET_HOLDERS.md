# Budget Holder Database Scripts

This directory contains scripts for managing budget holders in the database.

## Scripts Overview

### 1. `seedBudgetHolders.js` (Original)
Seeds all budget holders from config to database (includes any test data).

**Usage:**
```bash
node scripts/seedBudgetHolders.js
```

**Use when:** Initial development setup

---

### 2. `seedBudgetHoldersProduction.js` (New - Production Safe)
Seeds only validated production budget holders. Skips test/invalid data.

**Features:**
- ✅ Validates all entries before insertion
- ✅ Skips existing entries (idempotent)
- ✅ Only inserts data from the BUDGET_HOLDERS config
- ✅ Safe to run multiple times
- ✅ Works with custom database name

**Usage:**

Development:
```bash
node scripts/seedBudgetHoldersProduction.js
```

Production:
```bash
DB_NAME=synbioshop_production node scripts/seedBudgetHoldersProduction.js
```

**Use when:** 
- Setting up production database
- Need clean, validated data only

---

### 3. `cleanTestBudgetHolders.js` (New - Cleanup)
Removes test/invalid budget holders from the database.

**Features:**
- ✅ Identifies test data automatically
- ✅ Dry-run mode to preview changes
- ✅ Keeps all production budget holders
- ✅ Confirmation prompt (can be bypassed)

**Identifies as test data:**
- Entries not in production BUDGET_HOLDERS list
- Invalid username length (< 3 or > 20 chars)
- Invalid description length (< 10 or > 150 chars)
- Usernames matching test patterns ("test", "ab", "long123", etc.)

**Usage:**

Dry run (preview only):
```bash
DRY_RUN=true node scripts/cleanTestBudgetHolders.js
```

Live cleanup (with confirmation):
```bash
node scripts/cleanTestBudgetHolders.js
```

Force cleanup (no confirmation):
```bash
FORCE=true node scripts/cleanTestBudgetHolders.js
```

**Use when:**
- Cleaning up dev database before deploying
- Removing test data after running tests

---

## Recommended Workflows

### Development Setup
```bash
# Clean install
node scripts/seedBudgetHoldersProduction.js
```

### Cleaning Dev Database
```bash
# See what would be removed
DRY_RUN=true node scripts/cleanTestBudgetHolders.js

# Actually remove test data
node scripts/cleanTestBudgetHolders.js

# Re-seed production data if needed
node scripts/seedBudgetHoldersProduction.js
```

### Production Deployment
```bash
# Check production database first
DB_NAME=synbioshop_production DRY_RUN=true node scripts/cleanTestBudgetHolders.js

# Clean if needed
DB_NAME=synbioshop_production FORCE=true node scripts/cleanTestBudgetHolders.js

# Seed production data
DB_NAME=synbioshop_production node scripts/seedBudgetHoldersProduction.js
```

---

## Database Configuration

Scripts read database config from `lib/thinky.js` which uses environment variables:

- `DB_HOST` - RethinkDB host (default: localhost)
- `DB_PORT` - RethinkDB port (default: 28015)
- `DB_NAME` - Database name (default: synbioshop)

---

## Safety Notes

1. **Always run DRY_RUN first** on production to see what will be affected
2. **Backup production database** before running cleanup scripts
3. The production seed script is **idempotent** - safe to run multiple times
4. Clean scripts will **never delete** entries from the BUDGET_HOLDERS config list

---

## Validation Rules

Budget holders must meet these criteria:

- **Username:** 3-20 characters
- **Description:** 10-150 characters
- **Unique:** No duplicate usernames

These match the schema defined in `models/budgetHolder.js`

---

## Troubleshooting

**"Connection failed" error:**
- Check RethinkDB is running: `rethinkdb --daemon`
- Verify connection settings in `lib/thinky.js`

**"Table does not exist" error:**
- Run migrations first or ensure database is initialized
- Check `DB_NAME` environment variable is correct

**"Some entries were invalid":**
- This is normal - it means the script found and skipped test data
- Review the output to see which entries were skipped and why

---

## Questions?

Contact: George Deeks (deeks@nbi.ac.uk)
