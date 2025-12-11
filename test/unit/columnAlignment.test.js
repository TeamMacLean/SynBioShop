/**
 * Unit tests for table column alignment
 * Tests that item data arrays maintain proper alignment with heading arrays
 * even when some field values are empty/undefined/null
 *
 * This test was created to catch the bug where empty field values would cause
 * columns to shift left in the category table view (e.g., "Synthetic" category
 * value appearing in the wrong column because earlier empty fields were skipped)
 */

const chai = require('chai');
const expect = chai.expect;

describe('Table Column Alignment', function() {

  /**
   * Simulates the logic from controllers/premade.js that builds item data
   * This is the FIXED version that always pushes values to maintain alignment
   */
  function buildItemDataFixed(typeRecord, typeDefinition) {
    const itemData = {
      items: [typeRecord.description || "", typeRecord.comments || ""],
      id: typeRecord.id,
      name: typeRecord.name,
      disabled: typeRecord.disabled,
      position: typeRecord.position || 0,
    };

    // Fixed: Always push a value (even empty string) to maintain alignment
    typeDefinition.fields.forEach((fieldDef) => {
      itemData.items.push(typeRecord[fieldDef.name] || "");
    });

    return itemData;
  }

  /**
   * Simulates the BUGGY version that skipped empty fields
   */
  function buildItemDataBuggy(typeRecord, typeDefinition) {
    const itemData = {
      items: [typeRecord.description || "", typeRecord.comments || ""],
      id: typeRecord.id,
      name: typeRecord.name,
      disabled: typeRecord.disabled,
      position: typeRecord.position || 0,
    };

    // Bug: Only push if field has a truthy value - causes column shift!
    typeDefinition.fields.forEach((fieldDef) => {
      if (typeRecord[fieldDef.name]) {
        itemData.items.push(typeRecord[fieldDef.name]);
      }
    });

    return itemData;
  }

  /**
   * Builds headings array the same way as the controller
   */
  function buildHeadings(typeDefinition) {
    const headings = ["Description", "Comments"];
    typeDefinition.fields.forEach((field) => headings.push(field.text));
    return headings;
  }

  // Sample type definition similar to Type2 from models
  const mockType2Definition = {
    fields: [
      { type: "text", name: "code", text: "Code" },
      { type: "text", name: "speciesOfOrigin", text: "Species of Origin" },
      { type: "text", name: "category", text: "Category" },
      { type: "text", name: "whoMadeIt", text: "Who made it" },
    ]
  };

  // Sample type definition similar to Type1 from models
  const mockType1Definition = {
    fields: [
      { type: "text", name: "insideOverhangLeft", text: "Inside o/hang L" },
      { type: "text", name: "insideOverhangRight", text: "Inside o/hang R" },
      { type: "text", name: "outsideOverhangLeft", text: "Outside o/hang L" },
      { type: "text", name: "outsideOverhangRight", text: "Outside o/hang R" },
      { type: "text", name: "resistance", text: "Resistance" },
      { type: "text", name: "whoMadeIt", text: "Who made it" },
    ]
  };

  describe('Fixed buildItemData function', function() {

    it('should maintain alignment when all fields have values', function() {
      const record = {
        id: 'test-1',
        name: 'Test Item',
        description: 'A description',
        comments: 'Some comments',
        code: 'ABC123',
        speciesOfOrigin: 'E. coli',
        category: 'Synthetic',
        whoMadeIt: 'Mark Youles (TSL)'
      };

      const headings = buildHeadings(mockType2Definition);
      const itemData = buildItemDataFixed(record, mockType2Definition);

      // Headings: Description, Comments, Code, Species of Origin, Category, Who made it
      expect(headings.length).to.equal(6);
      // Items should have same number of entries as headings
      expect(itemData.items.length).to.equal(headings.length);

      // Verify correct alignment
      expect(itemData.items[0]).to.equal('A description'); // Description
      expect(itemData.items[1]).to.equal('Some comments'); // Comments
      expect(itemData.items[2]).to.equal('ABC123'); // Code
      expect(itemData.items[3]).to.equal('E. coli'); // Species of Origin
      expect(itemData.items[4]).to.equal('Synthetic'); // Category
      expect(itemData.items[5]).to.equal('Mark Youles (TSL)'); // Who made it
    });

    it('should maintain alignment when some fields are empty strings', function() {
      const record = {
        id: 'test-2',
        name: 'Test Item 2',
        description: 'A description',
        comments: '',  // Empty
        code: '',      // Empty
        speciesOfOrigin: '',  // Empty
        category: 'Synthetic',
        whoMadeIt: 'Mark Youles (TSL)'
      };

      const headings = buildHeadings(mockType2Definition);
      const itemData = buildItemDataFixed(record, mockType2Definition);

      // Items should still have same number of entries as headings
      expect(itemData.items.length).to.equal(headings.length);

      // Verify correct alignment - empty values should be at correct positions
      expect(itemData.items[0]).to.equal('A description'); // Description
      expect(itemData.items[1]).to.equal(''); // Comments (empty)
      expect(itemData.items[2]).to.equal(''); // Code (empty)
      expect(itemData.items[3]).to.equal(''); // Species of Origin (empty)
      expect(itemData.items[4]).to.equal('Synthetic'); // Category - should be in position 4!
      expect(itemData.items[5]).to.equal('Mark Youles (TSL)'); // Who made it
    });

    it('should maintain alignment when fields are undefined', function() {
      const record = {
        id: 'test-3',
        name: 'Test Item 3',
        description: 'A description',
        comments: 'Some comments',
        // code is undefined
        // speciesOfOrigin is undefined
        category: 'Synthetic',
        whoMadeIt: 'Mark Youles (TSL)'
      };

      const headings = buildHeadings(mockType2Definition);
      const itemData = buildItemDataFixed(record, mockType2Definition);

      // Items should still have same number of entries as headings
      expect(itemData.items.length).to.equal(headings.length);

      // Verify correct alignment
      expect(itemData.items[4]).to.equal('Synthetic'); // Category should still be at position 4
      expect(itemData.items[5]).to.equal('Mark Youles (TSL)'); // Who made it at position 5
    });

    it('should maintain alignment when fields are null', function() {
      const record = {
        id: 'test-4',
        name: 'Test Item 4',
        description: 'A description',
        comments: null,
        code: null,
        speciesOfOrigin: null,
        category: 'Synthetic',
        whoMadeIt: 'Mark Youles (TSL)'
      };

      const headings = buildHeadings(mockType2Definition);
      const itemData = buildItemDataFixed(record, mockType2Definition);

      expect(itemData.items.length).to.equal(headings.length);
      expect(itemData.items[4]).to.equal('Synthetic');
      expect(itemData.items[5]).to.equal('Mark Youles (TSL)');
    });

    it('should work with Type1 definition (more fields)', function() {
      const record = {
        id: 'test-5',
        name: 'pICSL30072',
        description: '6HIS-AviTAG-C3 NTAG',
        comments: '',
        insideOverhangLeft: '',
        insideOverhangRight: '',
        outsideOverhangLeft: '',
        outsideOverhangRight: '',
        resistance: '',
        whoMadeIt: 'Synthetic'
      };

      const headings = buildHeadings(mockType1Definition);
      const itemData = buildItemDataFixed(record, mockType1Definition);

      // 2 base headings + 6 Type1 fields = 8 total
      expect(headings.length).to.equal(8);
      expect(itemData.items.length).to.equal(headings.length);

      // whoMadeIt should be at the last position (index 7)
      expect(itemData.items[7]).to.equal('Synthetic');
    });
  });

  describe('Buggy buildItemData function (for comparison)', function() {

    it('should demonstrate the column shift bug with empty fields', function() {
      const record = {
        id: 'bug-demo',
        name: 'Bug Demo Item',
        description: 'A description',
        comments: '',  // Empty - will be ""
        code: '',      // Empty - will be skipped!
        speciesOfOrigin: '',  // Empty - will be skipped!
        category: 'Synthetic',
        whoMadeIt: 'Mark Youles (TSL)'
      };

      const headings = buildHeadings(mockType2Definition);
      const itemData = buildItemDataBuggy(record, mockType2Definition);

      // BUG: Items array is shorter than headings because empty fields were skipped
      expect(itemData.items.length).to.be.lessThan(headings.length);

      // BUG: "Synthetic" is now at wrong position (shifted left)
      // It should be at index 4 (Category column) but it's at index 2
      expect(itemData.items[2]).to.equal('Synthetic'); // This is WRONG - it's in Code column position!

      // This demonstrates the bug the user reported - values appear in wrong columns
    });
  });

  describe('Column alignment invariant', function() {

    it('should always have items.length equal to headings.length', function() {
      // Test with various combinations of missing fields
      const testCases = [
        { description: 'Full', comments: 'Yes', code: 'A', speciesOfOrigin: 'B', category: 'C', whoMadeIt: 'D' },
        { description: '', comments: '', code: '', speciesOfOrigin: '', category: '', whoMadeIt: '' },
        { description: 'Only desc' },
        { category: 'Only category', whoMadeIt: 'Only maker' },
        {},  // All empty
      ];

      const headings = buildHeadings(mockType2Definition);

      testCases.forEach((testRecord, index) => {
        const record = {
          id: `test-${index}`,
          name: `Test ${index}`,
          ...testRecord
        };

        const itemData = buildItemDataFixed(record, mockType2Definition);

        expect(itemData.items.length).to.equal(
          headings.length,
          `Test case ${index} failed: items.length (${itemData.items.length}) !== headings.length (${headings.length})`
        );
      });
    });

    it('should ensure each item maps to its corresponding heading', function() {
      const record = {
        id: 'mapping-test',
        name: 'Mapping Test',
        description: 'DESC_VALUE',
        comments: 'COMMENTS_VALUE',
        code: 'CODE_VALUE',
        speciesOfOrigin: 'SPECIES_VALUE',
        category: '',  // Empty - but should still have placeholder
        whoMadeIt: 'MAKER_VALUE'
      };

      const headings = buildHeadings(mockType2Definition);
      const itemData = buildItemDataFixed(record, mockType2Definition);

      // Create a mapping and verify each value is at the right heading index
      const mapping = {};
      headings.forEach((heading, index) => {
        mapping[heading] = itemData.items[index];
      });

      expect(mapping['Description']).to.equal('DESC_VALUE');
      expect(mapping['Comments']).to.equal('COMMENTS_VALUE');
      expect(mapping['Code']).to.equal('CODE_VALUE');
      expect(mapping['Species of Origin']).to.equal('SPECIES_VALUE');
      expect(mapping['Category']).to.equal(''); // Empty but correctly positioned
      expect(mapping['Who made it']).to.equal('MAKER_VALUE');
    });
  });

  describe('EJS template filtering (Who made it column)', function() {

    /**
     * Tests the logic from show.ejs that filters out "Who made it" column
     */
    it('should correctly filter headings and items arrays in sync', function() {
      const headings = ['Description', 'Comments', 'Code', 'Species of Origin', 'Category', 'Who made it'];
      const items = ['Desc', 'Comm', 'Code123', 'E. coli', 'Synthetic', 'Mark Youles'];

      const whoMadeItHeaderIndex = headings.indexOf('Who made it');
      const newHeadings = headings.filter(heading => heading !== 'Who made it');
      const filteredItems = items.filter((_, idx) => idx !== whoMadeItHeaderIndex);

      // After filtering, arrays should still be aligned
      expect(newHeadings.length).to.equal(filteredItems.length);

      // Verify mapping is still correct
      newHeadings.forEach((heading, idx) => {
        const expectedValue = {
          'Description': 'Desc',
          'Comments': 'Comm',
          'Code': 'Code123',
          'Species of Origin': 'E. coli',
          'Category': 'Synthetic'
        }[heading];

        expect(filteredItems[idx]).to.equal(expectedValue,
          `Heading "${heading}" at index ${idx} should map to "${expectedValue}" but got "${filteredItems[idx]}"`);
      });
    });

    it('should handle case when Who made it is not present', function() {
      const headings = ['Description', 'Comments', 'Code'];
      const items = ['Desc', 'Comm', 'Code123'];

      const whoMadeItHeaderIndex = headings.indexOf('Who made it'); // -1
      const newHeadings = headings.filter(heading => heading !== 'Who made it');
      const filteredItems = items.filter((_, idx) => idx !== whoMadeItHeaderIndex);

      // When "Who made it" doesn't exist, arrays should be unchanged
      expect(newHeadings).to.deep.equal(headings);
      expect(filteredItems).to.deep.equal(items);
    });
  });
});
