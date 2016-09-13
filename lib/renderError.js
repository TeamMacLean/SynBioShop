const log = require('./log');


/**
 * Render error
 * @param err
 * @param res
 */
module.exports = function error(err, res) {
    log.error(err);
    if (res) {
        return res.render('error', {error: err});
    }
};