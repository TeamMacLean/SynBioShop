const config = require('../config.json');

const thinky = require('thinky')({db: config.dbName});

module.exports = thinky;