/**
 * Typed errors carrying an HTTP status.
 *
 * Controllers previously threw a bare `Error` for a record that does not exist,
 * which the error handlers turned into a 500. That made a mistyped URL
 * indistinguishable from a real outage in the logs and to monitoring.
 */

class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

class ValidationError extends HttpError {
  constructor(message = "Invalid request") {
    super(400, message);
  }
}

class ForbiddenError extends HttpError {
  constructor(message = "Access denied") {
    super(403, message);
  }
}

module.exports = { HttpError, NotFoundError, ValidationError, ForbiddenError };
