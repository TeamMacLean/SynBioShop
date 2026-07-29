/**
 * lib/renderError — the shared error-page renderer.
 *
 * Reached from most controller catch blocks, so a defect here converts a
 * handled error into an unhandled one. It had essentially no coverage.
 */

const { expect } = require("chai");
const renderError = require("../../lib/renderError");

/** Minimal Express response stand-in recording what was produced. */
function makeRes({ headersSent = false, renderThrows = false } = {}) {
  const res = {
    headersSent,
    statusCode: null,
    rendered: null,
    sent: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    render(view, locals) {
      if (renderThrows) throw new Error("template blew up");
      res.rendered = { view, locals };
      return res;
    },
    send(body) {
      res.sent = body;
      return res;
    },
  };
  return res;
}

describe("lib/renderError", function () {
  it("renders the error view with a 500", function () {
    const res = makeRes();
    renderError("something broke", res);

    expect(res.statusCode).to.equal(500);
    expect(res.rendered.view).to.equal("error");
    expect(res.rendered.locals.error).to.include("something broke");
  });

  it("accepts an Error and uses its message", function () {
    const res = makeRes();
    renderError(new Error("boom"), res);

    expect(res.rendered.locals.error).to.include("boom");
  });

  it("does not leak a stack trace into the page", function () {
    const res = makeRes();
    const err = new Error("boom");
    renderError(err, res);

    expect(res.rendered.locals.error).to.not.include("at ");
    expect(res.rendered.locals.error).to.not.include("node_modules");
  });

  it("serialises a plain object error", function () {
    const res = makeRes();
    renderError({ code: "ECONNREFUSED", detail: "db down" }, res);

    expect(res.rendered.locals.error).to.include("ECONNREFUSED");
  });

  it("survives an error object that cannot be stringified", function () {
    const circular = {};
    circular.self = circular;

    const res = makeRes();
    renderError(circular, res);

    expect(res.statusCode).to.equal(500);
    expect(res.rendered.locals.error).to.include("Unknown error");
  });

  it("escapes markup in the error text", function () {
    // Error strings can carry user input — a filename, a search term.
    const res = makeRes();
    renderError('<img src=x onerror="alert(1)">', res);

    expect(res.rendered.locals.error).to.not.match(/<img[^>]*onerror/i);
  });

  it("does nothing when headers were already sent", function () {
    // Writing again would throw ERR_HTTP_HEADERS_SENT and escape the handler.
    const res = makeRes({ headersSent: true });
    renderError("too late", res);

    expect(res.statusCode).to.equal(null);
    expect(res.rendered).to.equal(null);
    expect(res.sent).to.equal(null);
  });

  it("falls back to a plain response when the template itself fails", function () {
    const res = makeRes({ renderThrows: true });
    renderError("boom", res);

    expect(res.sent, "a fallback body should still be sent").to.be.a("string");
    expect(res.sent).to.include("An error occurred");
  });

  it("does not throw when given no response object", function () {
    expect(() => renderError("orphaned error", undefined)).to.not.throw();
  });

  it("does not throw for null or undefined errors", function () {
    expect(() => renderError(null, makeRes())).to.not.throw();
    expect(() => renderError(undefined, makeRes())).to.not.throw();
  });
});
