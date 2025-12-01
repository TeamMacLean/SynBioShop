const Auth = {};
const passport = require("passport");
const crypto = require("crypto");
const renderError = require("../lib/renderError");
const config = require("../config");
const LOG = require("../lib/log");
const ldap = require("ldapjs");

/**
 * Generate Gravatar URL from email address
 * @param {string} email - The email address
 * @returns {string} The Gravatar URL
 */
function getGravatarUrl(email) {
  if (!email) return null;
  const hash = crypto
    .createHash("md5")
    .update(email.toLowerCase().trim())
    .digest("hex");
  return "https://www.gravatar.com/avatar/" + hash;
}

/**
 * render site index
 * @param req {request}
 * @param res {response}
 */
Auth.index = (req, res) => {
  res.render("index");
};

Auth.signIn = (req, res) => {
  // In VPN mode, don't expose dev mode UI even if devMode is true in config
  const showDevMode = config.devMode && !config.vpnMode;
  res.render("signin", {
    devMode: showDevMode,
    admins: config.admins,
  });
};

Auth.signOut = (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
};

Auth.signInPost = (req, res, next) => {
  // Use local strategy in dev mode (unless VPN mode), LDAP in production or VPN mode
  const useLocalAuth = config.devMode && !config.vpnMode;
  const strategy = useLocalAuth ? "local" : "ldapauth";

  if (useLocalAuth) {
    console.log("🔧 DEV MODE: Using local authentication");
  } else if (config.vpnMode) {
    console.log("🔐 VPN MODE: Using LDAP authentication");
  }

  passport.authenticate(strategy, (err, user, info) => {
    if (err) {
      const infoMessage = info && info.message ? info.message : "Unknown error";
      LOG.error(err, infoMessage, user);
      console.error("🔐 Authentication error:", err.message || err);
      console.error("Info:", infoMessage);

      // Provide helpful error message based on error type
      let errorMessage = "Authentication failed. Please try again.";

      if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
        errorMessage = config.vpnMode
          ? "Cannot connect to LDAP server. Please ensure you are connected to the VPN and try again."
          : "Cannot connect to LDAP server. Please contact support.";
        console.error("🔐 LDAP connection error - server unreachable");
      } else if (config.vpnMode) {
        errorMessage =
          "LDAP authentication failed. Please ensure you are connected to the VPN and try again.";
        console.error(
          "🔐 VPN MODE: LDAP authentication failed. Make sure you are connected to the VPN.",
        );
      }

      return renderError(errorMessage, res);
    }
    if (!user) {
      var message = "No user obj found";
      console.error(message);
      LOG.error(message);
      if (info && info.message) {
        message += `, ${info.message}`;
      }
      return renderError(message, res);
      //return res.render('error', {error: message});
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }

      req.user.iconURL =
        getGravatarUrl(req.user.mail) || config.defaultUserIcon;

      const formattedUser = {
        username: user.username,
        name: user.name,
        memberOfHowMany: user.memberOf.length,
        company: user.company,
      };

      //console.log("user logged in", formattedUser);

      //take them to the page they wanted before signing in :)
      if (req.session.returnTo) {
        return res.redirect(req.session.returnTo);
      } else {
        return res.redirect("/");
      }
    });
  })(req, res, next);
};

Auth.whoami = (req, res, next) => {
  return res.redirect("/");
};

Auth.checkLDAPUser = (req, res, next) => {
  const username = req.body.username;

  // In dev mode (not VPN), just check if user is in admins list
  if (config.devMode && !config.vpnMode) {
    const userExists = config.admins.includes(username);
    console.log(
      `🔧 DEV MODE: Checking user ${username} - exists: ${userExists}`,
    );
    return res.send({ exists: userExists });
  }

  // VPN mode or production: use LDAP
  if (config.vpnMode) {
    console.log(`🔐 VPN MODE: Checking LDAP for user ${username}`);
  }

  const client = ldap.createClient({
    url: config.ldap.url,
  });

  client.bind(config.ldap.bindDn, config.ldap.bindCredentials, (err) => {
    if (err) {
      client.unbind();
      console.error("LDAP bind failed:", err);
      return res.status(500).send("LDAP bind failed");
    }

    const searchOptions = {
      scope: "sub",
      filter: `(sAMAccountName=${username})`,
    };

    client.search(config.ldap.searchBase, searchOptions, (err, result) => {
      if (err) {
        client.unbind();
        console.error("LDAP search failed:", err);
        return res.status(500).send("LDAP search failed");
      }

      let userExists = false;
      result.on("searchEntry", (entry) => {
        userExists = true;
      });

      result.on("end", () => {
        client.unbind();
        res.send({ exists: userExists });
      });
    });
  });
};

module.exports = Auth;
