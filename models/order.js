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

Order.pre("save", function (next) {
  const order = this;

  // Set createdAt if not already set
  if (!order.createdAt) {
    order.createdAt = new Date();
  }

  if (!order.janCode) {
    Order.run({ cursor: false }) // Skip cursor to get raw data
      .then((allOrders) => {
        const allJanCodes = allOrders.map((o) =>
          parseInt(o.janCode || "0", 10),
        );
        const highestJanCode = Math.max(...allJanCodes);
        const newJanCode = highestJanCode + 1;
        const newJanCodeStr = newJanCode.toString();

        console.log(
          "PRESAVE - prevHighestJanCode:",
          highestJanCode,
          "+ newJancodeAsString:",
          newJanCodeStr,
        );

        order.janCode = newJanCodeStr;

        if (order.janCode !== newJanCodeStr) {
          console.error("Problems assigning order.janCode");
        }
        next();
      })
      .catch((err) => {
        next(err);
      });
  } else {
    next();
  }
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
