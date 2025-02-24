const renderError = require("../lib/renderError");
const Order = require("../models/order");
const Email = require("../lib/email");
const Flash = require("../lib/flash");
const Util = require("../lib/util");
const thinky = require("../lib/thinky");
const ldap = require("../lib/ldap");

const orders = {};

orders.show = (req, res) => {
  const orderID = req.params.id;
  Order.get(orderID)
    .getJoin({ items: true })
    .then((order) => {
      order
        .getTypes()
        .then((orderWithTypes) => {
          return res.render("orders/show", { order: orderWithTypes });
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => {
      return renderError(err, res);
    });
};

orders.mine = (req, res) => {};

orders.showAll = (req, res) => {
  const username = req.user.username;

  const filter = {};

  if (!Util.isAdmin(username)) {
    filter.username = username;
  }

  Order.filter(filter)
    .getJoin({ items: true })
    .then((orders) => {
      const sortedOrders = { open: [], closed: [] };

      orders.map((order) => {
        if (order.complete || order.cancelled) {
          sortedOrders.closed.push(order);
        } else {
          sortedOrders.open.push(order);
        }
      });
      return res.render("orders/all", { orders: sortedOrders });
    })
    .catch((err) => renderError(err, res));
};

orders.simonSummary = (req, res) => {
  const perPage = 50;
  // Default to page 1 if no page is provided, and ensure page is at least 1.
  let page = req.query.page ? parseInt(req.query.page, 10) : 1;
  if (page < 1) page = 1;

  // Use (page-1)*perPage for slicing so that page=1 shows the first 50 results.
  Order.orderBy(thinky.r.desc("createdAt"))
    .slice((page - 1) * perPage, page * perPage)
    .getJoin({ items: true })
    .then((orders) => {
      return Promise.all(
        orders.map((order) => {
          return order.getTypes();
        })
      );
    })
    .then((ordersWithTypes) => {
      // Get their full names from LDAP
      return Promise.all(
        ordersWithTypes.map((owt) => {
          return new Promise((good, bad) => {
            ldap
              .getNameFromUsername(owt.username)
              .then((users) => {
                if (users.length >= 1) {
                  const user = users[0];
                  owt.fullName = user.name;
                }
                good(owt);
              })
              .catch(() => {
                owt.fullName = owt.username; // Fallback
                good(owt);
              });
          });
        })
      );
    })
    .then((ordersWithTypes) => {
      Order.count()
        .execute()
        .then((count) => {
          res.render("orders/summary", {
            orders: ordersWithTypes,
            count: count,
            page: page,
            perPage: perPage,
          });
        });
    })
    .catch((err) => renderError(err, res));
};


orders.exportOrders = (req, res, next) => {
  const startParam = req.query.start;
  const endParam = req.query.end;

  if (!startParam || !endParam) {
    return res.status(400).json({ error: 'Please provide both start and end dates.' });
  }

  // Parse dates
  const startDate = new Date(startParam);
  const endDate = new Date(endParam);
  // Include the entire end date
  endDate.setHours(23, 59, 59, 999);

  Order
    .between(startDate, endDate, {
      index: "createdAt",
      leftBound: "closed",
      rightBound: "closed"
    })
    .orderBy({ index: "createdAt" })
    .filter(order =>
      order("costCode").ne(null)
        .and(order("totalCost").ne(null))
        .and(order("totalCost").ne(""))
    )
    // Ensure the results are ordered in ascending order by createdAt (earliest first)
    .getJoin({ items: true })
    .run()
    .then(orders => {
      return Promise.all(orders.map(order => order.getTypes()));
    })
    .then(ordersWithTypes => {
      res.json(ordersWithTypes);
    })
    .catch(err => {
      console.error('Error in exportOrders middleware:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

};

orders.simonRepeatOrders = (req, res) => {
  const itemsByUser = {}; //username:pagem, items:[]

  function addItem(username, id) {
    if (!itemsByUser[username]) {
      itemsByUser[username] = {};
    }

    if (!itemsByUser[username][id]) {
      itemsByUser[username][id] = 1;
    } else {
      itemsByUser[username][id] += 1;
    }
  }

  const promises = [];

  Order.getJoin({ items: true })
    .then((orders) => {
      orders.map((o) => {
        o.items.map((item) => {
          promises.push(
            new Promise((good, bad) => {
              item
                .getType()
                .then((type) => {
                  // console.log('type', type.name);
                  addItem(o.username, type.name);
                  good();
                })
                .catch((err) => {
                  good();
                  //TODO if not found it probably doesn't exist any more
                });
            })
          );
        });
      });

      // console.log(promises.length, 'promises');

      Promise.all(promises)
        .then(() => {
          // console.log('FINISHED PROMISES');
          for (const key in itemsByUser) {
            if (itemsByUser.hasOwnProperty(key)) {
              const obj = itemsByUser[key];
              for (const prop in obj) {
                if (obj.hasOwnProperty(prop)) {
                  if (obj[prop] < 2) {
                    delete itemsByUser[key][prop];
                  }
                }
              }
            }
            //TODO now check if its empty
            if (
              Object.keys(itemsByUser[key]).length === 0 &&
              itemsByUser[key].constructor === Object
            ) {
              delete itemsByUser[key];
            }
          }

          res.json(itemsByUser);
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

orders.markAsComplete = (req, res) => {
  const orderID = req.params.id;
  Order.get(orderID)
    .getJoin({ items: true })
    .then((order) => {
      order
        .getTypes()
        .then((orderWithTypes) => {
          orderWithTypes.complete = true;
          orderWithTypes.completedAt = Date.now();
          orderWithTypes
            .save()
            .then(() => {
              Email.orderReady(orderWithTypes)
                .then(() => {
                  Flash.success(req, "Completion email sent to user");
                  return res.redirect(`/order/${orderID}`);
                })
                .catch((err) => renderError(err, res));
            })
            .catch((err) => renderError(err, res));
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

orders.markAsIncomplete = (req, res) => {
  const orderID = req.params.id;

  Order.get(orderID)
    .then((order) => {
      order.complete = false;
      order
        .save()
        .then(() => {
          return res.redirect(`/order/${orderID}`);
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

orders.markAsCancelled = (req, res) => {
  const orderID = req.params.id;

  Order.get(orderID)
    .then((order) => {
      order.cancelled = true;
      order.complete = false; // Marking as cancelled also marks it as incomplete (no user email though)
      order
        .save()
        .then(() => {
          return res.redirect(`/order/${orderID}`);
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

orders.markAsUnCancelled = (req, res) => {
  const orderID = req.params.id;

  Order.get(orderID)
    .then((order) => {
      order.cancelled = false;
      order
        .save()
        .then(() => {
          return res.redirect(`/order/${orderID}`);
        })
        .catch((err) => renderError(err, res));
    })
    .catch((err) => renderError(err, res));
};

module.exports = orders;
