const express = require('express');
const router = express.Router();
const Util = require('./lib/util');
const docs = require('./controllers/documents');
const premade = require('./controllers/premade');
const custom = require('./controllers/custom');
const auth = require('./controllers/auth');
const shoppingCart = require('./controllers/shoppingCart');
const orders = require('./controllers/orders');
const upload = require('./controllers/upload');

router.route('/')
    .get((req, res) => res.render('index'));

//DOCS
router.route('/docs')
    .get(docs.index);
router.route('/docs/rearrange')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.rearrange)
    .post(docs.rearrangeSave);

router.route('/docs/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.subject.new)
    .post(docs.subject.save);
router.route('/docs/:subjectID')
    .get(docs.subject.show);
router.route('/docs/:subjectID/rename')
    .get(docs.subject.rename)
    .post(docs.subject.save);
router.route('/docs/:subjectID/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.subject.disable);
router.route('/docs/:subjectID/delete')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.subject.delete);
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
router.route('/docs/item/:itemID/delete')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(docs.document.delete);

router.route('/docs/item/:itemID/edit')
    .get(docs.document.edit)
    .post(docs.document.save);

//PREMADE
router.route('/premade')
    .all(isAuthenticated)
    .get(premade.index);
router.route('/premade/rearrange')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.rearrange)
    .post(premade.rearrangeSave);
router.route('/premade/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.db.new)
    .post(premade.db.save);
router.route('/premade/:id')
    .all(isAuthenticated)
    .get(premade.db.show);

router.route('/premade/:id/edit')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.db.edit);

router.route('/premade/:id/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.db.disable);
router.route('/premade/:id/enable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.db.enable);
router.route('/premade/:id/delete')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.db.delete);


router.route('/premade/:id/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.new)
    .post(premade.category.save);
router.route('/premade/category/:categoryID')
    .all(isAuthenticated)
    .get(premade.category.show);
router.route('/premade/category/:categoryID/edit')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.edit);
router.route('/premade/category/:categoryID/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.disable);
router.route('/premade/category/:categoryID/enable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.enable);
router.route('/premade/category/:categoryID/delete')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.category.delete);

router.route('/premade/category/:categoryID/new')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.new)
    .post(premade.item.save);
router.route('/premade/item/:itemID')
    .all(isAuthenticated)
    .get(premade.item.show);
router.route('/premade/item/:itemID/edit')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.edit);
router.route('/premade/item/:itemID/disable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.disable);
router.route('/premade/item/:itemID/enable')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.enable);
router.route('/premade/item/:itemID/delete')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(premade.item.delete);


//CUSTOM
router.route('/custom')
    .all(isAuthenticated)
    .get(custom.index);

//CART
router.route('/cart')
    .all(isAuthenticated)
    .get(shoppingCart.index);

// router.route('/cart/update')
//     .all(isAuthenticated)
//     .post(shoppingCart.update);

router.route('/cart/order')
    .all(isAuthenticated)
    .post(shoppingCart.placeOrder);

// router.route('/cart/remove/:cartItemID')
//     .all(isAuthenticated)
//     .get(shoppingCart.remove);

// router.route('/cart/add/:typeID')
//     .get(shoppingCart.add);


//FILE UPLOAD

router.route('/upload')
    .all(isAuthenticated)
    .all(isAdmin)
    // .get(upload.uploadFile)
    .post(upload.uploadFilePost);

//IMAGE UPLOAD
router.route('/imageupload')
    .all(isAuthenticated)
    .all(isAdmin)
    // .get(upload.uploadImage)
    .post(upload.uploadImagePost);

router.route('/filemanager/:id/download')
    .all(isAuthenticated)
    .get(upload.download);

router.route('/filemanager')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(upload.fileManager);
//ORDERS

router.route('/filemanager/:id/delete')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(upload.deleteFile);

router.route('/orders')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(orders.showAll);

router.route('/order/summary')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(orders.simonSummary);

router.route('/dupes')
    .all(isAuthenticated)
    .all(isAdmin)
    .get(orders.simonRepeatOrders);

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
    .get(auth.signIn)
    .post(auth.signInPost);

router.route('/signout')
    .all(isAuthenticated)
    .get(auth.signOut);

router.route('/whoamoi')
    .all(isAuthenticated)
    .get(auth.whoami);

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
        return res.send('You cannot access this page, you are not an admin.');
    }
}

module.exports = router;