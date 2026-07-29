const path = require("path");
const fs = require("fs");
const multer = require("multer");
const express = require("express");
const app = express();
const config = require("./config");
const session = require("express-session");
const CustomRethinkStore = require("./lib/sessionStore");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const server = require("http").createServer(app);
const io = require("socket.io")(server);
global.io = io; // Make io globally available for dev mode notifications
// Socket handlers are attached further down, once the session middleware
// exists — they need it to identify the connecting user.

// --- IMPORT NECESSARY MODELS FOR res.locals DATA ---
const Cart = require("./models/cart"); // <-- ADDED: Import Cart model
const Order = require("./models/order"); // <-- ADDED: Import Order model
// --- END MODEL IMPORTS ---

const flash = require("express-flash");
const Billboard = require("./models/billboard");

const util = require("./lib/util.js");
const security = require("./lib/security");
const routes = require("./routes");

/**
 * Coerces a user attribute to a plain string for the view layer.
 *
 * This used to HTML-escape each field before handing it to EJS. EJS then
 * escaped it again on `<%= %>`, so a name like O'Brien reached the page as
 * `O&amp;#x27;Brien`. Escaping belongs at the point of output — the templates
 * use `<%= %>`, and the one place that embeds this data in a script tag now
 * serialises it as JSON.
 *
 * @param {string} value
 * @returns {string}
 */
function asText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

// --- Express App Setup ---
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Available to every template, including error pages rendered before the
// per-request locals middleware has run.
app.locals.jsonForScript = require("./lib/sanitize").jsonForScript;

// Required for secure cookies and correct req.ip behind a reverse proxy.
app.set("trust proxy", 1);

// Do not advertise the framework.
app.disable("x-powered-by");

// --- Middleware Chain ---
// Security headers go first so they are present on every response, including
// static assets and error pages.
app.use(security.securityHeaders);

// Serve static assets first, including LESS compilation
app.use(require("less-middleware")(path.join(__dirname, "public")));
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    maxAge: 0,
    setHeaders: (res, path) => {
      // Disable caching for JS files to ensure latest version is always loaded
      if (path.endsWith(".js")) {
        res.set(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, private",
        );
      }
    },
  }),
);

// Body Parsers and Cookie Parser.
// The limit was 50mb, which let an unauthenticated client pin CPU in the
// parser. Nothing here posts bodies anywhere near that size; file uploads go
// through multer, which has its own limit.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

// Session Middleware
const r = require("./lib/thinky").r; // r is needed for RethinkDB queries (like in Order.filter)

// Use our custom session store that properly uses the configured database
const store = new CustomRethinkStore(session, {
  db: config.dbName || "synbioshop",
  table: "sessions",
  sessionTimeout: 86400000, // 1 day
  flushInterval: 60000, // 1 minute
});
const sessionMiddleware = session({
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  store,
  // Default name advertises the stack; a neutral one gives away less.
  name: "synbio.sid",
  cookie: {
    httpOnly: true, // No JS access, limiting XSS payoff.
    secure: config.secureCookies, // HTTPS-only in production.
    sameSite: "lax", // Blocks cross-site POSTs from carrying the session.
    maxAge: 86400000, // 1 day, matching the store's session timeout.
  },
});

app.use(sessionMiddleware);

// Passport.js Authentication (initialize and session)
const passportInitialize = passport.initialize();
const passportSession = passport.session();
app.use(passportInitialize);
app.use(passportSession);

// --- Socket.IO ---
// Sockets reuse the HTTP session so handlers can identify the user instead of
// trusting a username supplied in the message payload.
io.engine.use(sessionMiddleware);
io.engine.use(passportInitialize);
io.engine.use(passportSession);
require("./sockets")(io); // index file for sockets

// Express-flash for messages
app.use(flash());

// Multer for file uploads (must come AFTER body-parser for req.body, but BEFORE routes that use files)
// Updated for multer 1.4.5+ which requires using .any() for multi-field uploads
const upload = multer({
  dest: config.tmpDir,
  limits: {
    fileSize: config.maxUploadBytes,
    files: 10,
    // Bound the non-file parts too, so a multipart body cannot be used to
    // sidestep the urlencoded body limit.
    fields: 100,
    fieldSize: 1024 * 1024,
  },
});

app.use((req, res, next) => {
  // Only parse multipart bodies, and only for authenticated users.
  //
  // This used to run on every request from everyone. An anonymous client could
  // POST a multipart body to any URL — including 404s — and multer would write
  // it to disk unbounded, with nothing to clean it up afterwards. Gating on the
  // session closes that as a disk-exhaustion vector.
  const isMultipart = /^multipart\/form-data/i.test(
    req.get("content-type") || "",
  );
  if (!isMultipart) return next();

  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).send("Authentication required to upload files.");
  }

  upload.any()(req, res, (err) => {
    if (err) {
      if (err.message === "Unexpected end of form") {
        console.warn("Upload aborted: Unexpected end of form");
        return res.status(400).send("Upload aborted by client.");
      }
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(413)
          .send(
            `File too large. The maximum upload size is ${Math.floor(
              config.maxUploadBytes / (1024 * 1024),
            )} MB.`,
          );
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(413).send("Too many files in a single upload.");
      }
      return next(err);
    }
    next();
  });
});

// Remove any temp files the handler did not move into place. Without this,
// aborted or rejected uploads accumulate in tmpDir until the disk fills.
app.use((req, res, next) => {
  res.on("finish", () => {
    const files = req.files;
    if (!files) return;
    const list = Array.isArray(files) ? files : Object.values(files);
    for (const file of list) {
      if (!file || !file.path) continue;
      fs.promises.unlink(file.path).catch(() => {
        // Already moved into place by the handler, which is the success case.
      });
    }
  });
  next();
});

// Backwards compatibility middleware: convert req.files array to object
// Old multer (0.1.8) used req.files as object keyed by fieldname
// New multer (1.4.5+) uses req.files as array with fieldname property
app.use((req, res, next) => {
  if (req.files && Array.isArray(req.files)) {
    const filesObject = {};
    req.files.forEach((file) => {
      filesObject[file.fieldname] = file;
    });
    req.files = filesObject;
  }
  next();
});

// --- CRITICAL: Call Passport Setup Here ---
util.setupPassport();

// CSRF protection. Mounted after the body and multipart parsers so the token
// is visible for both urlencoded and multipart form posts, and after the
// session so it has somewhere to keep the token.
app.use(security.csrfProtection);

// --- res.locals Middleware (NOW ASYNCHRONOUS for DB fetches) ---
app.use(async (req, res, next) => {
  // <<< CHANGED: Made this middleware 'async' <<<
  // Make general config values available to all views
  res.locals.disablePremade = config.disablePremade;
  res.locals.disableCart = config.disableCart;
  res.locals.isPricingAvailable = config.isPricingAvailable;
  res.locals.pricePerUnit = config.pricePerUnit;
  res.locals.devMode = config.devMode; // Pass dev mode flag to views

  // Make user data available to all EJS templates as `locals.signedInUser`
  if (req.user) {
    res.locals.signedInUser = {
      username: asText(req.user.username),
      name: asText(req.user.name),
      mail: asText(req.user.mail),
      isAdmin: util.isAdmin(req.user.username),
      company: asText(req.user.company),
      iconURL: req.user.iconURL ? req.user.iconURL : config.defaultUserIcon,
    };

    const isAdmin = res.locals.signedInUser.isAdmin;

    // Both lookups run for every page view, so they go out together rather
    // than one after the other. The open-order count is only rendered in the
    // admin badge, so non-admins skip that query entirely — it is an unindexed
    // scan of the whole Order table.
    const [cartResult, incompleteResult] = await Promise.allSettled([
      Cart.filter({ username: req.user.username }).getJoin({ items: true }).run(),
      isAdmin
        ? Order.filter(
            r.and(r.row("complete").eq(false), r.row("cancelled").eq(false)),
          )
            .count()
            .execute()
        : Promise.resolve(0),
    ]);

    // A failure here must not blank the page; fall back to an empty cart.
    if (cartResult.status === "fulfilled") {
      const carts = cartResult.value;
      res.locals.signedInUser.cart =
        carts && carts.length === 1 && carts[0].items ? carts[0] : { items: [] };
    } else {
      console.error("Error fetching cart for locals:", cartResult.reason);
      res.locals.signedInUser.cart = { items: [] };
    }

    if (incompleteResult.status === "fulfilled") {
      res.locals.incompleteCount = incompleteResult.value;
    } else {
      console.error(
        "Error fetching incomplete order count for locals:",
        incompleteResult.reason,
      );
      res.locals.incompleteCount = 0;
    }

    next(); // Proceed to next middleware ONLY after async fetches complete
  } else {
    // Not logged in
    res.locals.signedInUser = null;
    res.locals.incompleteCount = 0; // Default 0 if not logged in
    next(); // Proceed to next middleware
  }
});

// Middleware to load Billboard (non-blocking) - This middleware is separate and doesn't affect main user data loading flow.
app.use((req, res, next) => {
  Billboard.run()
    .then((billboards) => {
      if (billboards && billboards.length) {
        res.locals.billboard = billboards[0];
      } else {
        res.locals.billboard = null;
      }
      next();
    })
    .catch((err) => {
      console.error("Error loading billboard:", err);
      res.locals.billboard = null;
      next();
    });
});

// Configure pretty JSON responses (optional)
app.set("json spaces", 2);

// --- Main Routes ---
app.use("/", routes);

// Global Error Handler for common web errors like malformed URIs
app.use((err, req, res, next) => {
  if (err instanceof URIError) {
    console.warn(`Malformed URI requested: ${req.originalUrl}`);
    return res.status(400).send("Bad Request: Invalid URI");
  }
  next(err);
});

// --- Terminal error handler ---
// Without this, Express's default handler serialises err.stack into the
// response body whenever NODE_ENV is not "production", leaking internals to
// whoever triggered the error. This logs the detail server-side and returns a
// generic page instead.
//
// The unused `next` is required: Express only treats a handler as an error
// handler when it declares four parameters.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error(
      `Unhandled error on ${req.method} ${req.originalUrl}:`,
      err && err.stack ? err.stack : err,
    );
  } else {
    console.warn(
      `${status} on ${req.method} ${req.originalUrl}: ${err && err.message}`,
    );
  }

  // A response already in flight cannot be replaced; let Express abort it.
  if (res.headersSent) return next(err);

  res.status(status);

  const message =
    status >= 500
      ? "Something went wrong on our end. The team has been notified."
      : err.message || "Request could not be processed.";

  if (req.accepts("html")) {
    // Fall back to plain text if the error template itself fails to render.
    return res.render("error", { error: message }, (renderErr, html) => {
      if (renderErr) {
        console.error("Failed to render error page:", renderErr);
        return res.type("txt").send(message);
      }
      return res.send(html);
    });
  }

  return res.json({ error: message });
});

// --- Server Start ---
module.exports = server;
