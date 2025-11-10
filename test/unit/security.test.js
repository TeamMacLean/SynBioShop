/**
 * Unit tests for security-related functions
 * Tests HTML escaping and other security utilities
 */

const chai = require('chai');
const expect = chai.expect;
const crypto = require('crypto');

describe('Security Functions', function() {
  describe('HTML Escaping (escapeHtml)', function() {
    // Since escapeHtml is defined in app.js, we'll test the logic here
    // This is the same implementation from app.js
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }

    it('should escape ampersand', function() {
      expect(escapeHtml('A & B')).to.equal('A &amp; B');
    });

    it('should escape less than', function() {
      expect(escapeHtml('<script>')).to.equal('&lt;script&gt;');
    });

    it('should escape greater than', function() {
      expect(escapeHtml('a > b')).to.equal('a &gt; b');
    });

    it('should escape double quotes', function() {
      expect(escapeHtml('Hello "World"')).to.equal('Hello &quot;World&quot;');
    });

    it('should escape single quotes', function() {
      expect(escapeHtml("It's nice")).to.equal('It&#x27;s nice');
    });

    it('should escape forward slash', function() {
      expect(escapeHtml('path/to/file')).to.equal('path&#x2F;to&#x2F;file');
    });

    it('should handle empty string', function() {
      expect(escapeHtml('')).to.equal('');
    });

    it('should handle null', function() {
      expect(escapeHtml(null)).to.equal('');
    });

    it('should handle undefined', function() {
      expect(escapeHtml(undefined)).to.equal('');
    });

    it('should escape XSS attack vector', function() {
      const malicious = '<script>alert("XSS")</script>';
      const escaped = escapeHtml(malicious);
      expect(escaped).to.equal('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
      expect(escaped).to.not.include('<script>');
    });

    it('should escape img tag XSS', function() {
      const malicious = '<img src=x onerror=alert(1)>';
      const escaped = escapeHtml(malicious);
      expect(escaped).to.not.include('<img');
      expect(escaped).to.include('&lt;img');
    });

    it('should handle multiple special characters', function() {
      const input = '<div class="test" onclick=\'alert("hi")\'>&copy;</div>';
      const escaped = escapeHtml(input);
      expect(escaped).to.not.include('<');
      expect(escaped).to.not.include('>');
      expect(escaped).to.include('&lt;');
      expect(escaped).to.include('&gt;');
    });

    it('should convert numbers to strings', function() {
      expect(escapeHtml(123)).to.equal('123');
    });

    it('should handle already escaped strings safely', function() {
      const alreadyEscaped = '&lt;script&gt;';
      const result = escapeHtml(alreadyEscaped);
      // Should double-escape the ampersand
      expect(result).to.equal('&amp;lt;script&amp;gt;');
    });
  });

  describe('Gravatar URL Generation', function() {
    // Test the getGravatarUrl function logic
    function getGravatarUrl(email) {
      if (!email) return null;
      const hash = crypto
        .createHash('md5')
        .update(email.toLowerCase().trim())
        .digest('hex');
      return 'https://www.gravatar.com/avatar/' + hash;
    }

    it('should generate valid Gravatar URL', function() {
      const url = getGravatarUrl('test@example.com');
      expect(url).to.be.a('string');
      expect(url).to.include('https://www.gravatar.com/avatar/');
    });

    it('should generate consistent hash for same email', function() {
      const url1 = getGravatarUrl('test@example.com');
      const url2 = getGravatarUrl('test@example.com');
      expect(url1).to.equal(url2);
    });

    it('should be case insensitive', function() {
      const url1 = getGravatarUrl('Test@Example.Com');
      const url2 = getGravatarUrl('test@example.com');
      expect(url1).to.equal(url2);
    });

    it('should trim whitespace', function() {
      const url1 = getGravatarUrl('  test@example.com  ');
      const url2 = getGravatarUrl('test@example.com');
      expect(url1).to.equal(url2);
    });

    it('should return null for empty email', function() {
      expect(getGravatarUrl('')).to.be.null;
      expect(getGravatarUrl(null)).to.be.null;
      expect(getGravatarUrl(undefined)).to.be.null;
    });

    it('should generate MD5 hash of email', function() {
      const email = 'test@example.com';
      const expectedHash = crypto.createHash('md5').update(email).digest('hex');
      const url = getGravatarUrl(email);
      expect(url).to.include(expectedHash);
    });

    it('should generate 32-character hash', function() {
      const url = getGravatarUrl('test@example.com');
      const hash = url.split('/avatar/')[1];
      expect(hash).to.have.lengthOf(32);
    });
  });

  describe('Image Extension Detection', function() {
    const path = require('path');
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];

    function isImage(filepath) {
      const ext = path.extname(filepath).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext);
    }

    it('should detect .jpg as image', function() {
      expect(isImage('photo.jpg')).to.be.true;
      expect(isImage('photo.JPG')).to.be.true;
    });

    it('should detect .png as image', function() {
      expect(isImage('icon.png')).to.be.true;
    });

    it('should detect .gif as image', function() {
      expect(isImage('animation.gif')).to.be.true;
    });

    it('should detect .svg as image', function() {
      expect(isImage('vector.svg')).to.be.true;
    });

    it('should detect .webp as image', function() {
      expect(isImage('modern.webp')).to.be.true;
    });

    it('should not detect .txt as image', function() {
      expect(isImage('document.txt')).to.be.false;
    });

    it('should not detect .pdf as image', function() {
      expect(isImage('file.pdf')).to.be.false;
    });

    it('should not detect .doc as image', function() {
      expect(isImage('document.doc')).to.be.false;
    });

    it('should be case insensitive', function() {
      expect(isImage('PHOTO.PNG')).to.be.true;
      expect(isImage('Photo.PnG')).to.be.true;
    });

    it('should handle paths with directories', function() {
      expect(isImage('/path/to/image.jpg')).to.be.true;
      expect(isImage('/path/to/file.txt')).to.be.false;
    });

    it('should handle files without extensions', function() {
      expect(isImage('filename')).to.be.false;
    });
  });
});
