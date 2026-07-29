const thinky = require("../lib/thinky");
const type = thinky.type;
const r = thinky.r;
const moment = require("moment");
moment.locale("en-gb");

const Order = thinky.createModel("Order", {
  id: type.string(),
  username: type.string().required(),
  signatory: type.string(),
  complete: type.boolean().default(false),
  cancelled: type.boolean().default(false),
  createdAt: type.date(),
  completedAt: type.date(),
  janCode: type.string(),
  costCode: type.string().min(3).max(20),
  totalCost: type.string(),
  totalQuantity: type.string().min(1),
  pricePerUnit: type.string(),
});

Order.define("createdHumanDate", function () {
  return moment(this.createdAt).calendar();
});
Order.define("completedHumanDate", function () {
  return moment(this.completedAt).calendar();
});

Order.define("getTypes", function () {
  return new Promise((good, bad) => {
    Order.get(this.id)
      .getJoin({ items: true })
      .then((orderWithItems) => {
        Promise.all(
          orderWithItems.items.map((item, i) => {
            return new Promise((g2, b2) => {
              item
                .getType()
                .then((type) => {
                  orderWithItems.items[i].type = type;
                  return g2();
                })
                .catch((err) => {
                  //no types, possibly deleted
                  orderWithItems.items[i].type = {
                    name: "type not found, possibly deleted",
                  };
                  return g2();
                });
              // .catch(err => b2(err));
            });
          }),
        )
          .then((nothing) => good(orderWithItems))
          .catch((err) => bad(err));
      })
      .catch((err) => {
        return bad(err);
      });
  });
});

const COUNTERS_TABLE = "counters";
const JAN_CODE_COUNTER = "janCode";

// Registered through createModel purely so the shared schema bootstrap creates
// the table and server.js waits for it before accepting traffic.
thinky.createModel(COUNTERS_TABLE, {
  id: type.string(),
  v: type.number().default(0),
});

/**
 * Highest numeric janCode currently in the Orders table.
 *
 * Only consulted the first time the counter is created. Non-numeric values are
 * ignored: a single bad janCode used to turn every later Math.max into NaN and
 * permanently poison the sequence.
 *
 * @returns {Promise<number>}
 */
async function highestExistingJanCode() {
  const orders = await r.table("Order").pluck("janCode").run();

  let highest = 0;
  for (const row of orders) {
    const parsed = parseInt(row.janCode, 10);
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed;
  }
  return highest;
}

/**
 * Reserves the next order number.
 *
 * The previous implementation read every order, took `Math.max(...) + 1`, and
 * wrote it back. Two checkouts inside the same read window produced the same
 * janCode, and because lib/csv.js names the printer file after it, the second
 * order silently overwrote the first order's tube labels.
 *
 * Both branches below are single atomic writes, which RethinkDB serialises per
 * document, so concurrent callers always receive distinct numbers.
 *
 * @returns {Promise<string>} The reserved code.
 */
async function nextJanCode() {
  // Fast path: the counter already exists, so just increment it.
  const bumped = await r
    .table(COUNTERS_TABLE)
    .get(JAN_CODE_COUNTER)
    .update({ v: r.row("v").add(1) }, { returnChanges: true })
    .run();

  if (bumped.replaced && bumped.changes && bumped.changes.length) {
    return String(bumped.changes[0].new_val.v);
  }

  // Slow path: no counter document yet. Insert-with-conflict-handler is still
  // one atomic operation — whoever loses the insert race increments instead of
  // overwriting, so a burst of first-ever orders cannot collide.
  const seed = await highestExistingJanCode();

  const created = await r
    .table(COUNTERS_TABLE)
    .insert(
      { id: JAN_CODE_COUNTER, v: seed + 1 },
      {
        // RethinkDB requires the conflict resolver to take all three
        // arguments, even though newDoc is unused here.
        conflict: (id, oldDoc, newDoc) =>
          oldDoc.merge({ v: oldDoc("v").add(1) }),
        returnChanges: "always",
      },
    )
    .run();

  if (!created.changes || !created.changes.length) {
    throw new Error("Could not reserve an order number (janCode).");
  }

  return String(created.changes[0].new_val.v);
}

Order.nextJanCode = nextJanCode;

Order.pre("save", function (next) {
  const order = this;

  // Set createdAt if not already set
  if (!order.createdAt) {
    order.createdAt = new Date();
  }

  if (order.janCode) return next();

  nextJanCode()
    .then((janCode) => {
      order.janCode = janCode;
      next();
    })
    .catch(next);
});

// Initialize janCode for existing orders (commented out - needs async handling)
// Order.orderBy(r.asc("createdAt")).then((orders) => {
//   orders.map((order, ind) => {
//     order.janCode = "" + ind;
//     order.save();
//   });
// });

module.exports = Order;
const CartItem = require("./cartItem");
Order.hasMany(CartItem, "items", "id", "orderID");

Order.ensureIndex("createdAt");
