const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ejs = require("ejs");
const sinon = require("sinon");

// Run the actual basket script without a global jQuery. The site's CSP blocks
// the old CDN import, and webpack's private jQuery does not define window.$.
const template = fs.readFileSync(
  path.join(__dirname, "../../views/cart/index.ejs"),
  "utf8",
);
const script = ejs.render(template.match(/<script>([\s\S]*?)<\/script>/)[1], {
  displayPricing: true,
  adminForceShowPricing: false,
  isAdmin: false,
  pricePerUnit: 5,
});

function loadCart(itemCount = 2) {
  const clickHandlers = {};
  const socketHandlers = {};
  const navCount = { textContent: String(itemCount) };
  const fields = Object.fromEntries(
    ["totalQuantity", "totalQuantity-input", "totalCost", "totalCost-input"]
      .map((id) => [id, {}]),
  );
  const items = Array.from({ length: itemCount }, (_, index) => {
    const row = {
      querySelector: () => null,
      remove() { items.splice(items.indexOf(item), 1); },
    };
    const item = {
      id: `item-${index}`,
      textContent: "1",
      closest: () => row,
      row,
    };
    return item;
  });
  const socket = { on: (event, handler) => { socketHandlers[event] = handler; }, emit: sinon.spy() };
  const location = { reload: sinon.spy() };
  let ready;
  const document = {
    body: { addEventListener: (event, handler) => { clickHandlers[event] = handler; } },
    addEventListener: (event, handler) => { if (event === "DOMContentLoaded") ready = handler; },
    getElementById: (id) => fields[id] || null,
    querySelector: (selector) => selector === ".nav-cart .count"
      ? navCount
      : items.find((item) => selector === `tr[data-id="${item.id}"]`)?.row || null,
    querySelectorAll: (selector) => selector === ".item-quantity" ? items : [],
  };
  vm.runInNewContext(script, { document, socket, location, console });
  ready();
  return { clickHandlers, socketHandlers, socket, location, navCount, fields, items };
}

describe("Basket page without global jQuery", function () {
  it("emits removal when the remove icon is clicked", function () {
    const cart = loadCart();
    const link = { dataset: { id: "item-0" } };
    const event = {
      target: { closest: (selector) => selector === 'a[name="removeItem"].areyousure' ? link : null },
      preventDefault: sinon.spy(),
    };
    cart.clickHandlers.click(event);
    assert.equal(event.preventDefault.calledOnce, true);
    assert.equal(cart.socket.emit.calledOnceWithExactly("removeFromCart", { id: "item-0" }), true);
    // Wait for server confirmation before removing the row.
    assert.equal(cart.items.length, 2);
  });

  it("removes the acknowledged row and updates the count and totals", function () {
    const cart = loadCart();
    cart.socketHandlers.removedFromCart({ id: "item-0" });
    assert.deepEqual(cart.items.map((item) => item.id), ["item-1"]);
    assert.equal(cart.navCount.textContent, 1);
    assert.equal(cart.fields.totalQuantity.textContent, 1);
    assert.equal(cart.fields["totalQuantity-input"].value, 1);
    assert.equal(cart.fields.totalCost.textContent, "5.00");
    assert.equal(cart.fields["totalCost-input"].value, "5.00");
    assert.equal(cart.location.reload.called, false);
  });

  it("reloads to the empty basket view after the last item is removed", function () {
    const cart = loadCart(1);
    cart.socketHandlers.removedFromCart({ id: "item-0" });
    assert.equal(cart.items.length, 0);
    assert.equal(cart.navCount.textContent, 0);
    assert.equal(cart.location.reload.calledOnce, true);
  });
});
