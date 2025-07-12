const Log = {};

/**
 * Log info (used for general informational messages)
 * @param inputs
 */
Log.info = (...inputs) => { // Renamed from Log.log to Log.info
    console.log('[INFO]', ...inputs); // Added [INFO] prefix for clarity
};

/**
 * Log error
 * @param inputs
 */
Log.error = (...inputs) => {
    console.error('[ERROR]', ...inputs); // Changed to console.error and added [ERROR]
};

/**
 * Log success
 * @param inputs
 */
Log.success = (...inputs) => {
    console.log('[SUCCESS]', ...inputs); // Added [SUCCESS] prefix
};

/**
 * Log warning
 * @param inputs
 */
Log.warn = (...inputs) => {
    console.warn('[WARN]', ...inputs); // Changed to console.warn and added [WARN]
};

module.exports = Log;