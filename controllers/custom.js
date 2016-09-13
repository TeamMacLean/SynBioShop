const custom = {};


custom.index = (req, res, next) => {
    return res.render('custom/index');
};


module.exports = custom;