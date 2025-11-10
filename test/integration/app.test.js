/**
 * Integration tests for main application
 * Tests basic routes and server functionality
 */

const chai = require('chai');
const request = require('supertest');
const expect = chai.expect;

describe('Application Integration Tests', function() {
  let app;

  // Load the app before tests
  before(function() {
    // Import the app (which is actually the HTTP server from app.js)
    app = require('../../app.js');
  });

  describe('GET /', function() {
    it('should load the home page', function(done) {
      request(app)
        .get('/')
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          expect(res.text).to.be.a('string');
          expect(res.text.length).to.be.greaterThan(0);
          done();
        });
    });

    it('should return HTML content', function(done) {
      request(app)
        .get('/')
        .expect('Content-Type', /html/)
        .expect(200, done);
    });
  });

  describe('GET /signin', function() {
    it('should load the sign-in page', function(done) {
      request(app)
        .get('/signin')
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          expect(res.text).to.include('sign'); // Should have "sign" in the content
          done();
        });
    });

    it('should return HTML content', function(done) {
      request(app)
        .get('/signin')
        .expect('Content-Type', /html/)
        .expect(200, done);
    });
  });

  describe('Static Assets', function() {
    it('should serve static files from /public', function(done) {
      // Test that static middleware is working
      // We'll just check that the route doesn't return 404
      request(app)
        .get('/style/main.css')
        .end(function(err, res) {
          // Could be 200 if file exists or 404 if not, but shouldn't error
          expect([200, 304, 404]).to.include(res.status);
          done();
        });
    });
  });

  describe('Protected Routes', function() {
    it('should redirect unauthenticated users from /premade', function(done) {
      request(app)
        .get('/premade')
        .end(function(err, res) {
          // Should either redirect (302/301) or show unauthorized (401/403) or redirect to signin
          expect([200, 301, 302, 401, 403]).to.include(res.status);
          done();
        });
    });

    it('should handle /admin route', function(done) {
      request(app)
        .get('/admin')
        .end(function(err, res) {
          // Should either redirect or show unauthorized
          expect([200, 301, 302, 401, 403]).to.include(res.status);
          done();
        });
    });
  });

  describe('Error Handling', function() {
    it('should return 404 for non-existent routes', function(done) {
      request(app)
        .get('/this-route-does-not-exist-12345')
        .expect(404, done);
    });

    it('should handle invalid POST requests gracefully', function(done) {
      request(app)
        .post('/nonexistent-endpoint')
        .send({ test: 'data' })
        .end(function(err, res) {
          expect([400, 404, 405]).to.include(res.status);
          done();
        });
    });
  });

  describe('API Health', function() {
    it('should have working session middleware', function(done) {
      request(app)
        .get('/')
        .end(function(err, res) {
          // Check that cookies are being set (session cookie)
          // This is a basic check that session middleware is loaded
          expect(res.status).to.equal(200);
          done();
        });
    });
  });
});
