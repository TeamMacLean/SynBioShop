const airdale = require('airdale');
airdale.setServer('http://ascowardswake.com:1337');

const Log = {};



Log.log = (...inputs) => {
    console.log(inputs.join(' '));
    airdale.post('log', airdale.types.info,inputs.join(' '));
};
Log.error = (...inputs) => {
    console.log(inputs.join(' '));
    airdale.post('log', airdale.types.error,inputs.join(' '));
};
Log.success = (...inputs) => {
    console.log(inputs.join(' '));
    airdale.post('log', airdale.types.success,inputs.join(' '));
};
Log.warn = (...inputs) => {
    console.log(inputs.join(' '));
    airdale.post('log', airdale.types.warn,inputs.join(' '));
};

module.exports = Log;
