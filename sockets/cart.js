const Type = require("../models/type");
const ShoppingCarts = require("../controllers/shoppingCart");
const CartItem = require("../models/cartItem");
const Cart = require("../models/cart");

/**
 * Wraps an async socket handler.
 *
 * socket.io dispatches listeners inside a bare `process.nextTick` with no
 * try/catch, so a throw here — including the TypeError from an empty payload —
 * becomes an uncaughtException and takes the whole server down. This confines
 * failures to the one socket that caused them.
 *
 * @param {import('socket.io').Socket} socket
 * @param {string} event
 * @param {(data: any) => Promise<void>} handler
 */
function on(socket, event, handler) {
  socket.on(event, (data) => {
    Promise.resolve()
      .then(() => handler(data))
      .catch((err) => {
        console.error(`Socket "${event}" failed:`, err && err.message ? err.message : err);
        // Never leak internals to the client.
        socket.emit("error", { message: "That action could not be completed." });
      });
  });
}

/**
 * Loads a cart item only if it belongs to the connected user.
 *
 * Cart item IDs are rendered into the DOM, so any signed-in user can read
 * another user's IDs from a shared page. Without this check they could delete
 * or re-quantify items in someone else's cart.
 *
 * @returns {Promise<object|null>} The item, or null if missing or not theirs.
 */
async function loadOwnedItem(itemID, username) {
  if (typeof itemID !== "string" || itemID.length === 0) return null;

  const item = await CartItem.get(itemID);
  if (!item || !item.cartID) return null;

  const cart = await Cart.get(item.cartID);
  if (!cart || cart.username !== username) return null;

  return item;
}

module.exports = (socket) => {
  // Set by the io.use() gate in sockets/index.js. Never read from the payload.
  const username = socket.data.username;

  on(socket, "addToCart", async (data) => {
    const typeID = data && data.typeID;
    if (typeof typeID !== "string" || !typeID) return;

    const type = await Type.getByID(typeID);
    const cart = await ShoppingCarts.ensureCart(username, { items: true });

    if (await cart.contains(typeID)) {
      return socket.emit("alreadyInCart", type);
    }

    await ShoppingCarts.ensureAddItem(username, type.id);
    socket.emit("addedToCart", type);
  });

  on(socket, "removeFromCart", async (data) => {
    const itemID = data && data.id;
    const item = await loadOwnedItem(itemID, username);

    if (!item) {
      return socket.emit("error", { message: "That cart item is no longer available." });
    }

    await item.delete();
    socket.emit("removedFromCart", { id: itemID });
  });

  on(socket, "changeQuantity", async (data) => {
    const itemID = data && data.id;
    const item = await loadOwnedItem(itemID, username);

    if (!item) {
      return socket.emit("error", { message: "That cart item is no longer available." });
    }

    // Clamp to the same 1-25 range the server enforces at checkout, so a
    // crafted payload cannot smuggle an out-of-range quantity into an order.
    const requested = parseInt(data.quantity, 10);
    item.quantity = Number.isFinite(requested)
      ? Math.max(1, Math.min(25, requested))
      : 1;

    const savedItem = await item.save();
    socket.emit("quantityUpdated", {
      id: savedItem.id,
      quantity: savedItem.quantity,
    });
  });
};
