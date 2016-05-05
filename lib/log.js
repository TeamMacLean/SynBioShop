const winston = require('winston');

var logger = new (winston.Logger)({
    colors: {
        success: 'green',
        info: 'blue',
        warn: 'yellow',
        error: 'red'
    },
    levels: {
        success: 3,
        info: 2,
        warn: 1,
        error: 0
    },
    transports: [
        new (winston.transports.Console)({
            level: 'success',
            colorize: true,
            timestamp: true
        })
    ]
});


module.exports = {

    info(...inputs) {
        logger.info(inputs.join(' '));
    },
    warn(...inputs) {
        logger.warn(inputs.join(' '))
    },
    error(...inputs) {
        logger.error(inputs.join(' '));
    },
    success(...inputs) {
        logger.success(inputs.join(' '));
    }
};