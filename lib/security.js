/**
 * Security middleware.
 *
 * Dependency-free implementations of the protections this app was missing:
 * CSRF, security headers, rate limiting and safe redirects.
 */

const crypto = require("crypto");
const config = require("../config");

const security = {};

// Methods that can change server state and therefore need CSRF protection.
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

/**
 * Builds the set of origins we accept state-changing requests from.
 * Derived from config.baseURL plus the Host header at request time, so the
 * app keeps working behind a reverse proxy or on a different port.
 */
function allowedOrigins(req) {
  const origins = new Set();

  if (config.baseURL) {
    try {
      origins.add(new URL(config.baseURL).origin);
    } catch (err) {
      // Malformed baseURL in config; fall back to Host-derived origins only.
    }
  }

  const host = req.get("host");
  if (host) {
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }

  return origins;
}

/**
 * Returns the request's origin, preferring the Origin header and falling back
 * to the origin portion of Referer. Returns null when neither is usable.
 */
function requestOrigin(req) {
  const origin = req.get("origin");
  if (origin && origin !== "null") return origin;

  const referer = req.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch (err) {
      return null;
    }
  }
  return null;
}

/** Lazily creates and returns this session's CSRF token. */
function tokenFor(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

/** Constant-time string comparison that tolerates length mismatch. */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * CSRF protection built from two independent layers:
 *
 *   1. Origin/Referer must match this site. Browsers set Origin on every
 *      cross-origin POST, so a forged form from another site is rejected
 *      outright. This layer needs no template changes, which means it cannot
 *      be bypassed by a form someone forgets to update.
 *   2. A per-session synchronizer token, checked whenever the request carries
 *      one. Defence in depth for the case where a browser omits both headers.
 *
 * Combined with the SameSite=Lax session cookie set in app.js, cross-site
 * state changes are blocked three different ways.
 */
security.csrfProtection = (req, res, next) => {
  // Expose the token to templates lazily. Generating it eagerly would write to
  // the session on every request, which forces express-session to persist a
  // session and set a cookie for anonymous visitors who never needed one —
  // the same pattern that makes session fixation possible.
  Object.defineProperty(res.locals, "csrfToken", {
    configurable: true,
    enumerable: true,
    get() {
      return tokenFor(req);
    },
  });

  if (!UNSAFE_METHODS.has(req.method)) return next();

  // --- Layer 1: origin check ---
  const origin = requestOrigin(req);
  if (origin === null) {
    // No Origin and no Referer. A cross-site form post from a browser always
    // carries at least one, so this is either a non-browser client or a
    // stripped request. Require a valid token instead.
    const supplied = req.body && req.body._csrf;
    if (!safeEqual(supplied, req.session && req.session.csrfToken)) {
      return security.rejectCsrf(req, res);
    }
    return next();
  }

  if (!allowedOrigins(req).has(origin)) {
    console.warn(
      `[CSRF] Rejected ${req.method} ${req.originalUrl} from origin ${origin}`,
    );
    return security.rejectCsrf(req, res);
  }

  // --- Layer 2: token check, when the form supplied one ---
  const supplied = req.body && req.body._csrf;
  if (supplied && !safeEqual(supplied, req.session && req.session.csrfToken)) {
    console.warn(
      `[CSRF] Token mismatch on ${req.method} ${req.originalUrl}`,
    );
    return security.rejectCsrf(req, res);
  }

  return next();
};

/** Sends the CSRF rejection response. */
security.rejectCsrf = (req, res) => {
  res.status(403);
  if (req.accepts("html")) {
    return res.send(
      "Request blocked: this form was submitted from an untrusted origin or " +
        "your session expired. Please reload the page and try again.",
    );
  }
  return res.json({ error: "CSRF validation failed" });
};

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

/**
 * Sets the baseline response headers. Written by hand rather than pulling in
 * helmet so the policy is visible and reviewable in one place.
 *
 * The CSP permits inline scripts and styles because the templates rely on
 * them heavily (TinyMCE, inline handlers). It still blocks the main stored-XSS
 * escalation path by forbidding script loads from other origins.
 */
security.securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-XSS-Protection", "0"); // Modern guidance: disable the legacy auditor.
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://www.gravatar.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  );

  if (config.secureCookies) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  next();
};

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Fixed-window in-memory rate limiter.
 *
 * Single-process only, which matches how this app is deployed. Its job is to
 * blunt credential stuffing and directory-enumeration loops, not to be a
 * distributed quota system.
 *
 * @param {object} options
 * @param {number} options.windowMs - Window length in milliseconds.
 * @param {number} options.max - Requests allowed per key per window.
 * @param {string} options.message - Body returned once the limit is hit.
 */
security.rateLimit = ({
  windowMs = 60000,
  max = 30,
  message = "Too many requests. Please slow down and try again shortly.",
} = {}) => {
  const hits = new Map();

  // Drop expired buckets so the map cannot grow without bound.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  // Do not hold the event loop open on shutdown.
  if (typeof sweeper.unref === "function") sweeper.unref();

  return (req, res, next) => {
    // Disabled under test so suites can hammer endpoints freely.
    if (config.isTest) return next();

    const key = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
    const now = Date.now();
    let bucket = hits.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      hits.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).send(message);
    }

    return next();
  };
};

// ---------------------------------------------------------------------------
// Safe redirects
// ---------------------------------------------------------------------------

/**
 * Resolves a caller-supplied redirect target to a safe, same-site path.
 *
 * Several handlers redirect to `req.get("Referrer")`, which an attacker
 * controls: a form posted from evil.com bounces the authenticated user back to
 * evil.com. This collapses any absolute or protocol-relative URL to its path,
 * and only when it points at this site.
 *
 * @param {import('express').Request} req
 * @param {string} fallback - Used when the target is missing or untrusted.
 * @returns {string} A path beginning with a single "/".
 */
security.safeRedirectTarget = (req, fallback = "/") => {
  const target = req.get("Referrer") || req.get("Referer");
  if (!target) return fallback;

  // Protocol-relative ("//evil.com") and absolute URLs both need resolving
  // against a base so we can compare origins.
  let parsed;
  try {
    parsed = new URL(target, `http://${req.get("host") || "localhost"}`);
  } catch (err) {
    return fallback;
  }

  if (!allowedOrigins(req).has(parsed.origin)) return fallback;

  const path = `${parsed.pathname}${parsed.search}`;
  // Guard against "//host" slipping through as a protocol-relative redirect.
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;

  return path;
};

module.exports = security;
