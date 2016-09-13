const gulp = require('gulp');
const jsdoc = require('gulp-jsdoc3');

gulp.task('doc', function () {

    const config = {
        "tags": {
            "allowUnknownTags": true
        },
        "opts": {
            "destination": "./docs"
        },
        // "plugins": [
        //     "plugins/markdown"
        // ],
        // "templates": {
        //     "cleverLinks": false,
        //     "monospaceLinks": false,
        //     "default": {
        //         "outputSourceFiles": true
        //     },
        //     "path": "ink-docstrap",
        //     "theme": "cerulean",
        //     "navType": "vertical",
        //     "linenums": true,
        //     "dateFormat": "MMMM Do YYYY, h:mm:ss a"
        // }
    };

    gulp.src(['*.js', 'controllers/**/*.js', 'lib/**/*.js', 'models/**/*.js'])
        .pipe(jsdoc(config, 'docs'));
});

gulp.task('default', ['doc']);