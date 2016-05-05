const premade = {};

const db = require('../models/db');
const renderError = require('../lib/renderError');

premade.index = (req, res, next) => {
    db.run().then(dbs => {
            dbs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.render('premade/index', {dbs});
        })
        .error(err => renderError(err, res))
};

function getDbs() {

    return new Promise((resolve, reject) => {
        db.run().then(dbs => {
                dbs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                resolve(dbs);
            })
            .error(err => {
                reject(err);
            });
    });


}

premade.admin = (req, res, next) => {
    getDbs().then(dbs => res.render('premade/admin', {dbs}))
        .catch(err => renderError(err, res));
};


premade.show = (req, res, next) => {

    db.filter({safeName: req.params.db}).run().then(dbs => {
            if (dbs.length) {
                getDbs().then(dbs => res.render('premade/show', {db, dbs}))
                    .catch(err => renderError(err, res));
            } else {
                return renderError(`Could not find DB $(req.params.db)`, res);
            }
        })
        .error(err => renderError(err, res));
};

module.exports = premade;