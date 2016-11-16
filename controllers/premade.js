const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');
const Category = require('../models/category');
const File = require('../models/file');
const config = require('../config.json');
const path = require('path');
const fs = require('fs');

const premade = {};
premade.db = {};
premade.category = {};
premade.item = {};

function getDbs() {
    return new Promise((resolve, reject) => {
        DB.run().then(dbs => {
            dbs = dbs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
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
        return res.render('premade/db/edit', {types: Type.TYPES, dbs});
    }).catch(err => renderError(err, res));
};

premade.db.save = (req, res, next) => {
    const name = req.body.name;
    const type = req.body.type;
    const description = req.body.description;
    const id = req.body.id;


    if (id) {
        DB.get(id)
            .then((db)=> {
                db.name = name;
                // db.type=type; //should not be allowed to change this!!!!
                db.description = description;
                db.save().then(()=> {
                    res.redirect('/premade');
                }).catch((err)=> {
                    return renderError(err, res);
                })
            })
            .catch((err)=> {
                return renderError(err, res);
            })

    } else {
        const db = new DB({
            name,
            type,
            description
        });
        db.save().then(()=> {
            res.redirect('/premade');
        }).catch((err)=> {
            return renderError(err, res);
        })
    }


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
            return res.redirect(`/premade/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

premade.db.delete = (req, res) => {
    const id = req.params.id;
    DB.get(id).then((db)=> {
        db.delete().then(()=> {
            return res.redirect('/premade/');
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

premade.db.enable = (req, res) => {
    const id = req.params.id;
    DB.get(id).then((db)=> {
        db.disabled = false;
        db.save().then(()=> {
            return res.redirect(`/premade/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

premade.db.edit = (req, res) => {
    const id = req.params.id;
    DB.get(id)
        .then((db)=> {
            getDbs().then((dbs)=> {
                return res.render('premade/db/edit', {db, dbs, types: [Type.TYPES[db.type]]});
            }).catch(err => renderError(err, res));
        })
        .catch((err)=> {
            return renderError(err, res);
        });
};

premade.category.new = (req, res) => {
    const id = req.params.id;
    DB.get(id).then(db => {
        getDbs().then((dbs)=> {
            return res.render('premade/category/edit', {dbs, db});
        }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

premade.category.save = (req, res) => {
    const name = req.body.name;
    const description = req.body.description;
    const id = req.body.id;
    const dbID = req.params.id;

    if (id) {
        Category.get(id)
            .then((category)=> {
                category.name = name;
                // db.type=type; //should not be allowed to change this!!!!
                category.description = description;
                category.save().then(()=> {
                    res.redirect(`/premade/category/${id}`);
                }).catch((err)=> {
                    return renderError(err, res);
                })
            })
            .catch((err)=> {
                return renderError(err, res);
            })

    } else {
        const category = new Category({
            name,
            description,
            dbID
        });
        category.save().then((newCategory)=> {
            res.redirect(`/premade/category/${newCategory.id}`);
        }).catch((err)=> {
            return renderError(err, res);
        })
    }
};

premade.category.edit = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).getJoin({db: true})
        .then((category)=> {
            getDbs().then((dbs)=> {
                return res.render('premade/category/edit', {category, dbs, db: category.db});
            }).catch(err => renderError(err, res));
        })
        .catch((err)=> {
            return renderError(err, res);
        });

};

premade.category.show = (req, res) => {

    const categoryID = req.params.categoryID;

    Category.get(categoryID).getJoin({db: true}).then((category)=> {

        Type.getByCategory(categoryID).then(types => {
            const type = Type.getByTypeNumber(category.db.type);
            const headings = ['Description', 'Comments'];
            const items = [];

            type.fields.map(t => {
                headings.push(t.text);
            });

            types.map(t => {
                const x = {
                    items: [t.description, t.comments],
                    id: t.id,
                    name: t.name,
                    disabled: t.disabled,
                    file: t.file
                };
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
            return res.redirect(`/premade/category/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};
premade.category.disable = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).then((category)=> {
        category.disabled = true;
        category.save().then((saved)=> {
            return res.redirect(`/premade/category/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};
premade.category.delete = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).then((category)=> {
        category.delete().then(()=> {
            return res.redirect(`/premade/${category.dbID}`);
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
            return res.render('premade/item/edit', {dbs, db: category.db, category, type});
        }).catch((err)=>renderError(err, res));
        // }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

premade.item.save = (req, res) => {
    const dbID = req.body.dbID;
    const categoryID = req.params.categoryID;

    const id = req.body.id;

    if (id) {


        Type.getByID(id)
            .then((type)=> {
                var TYPE = Type.getByTypeNumber(type.db.type);

                type.name = req.body.name;


                TYPE.fields.map((f)=> {
                    type[f.name] = req.body[f.name];
                });

                type.comments = req.body.comments;
                type.description = req.body.description;
                type.concentration = req.body.concentration;
                type.synBioID = req.body.synBioID;


                type.save()
                    .then(()=> {
                        return res.redirect(`/premade/item/${id}`);
                    })
                    .catch((err)=> {
                        return renderError(err, res);
                    });


            }).catch((err)=> {
            return renderError(err, res);
        })

    } else {

        DB.get(dbID).then((db)=> {
            const type = Type.getByTypeNumber(db.type);
            const obj = {};
            obj.dbID = dbID;
            obj.categoryID = categoryID;

            Object.keys(req.body).forEach(key => {
                obj[key] = req.body[key];
            });
            // Object.keys(req.files).forEach(key => {
            //     obj[key] = req.body[key];
            // });
            const newType = type.model(obj);
            newType.name = req.body.name;

            newType.file = 'TODO';
            newType.save().then((savedType) => {


                if (req.files && req.files.file) {
                    const file = req.files.file;
                    const newPath = path.join(config.uploadRoot, file.name);
                    fs.rename(file.path, newPath);
                    new File({
                        path: newPath,
                        name: file.name,
                        originalName: file.originalname,
                        typeID: savedType.id
                    })
                        .save()
                        .then(()=> {
                            return res.redirect(`/premade/category/${categoryID}`)
                        })
                        .catch((err)=> {
                            return renderError(err, res);
                        });

                } else {
                    return res.redirect(`/premade/category/${categoryID}`)
                }

            }).catch(err => renderError(err, res))
        }).catch(err => renderError(err, res));
    }
};

premade.item.show = (req, res) => {
    const itemID = req.params.itemID;

    Type.getByID(itemID)
        .then((item) => {


            const type = Type.getByTypeNumber(item.db.type);
            const headings = ['Description', 'Comments'];
            const values = [item.description, item.comments];

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
            return res.redirect(`/premade/item/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};
premade.item.disable = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type)=> {
        type.disabled = true;
        type.save().then(()=> {
            return res.redirect(`/premade/item/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

premade.item.edit = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type)=> {

        type.fields = Type.getByTypeNumber(type.db.type).fields;

        Category.get(type.categoryID)
            .then((category)=> {
                getDbs().then((dbs)=> {
                    // console.log(type);
                    return res.render('premade/item/edit.ejs', {type, dbs, category, db: type.db});
                }).catch(err => renderError(err, res));
            })
    }).catch((err)=>renderError(err, res));
};
premade.item.delete = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type)=> {
        type.delete().then(()=> {
            return res.redirect(`/premade/category/${type.categoryID}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

module.exports = premade;