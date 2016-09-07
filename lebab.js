var glob = require("glob");
var exec = require('child_process').exec;
var path = require('path');

glob("**/*.js", {ignore: ['node_modules/**', 'public/**',]}, (er, files) => {
    files.map(file=> {
        console.log(file);
        var filePath =file;
        var lebabPath = path.join('node_modules', '.bin','lebab');
        exec(lebabPath+' '+filePath+' -o '+filePath+ ' --transform arrow,for-of,arg-spread,obj-method,obj-shorthand,no-strict,exponent');
    });
});