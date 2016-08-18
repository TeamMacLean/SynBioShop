module.exports = function error(err, res) {
    console.error('renderError', err);
    if (res) {
        return res.render('error', {error: err});
    }
};