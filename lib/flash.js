const flash = {};

const success_key = 'success_messages';
const info_key = 'info_messages';
const error_key = 'error_messages';

/**
 * Flash info
 * @param req
 * @param text
 */
flash.info = (req, text) => {
    req.flash(info_key, text);
};

/**
 * Flash success
 * @param req
 * @param text
 */
flash.success = (req, text) => {
    req.flash(success_key, text);
};

/**
 * Flash error
 * @param req
 * @param text
 */
flash.error = (req, text) => {
    req.flash(error_key, text);
};

module.exports = flash;