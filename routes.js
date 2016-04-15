var express = require('express');
var router = express.Router();

var Auth = require('./controllers/auth');

router.route('/')
  .get(function (req, res) {
    return res.render('index');
  });

router.route('/premade')
  .all(isAuthenticated)
  .get(function (req, res) {
    return res.render('index');
  });

router.route('/signin')
  .get(Auth.signIn)
  //.post(Auth.signInPost);

//router.route('/signout')
//  .get(Auth.signOut);


function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  } else {
    req.session.returnTo = req.path;
    return res.redirect('/signin');
  }
}

module.exports = router;
