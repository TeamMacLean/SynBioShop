"use strict";

var config = require('../config.json');

var thinky = require('thinky')({db: config.dbName});
module.exports = thinky;