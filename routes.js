const express = require("express");
const router = express.Router();
const path = require("path");

const Util = require("./lib/util");
const config = require("./config");

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  } else {
    req.session.returnTo = req.path;
    return res.redirect("/signin");
  }
}

function isAdmin(req, res, next) {
  if (req.user && Util.isAdmin(req.user.username)) {
    return next();
  } else {
    return res
      .status(403)
      .send("Access Denied: You do not have administrator privileges.");
  }
}

// --- Controller Imports ---
const docs = require("./controllers/documents");
const premade = require("./controllers/premade");
const custom = require("./controllers/custom");
const recent = require("./controllers/recent");
const search = require("./controllers/search");
const auth = require("./controllers/auth");
const shoppingCart = require("./controllers/shoppingCart");
const orders = require("./controllers/orders");
const upload = require("./controllers/upload");
const admin = require("./controllers/admin");
const budgetHolder = require("./controllers/budgetHolder");

// --- Global/Root Routes ---
router.get("/", (req, res) => res.render("index"));
router.get("/whoamoi", isAuthenticated, auth.whoami);
router.post("/check-ldap-user", auth.checkLDAPUser);

// --- Authentication Routes ---
router.get("/signin", auth.signIn);
router.post("/signin", auth.signInPost);
router.get("/signout", isAuthenticated, auth.signOut);

// --- Admin-Specific Routes ---
router
  .route("/admin/billboard")
  .all(isAuthenticated, isAdmin) // Chained middleware
  .get(admin.billboard.edit)
  .post(admin.billboard.editPost);

// --- Documentation (Docs) Routes ---
router.get("/docs", docs.index);
router
  .route("/docs/rearrange")
  .all(isAuthenticated, isAdmin)
  .get(docs.rearrange)
  .post(docs.rearrangeSave);

router
  .route("/docs/new")
  .all(isAuthenticated, isAdmin)
  .get(docs.subject.new)
  .post(docs.subject.save);

router.get("/docs/:subjectID", docs.subject.show);
router
  .route("/docs/:subjectID/rename")
  .all(isAuthenticated, isAdmin)
  .get(docs.subject.rename)
  .post(docs.subject.save);

// use post not get now
router.post(
  "/docs/:subjectID/disable",
  isAuthenticated,
  isAdmin,
  docs.subject.disable,
);
router.post(
  "/docs/:subjectID/delete",
  isAuthenticated,
  isAdmin,
  docs.subject.delete,
);
router.post(
  "/docs/:subjectID/enable",
  isAuthenticated,
  isAdmin,
  docs.subject.enable,
);

router
  .route("/docs/:subjectID/new")
  .all(isAuthenticated, isAdmin)
  .get(docs.document.new)
  .post(docs.document.save);

// redundant?
router
  .route("/docs/:subjectID/addsubject")
  .all(isAuthenticated, isAdmin)
  .get(docs.subject.new)
  .post(docs.subject.save);

router.get("/docs/item/:itemID", docs.document.show);
router
  .route("/docs/item/:itemID/edit")
  .all(isAuthenticated, isAdmin)
  .get(docs.document.edit)
  .post(docs.document.save);

// changed from get to post
router.post(
  "/docs/item/:itemID/disable",
  isAuthenticated,
  isAdmin,
  docs.document.disable,
);
router.post(
  "/docs/item/:itemID/enable",
  isAuthenticated,
  isAdmin,
  docs.document.enable,
);
router.post(
  "/docs/item/:itemID/delete",
  isAuthenticated,
  isAdmin,
  docs.document.delete,
);

// --- Premade Item Management Routes ---
// Removed `if (!config.disablePremade)` around the entire block.
// Controller logic (e.g., premade.index) should handle redirects if disabled.
router.get("/premade", isAuthenticated, premade.index);
router.get("/premade/export", isAuthenticated, premade.export);

router
  .route("/premade/rearrange")
  .all(isAuthenticated, isAdmin)
  .get(premade.rearrange)
  .post(premade.rearrangeSave);

router
  .route("/premade/new")
  .all(isAuthenticated, isAdmin)
  .get(premade.db.new)
  .post(premade.db.save);

router.get("/premade/:id", isAuthenticated, premade.db.show); // Show DB
router.post("/premade/:id/edit", isAuthenticated, isAdmin, premade.db.save); // POST to save DB edits
router.get("/premade/:id/edit", isAuthenticated, isAdmin, premade.db.edit); // GET to show DB edit form

// DB disable/enable/delete (changed from GET to POST for state-changing actions)
router.post(
  "/premade/:id/disable",
  isAuthenticated,
  isAdmin,
  premade.db.disable,
);
router.post("/premade/:id/enable", isAuthenticated, isAdmin, premade.db.enable);
router.post("/premade/:id/delete", isAuthenticated, isAdmin, premade.db.delete);

router // For new Categories within a DB
  .route("/premade/:id/new") // The `:id` here refers to DB ID
  .all(isAuthenticated, isAdmin)
  .get(premade.category.new)
  .post(premade.category.save);

router.get(
  "/premade/category/:categoryID",
  isAuthenticated,
  premade.category.show,
);
router.post(
  "/premade/category/:categoryID/edit",
  isAuthenticated,
  isAdmin,
  premade.category.save,
); // POST to save category edits
router.get(
  "/premade/category/:categoryID/edit",
  isAuthenticated,
  isAdmin,
  premade.category.edit,
); // GET to show category edit form

// Category disable/enable/delete (changed from GET to POST)
router.post(
  "/premade/category/:categoryID/disable",
  isAuthenticated,
  isAdmin,
  premade.category.disable,
);
router.post(
  "/premade/category/:categoryID/enable",
  isAuthenticated,
  isAdmin,
  premade.category.enable,
);
router.post(
  "/premade/category/:categoryID/delete",
  isAuthenticated,
  isAdmin,
  premade.category.delete,
);

router // For new Items within a Category
  .route("/premade/category/:categoryID/new")
  .all(isAuthenticated, isAdmin)
  .get(premade.item.new)
  .post(premade.item.save);

router.get("/premade/item/:itemID", isAuthenticated, premade.item.show);
router.post(
  "/premade/item/:itemID/edit",
  isAuthenticated,
  isAdmin,
  premade.item.save,
); // POST to save item edits
router.get(
  "/premade/item/:itemID/edit",
  isAuthenticated,
  isAdmin,
  premade.item.edit,
); // GET to show item edit form

// Item disable/enable/delete (changed from GET to POST)
router.post(
  "/premade/item/:itemID/disable",
  isAuthenticated,
  isAdmin,
  premade.item.disable,
);
router.post(
  "/premade/item/:itemID/enable",
  isAuthenticated,
  isAdmin,
  premade.item.enable,
);
router.post(
  "/premade/item/:itemID/delete",
  isAuthenticated,
  isAdmin,
  premade.item.delete,
); // This is the premade item deletion

// Sequence File Upload and Delete for Items
// HOWDY
router.post(
  "/premade/item/:itemID/uploadSequenceFile",
  isAuthenticated,
  isAdmin,
  upload.uploadSequenceFile,
);
router.post(
  "/premade/item/:itemID/deleteSequenceFile",
  isAuthenticated,
  isAdmin,
  upload.deleteSequenceFile,
);

// --- Custom Routes ---
router.get("/custom", isAuthenticated, custom.index);

// --- Recently Added Items Routes ---
router.get("/recently-added-items", isAuthenticated, recent.index); // Renamed from '/recent' to match content

// --- Search Routes ---
router.get("/search", isAuthenticated, search.index);

// --- Shopping Cart Routes ---
// Removed `if (!config.disableCart)` around the block.
router.get("/cart", isAuthenticated, shoppingCart.index);
router.post("/cart/order", isAuthenticated, shoppingCart.placeOrder);
router.post("/cart/add", isAuthenticated, shoppingCart.addViaPostRoute); // Use a new method name

// --- Budget Holder Management Routes (Admin Only) ---
router.get(
  "/budget",
  isAuthenticated,
  budgetHolder.ensureAdmin,
  budgetHolder.index,
);
router.get(
  "/budget/new",
  isAuthenticated,
  budgetHolder.ensureAdmin,
  budgetHolder.new,
);
router.post(
  "/budget",
  isAuthenticated,
  budgetHolder.ensureAdmin,
  budgetHolder.create,
);
router.get(
  "/budget/:id/edit",
  isAuthenticated,
  budgetHolder.ensureAdmin,
  budgetHolder.edit,
);
router.post(
  "/budget/:id",
  isAuthenticated,
  budgetHolder.ensureAdmin,
  budgetHolder.update,
);
router.post(
  "/budget/:id/delete",
  isAuthenticated,
  budgetHolder.ensureAdmin,
  budgetHolder.delete,
);

// --- File Upload & Management Routes (General) ---
// Changed from .route('/upload') to separate GET/POST for clarity
router.post("/upload", isAuthenticated, isAdmin, upload.uploadFilePost); // For general file uploads

router.post("/imageupload", isAuthenticated, isAdmin, upload.uploadImagePost); // For image uploads (e.g., from TinyMCE)

router.get("/filemanager", isAuthenticated, isAdmin, upload.fileManager); // General file manager view
router.get("/filemanager/:id/download", upload.download); // Download specific file

// HOWDY
router.post(
  "/filemanager/:id/delete",
  isAuthenticated,
  isAdmin,
  upload.deleteFile,
);
router.get("/sequencefilemanager/:id/download", upload.downloadSequenceFile); // Download sequence file

// --- Orders Routes ---
router.get("/orders", isAuthenticated, isAdmin, orders.showAll);
router.get("/order/summary", isAuthenticated, isAdmin, orders.simonSummary);
router.get("/order/export", isAuthenticated, isAdmin, orders.exportOrders); // Export costed orders only
router.get(
  "/order/export-all",
  isAuthenticated,
  isAdmin,
  orders.exportAllOrders,
); // Export all orders (including non-costed)
router.get("/order/summary-data", isAuthenticated, isAdmin, orders.summaryData); // Get summary data for date range

router.get("/dupes", isAuthenticated, isAdmin, orders.simonRepeatOrders); // Route name 'dupes' could be more descriptive

router.get("/order/:id", isAuthenticated, isAdmin, orders.show); // Show specific order details

// Order state changes (changed from GET to POST for best practice)
router.post(
  "/order/:id/complete",
  isAuthenticated,
  isAdmin,
  orders.markAsComplete,
);
router.post(
  "/order/:id/incomplete",
  isAuthenticated,
  isAdmin,
  orders.markAsIncomplete,
);
router.post(
  "/order/:id/cancel",
  isAuthenticated,
  isAdmin,
  orders.markAsCancelled,
);
router.post(
  "/order/:id/uncancel",
  isAuthenticated,
  isAdmin,
  orders.markAsUnCancelled,
);

// --- 404 Catch-all ---
router.use("*", (req, res) => {
  // Use router.use for catch-all middleware
  console.log("404 Not Found:", req.method, req.originalUrl);
  res.status(404).render("404"); // Ensure 404 status is sent
});

module.exports = router;
