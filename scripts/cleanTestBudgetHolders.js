/**
 * Clean Test Budget Holders
 *
 * This script removes test/invalid budget holders from the database.
 * Useful before running the production seed script on a clean database.
 *
 * It removes entries that:
 * - Have usernames < 3 or > 20 characters
 * - Have descriptions < 10 or > 150 characters
 * - Match known test patterns (e.g., "ab", "test", "long123")
 *
 * Usage:
 *   node scripts/cleanTestBudgetHolders.js
 *
 * With dry-run (shows what would be deleted):
 *   DRY_RUN=true node scripts/cleanTestBudgetHolders.js
 *
 * Force delete without confirmation:
 *   FORCE=true node scripts/cleanTestBudgetHolders.js
 */

const BudgetHolder = require('../models/budgetHolder');
const legacyBudgetHolders = require('../config/budgetHolders');

const DRY_RUN = process.env.DRY_RUN === 'true';
const FORCE = process.env.FORCE === 'true';

// Known test usernames to remove
const TEST_PATTERNS = ['ab', 'test', 'long', 'short', 'invalid', 'foo', 'bar'];

/**
 * Check if a budget holder looks like test data
 */
function isTestData(holder) {
  const { username, description } = holder;

  // Check if it's NOT in the production list
  const isProduction = Object.keys(legacyBudgetHolders.BUDGET_HOLDERS).includes(username);
  if (isProduction) {
    return false;
  }

  // Check validation constraints
  if (username.length < 3 || username.length > 20) {
    return true;
  }
  if (description.length < 10 || description.length > 150) {
    return true;
  }

  // Check for test patterns
  const lowerUsername = username.toLowerCase();
  if (TEST_PATTERNS.some(pattern => lowerUsername.includes(pattern))) {
    return true;
  }

  return false;
}

async function cleanTestBudgetHolders() {
  console.log('='.repeat(70));
  console.log('Clean Test Budget Holders');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🔥 LIVE (will delete)'}`);
  console.log(`Database: ${process.env.DB_NAME || 'synbioshop (default)'}`);
  console.log('');

  try {
    // Get all budget holders
    const allHolders = await BudgetHolder.run();
    console.log(`Found ${allHolders.length} total budget holders in database`);
    console.log('');

    // Find test data
    const testHolders = allHolders.filter(isTestData);
    const productionCount = allHolders.length - testHolders.length;

    if (testHolders.length === 0) {
      console.log('✅ No test data found - database is clean!');
      console.log('');
      console.log(`Production budget holders: ${productionCount}`);
      process.exit(0);
    }

    console.log('Test/Invalid Budget Holders Found:');
    console.log('─'.repeat(70));
    testHolders.forEach(holder => {
      const reason = [];
      if (holder.username.length < 3 || holder.username.length > 20) {
        reason.push(`username=${holder.username.length} chars`);
      }
      if (holder.description.length < 10 || holder.description.length > 150) {
        reason.push(`desc=${holder.description.length} chars`);
      }
      if (!Object.keys(legacyBudgetHolders.BUDGET_HOLDERS).includes(holder.username)) {
        reason.push('not in production list');
      }
      console.log(`  🗑️  ${holder.username.padEnd(15)} - ${reason.join(', ')}`);
    });
    console.log('─'.repeat(70));
    console.log('');

    console.log(`❌ Will delete: ${testHolders.length}`);
    console.log(`✅ Will keep:   ${productionCount}`);
    console.log('');

    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes made');
      console.log('   Run without DRY_RUN=true to actually delete these entries');
      process.exit(0);
    }

    // Ask for confirmation unless FORCE is set
    if (!FORCE) {
      console.log('⚠️  WARNING: This will permanently delete the above entries!');
      console.log('   Press Ctrl+C to cancel, or run with FORCE=true to skip this prompt');
      console.log('');
      console.log('Proceeding in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Delete test data
    console.log('');
    console.log('Deleting test data...');
    let deleted = 0;
    let errors = 0;

    for (const holder of testHolders) {
      try {
        await holder.delete();
        console.log(`  ✅ Deleted ${holder.username}`);
        deleted++;
      } catch (err) {
        console.error(`  ❌ Error deleting ${holder.username}:`, err.message);
        errors++;
      }
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('Cleanup Complete');
    console.log('='.repeat(70));
    console.log(`✅ Deleted: ${deleted}`);
    console.log(`❌ Errors:  ${errors}`);
    console.log(`✅ Remaining production budget holders: ${productionCount}`);
    console.log('='.repeat(70));

    process.exit(errors > 0 ? 1 : 0);

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
  cleanTestBudgetHolders();
}

module.exports = cleanTestBudgetHolders;
