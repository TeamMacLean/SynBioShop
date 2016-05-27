const express = require('express');
const router = express.Router();
const config = require('./config.json');
const Util = require('./lib/util');

const docs = require('./controllers/documents');
const premade = require('./controllers/premade');
const Auth = require('./controllers/auth');

const shoppingCart = require('./controllers/shoppingCart');

router.route('/')
    .get((req, res) => res.render('index'));

//DOCS
router.route('/docs')
// .all(isAuthenticated)
    .get(docs.index);
router.route('/docs/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.new)
    .post(docs.save);
router.route('/docs/:id')
    .get(docs.show);
router.route('/docs/edit/:id')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.edit)
    .post(docs.save);
router.route('/docs/disable/:id')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.disable);
router.route('/docs/enable/:id')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.enable);

//PREMADE
router.route('/premade')
    .all(isAuthenticated)
    .get(premade.index);
router.route('/premade/new')
    .all(isAuthenticated)
    .get(premade.new)
    .post(premade.newPost);
router.route('/premade/:id')
    .all(isAuthenticated)
    .get(premade.show);
router.route('/premade/:id/add')
    .all(isAuthenticated)
    .get(premade.add)
    .post(premade.addPost);

//CART
router.route('/cart')
    .all(isAuthenticated)
    .get(shoppingCart.index);

router.route('/cart/add/:typeID')
    .get(shoppingCart.add);

//AUTH

router.route('/signin')
    .get(Auth.signIn)
    .post(Auth.signInPost);

router.route('/signout')
    .get(Auth.signOut);

router.route('*')
    .get((req, res) => {
        res.render('404');
    });


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