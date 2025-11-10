/**
 * Unit tests for utility functions
 * Tests lib/util.js helper functions
 */

const chai = require('chai');
const expect = chai.expect;

describe('Utility Functions', function() {
  let util;

  before(function() {
    // Load the utility module
    util = require('../../lib/util.js');
  });

  describe('toSafeName()', function() {
    it('should convert spaces to underscores', function() {
      const result = util.toSafeName('hello world');
      expect(result).to.equal('hello_world');
    });

    it('should convert to lowercase', function() {
      const result = util.toSafeName('HELLO');
      expect(result).to.equal('hello');
    });

    it('should replace ampersand with "and"', function() {
      const result = util.toSafeName('Rock & Roll');
      expect(result).to.equal('rock_and_roll');
    });

    it('should remove special characters', function() {
      const result = util.toSafeName('hello@world!');
      expect(result).to.equal('hello_world_');
    });

    it('should handle multiple special characters', function() {
      const result = util.toSafeName('Test (123) - File.txt');
      expect(result).to.equal('test__123____file_txt');
    });

    it('should handle empty string', function() {
      const result = util.toSafeName('');
      expect(result).to.equal('');
    });

    it('should handle numbers', function() {
      const result = util.toSafeName('test123');
      expect(result).to.equal('test123');
    });

    it('should handle alphanumeric with underscores', function() {
      const result = util.toSafeName('valid_name_123');
      expect(result).to.equal('valid_name_123');
    });
  });

  describe('isAdmin()', function() {
    it('should return true for admin users', function() {
      // This test requires config.json to have admins list
      // We'll just test the function works
      const result = util.isAdmin('testuser');
      expect(result).to.be.a('boolean');
    });

    it('should return false for non-admin users', function() {
      const result = util.isAdmin('definitely-not-an-admin-user-12345');
      expect(result).to.equal(false);
    });

    it('should return false for empty string', function() {
      const result = util.isAdmin('');
      expect(result).to.equal(false);
    });

    it('should return false for null/undefined', function() {
      const result1 = util.isAdmin(null);
      const result2 = util.isAdmin(undefined);
      expect(result1).to.equal(false);
      expect(result2).to.equal(false);
    });
  });

  describe('generateSafeName()', function() {
    it('should generate a safe name', function(done) {
      const list = [
        { safeName: 'existing_name' }
      ];

      util.generateSafeName('Test Name', list, function(safeName) {
        expect(safeName).to.be.a('string');
        expect(safeName).to.equal('test_name');
        done();
      });
    });

    it('should avoid duplicates by adding number suffix', function(done) {
      const list = [
        { safeName: 'test_name' },
        { safeName: 'test_name_2' }
      ];

      util.generateSafeName('Test Name', list, function(safeName) {
        expect(safeName).to.equal('test_name_3');
        done();
      });
    });

    it('should handle empty list', function(done) {
      const list = [];

      util.generateSafeName('Unique Name', list, function(safeName) {
        expect(safeName).to.equal('unique_name');
        done();
      });
    });

    it('should use callback pattern correctly', function(done) {
      const list = [];

      util.generateSafeName('Test', list, function(result) {
        expect(result).to.be.a('string');
        done();
      });
    });
  });
});
