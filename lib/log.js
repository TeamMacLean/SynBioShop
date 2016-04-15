var colors = require('colors');

function build(args) {
  var message = '';
  for (var i = 0; i < args.length; ++i) {
    message += args[i];
    if (i < args.length - 1) message += ' ';
  }
  return message;
}

module.exports = {

  info: function (inputs) {
    console.log(build(arguments).blue);
  },
  error: function (inputs) {
    console.error(build(arguments).red);
  },
  success: function (inputs) {
    console.log(build(arguments).green);
  }
};