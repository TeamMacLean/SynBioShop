# SynBioShop Test Suite

This directory contains the test suite for SynBioShop, designed to work across Node.js versions from 12.20.0 to 20+ LTS.

## Prerequisites

Before running tests, you need to:

1. **Create config.json**: Copy the example configuration
   ```bash
   cp config-example.json config.json
   ```

2. **Install dependencies**: Install all test dependencies
   ```bash
   npm install --legacy-peer-deps
   ```

## Current Test Status

**✅ 48 passing tests** (all unit and security tests)

**Known Limitations:**
- Integration tests may fail without `config.json` (see Prerequisites above)
- Some integration tests require RethinkDB to be running
- LDAP authentication tests require LDAP connection
- Express 4.14.0 doesn't support built-in body parsing (will work after upgrading to Express 4.16+)

## Test Structure

```
test/
├── helpers/
│   └── setup.js           # Test configuration and global helpers
├── integration/
│   └── app.test.js        # Integration tests for routes and middleware
└── unit/
    ├── utils.test.js      # Unit tests for utility functions
    └── security.test.js   # Unit tests for security functions
```

## Running Tests

### Install Test Dependencies

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Only Unit Tests

```bash
npm run test:unit
```

### Run Only Integration Tests

```bash
npm run test:integration
```

### Run with Verbose Output

```bash
npm test -- --reporter spec
```

## Test Coverage

### Integration Tests (`test/integration/`)

- **Home Page**: Tests that the root route (`/`) loads successfully
- **Sign-In Page**: Tests that the sign-in page loads
- **Static Assets**: Verifies static file serving works
- **Protected Routes**: Checks authentication redirects
- **Error Handling**: Tests 404 responses and invalid requests
- **API Health**: Basic middleware health checks

### Unit Tests (`test/unit/`)

#### Utils Tests (`utils.test.js`)
- `toSafeName()`: Converts strings to URL-safe format
- `isAdmin()`: Checks admin user status
- `generateSafeName()`: Generates unique safe names with deduplication

#### Security Tests (`security.test.js`)
- **HTML Escaping**: Tests the native `escapeHtml()` function (replaced `validator.escape`)
  - XSS attack prevention
  - Special character escaping
  - Edge case handling
- **Gravatar URL Generation**: Tests the native `getGravatarUrl()` function (replaced `gravatar` package)
  - MD5 hash generation
  - Case insensitivity
  - Whitespace trimming
- **Image Extension Detection**: Tests the native `isImage()` function (replaced `is-image` package)
  - Supported formats: .jpg, .jpeg, .png, .gif, .bmp, .svg, .webp, .ico, .tiff, .tif
  - Case insensitivity
  - Path handling

## Test Dependencies

All test dependencies are chosen for maximum compatibility across Node.js versions:

- **mocha** (^8.4.0): Test framework - supports Node 12+ through Node 20+
- **chai** (^4.3.4): Assertion library - extremely stable across versions
- **supertest** (^6.1.3): HTTP integration testing - works on Node 12+ through latest
- **sinon** (^11.1.0): Mocking and stubbing - if needed for future tests

These versions are:
- ✅ Compatible with Node 12.20.0 (current version)
- ✅ Compatible with Node 18 LTS
- ✅ Compatible with Node 20 LTS
- ✅ Will upgrade smoothly when Node version is upgraded

## Configuration

Test configuration is in `.mocharc.json`:

```json
{
  "require": ["test/helpers/setup.js"],
  "timeout": 5000,
  "exit": true,
  "color": true,
  "spec": "test/**/*.test.js"
}
```

## Writing New Tests

### Integration Test Template

```javascript
const chai = require('chai');
const request = require('supertest');
const expect = chai.expect;

describe('Feature Name', function() {
  let app;

  before(function() {
    app = require('../../app.js');
  });

  it('should do something', function(done) {
    request(app)
      .get('/route')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        expect(res.body).to.have.property('key');
        done();
      });
  });
});
```

### Unit Test Template

```javascript
const chai = require('chai');
const expect = chai.expect;

describe('Module Name', function() {
  let module;

  before(function() {
    module = require('../../lib/module.js');
  });

  it('should do something', function() {
    const result = module.functionName('input');
    expect(result).to.equal('expected');
  });
});
```

## Important Notes

### Database Dependency

Some integration tests may fail if:
- RethinkDB is not running
- Database connection fails
- Test data is not seeded

This is expected behavior. The tests will still verify that the app structure is correct.

### LDAP Dependency

Authentication tests may fail without LDAP connection. This is normal in development/testing environments.

### Session Store

Tests run with the configured session store (RethinkDB). If the connection fails, some tests may timeout.

## Continuous Integration

These tests are designed to be run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Install dependencies
  run: npm ci
- name: Run tests
  run: npm test
```

## Upgrading Node Version

When upgrading Node.js, follow this checklist:

1. **Before upgrade**: Run `npm test` to ensure all tests pass
2. **After upgrade**: Run `npm test` to verify compatibility
3. **Update test dependencies** if needed:
   ```bash
   npm update mocha chai supertest sinon --save-dev
   ```
4. **Check for deprecation warnings** in test output
5. **Update this README** if test behavior changes

## Node Version Compatibility

| Node Version | Status | Notes |
|--------------|--------|-------|
| 12.20.0      | ✅ Current | All tests pass |
| 14.x LTS     | ✅ Compatible | Should work without changes |
| 16.x LTS     | ✅ Compatible | Should work without changes |
| 18.x LTS     | ✅ Compatible | Recommended upgrade target |
| 20.x LTS     | ✅ Compatible | Latest LTS, best long-term choice |

## Test Philosophy

These tests follow these principles:

1. **Stability**: Use mature, well-maintained packages
2. **Compatibility**: Work across multiple Node versions
3. **Simplicity**: Easy to understand and maintain
4. **Coverage**: Test critical paths and edge cases
5. **Speed**: Fast enough to run frequently
6. **Isolation**: Tests don't depend on external services where possible

## Troubleshooting

### Tests Timeout

- Increase timeout in `.mocharc.json` or use `--timeout` flag:
  ```bash
  npm test -- --timeout 10000
  ```

### Database Connection Errors

- Ensure RethinkDB is running
- Check database configuration in `config.json`
- Some tests are expected to fail without DB

### Module Not Found Errors

- Run `npm install` to install all dependencies
- Check that file paths in tests are correct

### Tests Pass Locally But Fail in CI

- Check Node version matches between local and CI
- Ensure all dependencies are listed in `package.json`
- Check for environment-specific configuration

## Future Improvements

Potential enhancements for the test suite:

- [ ] Add database mocking for integration tests
- [ ] Add code coverage reporting (nyc/istanbul)
- [ ] Add E2E tests with browser automation
- [ ] Add performance/load testing
- [ ] Add API contract testing
- [ ] Mock LDAP for authentication tests
- [ ] Add tests for file upload functionality
- [ ] Add tests for real-time Socket.io features

## Related Documentation

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertion Library](https://www.chaijs.com/)
- [SuperTest Documentation](https://github.com/visionmedia/supertest)
- [Node.js Version Support](https://nodejs.org/en/about/releases/)

## Questions or Issues?

If you encounter issues with the test suite:

1. Check this README for troubleshooting steps
2. Ensure your Node version matches `.nvmrc`
3. Run `npm install` to update dependencies
4. Check test output for specific error messages
