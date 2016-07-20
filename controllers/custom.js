const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');
const config = require('../config.json');

const custom = {};


custom.index = (req, res, next) => {
        return res.render('custom/index');
};


module.exports = custom;