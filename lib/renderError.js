var log = require('./log');
module.exports = function error(err, res) {
    log.error(err);
    if (res) {
        return res.render('error', {error: err});
    }
};