/**
 * Seed Budget Holders
 *
 * This script migrates budget holders from the hardcoded config file
 * to the database. Run once during deployment.
 *
 * Usage: node scripts/seedBudgetHolders.js
 */

const BudgetHolder = require('../models/budgetHolder');
const legacyBudgetHolders = require('../config/budgetHolders');

async function seedBudgetHolders() {
  console.log('Starting budget holder migration...');

  try {
    // Get existing budget holders from config
    const holders = legacyBudgetHolders.BUDGET_HOLDERS;
    const entries = Object.entries(holders);

    console.log(`Found ${entries.length} budget holders to migrate`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const [username, description] of entries) {
      try {
        // Check if already exists
        const existing = await BudgetHolder.filter({ username }).run();

        if (existing.length > 0) {
          console.log(`  ⏭  Skipping ${username} (already exists)`);
          skipped++;
          continue;
        }

        // Create new budget holder
        const holder = new BudgetHolder({
          username: username,
          description: description
        });

        await holder.save();
        console.log(`  ✓  Created ${username}`);
        created++;

      } catch (err) {
        console.error(`  ✗  Error creating ${username}:`, err.message);
        errors++;
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Created: ${created}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total: ${entries.length}`);

    process.exit(errors > 0 ? 1 : 0);

  } catch (err) {
    console.error('Fatal error during migration:', err);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  seedBudgetHolders();
}

module.exports = seedBudgetHolders;
