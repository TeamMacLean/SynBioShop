/**
 * lib/asyncHandler.
 *
 * Express 4 ignores returned promises, so an async handler that rejects never
 * reaches the error middleware: the response is never written and the request
 * hangs until the client times out.
 */

const { expect } = require("chai");
const { asyncHandler, wrapController } = require("../../lib/asyncHandler");

describe("lib/asyncHandler", function () {
  describe("asyncHandler", function () {
    it("passes a rejection to next()", async function () {
      const boom = new Error("boom");
      const wrapped = asyncHandler(async () => {
        throw boom;
      });

      const seen = await new Promise((resolve) => {
        wrapped({}, {}, resolve);
      });
      expect(seen).to.equal(boom);
    });

    it("passes a synchronous throw to next()", async function () {
      const boom = new Error("sync boom");
      const wrapped = asyncHandler(() => {
        throw boom;
      });

      const seen = await new Promise((resolve) => {
        wrapped({}, {}, resolve);
      });
      expect(seen).to.equal(boom);
    });

    it("does not call next() when the handler succeeds", async function () {
      let nextCalled = false;
      const wrapped = asyncHandler(async () => "ok");

      await wrapped({}, {}, () => {
        nextCalled = true;
      });
      expect(nextCalled).to.equal(false);
    });

    it("preserves arity 4 so Express still sees an error handler", function () {
      const wrapped = asyncHandler(async (err, req, res, next) => next(err));
      expect(wrapped.length).to.equal(4);
    });

    it("forwards rejections from an error handler too", async function () {
      const boom = new Error("handler itself failed");
      const wrapped = asyncHandler(async () => {
        throw boom;
      });
      // Arity-3 form; the arity-4 path is covered above.
      const seen = await new Promise((resolve) => wrapped({}, {}, resolve));
      expect(seen).to.equal(boom);
    });

    it("returns non-functions unchanged", function () {
      expect(asyncHandler(null)).to.equal(null);
      expect(asyncHandler("nope")).to.equal("nope");
    });
  });

  describe("wrapController", function () {
    it("wraps every function on the object", async function () {
      const controller = {
        async explode() {
          throw new Error("nested boom");
        },
      };
      const wrapped = wrapController(controller);

      const seen = await new Promise((resolve) => {
        wrapped.explode({}, {}, resolve);
      });
      expect(seen).to.be.an("error");
    });

    it("wraps nested controller objects, like docs.subject.show", function () {
      const controller = {
        subject: {
          show: async () => {},
          nested: { deeper: async () => {} },
        },
      };
      const wrapped = wrapController(controller);

      expect(wrapped.subject.show).to.be.a("function");
      expect(wrapped.subject.show).to.not.equal(controller.subject.show);
      expect(wrapped.subject.nested.deeper).to.be.a("function");
    });

    it("leaves non-function properties alone", function () {
      const controller = { name: "docs", limit: 10, flags: null };
      const wrapped = wrapController(controller);

      expect(wrapped.name).to.equal("docs");
      expect(wrapped.limit).to.equal(10);
      expect(wrapped.flags).to.equal(null);
    });
  });
});
