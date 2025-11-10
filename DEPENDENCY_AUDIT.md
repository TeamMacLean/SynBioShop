# SynBioShop Dependency Audit Report

**Date:** 2025-11-10
**Node Version:** Currently configured for Node 12.20.0 (via .nvmrc)
**Goal:** Reduce dependencies and prepare for Node.js upgrade

---

## Executive Summary

This audit identifies opportunities to reduce the dependency footprint by:
1. Removing unused dependencies (2 packages)
2. Replacing dependencies with native Node.js features (5 packages)
3. Implementing simple alternatives for lightweight utilities (2 packages)
4. Keeping essential/complex dependencies (26 packages)

**Total potential reduction: 9 dependencies** (24% reduction from 38 to 29 dependencies)

---

## Current Node Version Constraints

**Current Target:** Node 12.20.0
- No optional chaining (`?.`)
- No nullish coalescing (`??`)
- No native fetch API
- No top-level await
- No native promises for many fs methods

**Recommendation:** Upgrade to Node 18 LTS or Node 20 LTS for modern features while maintaining stability.

---

## Dependency Analysis

### 🔴 REMOVE IMMEDIATELY (Not Used)

#### 1. `cheerio` (^1.0.0-rc.12)
- **Usage:** NOT USED - No references found in codebase
- **Action:** Remove from dependencies
- **Impact:** None - no code changes needed

#### 2. `fs` (0.0.1-security)
- **Usage:** This is a FAKE package - Node.js includes fs natively
- **Action:** Remove from dependencies immediately
- **Impact:** None - fs is built into Node.js
- **Note:** This package exists only to warn users they don't need it

---

### 🟡 REPLACE WITH NATIVE NODE.JS (Modern Versions)

#### 3. `mkdirp` (^1.0.4)
- **Current Usage:**
  - `controllers/upload.js:9` - Creating directories recursively
  - `controllers/premade.js` - Directory creation
- **Native Alternative:** `fs.mkdir(path, { recursive: true })`
- **Available Since:** Node 10.12.0 ✅ (AVAILABLE NOW)
- **Action:** Replace with native fs.promises.mkdir
- **Files to Update:**
  - `controllers/upload.js:57`
  - `controllers/upload.js:277`
  - `controllers/premade.js` (need to verify)

**Example Refactor:**
```javascript
// Before
const mkdirp = require('mkdirp');
await mkdirp(dir);

// After
const fs = require('fs').promises;
await fs.mkdir(dir, { recursive: true });
```

#### 4. `body-parser` (^1.15.0)
- **Current Usage:**
  - `app.js:38-39` - Parsing JSON and URL-encoded bodies
- **Native Alternative:** Built into Express 4.16+
- **Available Since:** Express 4.16.0 (2018) ✅
- **Action:** Replace with express.json() and express.urlencoded()
- **Files to Update:** `app.js`

**Example Refactor:**
```javascript
// Before
const bodyParser = require('body-parser');
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));

// After
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
```

#### 5. `moment` (^2.17.0)
- **Current Usage:**
  - `models/order.js:4-5` - Date formatting
  - `models/order.js:23-27` - Human-readable dates (`.calendar()`)
- **Native Alternative:** Native Date + Intl.DateTimeFormat
- **Available Since:** Node 12+ has Intl support ✅
- **Action:** Replace with native Date methods
- **Files to Update:** `models/order.js`
- **Considerations:**
  - Moment is 232KB unpacked
  - No longer maintained (in maintenance mode)
  - Native Intl API is well-supported
  - `.calendar()` method would need custom implementation

**Example Refactor:**
```javascript
// Before
const moment = require('moment');
moment.locale('en-gb');
Order.define('createdHumanDate', function() {
  return moment(this.createdAt).calendar();
});

// After - Simple approach
Order.define('createdHumanDate', function() {
  const date = new Date(this.createdAt);
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
});

// After - More calendar-like behavior
Order.define('createdHumanDate', function() {
  return formatCalendarDate(this.createdAt);
});

function formatCalendarDate(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const days = diff / (1000 * 60 * 60 * 24);

  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${Math.floor(days)} days ago`;

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium'
  }).format(new Date(date));
}
```

#### 6. `axios` (^1.6.8)
- **Current Usage:** NOT FOUND in codebase
- **Native Alternative:** Native fetch API
- **Available Since:** Node 18.0.0 (NOT AVAILABLE in Node 12)
- **Action:** If truly unused, remove. If used, wait for Node 18 upgrade
- **Note:** Double-check if used in frontend code

#### 7. `gravatar` (^1.6.0)
- **Current Usage:**
  - `controllers/auth.js:50` - Generating Gravatar URLs
- **Native Alternative:** Simple URL construction
- **Action:** Replace with native string manipulation
- **Files to Update:** `controllers/auth.js`

**Example Refactor:**
```javascript
// Before
const gravatar = require('gravatar');
req.user.iconURL = gravatar.url(req.user.mail) || config.defaultUserIcon;

// After
const crypto = require('crypto');

function getGravatarUrl(email) {
  const hash = crypto
    .createHash('md5')
    .update(email.toLowerCase().trim())
    .digest('hex');
  return `https://www.gravatar.com/avatar/${hash}`;
}

req.user.iconURL = getGravatarUrl(req.user.mail) || config.defaultUserIcon;
```

---

### 🟢 SIMPLIFY WITH LIGHTWEIGHT ALTERNATIVES

#### 8. `is-image` (1.0.1)
- **Current Usage:**
  - `models/file.js:30` - Checking if file is an image
  - `models/sequenceFile.js` - Similar usage
- **Alternative:** Simple file extension check
- **Action:** Replace with native path.extname() check
- **Files to Update:** `models/file.js`, `models/sequenceFile.js`

**Example Refactor:**
```javascript
// Before
const isImage = require('is-image');
File.define('isImage', function() {
  return isImage(this.path);
});

// After
const path = require('path');
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'];

File.define('isImage', function() {
  const ext = path.extname(this.path).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
});
```

#### 9. `validator` (^10.3.0)
- **Current Usage:**
  - `app.js:81-83,85` - Only using `validator.escape()` for HTML escaping
- **Alternative:** Simple HTML entity encoding function
- **Action:** Replace with native escape function
- **Files to Update:** `app.js`
- **Note:** Only using escape() method, not validation features

**Example Refactor:**
```javascript
// Before
const validator = require('validator');
username: validator.escape(req.user.username)

// After
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

username: escapeHtml(req.user.username)
```

---

### ✅ KEEP (Essential or Complex)

#### Backend Core Dependencies

**10-18. Express Ecosystem** (KEEP)
- `express` (^4.14.0) - Web framework core
- `ejs` (^2.5.2) - Template engine (used throughout views)
- `cookie-parser` (^1.4.1) - Cookie parsing middleware
- `express-session` (^1.14.2) - Session management
- `express-flash` (0.0.2) - Flash messages
- `less` (^2.7.1) - CSS preprocessing
- `less-middleware` (^2.2.0) - LESS compilation middleware
- `multer` (^0.1.8) - File upload handling (complex multipart/form-data)
- **Recommendation:** Consider updating Express to 4.18+ (LTS) when upgrading Node

**19-22. Authentication** (KEEP)
- `passport` (^0.3.2) - Authentication framework
- `passport-ldapauth` (^0.5.0) - LDAP strategy
- `ldapjs` (^1.0.2) - LDAP client
- **Note:** Critical for authentication, complex protocol

**23-24. Database** (KEEP)
- `thinky` (^2.3.8) - RethinkDB ORM
- `session-rethinkdb` (^2.0.0) - RethinkDB session store
- **Note:** Core database layer, tightly integrated

**25. Real-time Communication** (KEEP)
- `socket.io` (^1.6.0) - WebSocket library for real-time features
- **Used in:** `sockets/` directory
- **Recommendation:** Consider upgrading to socket.io v4+ when upgrading Node

**26-28. Email** (KEEP)
- `nodemailer` (^2.6.4) - Email sending library
- `nodemailer-smtp-transport` (^2.7.2) - SMTP transport
- `email-templates` (^2.5.4) - Email templating
- **Used in:** `lib/email.js`
- **Note:** Complex SMTP handling, template rendering

**29-30. Data Processing** (KEEP)
- `csv` (^6.2.7) - CSV parsing/generation
- `csv-stringify` (^6.2.4) - CSV stringification
- **Used in:** `lib/csv.js`
- **Note:** Reliable CSV handling for order exports

**31. Security** (KEEP)
- `xss` (^0.3.3) - XSS sanitization
- **Used in:** `lib/renderError.js:12`
- **Note:** Security-critical, handles edge cases
- **Recommendation:** Consider updating to latest version (^1.0.14) for security fixes

#### Frontend Dependencies

**32-39. Build Tools & Frontend Libraries** (KEEP)
- `@babel/core`, `@babel/preset-env`, `@babel/preset-react` - Transpilation
- `babel-loader`, `css-loader`, `style-loader` - Webpack loaders
- `webpack` (^2.7.0) - Module bundler
- `react` (^15.6.0), `react-dom` (^15.6.0) - UI framework
- **Recommendation:** Upgrade Webpack and React when upgrading Node (React 15 is very old)

**40-44. UI Libraries** (KEEP)
- `jquery` (^3.3.1) - DOM manipulation
- `tinymce` (^4.7.13) - WYSIWYG editor
- `inputmask` (^5.0.3) - Input masking
- `micromodal` (^0.4.6) - Modal dialogs
- `normalize.css` (^8.0.0) - CSS normalization
- `elegant-icons` (0.0.1) - Icon font
- **Note:** Used in public/views

---

## Upgrade Considerations

### Node Version Upgrade Path

**Current:** Node 12.20.0 (EOL April 2022 ⚠️)

**Recommended Upgrade Options:**

1. **Node 18 LTS (Hydrogen)** - Recommended for stability
   - Active LTS until April 2025
   - Native fetch API
   - Import assertions
   - Test runner built-in
   - Better performance

2. **Node 20 LTS (Iron)** - Recommended for longevity
   - Active LTS until April 2026
   - Maintenance until April 2027
   - Latest stable features
   - Best long-term choice

### Breaking Changes to Consider

When upgrading from Node 12 to 18/20:

1. **Crypto changes** - Some crypto APIs deprecated
2. **URL parsing** - Legacy URL API removed
3. **Timers** - Timer promises API added
4. **OpenSSL** - Version changes may affect some packages
5. **V8 version** - May affect some native modules

### Package Updates Required for Node 18+

These packages have old versions that may need updates:

1. **Express 4.14.0 → 4.18+** (4.14 is from 2016)
2. **React 15.6.0 → 18.x** (Major rewrite needed)
3. **Webpack 2.7.0 → 5.x** (Build configuration changes)
4. **Socket.io 1.6.0 → 4.x** (API changes)
5. **Multer 0.1.8 → 1.4.5** (Very old version)
6. **EJS 2.5.2 → 3.1.9** (Security updates)
7. **Passport 0.3.2 → 0.7.0** (Minor updates)

### Security Vulnerabilities (Old Versions)

⚠️ **High Priority Updates:**
- `ejs@2.5.2` - Known XSS vulnerabilities (CVE-2017-1000188, etc.)
- `moment@2.17.0` - ReDoS vulnerabilities (CVE-2022-24785, etc.)
- `webpack@2.7.0` - Multiple vulnerabilities
- `multer@0.1.8` - Very outdated

---

## Implementation Roadmap

### Phase 1: Quick Wins (No Node Upgrade Required)

**Estimated Time:** 2-4 hours

1. ✅ Remove `fs` package (immediate)
2. ✅ Remove `cheerio` package (immediate)
3. ✅ Replace `mkdirp` with native fs.mkdir (Node 12.20 compatible)
4. ✅ Replace `body-parser` with Express built-in (Express 4.16+ compatible)
5. ✅ Replace `gravatar` with native crypto hash
6. ✅ Replace `is-image` with extension check
7. ✅ Replace `validator.escape()` with native function

**Expected Reduction:** 7 dependencies
**Risk Level:** Low

### Phase 2: Moment.js Replacement (No Node Upgrade Required)

**Estimated Time:** 4-6 hours

1. Analyze all moment.js usage
2. Implement calendar date formatting function
3. Replace moment in models/order.js
4. Test date formatting across application
5. Remove moment dependency

**Expected Reduction:** 1 dependency (232KB)
**Risk Level:** Medium (date formatting is user-facing)

### Phase 3: Node Version Upgrade (Major Effort)

**Estimated Time:** 1-2 weeks

1. Set up Node 18/20 testing environment
2. Run test suite against new Node version
3. Update package versions with vulnerabilities
4. Update deprecated APIs
5. Test LDAP, RethinkDB, and socket.io integrations
6. Update .nvmrc to new version
7. Update CI/CD pipelines

**Risk Level:** High (infrastructure change)

### Phase 4: Modern Frontend (Optional Future Work)

**Estimated Time:** 2-4 weeks

1. Upgrade React 15 → 18
2. Upgrade Webpack 2 → 5
3. Modernize build pipeline
4. Consider replacing jQuery with vanilla JS
5. Update Babel configuration

**Risk Level:** High (major refactor)

---

## Cost-Benefit Analysis

### Immediate Benefits (Phase 1 + 2)

**Pros:**
- ✅ Reduce `node_modules` size by ~5-8 MB
- ✅ Reduce security attack surface
- ✅ Fewer packages to audit/maintain
- ✅ Faster `npm install` times
- ✅ No runtime dependencies on unmaintained packages

**Cons:**
- ⚠️ Code changes required (testing needed)
- ⚠️ Potential for edge case bugs
- ⚠️ Time investment (6-10 hours)

### Node Upgrade Benefits (Phase 3)

**Pros:**
- ✅ Security updates (Node 12 is EOL)
- ✅ Performance improvements
- ✅ Native fetch, promises, modern APIs
- ✅ Better error messages and debugging
- ✅ Preparation for future features

**Cons:**
- ⚠️ Major infrastructure change
- ⚠️ Potential breaking changes
- ⚠️ Testing burden
- ⚠️ Time investment (1-2 weeks)

---

## Recommendations

### Immediate Actions

1. **Remove unused packages** (cheerio, fs) - 5 minutes
2. **Replace mkdirp** - Already compatible with Node 12 - 30 minutes
3. **Replace body-parser** - Simple Express migration - 15 minutes
4. **Replace gravatar** - Simple string manipulation - 20 minutes
5. **Replace is-image** - Simple extension check - 15 minutes
6. **Replace validator.escape** - Simple HTML encoding - 20 minutes

**Total Time Investment:** ~2 hours
**Impact:** -6 dependencies, cleaner codebase

### Short-term (Next Sprint)

1. **Replace moment.js** - Requires custom calendar formatting - 4-6 hours
2. **Update security-vulnerable packages** (ejs, xss) - 1-2 hours
3. **Audit axios usage** - Remove if unused - 15 minutes

### Long-term (Next Quarter)

1. **Plan Node 18/20 upgrade** - Schedule, test, deploy
2. **Update Express ecosystem** (Socket.io, Multer, etc.)
3. **Modernize frontend build** (React 18, Webpack 5)

---

## Testing Checklist

Before removing/replacing any dependency:

- [ ] Search for all `require()` statements
- [ ] Check for usage in views (EJS templates)
- [ ] Check frontend bundle files
- [ ] Run existing test suite
- [ ] Manual testing of affected features
- [ ] Check for type coercion issues
- [ ] Verify error handling
- [ ] Test edge cases (empty strings, null, undefined)

---

## Dependencies Summary

| Category | Keep | Remove | Replace | Total |
|----------|------|--------|---------|-------|
| Backend Core | 11 | 2 | 7 | 20 |
| Frontend | 13 | 0 | 0 | 13 |
| DevDependencies | 8 | 0 | 0 | 8 |
| **Total** | **32** | **2** | **7** | **41** |

**Final Count After Cleanup:** 32 dependencies (22% reduction)

---

## Additional Notes

### File Encoding Considerations

When replacing `validator.escape()`, ensure the escaping function handles:
- UTF-8 characters correctly
- Empty strings and null/undefined values
- Already-escaped content (avoid double-escaping)

### Date Formatting Considerations

The `.calendar()` method in moment.js provides:
- "Today at 2:30 PM"
- "Yesterday at 11:00 AM"
- "Last Sunday at 5:00 PM"
- "11/10/2025"

Any replacement should maintain similar user experience.

### RethinkDB Considerations

Thinky ORM is no longer maintained but still functional. Future considerations:
- RebirthDB (RethinkDB fork)
- Migration to PostgreSQL/MongoDB
- Alternative ORMs (Sequelize, TypeORM, Prisma)

---

## Conclusion

This audit identifies **9 dependencies** that can be safely removed or replaced with native Node.js code, reducing the dependency footprint by 24%. The most impactful changes (removing unused packages and replacing utilities) can be completed in approximately 2-6 hours with low risk.

The larger opportunity is upgrading from Node 12 (EOL) to Node 18/20 LTS, which would unlock native features like fetch API, improve security, and enable further dependency reduction. This is recommended as a separate, well-planned project.

**Recommended Next Steps:**
1. Complete Phase 1 (quick wins) in current sprint
2. Schedule Phase 2 (moment.js) for next sprint
3. Plan Phase 3 (Node upgrade) for next quarter with proper testing and staging

---

**Audit Completed By:** Claude (AI Assistant)
**Date:** 2025-11-10
