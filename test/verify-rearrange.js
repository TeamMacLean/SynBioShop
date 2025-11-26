#!/usr/bin/env node

/**
 * Simple verification script for rearrange page functionality
 * Checks that:
 * 1. JavaScript files exist and are not empty
 * 2. React components are properly compiled (no React.createClass)
 * 3. View template has correct structure
 */

const fs = require('fs');
const path = require('path');

const results = {
  passed: [],
  failed: []
};

function test(name, fn) {
  try {
    fn();
    results.passed.push(name);
    console.log(`✓ ${name}`);
  } catch (err) {
    results.failed.push({ name, error: err.message });
    console.error(`✗ ${name}: ${err.message}`);
  }
}

// Test 1: Check rearrangeDocs.js exists and has content
test('rearrangeDocs.js exists and has content', () => {
  const jsPath = path.join(__dirname, '../public/js/rearrangeDocs.js');
  const content = fs.readFileSync(jsPath, 'utf8');
  if (content.length < 1000) {
    throw new Error('File is too small, likely not built correctly');
  }
});

// Test 2: Check rearrangeDocs.js doesn't contain React.createClass
test('rearrangeDocs.js uses modern React (no createClass)', () => {
  const jsPath = path.join(__dirname, '../public/js/rearrangeDocs.js');
  const content = fs.readFileSync(jsPath, 'utf8');
  if (content.includes('React.createClass') || content.includes('r.createClass')) {
    throw new Error('File contains deprecated React.createClass');
  }
});

// Test 3: Check view template structure
test('rearrange.ejs has correct structure', () => {
  const viewPath = path.join(__dirname, '../views/documents/rearrange.ejs');
  const content = fs.readFileSync(viewPath, 'utf8');

  if (!content.includes('id="app"')) {
    throw new Error('Missing React app container');
  }
  if (!content.includes('/js/rearrangeDocs.js')) {
    throw new Error('Missing rearrangeDocs.js script tag');
  }
  if (!content.includes('Documents - Rearrange')) {
    throw new Error('Missing page title');
  }
});

// Test 4: Check main.js exists
test('main.js exists and has content', () => {
  const jsPath = path.join(__dirname, '../public/js/main.js');
  const content = fs.readFileSync(jsPath, 'utf8');
  if (content.length < 1000) {
    throw new Error('File is too small, likely not built correctly');
  }
});

// Test 5: Check rearrangePremade.js for consistency
test('rearrangePremade.js uses modern React', () => {
  const jsPath = path.join(__dirname, '../public/js/rearrangePremade.js');
  const content = fs.readFileSync(jsPath, 'utf8');
  if (content.includes('React.createClass') || content.includes('r.createClass')) {
    throw new Error('File contains deprecated React.createClass');
  }
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${results.passed.length}`);
console.log(`Tests failed: ${results.failed.length}`);

if (results.failed.length > 0) {
  console.log('\nFailed tests:');
  results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\n✓ All verification checks passed!');
  console.log('\nThe rearrange page should now work correctly.');
  console.log('To test manually:');
  console.log('  1. Sign in as an admin user');
  console.log('  2. Navigate to http://localhost:3000/docs/rearrange');
  console.log('  3. You should see the rearrange interface with subjects/documents');
  process.exit(0);
}
