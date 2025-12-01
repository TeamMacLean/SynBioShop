const Util = {};

const passport = require("passport");
const LdapStrategy = require("passport-ldapauth");
const LocalStrategy = require("passport-local").Strategy;
const config = require("../config");

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

  // Dev mode authentication - allows admin login with any password
  // VPN mode forces LDAP even when devMode is true in config.json
  if (config.devMode && !config.vpnMode) {
    console.log("🔧 DEV MODE: Using local authentication strategy");

    passport.use(
      "local",
      new LocalStrategy(
        {
          usernameField: "username",
          passwordField: "password",
        },
        (username, password, done) => {
          // Check if user is an admin
          if (!config.admins || !config.admins.includes(username)) {
            return done(null, false, {
              message: "User not authorized in dev mode",
            });
          }

          // Check if password field has any text
          if (!password || password.trim() === "") {
            return done(null, false, { message: "Password cannot be empty" });
          }

          // Create a mock user object for dev mode
          const user = {
            id: username,
            username: username,
            name: `Dev User (${username})`,
            mail: `${username}@dev.local`,
            memberOf: ["dev-admins"],
            company: "TSL",
          };

          console.log(`✅ DEV MODE: User ${username} logged in successfully`);
          return done(null, user);
        },
      ),
    );
  } else {
    // Production or VPN mode LDAP authentication
    if (config.vpnMode) {
      console.log("🔐 VPN MODE: Using LDAP authentication strategy");
    }
    passport.use(
      "ldapauth",
      new LdapStrategy(
        {
          server: {
            url: config.ldap.url,
            bindDn: config.ldap.bindDn,
            bindCredentials: config.ldap.bindCredentials,
            searchBase: config.ldap.searchBase,
            searchFilter: config.ldap.searchFilter,
          },
        },
        (userLdap, done) => {
          // console.log(userLdap);

          const user = {
            id: userLdap.sAMAccountName,
            username: userLdap.sAMAccountName,
            name: userLdap.name,
            mail: userLdap.mail,
            memberOf: userLdap.memberOf,
            company: userLdap.company,
          };

          return done(null, user);
        },
      ),
    );
  }
};

/**
 * Determine if current user is an admin
 * @param username
 */
Util.isAdmin = (username) => config.admins.indexOf(username) > -1;

/**
 * Generate safe name
 * @param name
 * @param list
 * @param cb
 */
Util.generateSafeName = (name, list, cb) => {
  //$path, $filename
  const safeName = Util.toSafeName(name);
  let canHave = false;
  let testName = safeName;
  let testCount = 1;

  const filter = (res) => res.safeName === testName;

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
Util.toSafeName = (unsafeName) =>
  unsafeName
    .replace("&", "and")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();

module.exports = Util;
