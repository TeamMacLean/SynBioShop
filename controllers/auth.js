const Auth = {};
const passport = require('passport');
const gravatar = require('gravatar');
const renderError = require('../lib/renderError');
const config = require('../config.json');
const LOG = require('../lib/log');
/**
 * render site index
 * @param req {request}
 * @param res {response}
 */
Auth.index = (req, res) => {
    res.render('index');
};

Auth.signIn = (req, res) => {
    res.render('signin');
};

Auth.signOut = (req, res) => {
    req.logout();
    res.redirect('/');
};

Auth.signInPost = (req, res, next) => {

    passport.authenticate('ldapauth', (err, user, info) => {
        if (err) {
            LOG.error(err, info.message, user);
            console.error(err, info.message, user)
            return next(err);
        }
        if (!user) {
            var message = 'No user obj found';
            console.error(message)
            LOG.error(message);
            if (info && info.message) {
                message += `, ${info.message}`;
            }
            return renderError(message, res);
            //return res.render('error', {error: message});
        }
        req.logIn(user, err => {
            if (err) {
                return next(err);
            }

            req.user.iconURL = gravatar.url(req.user.mail) || config.defaultUserIcon;

            //take them to the page they wanted before signing in :)
            if (req.session.returnTo) {
                return res.redirect(req.session.returnTo);
            } else {
                return res.redirect('/');
            }
        });
    })(req, res, next);
};


Auth.whoami = (req, res, next) => {
    return res.redirect('/');
};


module.exports = Auth;