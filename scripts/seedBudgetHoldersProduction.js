/**
 * Seed Budget Holders - Production Version
 *
 * This script seeds only the real budget holders from the config file,
 * skipping any test/invalid data that might exist in the dev database.
 *
 * Safe to run multiple times - will skip existing entries.
 *
 * Usage:
 *   node scripts/seedBudgetHoldersProduction.js
 *
 * Or with custom database:
 *   DB_NAME=synbioshop_production node scripts/seedBudgetHoldersProduction.js
 */

const BudgetHolder = require('../models/budgetHolder');
const legacyBudgetHolders = require('../config/budgetHolders');

// Production budget holders - the real list from config
const PRODUCTION_BUDGET_HOLDERS = legacyBudgetHolders.BUDGET_HOLDERS;

/**
 * Validate budget holder data meets schema requirements
 */
function isValidBudgetHolder(username, description) {
  // Schema validation: username (3-20 chars), description (10-150 chars)
  if (!username || username.length < 3 || username.length > 20) {
    return false;
  }
  if (!description || description.length < 10 || description.length > 150) {
    return false;
  }
  return true;
}

async function seedProductionBudgetHolders() {
  console.log('='.repeat(70));
  console.log('PRODUCTION Budget Holder Seed Script');
  console.log('='.repeat(70));
  console.log(`Database: ${process.env.DB_NAME || 'synbioshop (default)'}`);
  console.log('');

  try {
    const entries = Object.entries(PRODUCTION_BUDGET_HOLDERS);
    console.log(`Found ${entries.length} production budget holders to process`);
    console.log('');

    let created = 0;
    let skipped = 0;
    let invalid = 0;

    for (const [username, description] of entries) {
      try {
        // Validate data
        if (!isValidBudgetHolder(username, description)) {
          console.log(`  ⚠️  Skipping ${username} (invalid: username=${username.length} chars, desc=${description.length} chars)`);
          invalid++;
          continue;
        }

        // Check if already exists
        const existing = await BudgetHolder.filter({ username }).run();

        if (existing.length > 0) {
          console.log(`  ⏭️  Skipping ${username} (already exists)`);
          skipped++;
          continue;
        }

        // Create new budget holder
        const holder = new BudgetHolder({
          username: username,
          description: description
        });

        await holder.save();
        console.log(`  ✅ Created ${username}`);
        created++;

      } catch (err) {
        console.error(`  ❌ Error creating ${username}:`, err.message);
        invalid++;
      }
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('Migration Complete');
    console.log('='.repeat(70));
    console.log(`✅ Created:  ${created}`);
    console.log(`⏭️  Skipped:  ${skipped} (already exist)`);
    console.log(`❌ Invalid:  ${invalid}`);
    console.log(`📊 Total:    ${entries.length}`);
    console.log('='.repeat(70));

    if (invalid > 0) {
      console.log('');
      console.log('⚠️  Some entries were invalid and skipped.');
      console.log('   This is normal if the config contains test data.');
    }

    process.exit(invalid > entries.length / 2 ? 1 : 0); // Fail if more than half failed

  } catch (err) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ FATAL ERROR');
    console.error('='.repeat(70));
    console.error(err);
    console.error('='.repeat(70));
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  console.log('');
  seedProductionBudgetHolders();
}

module.exports = seedProductionBudgetHolders;
