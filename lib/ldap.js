const ldap = require('ldapjs');
const config = require('../config');


module.exports = {

    getNameFromUsername(username) {
        return new Promise((good, bad) => {

            const client = ldap.createClient({
                url: config.ldap.url
            });
            client.bind(`${config.ldap.bindDn}`, config.ldap.bindCredentials, function (err) {
                if (err) {
                    console.error(err)
                }
                // assert.ifError(err);
                // client.unbind();
                const opts = {
                    scope: "sub",
                    filter: `(sAMAccountName=${username})`
                };

                client.search(config.ldap.searchBase, opts, function (err, res) {
                    // assert.ifError(err);

                    const entries = [];

                    res.on('searchEntry', function (entry) {
                        entries.push(entry.object);
                        // console.log('entry: ' + JSON.stringify(entry.object));
                    });
                    res.on('searchReference', function (referral) {
                        // console.log('referral: ' + referral.uris.join());
                    });
                    res.on('error', function (err) {
                        // console.error('error: ' + err.message);
                        client.unbind();
                        return bad(err);
                    });
                    res.on('end', function (result) {
                        // console.log('status: ' + result.status);
                        client.unbind();
                        return good(entries);
                    });
                });
            });
        })
    }

};