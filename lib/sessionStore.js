const { Store } = require("express-session");
const config = require("../config.json");

/**
 * Custom RethinkDB Session Store
 * Properly uses the configured database instead of defaulting to 'test'
 */
class CustomRethinkStore extends Store {
  constructor(session, options = {}) {
    super(options);

    // Get the rethinkdbdash connection from our thinky wrapper
    this.r = require("./thinky").r;
    this.tableName = options.table || "sessions";
    this.dbName = options.db || config.dbName || "synbioshop";
    this.sessionTimeout = options.sessionTimeout || 86400000; // 1 day default
    this.flushInterval = options.flushInterval || 60000; // 1 minute default

    // Ensure table exists
    this.setupTable();

    // Start periodic cleanup of expired sessions
    if (this.flushInterval > 0) {
      this.startCleanup();
    }
  }

  async setupTable() {
    try {
      const tableExists = await this.r
        .tableList()
        .contains(this.tableName)
        .run();
      if (!tableExists) {
        await this.r.tableCreate(this.tableName).run();
        console.log(
          `Created sessions table '${this.tableName}' in database '${this.dbName}'`,
        );
      } else {
        //console.log(`Sessions table '${this.tableName}' exists in database '${this.dbName}'`);
      }
    } catch (err) {
      console.error("Error setting up sessions table:", err);
    }
  }

  startCleanup() {
    this.cleanupTimer = setInterval(async () => {
      try {
        const now = Date.now();
        const result = await this.r
          .table(this.tableName)
          .filter(this.r.row("expires").lt(now))
          .delete()
          .run();
        if (result.deleted > 0) {
          console.log(`Cleaned up ${result.deleted} expired sessions`);
        }
      } catch (err) {
        console.error("Error cleaning up sessions:", err);
      }
    }, this.flushInterval);
  }

  /**
   * Get session from the store
   */
  get(sessionId, callback) {
    this.r
      .table(this.tableName)
      .get(sessionId)
      .run()
      .then((session) => {
        if (!session) {
          return callback();
        }

        // Check if session has expired
        if (session.expires && session.expires < Date.now()) {
          this.destroy(sessionId, () => {});
          return callback();
        }

        callback(null, session.session);
      })
      .catch((err) => {
        callback(err);
      });
  }

  /**
   * Set session in the store
   */
  set(sessionId, session, callback) {
    const expires =
      session.cookie && session.cookie.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + this.sessionTimeout;

    const sessionData = {
      id: sessionId,
      session: session,
      expires: expires,
    };

    this.r
      .table(this.tableName)
      .insert(sessionData, { conflict: "replace" })
      .run()
      .then(() => {
        callback();
      })
      .catch((err) => {
        callback(err);
      });
  }

  /**
   * Destroy session from the store
   */
  destroy(sessionId, callback) {
    this.r
      .table(this.tableName)
      .get(sessionId)
      .delete()
      .run()
      .then(() => {
        callback();
      })
      .catch((err) => {
        callback(err);
      });
  }

  /**
   * Clear all sessions from the store
   */
  clear(callback) {
    this.r
      .table(this.tableName)
      .delete()
      .run()
      .then(() => {
        callback();
      })
      .catch((err) => {
        callback(err);
      });
  }

  /**
   * Get the number of sessions in the store
   */
  length(callback) {
    this.r
      .table(this.tableName)
      .count()
      .run()
      .then((count) => {
        callback(null, count);
      })
      .catch((err) => {
        callback(err);
      });
  }

  /**
   * Get all sessions from the store
   */
  all(callback) {
    this.r
      .table(this.tableName)
      .run()
      .then((sessions) => {
        const sessionMap = {};
        sessions.forEach((session) => {
          if (!session.expires || session.expires >= Date.now()) {
            sessionMap[session.id] = session.session;
          }
        });
        callback(null, sessionMap);
      })
      .catch((err) => {
        callback(err);
      });
  }

  /**
   * Touch a session (update expiry)
   */
  touch(sessionId, session, callback) {
    const expires =
      session.cookie && session.cookie.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + this.sessionTimeout;

    this.r
      .table(this.tableName)
      .get(sessionId)
      .update({ expires: expires })
      .run()
      .then(() => {
        callback();
      })
      .catch((err) => {
        callback(err);
      });
  }

  /**
   * Stop the cleanup timer when store is being destroyed
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = CustomRethinkStore;
