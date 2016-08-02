const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');
const config = require('../config.json');
const Category = require('../models/category');
const Log = require('../lib/log');
const CartItem = require('../models/cartItem');

const premade = {};
premade.db = {};
premade.category = {};
premade.item = {};

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

premade.index = (req, res) => {
    DB.getJoin({categories: true}).then((dbs)=> {
        return res.render('premade/index', {dbs});
    }).catch(err => renderError(err, res));
};


premade.db.new = (req, res, next) => {
    getDbs().then((dbs)=> {
        return res.render('premade/db/new', {types: Type.TYPES, dbs});
    }).catch(err => renderError(err, res));
};

premade.db.newPost = (req, res, next) => {
    const name = req.body.name;
    const type = req.body.type;

    const db = new DB({
        name,
        type
    });

    db.save().then((saved)=> {
        res.redirect('/premade');
    }).catch((err)=> {
        return renderError(err, res);
    })
};

premade.db.show = (req, res, next) => {

    DB.get(req.params.id).getJoin({categories: true}).then(db => {
        getDbs().then((dbs)=> {
            return res.render('premade/db/show', {db, dbs});
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));


};


premade.category.new = (req, res, next) => {
    const id = req.params.id;
    DB.get(id).then(function (db) {
        getDbs().then((dbs)=> {
            return res.render('premade/category/new', {dbs, db});
        }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

premade.category.newPost = (req, res, next) => {
    const name = req.body.name;
    const id = req.params.id;
    const category = new Category({
        name,
        dbID: id
    });

    category.save().then((saved)=> {
        res.redirect('/premade/' + id);
    }).catch((err)=> {
        return renderError(err, res);
    })
};

premade.category.show = (req, res, next) => {

    // const dbID = req.params.id;
    const categoryID = req.params.categoryID;

    Category.get(categoryID).getJoin({db: true}).then((category)=> {

        Type.getByCategory(categoryID).then(types => {
            const type = Type.getByTypeNumber(category.db.type);
            const headings = [];
            const items = [];

            type.fields.map(t => {
                headings.push(t.text);
            });

            types.map(t => {
                const x = {items: [], id: t.id, name: t.name};
                type.fields.map(tt => {
                    if (t[tt.name]) {
                        x.items.push(t[tt.name])
                    }
                });
                if (x.items.length > 0) {
                    items.push(x);
                }
            });
            getDbs().then((dbs)=> {
                return res.render('premade/category/show', {db: category.db, dbs, headings, items, category});
            }).catch((err)=>renderError(err, res));
        }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

premade.item.new = (req, res, next) => {
    const dbID = req.params.id;
    const categoryID = req.params.categoryID;
    Category.get(categoryID).then((category)=> {
        DB.get(dbID).run().then(db => {
            const type = Type.getByTypeNumber(db.type);
            getDbs().then((dbs)=> {
                return res.render('premade/item/new', {dbs, db, category, type});
            }).catch((err)=>renderError(err, res));
        }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

premade.item.newPost = (req, res, next) => {
    const dbID = req.params.id;
    const categoryID = req.params.categoryID;

    DB.get(dbID).then((db)=> {
        var type = Type.getByTypeNumber(db.type);
        const obj = {};
        obj.dbID = dbID;
        obj.categoryID = categoryID;

        Object.keys(req.body).forEach(key => {
            obj[key] = req.body[key];
        });
        Object.keys(req.files).forEach(key => {
            obj[key] = req.body[key];
        });
        const newType = type.model(obj);
        newType.name = req.body.name;
        newType.quantity = req.body.quantity || CartItem.QUANTITY_OPTIONS.normal;
        newType.file = 'TODO';
        newType.save().then(savedType => res.redirect(`/premade/${dbID}/${categoryID}`)).catch(err => renderError(err, res))
    }).catch(err => renderError(err, res));
};

premade.item.show = (req, res, next) => {
    const itemID = req.params.itemID;

    Type.getByID(itemID)
        .then((typesFound) => {

            if (typesFound.length < 1) {
                return next('no items found with id ' + itemID);
            }

            const item = typesFound[0];

            const type = Type.getByTypeNumber(item.db.type);
            const headings = [];
            const values = [];

            type.fields.map(t => {
                headings.push(t.text);
            });

            type.fields.map(tt => {
                if (item[tt.name]) {
                    values.push(item[tt.name])
                }
            });


            getDbs().then((dbs)=> {
                return res.render('premade/item/show', {headings, values, dbs, item});
            }).catch(err => renderError(err, res));
        }).catch((err)=>renderError(err, res));
};

// premade.delete = (req, res, next) => {
//     const id = req.params.id;
//     DB.get(id).then((db)=> {
//         Type.getByDB(db.id).then((found)=> {
//             if (found && found.length) {
//                 return renderError('This DB is not empty', res);
//             } else {
//                 db.delete().then(() => {
//                     return res.redirect('/premade');
//                 }).error((err)=> {
//                     return renderError(err, res);
//                 });
//             }
//         }).catch((err)=> {
//             return renderError(err, res);
//         });
//     }).error((err)=> {
//         return renderError(err, res);
//     });
// };

module.exports = premade;