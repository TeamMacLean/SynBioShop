const app = require('./app');
const log = require('./lib/log');
const config = require('./config.json');

const port = process.env.PORT || config.port;

app.listen(port, '0.0.0.0', () => {
  log.success('Listening on port', port);
});