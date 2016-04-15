var app = require('./app');
var log = require('./lib/log');
var config = require('./config.json');

var port = process.env.PORT || config.port;

app.listen(port, '0.0.0.0', function () {
  log.success('Listening on port', port);
});