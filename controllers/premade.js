const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');
const config = require('../config.json');
const Category = require('../models/category');
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


premade.db.new = (req, res) => {
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

    db.save().then(()=> {
        res.redirect('/premade');
    }).catch((err)=> {
        return renderError(err, res);
    })
};

premade.db.show = (req, res) => {

    DB.get(req.params.id).getJoin({categories: true}).then(db => {
        getDbs().then((dbs)=> {
            return res.render('premade/db/show', {db, dbs});
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

premade.db.disable = (req, res) => {
    const id = req.params.id;
    DB.get(id).then((db)=> {
        db.disabled = true;
        db.save().then(()=> {
            return res.redirect('/premade/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

premade.db.enable = (req, res) => {
    const id = req.params.id;
    DB.get(id).then((db)=> {
        db.disabled = false;
        db.save().then(()=> {
            return res.redirect('/premade/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
}


premade.category.new = (req, res) => {
    const id = req.params.id;
    DB.get(id).then(function (db) {
        getDbs().then((dbs)=> {
            return res.render('premade/category/new', {dbs, db});
        }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

premade.category.newPost = (req, res) => {
    const name = req.body.name;
    const id = req.params.id;
    const category = new Category({
        name,
        dbID: id
    });

    category.save().then(()=> {
        res.redirect('/premade/' + id);
    }).catch((err)=> {
        return renderError(err, res);
    })
};

premade.category.show = (req, res) => {

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
                const x = {items: [], id: t.id, name: t.name, disabled: t.disabled};
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

premade.category.enable = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).then((category)=> {
        category.disabled = false;
        category.save().then(()=> {
            return res.redirect('/premade/category/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
}
premade.category.disable = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).then((category)=> {
        category.disabled = true;
        category.save().then((saved)=> {
            return res.redirect('/premade/category/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

premade.item.new = (req, res) => {
    // const dbID = req.params.id;
    const categoryID = req.params.categoryID;
    Category.get(categoryID).getJoin({db: true}).then((category)=> {
        // DB.get(dbID).run().then(db => {
        const type = Type.getByTypeNumber(category.db.type);
        getDbs().then((dbs)=> {
            return res.render('premade/item/new', {dbs, db: category.db, category, type});
        }).catch((err)=>renderError(err, res));
        // }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

premade.item.newPost = (req, res) => {
    const dbID = req.body.dbID;
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
        newType.file = 'TODO';
        newType.save().then(savedType => res.redirect(`/premade/category/${categoryID}`)).catch(err => renderError(err, res))
    }).catch(err => renderError(err, res));
};

premade.item.show = (req, res) => {
    const itemID = req.params.itemID;

    Type.getByID(itemID)
        .then((item) => {

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

premade.item.enable = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type)=> {
        type.disabled = false;
        type.save().then(()=> {
            return res.redirect('/premade/item/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};
premade.item.disable = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type)=> {
        type.disabled = true;
        type.save().then(()=> {
            return res.redirect('/premade/item/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

module.exports = premade;