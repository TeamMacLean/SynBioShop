const flash = {};

const success_key = 'success_messages';
const info_key = 'info_messages';
const error_key = 'error_messages';

flash.info = (req, text) => {
    req.flash(info_key, text);
};
flash.success = (req, text) => {
    req.flash(success_key, text);
};

flash.error = (req, text) => {
    req.flash(error_key, text);
};
module.exports = flash;