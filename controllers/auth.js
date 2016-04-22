"use strict";

var Auth = {};
var passport = require('passport');
var gravatar = require('gravatar');
var renderError = require('../lib/renderError');
var config = require('../config.json');

/**
 * render site index
 * @param req {request}
 * @param res {response}
 */
Auth.index = function (req, res) {
  res.render('index');
};

Auth.signIn = function (req, res) {
  res.render('signin');
};

Auth.signOut = function (req, res) {
  req.logout();
  res.redirect('/');
};

Auth.signInPost = function (req, res, next) {

  passport.authenticate('ldapauth', function (err, user, info) {
    if (err) {
      console.error(err);
      return next(err);
    }
    if (info) {
      console.log(info);
    }
    if (!user) {
      var message = 'No such user';
      if (info && info.message) {
        message += ', ' + info.message;
      }
      return renderError(message, res);
      //return res.render('error', {error: message});
    }
    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }

      req.user.iconURL = gravatar.url(req.user.mail) || config.defaultUserIcon;

      //take them to the page they wanted before signing in :)
      if (req.session.returnTo) {
        return res.redirect(req.session.returnTo);
      } else {
        return res.redirect('/groups');
      }
    });
  })(req, res, next);
};


module.exports = Auth;