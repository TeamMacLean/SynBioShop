const Auth = {};
const passport = require('passport');
const gravatar = require('gravatar');
const renderError = require('../lib/renderError');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');
var uuid = require('node-uuid');

const LOG = require('../lib/log');
/**
 * render site index
 * @param req {request}
 * @param res {response}
 */
Auth.index = (req, res) => {
    res.render('index');
};

Auth.signIn = (req, res) => {
    res.render('signin');
};

Auth.signOut = (req, res) => {
    req.logout();
    res.redirect('/');
};

Auth.signInPost = (req, res, next) => {

    passport.authenticate('ldapauth', (err, user, info) => {
        if (err) {
            LOG.error(err);
            return next(err);
        }
        if (!user) {
            let message = 'No such user';
            if (info && info.message) {
                message += `, ${info.message}`;
            }
            return renderError(message, res);
            //return res.render('error', {error: message});
        }
        req.logIn(user, err => {
            if (err) {
                return next(err);
            }

            req.user.iconURL = gravatar.url(req.user.mail) || config.defaultUserIcon;

            //take them to the page they wanted before signing in :)
            if (req.session.returnTo) {
                return res.redirect(req.session.returnTo);
            } else {
                return res.redirect('/');
            }
        });
    })(req, res, next);
};

Auth.uploadImage = (req, res, next) => {
    return res.render('upload/dialog');
};

Auth.availableImages = (req, res) => {
    fs.readdir(config.imageUploadRoot, function (err, files) {
        if (err) {
            return res.json([]);
        } else {
            return res.json(files.map((file)=> {
                const url = path.join(config.imageUploadRootURL, file);
                return {
                    imageUrl: url,
                    name: file,
                    value: url
                };
            }))
        }

    });

};

Auth.uploadImagePost = (req, res, next) => {


    console.log('body', req.body);
    console.log('files', req.files);

    const newName = uuid.v1();
    const file = req.files.userfile;
    // console.log(file);
    const newPath = path.join(config.imageUploadRoot, newName) + '.' + file.extension;
    fs.rename(file.path, newPath);

    return res.json({location: path.join(config.imageUploadRootURL, newName) + '.' + file.extension});


};

Auth.whoami = (req, res, next) => {
    return res.redirect('/');
};


module.exports = Auth;