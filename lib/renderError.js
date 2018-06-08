const log = require('./log');
const xss = require('xss');


/**
 * Render error
 * @param err
 * @param res
 */
module.exports = function error(err, res) {
    log.error(JSON.stringify(err));
    err = xss(err);
    if (res) {
        return res.render('error', {error: err});
    }
};