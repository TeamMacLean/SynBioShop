var express = require('express');
var router = express.Router();
var config = require('./config.json');
var Util = require('./lib/util');

var premade = require('./controllers/premade');

var Auth = require('./controllers/auth');

router.route('/')
    .get(function (req, res) {
        return res.render('index');
    });

router.route('/premade')
    .all(isAuthenticated)
    .get(premade.index);
router.route('/premade/admin')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.admin);

router.route('/premade/:db')
    .all(isAuthenticated)
    .get(premade.show);

router.route('/signin')
    .get(Auth.signIn)
    .post(Auth.signInPost);

router.route('/signout')
    .get(Auth.signOut);


function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
        req.session.returnTo = req.path;
        return res.redirect('/signin');
    }
}

function isAdmin(req, res, next) {
    if (Util.isAdmin(req.user.username)) {
        return next();
    } else {
        return res.send('your not an admin!');
    }
}

module.exports = router;
