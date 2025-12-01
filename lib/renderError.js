const log = require("./log");
const xss = require("xss");

/**
 * Render error page with defensive error handling
 * @param err - Error message or object
 * @param res - Express response object
 */
module.exports = function error(err, res) {
  try {
    // Safely stringify the error for logging
    let errorString;
    if (typeof err === "string") {
      errorString = err;
    } else if (err instanceof Error) {
      errorString = err.message;
    } else {
      try {
        errorString = JSON.stringify(err);
      } catch (e) {
        errorString = "Unknown error (could not stringify)";
      }
    }

    log.error(errorString);

    // Sanitize the error message for display
    const safeError = xss(errorString);

    if (res) {
      // Check if headers have already been sent
      if (res.headersSent) {
        console.error("Cannot render error - headers already sent:", safeError);
        return;
      }

      return res.status(500).render("error", { error: safeError });
    }
  } catch (renderErr) {
    // If rendering fails, try to send a basic response
    console.error("Error while rendering error page:", renderErr);
    if (res && !res.headersSent) {
      try {
        return res
          .status(500)
          .send("An error occurred. Please try again later.");
      } catch (e) {
        console.error("Failed to send fallback error response:", e);
      }
    }
  }
};
