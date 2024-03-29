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
  let page = req.query.page || 0;
  page = parseInt(page, 10);

  Order.orderBy(thinky.r.desc("createdAt"))
    .slice(page * perPage, page * perPage + perPage)
    .getJoin({ items: true })
    .then((orders) => {
      return Promise.all(
        orders.map((order) => {
          return order.getTypes();
        })
      );
    })
    .then((ordersWithTypes) => {
      //get their full names from ldap
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
                owt.fullName = owt.username; //fallback
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
