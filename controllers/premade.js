var premade = {};

var db = require('../models/db');
var renderError = require('../lib/renderError');

premade.index = function (req, res, next) {
  db.run().then(function (dbs) {
      dbs.sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      return res.render('premade/index', {dbs: dbs});
    })
    .error(function (err) {
      return renderError(err, res);
    })
};

premade.admin = function (req, res, next) {
  db.run().then(function (dbs) {
      dbs.sort(function (a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      return res.render('premade/admin', {dbs: dbs});
    })
    .error(function (err) {
      return renderError(err, res);
    });
};

module.exports = premade;