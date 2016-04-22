var path = require('path');
//var multer = require('multer');
var bodyParser = require('body-parser');
var express = require('express');
var app = express();
var config = require('./config.json');
var session = require('express-session');
var rethinkSession = require('session-rethinkdb')(session);
var passport = require('passport');
var cookieParser = require('cookie-parser');
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var socketController = require('./controllers/socket');
socketController(io);


var util = require('./lib/util.js');
var routes = require('./routes');

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
//app.use(multer({
//  dest: config.tmpDir
//}));
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

const r = require('./lib/thinky').r;
var store = new rethinkSession(r);

app.use(session({
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  store: store
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(function (req, res, next) {
  if (req.user != null) {
    res.locals.signedInUser = {};
    res.locals.signedInUser.username = req.user.username;
    res.locals.signedInUser.name = req.user.name;
    res.locals.signedInUser.mail = req.user.mail;
    res.locals.signedInUser.isAdmin = util.isAdmin(req.user.username);
    if (req.user.iconURL) {
      res.locals.signedInUser.iconURL = req.user.iconURL;
    }

  }
  next(null, req, res);
});

util.setupPassport();


app.use('/', routes);


module.exports = server;
