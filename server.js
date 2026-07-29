const app = require("./app");
const log = require("./lib/log");
const config = require("./config");
const thinky = require("./lib/thinky");

const port = process.env.PORT || config.port;

// --- Process-level safety nets ---------------------------------------------
// Node terminates the process on an unhandled rejection. Without a handler the
// only record is a stack trace on stderr, which tells you nothing about which
// request was in flight.

process.on("unhandledRejection", (reason, promise) => {
  log.error(
    "Unhandled promise rejection:",
    reason && reason.stack ? reason.stack : reason,
  );
  // Deliberately not exiting: a single rejected promise in a request handler
  // should not take down every other in-flight request. The terminal error
  // handler in app.js catches the ones that originate in routes.
});

process.on("uncaughtException", (err) => {
  // An uncaught exception leaves the process in an undefined state, so the
  // only safe response is to stop taking new work and exit once the current
  // requests drain.
  log.error("Uncaught exception:", err && err.stack ? err.stack : err);
  shutdown("uncaughtException", 1);
});

// --- Startup ---------------------------------------------------------------

let server;

async function start() {
  // Wait for the database, tables and indexes to exist before accepting
  // traffic. Previously these were created fire-and-forget at require time, so
  // the first requests after a cold start could hit a missing table and 500.
  try {
    await thinky.ready();
    log.success(`Database "${config.dbName}" schema ready`);
  } catch (err) {
    log.error(
      "Failed to prepare the database schema:",
      err && err.stack ? err.stack : err,
    );
    process.exit(1);
  }

  server = app.listen(port, "0.0.0.0", () => {
    log.success("Listening on port", port);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      log.error(`Port ${port} is already in use. Is another instance running?`);
    } else {
      log.error("HTTP server error:", err && err.stack ? err.stack : err);
    }
    process.exit(1);
  });

  // Bound how long a slow client can hold a connection open.
  server.headersTimeout = 65000;
  server.requestTimeout = 300000;
}

// --- Graceful shutdown ------------------------------------------------------

let shuttingDown = false;

/**
 * Stops accepting connections, lets in-flight requests finish, closes the
 * database pool, then exits. Falls back to a hard exit if anything hangs.
 *
 * @param {string} signal - What triggered the shutdown, for the log line.
 * @param {number} exitCode
 */
function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info(`Received ${signal}, shutting down gracefully...`);

  // Never let shutdown hang forever.
  const forceExit = setTimeout(() => {
    log.error("Graceful shutdown timed out after 15s, forcing exit.");
    process.exit(exitCode || 1);
  }, 15000);
  if (typeof forceExit.unref === "function") forceExit.unref();

  const closeServer = new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });

  closeServer
    .then(() => thinky.r.getPoolMaster().drain())
    .then(() => {
      log.success("Shutdown complete.");
      clearTimeout(forceExit);
      process.exit(exitCode);
    })
    .catch((err) => {
      log.error("Error during shutdown:", err && err.stack ? err.stack : err);
      process.exit(exitCode || 1);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
