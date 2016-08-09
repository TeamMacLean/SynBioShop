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
router.route('/docs/:subjectID/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.subject.disable);
router.route('/docs/:subjectID/enable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.subject.enable);
router.route('/docs/:subjectID/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.document.new)
    .post(docs.document.save);
router.route('/docs/:subjectID/addsubject')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.subject.new)
    .post(docs.subject.save);
router.route('/docs/item/:itemID')
    .get(docs.document.show);

router.route('/docs/item/:itemID/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.document.disable);
router.route('/docs/item/:itemID/enable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.document.enable);

router.route('/docs/item/:itemID/edit')
    .get(docs.document.edit)
    .post(docs.document.save);

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

router.route('/premade/:id/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.db.disable);
router.route('/premade/:id/enable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.db.enable);

router.route('/premade/:id/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.new)
    .post(premade.category.newPost);

router.route('/premade/category/:categoryID')
    .all(isAuthenticated)
    .get(premade.category.show);

router.route('/premade/category/:categoryID/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.disable);
router.route('/premade/category/:categoryID/enable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.enable);

router.route('/premade/category/:categoryID/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.new)
    .post(premade.item.newPost);

router.route('/premade/item/:itemID')
    .all(isAuthenticated)
    .get(premade.item.show);

router.route('/premade/item/:itemID/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.disable);
router.route('/premade/item/:itemID/enable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.enable);


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

//IMAGE UPLOAD
router.route('/imageupload')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(Auth.uploadImage)
    .post(Auth.uploadImagePost);

router.route('/availableImages')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(Auth.availableImages)
//ORDERS

router.route('/orders')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(orders.showAll);

router.route('/order/:id')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(orders.show);

router.route('/order/:id/complete')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(orders.markAsComplete);


router.route('/order/:id/incomplete')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(orders.markAsIncomplete);


//AUTH
router.route('/signin')
    .get(Auth.signIn)
    .post(Auth.signInPost);

router.route('/signout')
    .all(isAuthenticated)
    .get(Auth.signOut);

router.route('/whoamoi')
    .all(isAuthenticated)
    .get(Auth.whoami);

router.route('*')
    .get((req, res) => {
        console.log('404', req.url);
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