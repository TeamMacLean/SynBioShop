const Util = {};

const passport = require('passport');
const LdapStrategy = require('passport-ldapauth');
const config = require('../config.json');

/**
 * Setup passport
 */

Util.setupPassport = () => {

    passport.serializeUser((user, done) => {
        //console.log('serializeUser was called');
        done(null, user);
    });

    passport.deserializeUser((obj, done) => {
        //console.log('deserializeUser was called');
        done(null, obj);
    });

    passport.use(new LdapStrategy({
        server: {
            url: config.ldap.url,
            bindDn: config.ldap.bindDn,
            bindCredentials: config.ldap.bindCredentials,
            searchBase: config.ldap.searchBase,
            searchFilter: config.ldap.searchFilter
        }
    }, (userLdap, done) => {

        //if(userLdap.company === 'TSL'){ //TODO check company is TSL
        //}

        const user = {
            id: userLdap.sAMAccountName,
            username: userLdap.sAMAccountName,
            name: userLdap.name,
            mail: userLdap.mail,
            memberOf: userLdap.memberOf
        };

        done(null, user);
    }));
};


/**
 * Determine if current user is an admin
 * @param username
 */
Util.isAdmin = username => config.admins.indexOf(username) > -1;

/**
 * Generate safe name
 * @param name
 * @param list
 * @param cb
 */
Util.generateSafeName = (name, list, cb) => { //$path, $filename
    const safeName = Util.toSafeName(name);
    var canHave = false;
    var testName = safeName;
    var testCount = 1;

    const filter = res => res.safeName === testName;

    while (!canHave) {

        const dupes = list.filter(filter);

        if (dupes.length) {
            testCount += 1;
            testName = `${safeName}_${testCount}`;
        } else {
            canHave = true;
            cb(testName);
        }
    }
};

/**
 * Get uri safe version of string
 * @param unsafeName
 */
Util.toSafeName = unsafeName => unsafeName.replace('&', 'and').replace(/[^a-z0-9]/gi, '_').toLowerCase();

module.exports = Util;