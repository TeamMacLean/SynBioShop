var Util = {};

var passport = require('passport');
var LdapStrategy = require('passport-ldapauth');
var config = require('../config.json');

Util.setupPassport = function () {

  passport.serializeUser(function (user, done) {
    //console.log('serializeUser was called');
    done(null, user);
  });

  passport.deserializeUser(function (obj, done) {
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
  }, function (userLdap, done) {

    //if(userLdap.company === 'TSL'){ //TODO check company is TSL
    //}

    var user = {
      id: userLdap.sAMAccountName,
      username: userLdap.sAMAccountName,
      name: userLdap.name,
      mail: userLdap.mail,
      memberOf: userLdap.memberOf
    };

    done(null, user);
  }));
};

Util.isAdmin = function (username) {
  return config.admins.indexOf(username) > -1;
};

module.exports = Util;