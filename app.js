var path = require('path');
var express = require('express');
var app = express();
var config = require('./config.json');
var session = require('express-session');
var rethinkSession = require('session-rethinkdb')(session);
var passport = require('passport');
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var util = require('./lib/util.js');
var routes = require('./routes');

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

const r = require('rethinkdbdash')({
  servers: [
    {host: 'localhost', port: 28015, db: config.dbName}
  ]
});

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
  }
  next(null, req, res);
});

util.setupPassport();


app.use('/', routes);


module.exports = server;
