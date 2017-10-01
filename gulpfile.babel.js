import gulp          from 'gulp';
import plugins       from 'gulp-load-plugins';
import browser       from 'browser-sync';
import rimraf        from 'rimraf';
import panini        from 'panini';
import yargs         from 'yargs';
import lazypipe      from 'lazypipe';
import inky          from 'inky';
import fs            from 'fs';
import siphon        from 'siphon-media-query';
import path          from 'path';
import merge         from 'merge-stream';
import beep          from 'beepbeep';
import colors        from 'colors';
import rename        from 'gulp-rename';
import ext_replace   from 'gulp-ext-replace';

var sftp = require('gulp-sftp');

const $ = plugins();

// Look for the --production flag
const PRODUCTION = !!(yargs.argv.production);
const EMAIL = yargs.argv.to;

// Declar var so that both AWS and Litmus task can use it.
var CONFIG;

// Compile the "dist" folder by running all of the below tasks
gulp.task('compile',
  gulp.series(clean, pages, sass, inline, createTMPL));

// Compile emails, run the server, and watch for file changes
gulp.task('default',
  gulp.series('compile', server, watch));

// Delete the "dist" folder
// This happens every time a Compile starts
function clean(done) {
  rimraf('dist', done);
  rimraf('templates', done);
}

// Compile layouts, pages, and partials into flat HTML files
// Then parse using Inky templates
function pages() {
  return gulp.src(['src/pages/**/*.html', '!src/pages/archive/**/*.html'])
    .pipe(panini({
      root: 'src/pages',
      layouts: 'src/layouts',
      partials: 'src/partials',
      helpers: 'src/helpers'
    }))
    .pipe(inky())
    .pipe(gulp.dest('dist'));
}

// Reset Panini's cache of layouts and partials
function resetPages(done) {
  panini.refresh();
  done();
}

// Compile Sass into CSS
function sass() {
  return gulp.src('src/assets/scss/app.scss')
    .pipe($.if(!PRODUCTION, $.sourcemaps.init()))
    .pipe($.sass({
      includePaths: ['node_modules/foundation-emails/scss']
    }).on('error', $.sass.logError))
    .pipe($.if(PRODUCTION, $.uncss(
      {
        html: ['dist/**/*.html']
      })))
    .pipe($.if(!PRODUCTION, $.sourcemaps.write()))
    .pipe(gulp.dest('dist/css'));
}

// Inline CSS and minify HTML
function inline() {
  return gulp.src('dist/**/*.html')
    .pipe($.if(PRODUCTION, inliner('dist/css/app.css')))
    .pipe(gulp.dest('dist'));
}

// Start a server with LiveReload to preview the site in
function server(done) {
  browser.init({
    server: 'dist'
  });
  done();
}

// Watch for file changes
function watch() {
  gulp.watch('src/pages/**/*.html').on('all', gulp.series(pages, inline, createTMPL, browser.reload));
  gulp.watch(['src/layouts/**/*', 'src/partials/**/*']).on('all', gulp.series(resetPages, pages, inline, createTMPL, browser.reload));
  gulp.watch(['../scss/**/*.scss', 'src/assets/scss/**/*.scss']).on('all', gulp.series(resetPages, sass, pages, inline, createTMPL, browser.reload));
}

// Inlines CSS into HTML, adds media query CSS into the <style> tag of the email, and compresses the HTML
function inliner(css) {
  var css = fs.readFileSync(css).toString();
  var mqCss = siphon(css);

  var pipe = lazypipe()
    .pipe($.inlineCss, {
      applyStyleTags: false,
      removeStyleTags: true,
      preserveMediaQueries: true,
      removeLinkTags: false
    })
    .pipe($.replace, '<!-- <style> -->', `<style>${mqCss}</style>`)
    .pipe($.replace, '<link rel="stylesheet" type="text/css" href="css/app.css">', '')
    .pipe($.replace, '=""', '')
    .pipe($.replace, '</tmpl_var>', '')
    .pipe($.replace, 'tmpl_var', 'TMPL_VAR')
    .pipe($.replace, '</tmpl_include>', '')
    .pipe($.replace, 'tmpl_include', 'TMPL_INCLUDE')
    .pipe($.replace, 'tmpl_loop', 'TMPL_LOOP')
    .pipe($.replace, 'tmpl_if', 'TMPL_IF')

  return pipe();
}

function createTMPL () {
  return gulp
    .src('dist/*.html')
    .pipe(ext_replace('.tmpl'))
    .pipe(gulp.dest('templates'))
}

function deploy () {
    return gulp.src('templates/*')
        .pipe(sftp({
            host: 'lj-13.local.bulyon.com',
            user: 'lj',
            pass: 'test',
            remotePath: '/home/lj/templates/ESN/'
        }));
};
