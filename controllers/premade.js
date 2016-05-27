const premade = {};

const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');

const config = require('../config.json');

premade.index = (req, res, next) => {
    getDbs().then((dbs)=> {
        return res.render('premade/index', {dbs});
    }).catch(err => renderError(err, res));
};

function getDbs() {
    return new Promise((resolve, reject) => {
        DB.run().then(dbs => {
            dbs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            resolve(dbs);
        })
            .error(err => {
                reject(err);
            });
    });
}

premade.new = (req, res, next) => {
    return res.render('premade/new', {types: Type.TYPES});
};

premade.newPost = (req, res, next) => {
    const name = req.body.name;
    const type = req.body.type;

    const db = new DB({
        name,
        type
    });

    db.save().then((saved)=> {
        res.redirect('/premade');
    }).error((err)=> {
        return renderError(err, res);
    })
};

premade.show = (req, res, next) => {
    DB.get(req.params.id).run().then(db => {
        Type.getByDB(db.id).then(types => {
            Type.getByTypeNumber(db.type).then((type)=> {
                getDbs().then((dbs)=> {

                    const headings = [];
                    const items = [];

                    type.fields.map(t => {
                        headings.push(t.text);
                    });

                    types.map(t => {
                        const x = {items: [], id: t.id};
                        type.fields.map(tt => {
                            if (t[tt.name]) {
                                x.items.push(t[tt.name])
                            }
                        });
                        if (x.items.length > 0) {
                            items.push(x);
                        }
                    });
                    return res.render('premade/show', {db, dbs, headings, items});
                }).catch((err)=>renderError(err, res));
            }).catch(err => renderError(err, res));
        }).catch(err => renderError(err, res));
    }).error(err => renderError(err, res));
};

premade.add = (req, res, next) => {
    const id = req.params.id;
    DB.get(id).run().then((db)=> {
        Type.getByTypeNumber(db.type).then((type)=> {
            getDbs().then((dbs)=> {
                return res.render('premade/add', {type, dbs, db});
            }).catch(err => renderError(err, res));
        }).catch((err)=>renderError(err, res));
    }).error((err)=>renderError(err, res));


};
premade.addPost = (req, res, next) => {

    const typeID = req.body.type;
    const dbID = req.body.dbID;

    Type.getByTypeNumber(typeID).then(type => {

        const obj = {};

        obj.dbID = dbID;

        Object.keys(req.body).forEach(key => {
            obj[key] = req.body[key];
        });
        Object.keys(req.files).forEach(key => {
            obj[key] = req.body[key];
        });
        const newType = type.model(obj);
        newType.save().then(savedType => res.redirect(`/premade/${dbID}`)).catch(err => renderError(err, res))
    }).catch(err => renderError(err, res));
};

module.exports = premade;