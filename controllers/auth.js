const Auth = {};
const passport = require("passport");
const crypto = require("crypto");
const renderError = require("../lib/renderError");
const config = require("../config");
const LOG = require("../lib/log");
const ldapLib = require("../lib/ldap");
const Flash = require("../lib/flash");

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
      const logMessage =
        info && info.message
          ? `Invalid credentials details: ${info.message}`
          : "Invalid username/password";
      console.log(`[Auth] Failed login attempt: ${logMessage}`);

      // Flash a single, clean error message to the user
      Flash.error(req, "Invalid username/password");
      return res.redirect("/signin");
    }
    // Regenerate the session before establishing the login.
    //
    // Without this the pre-authentication session ID survives, so an attacker
    // who plants a known ID in a victim's browser holds a valid authenticated
    // session once the victim signs in. `returnTo` is the one thing worth
    // carrying across, so capture it first.
    const returnTo = req.session ? req.session.returnTo : null;

    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error("Session regeneration failed:", regenErr);
        return next(regenErr);
      }

      req.logIn(user, (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }

        req.user.iconURL =
          getGravatarUrl(req.user.mail) || config.defaultUserIcon;

        // Persist the regenerated session before redirecting, otherwise the
        // next request can race the store write and appear logged out.
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save failed after login:", saveErr);
            return next(saveErr);
          }

          // Only follow an internal path, so a poisoned returnTo cannot be
          // used to bounce the user off-site straight after signing in.
          if (
            typeof returnTo === "string" &&
            returnTo.startsWith("/") &&
            !returnTo.startsWith("//")
          ) {
            return res.redirect(returnTo);
          }
          return res.redirect("/");
        });
      });
    });
  })(req, res, next);
};

Auth.whoami = (req, res, next) => {
  return res.redirect("/");
};

Auth.checkLDAPUser = async (req, res) => {
  const username = req.body && req.body.username;

  if (typeof username !== "string" || username.trim() === "") {
    return res.status(400).send({ error: "A username is required." });
  }

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

  // Delegates to lib/ldap, which escapes the filter value, sets timeouts and
  // handles the client 'error' event. The previous inline implementation
  // interpolated the username straight into the filter and crashed the process
  // when the directory was unreachable.
  try {
    const entries = await ldapLib.getNameFromUsername(username);
    return res.send({ exists: entries.length > 0 });
  } catch (err) {
    console.error("LDAP user check failed:", err.message);
    return res
      .status(503)
      .send({ error: "Directory lookup is unavailable. Please try again." });
  }
};

module.exports = Auth;
