const renderError = require("../lib/renderError");
// const Type = require('../models/type');
const Cart = require("../models/cart");
const CartItem = require("../models/cartItem");
const Order = require("../models/order");
// const Log = require('../lib/log');
// const async = require('async');
const Email = require("../lib/email");
const Csv = require("../lib/csv");
const Flash = require("../lib/flash");
const config = require("../config.json");
const cheerio = require('cheerio');
const { exec } = require('child_process');

const pricePerUnit = config.pricePerUnit;

const ShoppingCart = {};

function renderShoppingCartError(err, res) {
  console.error('Error processing cart:', err);
  res.status(500).send('Error processing cart');
}

ShoppingCart.index = (req, res) => {
  const {user} = req;
  const {username} = user;

  ShoppingCart.ensureCart(username, { items: true })
    .then((cart) => {
      if (!cart.items) {
        cart.items = [];
      }

      const promises = cart.items.map((item) =>
        new Promise((resolve, reject) => {
          item.getType()
            .then((type) => {
              item.type = type;
              return resolve(item);
            })
            .catch((err) => {
              return reject(err);
            });
        })
      );
      
      Promise.all(promises)
        .then((updatedItems) => {
          cart.items = [].concat(...updatedItems);

          const adminForceShowPricing = req.query && req.query.adminForceShowPricing;

          const userIsInTSL = user.company === 'TSL';

          const isAdmin = config.admins.includes(username);

          const userShouldPay = !userIsInTSL && !isAdmin;

          const displayPricing = adminForceShowPricing || userShouldPay;

          return res.render('cart/index', {
            cart,
            pricePerUnit,
            isAdmin,
            displayPricing,
            adminForceShowPricing,
          });
        })
        .catch((err) => renderShoppingCartError(err, res));
    })
    .catch((err) => renderShoppingCartError(err, res));
};

ShoppingCart.ensureCart = (username, join) =>
  new Promise((good, bad) => {
    join = join || {};
    Cart.filter({ username })
      .getJoin(join)
      .then((carts) => {
        if (carts.length < 1) {
          new Cart({
            username,
          })
            .save()
            .then((savedCart) => {
              return good(savedCart);
            })
            .catch((err) => {
              return bad(err);
            });
        } else {
          return good(carts[0]);
        }
      })
      .catch((err) => {
        return bad(err);
      });
  });

ShoppingCart.ensureAdd = (username, typeID) =>
  new Promise((good, bad) => {
    ShoppingCart.ensureCart(username).then((cart) => {
      new CartItem({ cartID: cart.id, typeID })
        .save()
        .then(() => {
          return good(cart);
        })
        .catch((err) => {
          return bad(err);
        });
    });
  });

ShoppingCart.placeOrder = (req, res) => {
  const username = req.user.username;
  const { costCode, pricePerUnit } = req.body;
  var totalQuantity = req.body.totalQuantity;
  var totalCost = req.body.totalCost;
  var signatory = req.body.signatory || null;

  // database join of 'items' with cart
  ShoppingCart.ensureCart(username, { items: true })
    .then((cart) => {

      if (cart.items.length === 0) {
        // Cart is empty, do not place an order
        return res.redirect("/cart");
      }

      // recalculate quantity and cost on serverside, in case of old/bad browser:

      var totalQuantityCalculated = cart.items
        .map((item) => item.quantity)
        .reduce((a, b) => a + b, 0);

      const isCostApplicable = req.user.company !== "TSL" && !config.admins.includes(username);

      var totalCostCalculated = isCostApplicable
        ? totalQuantityCalculated * pricePerUnit
        : null;

      totalQuantity = totalQuantity ? totalQuantity : totalQuantityCalculated;
      totalCost = isCostApplicable
        ? totalCost
          ? totalCost
          : totalCostCalculated
        : null;

      if (!totalQuantity) {
        var grovel =
          "Total Quantity has not been defined. Please empty your cart, log in and out again, and try again.";
        grovel +=
          " This site is built for Google Chrome. Please also ensure that you are using it.";
        grovel +=
          " If this problem persists, please click the 'Report Bug' button and ";
        grovel +=
          " list the steps you took that will reproduce this issue, and we will ";
        grovel += " endeavour to fix the error as soon as possible.";

        return renderError(grovel, res);
      }

      new Order({ username, costCode, totalCost, totalQuantity, pricePerUnit, signatory })
        .save()
        .then((savedOrder) => {
          const saving = [];

          cart.items.map((item) => {
            item.orderID = savedOrder.id;
            saving.push(item.save());
          });

          Promise.all(saving)
            .then(() => {
              savedOrder
                .getTypes()
                .then((orderWithTypes) => {
                  Csv.newOrder(orderWithTypes, req.user)
                    .then(() => {
                      Email.newOrder(orderWithTypes, req.user)
                        .then(() => {
                          cart
                            .empty()
                            .then(() => {
                              Flash.success(req, "Order successfully placed");
                              return res.redirect("/cart");
                            })
                            .catch((err) => {
                              return renderError(err, res);
                            });
                        })
                        .catch((err) => {
                          return renderError(err, res);
                        });
                    })
                    .catch((err) => {
                      console.error("Error from Csv.newOrder:", err);
                      return renderError(err, res);
                    });
                })
                .catch((err) => {
                  return renderError(err, res);
                });
            })
            .catch((err) => {
              return renderError(err, res);
            });
        })
        .catch((err) => {
          return renderError(err, res);
        });
    })
    .catch((err) => {
      return renderError(err, res);
    });
};

module.exports = ShoppingCart;
