/**
 * Async route-handler adapter.
 *
 * Express 4 does not understand promises. When an `async` handler rejects,
 * nothing forwards the error to the error-handling middleware, so the response
 * is never written and the request hangs until the client times out. Wrapping
 * handlers routes those rejections into `next(err)`.
 */

/**
 * Wraps a single handler so rejections reach Express's error pipeline.
 * Non-async handlers are returned with the same protection against throws.
 *
 * @param {Function} fn - An Express handler or middleware.
 * @returns {Function} The wrapped handler, preserving arity semantics.
 */
function asyncHandler(fn) {
  if (typeof fn !== "function") return fn;

  // Error-handling middleware has arity 4 and must keep that shape, otherwise
  // Express stops recognising it as an error handler.
  if (fn.length === 4) {
    return function wrappedErrorHandler(err, req, res, next) {
      try {
        return Promise.resolve(fn.call(this, err, req, res, next)).catch(next);
      } catch (syncErr) {
        return next(syncErr);
      }
    };
  }

  return function wrappedHandler(req, res, next) {
    try {
      return Promise.resolve(fn.call(this, req, res, next)).catch(next);
    } catch (syncErr) {
      return next(syncErr);
    }
  };
}

/**
 * Recursively wraps every function on a controller object.
 *
 * Controllers here are plain objects, sometimes nested (`docs.subject.show`).
 * Wrapping at the module boundary means every route gets the protection
 * without having to remember it at each `router.get(...)` call site.
 *
 * @param {object} controller
 * @returns {object} A new object with the same shape and wrapped functions.
 */
function wrapController(controller) {
  if (typeof controller === "function") return asyncHandler(controller);
  if (!controller || typeof controller !== "object") return controller;

  const wrapped = {};
  for (const [key, value] of Object.entries(controller)) {
    wrapped[key] = wrapController(value);
  }
  return wrapped;
}

module.exports = { asyncHandler, wrapController };
