const path = require('path');
const multer = require('multer');
const renderError = require('./lib/renderError');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const config = require('./config.json');
const session = require('express-session');
const rethinkSession = require('session-rethinkdb')(session);
const passport = require('passport');
const cookieParser = require('cookie-parser');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
require('./sockets')(io); //index file
const Cart = require('./models/cart');
const Order = require('./models/order');
const flash = require('express-flash');
const Billboard = require('./models/billboard');


const validator = require('validator');

const util = require('./lib/util.js');
const routes = require('./routes');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
// bodyparser is the most important plugin for express
// to get the body out of the request is usually regex garbage
// this formats and puts in req body for you. super useful!
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({extended: false})); 
app.use(cookieParser());
app.use(flash());
app.use(multer({
    dest: config.tmpDir
}));


const r = require('./lib/thinky').r;
const store = new rethinkSession(r);

app.use(session({
    secret: config.secret,
    resave: false,
    saveUninitialized: false,
    store
}));

app.use(passport.initialize());
app.use(passport.session());


app.use((req, res, next) => {
    res.locals.disablePremade = config.disablePremade;
    res.locals.disableCart = config.disableCart;
    next();

})

app.use((req, res, next) => {

    if (req.user) {
        res.locals.signedInUser = {};
        res.locals.signedInUser.username = validator.escape(req.user.username);
        res.locals.signedInUser.name = validator.escape(req.user.name);
        res.locals.signedInUser.mail = validator.escape(req.user.mail);
        res.locals.signedInUser.isAdmin = util.isAdmin(req.user.username);
        res.locals.signedInUser.company = validator.escape(req.user.company);
        res.locals.isPricingAvailable = config.isPricingAvailable;
        if (req.user.iconURL) {
            res.locals.signedInUser.iconURL = req.user.iconURL;
        }

        new Promise((good, bad) => {
            Cart.filter({username: res.locals.signedInUser.username}).getJoin({items: true})
                .then(carts => {
                    if (carts.length === 1) {
                        res.locals.signedInUser.cart = carts[0];
                    } else {
                        res.locals.signedInUser.cart = {};
                        res.locals.signedInUser.cart.items = [];
                    }
                    return good();
                }).catch(err => bad(err));
        })
            .then(() => {
                return new Promise((good, bad) => {
                    Order.filter({complete: false})
                        .count()
                        .execute()
                        .then(incompleteCount => {
                            res.locals.incompleteCount = incompleteCount;
                            return good();
                        })
                        .catch(err => bad(err))
                })


            }).then(() => {
            return next(null, req, res);
        })
            .catch(err => next(err, req, res))
    } else {
        next();
    }
});

app.use((req, res, next) => {
    Billboard.run()
        .then(billboards => {
            if (billboards.length) {
                res.locals.billboard = billboards[0];
            } else {
            }

            return next()

        })
        .catch(err => renderError(err));
})

// FLASH TEST
// app.use(function (req, res, next) {
//     req.flash('success_messages', 'success test');
//     req.flash('info_messages', 'info test');
//     req.flash('error_messages', 'error test');
//     next();
// });

util.setupPassport();
app.set('json spaces', 2);
app.use('/', routes);


module.exports = server;
