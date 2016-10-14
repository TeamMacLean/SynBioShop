const path = require('path');
const multer = require('multer');
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
const flash = require('express-flash');

const util = require('./lib/util.js');
const routes = require('./routes');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// const lessOptions = {dest: path.join(__dirname, 'public/css')};
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
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
    if (req.user != null) {
        res.locals.signedInUser = {};
        res.locals.signedInUser.username = req.user.username;
        res.locals.signedInUser.name = req.user.name;
        res.locals.signedInUser.mail = req.user.mail;
        res.locals.signedInUser.isAdmin = util.isAdmin(req.user.username);
        if (req.user.iconURL) {
            res.locals.signedInUser.iconURL = req.user.iconURL;
        }
        Cart.filter({username: res.locals.signedInUser.username}).getJoin({items: true}).then(carts => {
            if (carts.length == 1) {
                res.locals.signedInUser.cart = carts[0];
            } else {
                res.locals.signedInUser.cart = {};
                res.locals.signedInUser.cart.items = [];
            }
            return next(null, req, res);
        }).error(err => next(err, req, res))
    } else {
        next();
    }
});

//FLASH TEST
// app.use(function (req, res, next) {
//     req.flash('success_messages', 'success test');
//     req.flash('info_messages', 'info test');
//     req.flash('error_messages', 'error test');
//     next();
// });

util.setupPassport();

app.use('/', routes);


module.exports = server;