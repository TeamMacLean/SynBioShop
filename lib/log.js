const Log = {};

Log.log = (...inputs) => {
    console.log(inputs.join(' '));
};
Log.error = (...inputs) => {
    console.log(inputs.join(' '));
};
Log.success = (...inputs) => {
    console.log(inputs.join(' '));
};
Log.warn = (...inputs) => {
    console.log(inputs.join(' '));
};

module.exports = Log;