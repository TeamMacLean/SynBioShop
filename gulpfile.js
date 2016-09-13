const gulp = require('gulp');
const jsdoc = require('gulp-jsdoc3');

gulp.task('doc', function () {

    const config = {
        tags: {
            allowUnknownTags: true
        },
        opts: {
            destination: './docs'
        }
    };

    gulp.src(['*.js', 'controllers/**/*.js', 'lib/**/*.js', 'models/**/*.js'])
        .pipe(jsdoc(config, 'docs'));
});

gulp.task('default', ['doc']);