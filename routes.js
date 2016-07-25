const express = require('express');
const router = express.Router();
const config = require('./config.json');
const Util = require('./lib/util');

const docs = require('./controllers/documents');
const premade = require('./controllers/premade');
const custom = require('./controllers/custom');
const Auth = require('./controllers/auth');
const shoppingCart = require('./controllers/shoppingCart');
const orders = require('./controllers/orders');

router.route('/')
    .get((req, res) => res.render('index'));

//DOCS
router.route('/docs')
    .get(docs.index);
router.route('/docs/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.subject.new)
    .post(docs.subject.save);
router.route('/docs/:subjectID')
    .get(docs.subject.show);
router.route('/docs/:subjectID/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.document.new)
    .post(docs.document.save);
router.route('/docs/:subjectID/:itemID')
    .get(docs.document.show);

router.route('/docs/:subjectID/:itemID/edit')
    .get(docs.document.edit)
    .post(docs.document.save);

// router.route('/docs/edit/:id')
//     .all(isAuthenticated)
//     .all(isAdmin)
//     .get(docs.edit)
//     .post(docs.save);
// router.route('/docs/disable/:id')
//     .all(isAuthenticated)
//     .all(isAdmin)
//     .get(docs.disable);
// router.route('/docs/enable/:id')
//     .all(isAuthenticated)
//     .all(isAdmin)
//     .get(docs.enable);

//PREMADE
router.route('/premade')
    .all(isAuthenticated)
    .get(premade.index);
router.route('/premade/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.db.new)
    .post(premade.db.newPost);
router.route('/premade/:id')
    .all(isAuthenticated)
    .get(premade.db.show);
router.route('/premade/:id/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.new)
    .post(premade.category.newPost);

router.route('/premade/:id/:categoryID')
    .all(isAuthenticated)
    .get(premade.category.show);

router.route('/premade/:id/:categoryID/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.new)
    .post(premade.item.newPost);

router.route('/premade/:id/:categoryID/:itemID')
    .all(isAuthenticated)
    .get(premade.item.show);


//CUSTOM
router.route('/custom')
    .all(isAuthenticated)
    .get(custom.index);

//CART
router.route('/cart')
    .all(isAuthenticated)
    .get(shoppingCart.index);

router.route('/cart/update')
    .all(isAuthenticated)
    .post(shoppingCart.update);

router.route('/cart/order')
    .all(isAuthenticated)
    .get(shoppingCart.placeOrder);

router.route('/cart/remove/:cartItemID')
    .all(isAuthenticated)
    .get(shoppingCart.remove);

router.route('/cart/add/:typeID')
    .get(shoppingCart.add);

router.route('/order/:id')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(orders.show);

//IMAGE UPLOAD
router.route('/imageupload')
    .all(isAuthenticated)
    .all(isAdmin)
    .post(docs.uploadImage);

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