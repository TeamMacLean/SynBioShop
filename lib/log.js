const airdale = require('airdale');
airdale.setServer('http://ascowardswake.com:1337');

const Log = {};


Log.log = (...inputs) => {
    console.log(inputs.join(' '));
    airdale.post('wookoouk', 'SynBioShop', airdale.types.info, inputs.join(' '));
};
Log.error = (...inputs) => {
    console.log(inputs.join(' '));
    airdale.post('wookoouk', 'SynBioShop', airdale.types.error, inputs.join(' '));
};
Log.success = (...inputs) => {
    console.log(inputs.join(' '));
    airdale.post('wookoouk', 'SynBioShop', airdale.types.success, inputs.join(' '));
};
Log.warn = (...inputs) => {
    console.log(inputs.join(' '));
    airdale.post('wookoouk', 'SynBioShop', airdale.types.warn, inputs.join(' '));
};

module.exports = Log;
