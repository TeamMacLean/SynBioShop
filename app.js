const path = require("path");
const multer = require("multer");
const renderError = require("./lib/renderError");
const bodyParser = require("body-parser");
const express = require("express");
const app = express();
const config = require("./config.json");
const session = require("express-session");
const rethinkSession = require("session-rethinkdb")(session);
const passport = require("passport");
const cookieParser = require("cookie-parser");
const server = require("http").createServer(app);
const io = require("socket.io")(server);
require("./sockets")(io); // index file for sockets

// --- IMPORT NECESSARY MODELS FOR res.locals DATA ---
const Cart = require("./models/cart"); // <-- ADDED: Import Cart model
const Order = require("./models/order"); // <-- ADDED: Import Order model
// --- END MODEL IMPORTS ---

const flash = require("express-flash");
const Billboard = require("./models/billboard");

const validator = require("validator");
const util = require("./lib/util.js");
const routes = require("./routes");

// --- Express App Setup ---
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// --- Middleware Chain ---
// Serve static assets first, including LESS compilation
app.use(require("less-middleware")(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "public")));

// Body Parsers and Cookie Parser
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: false, limit: "50mb" }));
app.use(cookieParser());

// Session Middleware
const r = require("./lib/thinky").r; // r is needed for RethinkDB queries (like in Order.filter)
const store = new rethinkSession(r);
app.use(
  session({
    secret: config.secret,
    resave: false,
    saveUninitialized: false,
    store,
  })
);

// Passport.js Authentication (initialize and session)
app.use(passport.initialize());
app.use(passport.session());

// Express-flash for messages
app.use(flash());

// Multer for file uploads (must come AFTER body-parser for req.body, but BEFORE routes that use files)
app.use(
  multer({
    dest: config.tmpDir,
  })
);

// --- CRITICAL: Call Passport Setup Here ---
util.setupPassport();

// --- res.locals Middleware (NOW ASYNCHRONOUS for DB fetches) ---
app.use(async (req, res, next) => { // <<< CHANGED: Made this middleware 'async' <<<
  // Make general config values available to all views
  res.locals.disablePremade = config.disablePremade;
  res.locals.disableCart = config.disableCart;
  res.locals.isPricingAvailable = config.isPricingAvailable;

  // Make user data available to all EJS templates as `locals.signedInUser`
  if (req.user) {
    res.locals.signedInUser = {
      username: validator.escape(req.user.username),
      name: validator.escape(req.user.name),
      mail: validator.escape(req.user.mail),
      isAdmin: util.isAdmin(req.user.username),
      company: validator.escape(req.user.company),
      iconURL: req.user.iconURL ? req.user.iconURL : config.defaultUserIcon
    };

    // --- NEW/MODIFIED: Asynchronously fetch Cart Item Count ---
    try {
      const carts = await Cart.filter({ username: req.user.username })
                              .getJoin({ items: true }) // Need items to count length
                              .run(); // Execute the query

      if (carts && carts.length === 1 && carts[0].items) { // Safe access
        res.locals.signedInUser.cart = carts[0]; // Assign the actual cart object
        res.locals.signedInUser.cart.items.length = carts[0].items.length; // Set the length property for the count
      } else {
        res.locals.signedInUser.cart = { items: [] }; // Default to empty cart
        res.locals.signedInUser.cart.items.length = 0; // Explicitly set length to 0
      }
    } catch (err) {
      console.error('Error fetching cart count for locals:', err);
      res.locals.signedInUser.cart = { items: [] }; // Default empty on error
      res.locals.signedInUser.cart.items.length = 0;
    }

    // --- NEW/MODIFIED: Asynchronously fetch Incomplete Order Count ---
    try {
        const incompleteCount = await Order.filter(
            r.and(r.row("complete").eq(false), r.row("cancelled").eq(false))
        ).count().execute();
        res.locals.incompleteCount = incompleteCount;
    } catch (err) {
        console.error('Error fetching incomplete order count for locals:', err);
        res.locals.incompleteCount = 0; // Default to 0 on error
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
      console.error('Error loading billboard:', err);
      res.locals.billboard = null;
      next();
    });
});

// Configure pretty JSON responses (optional)
app.set("json spaces", 2);

// --- Main Routes ---
app.use("/", routes);

// --- Server Start ---
module.exports = server;