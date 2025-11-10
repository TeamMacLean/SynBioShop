# Node v24 Upgrade - Manual Testing Guide

## Summary

This document outlines the upgrade of SynBioShop from Node.js v12.20.0 to Node.js v24.11.0 (LTS: Krypton). All automated tests pass successfully with the new Node version.

## Changes Made

### 1. Node Version Updates
- **`.nvmrc`**: Updated from `12.20.0` to `24.11.0`
- **`package.json`**: Added engines requirement
  ```json
  "engines": {
    "node": ">=24.0.0",
    "npm": ">=11.0.0"
  }
  ```

### 2. Dependencies
- All dependencies installed successfully using `npm install --legacy-peer-deps`
- npm v11.6.1 is now in use (upgraded from npm v6.x)
- package-lock.json updated for Node v24 compatibility

### 3. Test Results
**Automated Tests: ✅ PASSING**
- 34 tests passing
- 0 tests failing
- All unit tests pass successfully
- Integration tests pass (database connection errors are expected without RethinkDB running)

Test suites:
- ✅ Security Functions (14 tests)
- ✅ Gravatar URL Generation (6 tests)
- ✅ Image Extension Detection (11 tests)
- ✅ Application Integration Tests (3 tests)

---

## Manual Testing Required

### Critical Features to Test

#### 1. Application Startup
**Priority: HIGH**

- [ ] Start RethinkDB server
- [ ] Copy `config-example.json` to `config.json` and configure
- [ ] Run `npm start` or `node server.js`
- [ ] Verify server starts without errors
- [ ] Check console for any deprecation warnings or errors
- [ ] Confirm server listens on expected port

**Commands:**
```bash
# Ensure using Node v24
nvm use 24.11.0

# Start the application
npm start
```

#### 2. Database Connectivity
**Priority: HIGH**

- [ ] Verify RethinkDB connection establishes successfully
- [ ] Check database pool creation and management
- [ ] Test database queries execute correctly
- [ ] Verify session storage works (session-rethinkdb)
- [ ] Test data persistence across application restarts

**What to watch for:**
- Connection pool errors
- Query execution failures
- Session storage issues

#### 3. Authentication & Authorization
**Priority: HIGH**

- [ ] Test LDAP authentication (ldapjs)
- [ ] Verify user login functionality
- [ ] Test passport.js authentication flow
- [ ] Confirm session management works correctly
- [ ] Test user logout functionality
- [ ] Verify protected routes are still protected

**Routes to test:**
- `/signin` - Login page
- `/` - Home page (may require auth)
- Any admin or protected routes

#### 4. File Upload Functionality
**Priority: HIGH**

**⚠️ SECURITY WARNING**: Current multer version (0.1.8) has CVE-2022-24434

- [ ] Test file upload functionality
- [ ] Verify file size limits are enforced
- [ ] Test various file types (images, documents)
- [ ] Confirm uploaded files are stored correctly
- [ ] Test file path validation and security

#### 5. Web Interface
**Priority: MEDIUM**

- [ ] Test all main pages load correctly
- [ ] Verify CSS/LESS compilation works
- [ ] Test JavaScript bundle loads and executes
- [ ] Check for browser console errors
- [ ] Test responsive design on different screen sizes
- [ ] Verify TinyMCE editor functionality
- [ ] Test Micromodal popups

**Build commands:**
```bash
npm run build
npm run build-watch  # For development
```

#### 6. Email Functionality
**Priority: MEDIUM**

- [ ] Test email sending (nodemailer)
- [ ] Verify email templates render correctly (email-templates)
- [ ] Test SMTP configuration
- [ ] Confirm email delivery for critical actions

#### 7. Real-time Features
**Priority: MEDIUM**

**⚠️ DEPRECATION WARNING**: socket.io v1.6.0 is very old (latest is v4.8.1)

- [ ] Test Socket.IO connection establishment
- [ ] Verify real-time data updates
- [ ] Test WebSocket fallback mechanisms
- [ ] Check for connection stability issues
- [ ] Test reconnection logic

#### 8. CSV Export/Import
**Priority: LOW**

- [ ] Test CSV export functionality
- [ ] Verify CSV data format is correct
- [ ] Test CSV import if applicable
- [ ] Check for encoding issues

---

## Known Issues & Deprecation Warnings

### Critical Security Vulnerabilities
npm audit reports **76 vulnerabilities** (1 low, 24 moderate, 38 high, 13 critical)

**Most Critical:**
1. **multer v0.1.8** - CVE-2022-24434 (File upload vulnerability)
   - **Recommendation**: Upgrade to multer v1.4.4-lts.1 or v2.0.0+

2. **nodemailer v2.7.2** - All versions below v4.0.1 deprecated
   - **Recommendation**: Upgrade to nodemailer v7.0.0+

3. **socket.io v1.7.4** - Very outdated (v4.8.1 available)
   - **Recommendation**: Upgrade to socket.io v4.x (requires code changes)

### Deprecated Dependencies

The following packages are deprecated or unmaintained:

1. **ldapjs v1.0.2** - Package decomissioned
   - Recommendation: Migrate to ldapjs v3.0.7 or alternative LDAP library

2. **session-rethinkdb v2.0.1** - No longer supported
   - Recommendation: Consider alternative session store

3. **email-templates v2.7.1** - Deprecated (v12.0.3 available)
   - Major version upgrade required

4. **request** - Completely deprecated
   - Used by several dependencies
   - Modern alternatives: axios, node-fetch, undici

5. **core-js v1.2.7** - Can cause 100x slowdown
   - Update webpack/babel configuration to use v3+

### Webpack Compatibility

Current setup uses webpack v2.7.0 with conflicting peer dependencies:
- css-loader v3 requires webpack v4 or v5
- Installation required `--legacy-peer-deps` flag

**Recommendation**: Upgrade webpack to v5 and update all loaders

---

## Performance Testing

### Areas to Monitor

1. **Memory Usage**
   - [ ] Monitor application memory consumption over time
   - [ ] Check for memory leaks during extended operation
   - [ ] Test under normal and peak load conditions

2. **Response Times**
   - [ ] Measure page load times
   - [ ] Test API endpoint response times
   - [ ] Compare with Node v12 baseline if available

3. **Database Performance**
   - [ ] Monitor query execution times
   - [ ] Check connection pool efficiency
   - [ ] Test concurrent user loads

4. **Build Performance**
   - [ ] Measure webpack build times
   - [ ] Compare production vs development builds

---

## Browser Compatibility Testing

Test in the following browsers:

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile browsers (iOS Safari, Chrome Android)

---

## Environment-Specific Testing

### Development Environment
- [ ] `npm run start-watch` - Nodemon auto-restart
- [ ] `npm run build-watch` - Webpack hot reload
- [ ] Source maps work correctly

### Production Environment
- [ ] Production build completes successfully
- [ ] Minification works correctly
- [ ] Environment variables load properly
- [ ] Logging configuration correct
- [ ] Error handling appropriate for production

---

## Rollback Plan

If critical issues are discovered:

1. **Revert Node version**
   ```bash
   nvm use 12.20.0
   ```

2. **Revert code changes**
   ```bash
   git revert <commit-hash>
   ```

3. **Reinstall dependencies**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

---

## Recommendations for Future Work

### Immediate Priority (Before Production Deploy)

1. **Fix Security Vulnerabilities**
   - Upgrade multer to v2.0.0+
   - Update nodemailer to v7.x
   - Review and update all high/critical vulnerabilities

2. **Test with Database**
   - Set up RethinkDB in test environment
   - Run full integration test suite
   - Test data migration if needed

### Medium-Term Improvements

1. **Modernize Build System**
   - Upgrade webpack v2 → v5
   - Update all webpack loaders and plugins
   - Consider Vite or alternative bundlers

2. **Update Critical Dependencies**
   - socket.io v1 → v4 (breaking changes expected)
   - express v4 → v5 (when stable)
   - React v15 → v18 (major rewrite required)

3. **Replace Deprecated Packages**
   - Find alternative to ldapjs or upgrade to v3
   - Replace session-rethinkdb with alternative
   - Migrate from moment.js to date-fns or dayjs

4. **Improve Test Coverage**
   - Add tests requiring database connectivity
   - Add end-to-end tests with Playwright or Cypress
   - Add performance benchmarks

### Long-Term Considerations

1. **TypeScript Migration**
   - Add type safety to prevent runtime errors
   - Better IDE support and developer experience

2. **API Modernization**
   - Consider REST → GraphQL migration
   - Implement API versioning
   - Add OpenAPI/Swagger documentation

3. **Database Evaluation**
   - Assess RethinkDB alternatives (PostgreSQL, MongoDB)
   - RethinkDB project has limited maintenance

---

## Success Criteria

The Node v24 upgrade is considered successful when:

- ✅ All automated tests pass
- ⏳ Application starts without errors
- ⏳ All critical features function correctly
- ⏳ No performance regressions observed
- ⏳ No new bugs introduced
- ⏳ Production deployment successful

---

## Support & Resources

- Node.js v24 Release Notes: https://nodejs.org/en/blog/release/
- npm v11 Documentation: https://docs.npmjs.com/
- Breaking Changes: Review Node.js v13-v24 breaking changes

---

## Testing Sign-off

| Test Area | Tester | Date | Status | Notes |
|-----------|--------|------|--------|-------|
| Application Startup | | | ⏳ | |
| Database Connectivity | | | ⏳ | |
| Authentication | | | ⏳ | |
| File Upload | | | ⏳ | |
| Web Interface | | | ⏳ | |
| Email Functionality | | | ⏳ | |
| Real-time Features | | | ⏳ | |
| Performance Testing | | | ⏳ | |
| Browser Compatibility | | | ⏳ | |

---

**Last Updated**: 2025-11-10
**Node Version**: v24.11.0 (LTS: Krypton)
**npm Version**: v11.6.1
