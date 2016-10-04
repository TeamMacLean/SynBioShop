// const airdale = require('airdale');
// airdale.setServer('http://ascowardswake.com:1337');

const Log = {};


/**
 * Log default
 * @param inputs
 */
Log.log = (...inputs) => {
    console.log(inputs.join(' '));
    // airdale.post('wookoouk', 'SynBioShop', airdale.types.info, inputs.join(' '));
};

/**
 * Log error
 * @param inputs
 */
Log.error = (...inputs) => {
    console.log(inputs.join(' '));
    // airdale.post('wookoouk', 'SynBioShop', airdale.types.error, inputs.join(' '));
};

/**
 * Log success
 * @param inputs
 */
Log.success = (...inputs) => {
    console.log(inputs.join(' '));
    // airdale.post('wookoouk', 'SynBioShop', airdale.types.success, inputs.join(' '));
};

/**
 * Log warning
 * @param inputs
 */
Log.warn = (...inputs) => {
    console.log(inputs.join(' '));
    // airdale.post('wookoouk', 'SynBioShop', airdale.types.warning, inputs.join(' '));
};

module.exports = Log;
