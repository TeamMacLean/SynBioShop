// lib/flash.js

const flash = {};

// Use standard keys without underscores for consistency
const success_key = 'success';
const info_key = 'info';
const error_key = 'error';
const warning_key = 'warning';

/**
 * Flash info message
 * @param req - Express request object
 * @param text - The message text
 */
flash.info = (req, text) => {
    req.flash(info_key, text);
};

/**
 * Flash success message
 * @param req - Express request object
 * @param text - The message text
 */
flash.success = (req, text) => {
    req.flash(success_key, text);
};

/**
 * Flash error message
 * @param req - Express request object
 * @param text - The message text
 */
flash.error = (req, text) => {
    req.flash(error_key, text);
};

/**
 * Flash warning message
 * @param req - Express request object
 * @param text - The message text
 */
flash.warning = (req, text) => {
    req.flash(warning_key, text);
};

module.exports = flash;