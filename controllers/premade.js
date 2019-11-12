const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');
const Category = require('../models/category');
const File = require('../models/file');
const config = require('../config.json');
const path = require('path');
const fs = require('fs');
const Flash = require('../lib/flash');
const Log = require('../lib/log');

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
    DB.getJoin({categories: true}).then((dbs) => {
        return res.render('premade/index', {dbs});
    }).catch(err => renderError(err, res));
};



//TEST
premade.export = (req, res) => {


  Category.getJoin({db: true}).then((categories) => {
    return Promise.all(categories.map(category => {

      return Type.getByCategory(category.id).then(types => {
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
            file: t.file,
            position: t.position
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


        return {
          category: category.name, items: items.map(i => {
            return {name: i.name, description: i.items[0]}
          })
        }
      })
    }))

  })
    .then(out => {
      
      //to csv
      let csv = '';
      out.map(o=>{
          csv = csv + o.category+'\n';
          o.items.map(i=>{
            csv = csv + i.name + ', ' + i.description + '\n';  
          })
          csv = csv + '\n';
      });
     
      
      res.contentType('text/csv');
      res.set("Content-Disposition", "attachment;filename=premade_items.csv");
      res.send(csv); 
    })
    .catch(err => renderError(err, res));

};




premade.rearrange = (req, res) => {
    DB.getJoin({categories: true}).then(dbs => {

        var getTypes = [];
        //TODO prune data


        var pruned = dbs.map(db => {
            var cats = db.categories.map(cat => {

                //TODO get items too

                var out = {id: cat.id, position: cat.position, name: cat.name, items: []};

                getTypes.push(
                    new Promise((good, bad) => {
                        Type.getByCategory(cat.id)
                            .then(t => {
                                t.map(tt => {
                                    out.items.push({id: tt.id, position: tt.position, name: tt.name});
                                });
                                good()
                            })
                            .catch(bad);
                    })
                );
                return out;
            });
            return {categories: cats, id: db.id, name: db.name, position: db.position};
        });
        Promise.all(getTypes)
            .then(o => {
                return res.render('premade/rearrange', {dbs: pruned});
            })
            .catch(err => renderError(err, res))


    }).catch(err => renderError(err, res));
};


//TODO
premade.rearrangeSave = (req, res) => {

    const newOrder = JSON.parse(req.body.newOrder);

    const toDo = [];


    newOrder.map(db => {

        toDo.push(
            new Promise((good, bad) => {
                DB.get(db.id)
                    .then(doc => {
                        doc.position = db.position;
                        return doc.save()
                    })
                    .then(savedDoc => {
                        good();
                    })
                    .catch(bad)
            })
        );

        db.categories.map(c => {

            c.items.map(i => {
                toDo.push(
                    new Promise((good, bad) => {
                        Type.getByID(i.id)
                            .then(item => {
                                item.position = i.position;
                                return item.save()
                            })
                            .then(savedDoc => {
                                good();
                            })
                            .catch(bad)
                    })
                );
            })


            toDo.push(
                new Promise((good, bad) => {
                    Category.get(c.id)
                        .then(doc => {
                            doc.position = c.position;
                            return doc.save()
                        })
                        .then(savedDoc => {
                            good();
                        })
                        .catch(bad)
                })
            );
        });
    });


    Promise.all(toDo)
        .then(() => {
            Flash.success(req, 'Rearrange saved');
            Log.error('Rearrange saved');
            return res.sendStatus(200);
        })
        .catch(err => {
            Flash.error(req, err);
            Log.error(err);
            return res.sendStatus(400).json({error: err});
        });

};


premade.db.new = (req, res) => {
    getDbs().then((dbs) => {
        return res.render('premade/db/edit', {types: Type.TYPES, dbs});
    }).catch(err => renderError(err, res));
};

premade.db.save = (req, res) => {
    const name = req.body.name;
    const type = req.body.type;
    const description = req.body.description;
    const id = req.body.id;


    if (id) {
        DB.get(id)
            .then((db) => {
                db.name = name;
                // db.type=type; //should not be allowed to change this!!!!
                db.description = description;
                db.save().then(() => {
                    res.redirect('/premade');
                }).catch((err) => {
                    return renderError(err, res);
                })
            })
            .catch((err) => {
                return renderError(err, res);
            })

    } else {
        const db = new DB({
            name,
            type,
            description
        });
        db.save().then(() => {
            res.redirect('/premade');
        }).catch((err) => {
            return renderError(err, res);
        })
    }


};

premade.db.show = (req, res) => {

    DB.get(req.params.id).getJoin({categories: true}).then(db => {
        getDbs().then((dbs) => {
            return res.render('premade/db/show', {db, dbs});
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

premade.db.disable = (req, res) => {
    const id = req.params.id;
    DB.get(id).then((db) => {
        db.disabled = true;
        db.save().then(() => {
            return res.redirect(`/premade/${id}`);
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

premade.db.delete = (req, res) => {
    const id = req.params.id;
    DB.get(id).then((db) => {
        db.delete().then(() => {
            return res.redirect('/premade/');
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

premade.db.enable = (req, res) => {
    const id = req.params.id;
    DB.get(id).then((db) => {
        db.disabled = false;
        db.save().then(() => {
            return res.redirect(`/premade/${id}`);
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

premade.db.edit = (req, res) => {
    const id = req.params.id;
    DB.get(id)
        .then((db) => {
            getDbs().then((dbs) => {
                return res.render('premade/db/edit', {db, dbs, types: [Type.TYPES[db.type]]});
            }).catch(err => renderError(err, res));
        })
        .catch((err) => {
            return renderError(err, res);
        });
};

premade.category.new = (req, res) => {
    const id = req.params.id;
    DB.get(id).then(db => {
        getDbs().then((dbs) => {
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
            .then((category) => {
                category.name = name;
                // db.type=type; //should not be allowed to change this!!!!
                category.description = description;
                category.save().then(() => {
                    res.redirect(`/premade/category/${id}`);
                }).catch((err) => {
                    return renderError(err, res);
                })
            })
            .catch((err) => {
                return renderError(err, res);
            })

    } else {
        const category = new Category({
            name,
            description,
            dbID
        });
        category.save().then((newCategory) => {
            res.redirect(`/premade/category/${newCategory.id}`);
        }).catch((err) => {
            return renderError(err, res);
        })
    }
};

premade.category.edit = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).getJoin({db: true})
        .then((category) => {
            getDbs().then((dbs) => {
                return res.render('premade/category/edit', {category, dbs, db: category.db});
            }).catch(err => renderError(err, res));
        })
        .catch((err) => {
            return renderError(err, res);
        });

};

premade.category.show = (req, res) => {

    const categoryID = req.params.categoryID;

    Category.get(categoryID).getJoin({db: true}).then((category) => {

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
                    file: t.file,
                    position: t.position
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


            getDbs().then((dbs) => {
                return res.render('premade/category/show', {db: category.db, dbs, headings, items, category});
            }).catch((err) => renderError(err, res));
        }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

premade.category.enable = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).then((category) => {
        category.disabled = false;
        category.save().then(() => {
            return res.redirect(`/premade/category/${id}`);
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};
premade.category.disable = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).then((category) => {
        category.disabled = true;
        category.save().then((saved) => {
            return res.redirect(`/premade/category/${id}`);
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};
premade.category.delete = (req, res) => {
    const id = req.params.categoryID;
    Category.get(id).then((category) => {
        category.delete().then(() => {
            return res.redirect(`/premade/${category.dbID}`);
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

premade.item.new = (req, res) => {
    // const dbID = req.params.id;
    const categoryID = req.params.categoryID;
    Category.get(categoryID).getJoin({db: true}).then((category) => {
        // DB.get(dbID).run().then(db => {
        const type = Type.getByTypeNumber(category.db.type);


        getDbs().then((dbs) => {
            return res.render('premade/item/edit', {dbs, db: category.db, category, type});
        }).catch((err) => renderError(err, res));
        // }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

function processFiles(savedType, req) {
    return new Promise((good, bad) => {
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
                .then(() => {
                    return good();
                })
                .catch((err) => {
                    return bad(err);
                });

        } else {
            return good();
        }
    });
}

premade.item.save = (req, res) => {
    const dbID = req.body.dbID;
    const categoryID = req.params.categoryID;

    const id = req.body.id;

    if (id) {


        Type.getByID(id)
            .then((type) => {
                var TYPE = Type.getByTypeNumber(type.db.type);

                type.name = req.body.name;


                TYPE.fields.map((f) => {
                    type[f.name] = req.body[f.name];
                });

                type.comments = req.body.comments;
                type.description = req.body.description;
                type.concentration = req.body.concentration;
                type.synBioID = req.body.synBioID;

                type.documentation = req.body.documentation;


                type.save()
                    .then((savedType) => {

                        processFiles(savedType, req)
                            .then(() => {
                                return res.redirect(`/premade/item/${id}`);
                            })
                            .catch((err) => {
                                return renderError(err, res);
                            });

                    })
                    .catch((err) => {
                        return renderError(err, res);
                    });


            }).catch((err) => {
            return renderError(err, res);
        })

    } else {

        DB.get(dbID).then((db) => {
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

            // newType.file = 'TODO';
            newType.save().then((savedType) => {


                processFiles(savedType, req)
                    .then(() => {
                        console.log(`trying to get to /premade/item/${savedType.id}`);
                        return res.redirect(`/premade/item/${savedType.id}`);
                    })
                    .catch((err) => {
                        return renderError(err, res);
                    });

            }).catch(err => renderError(err, res))
        }).catch(err => renderError(err, res));
    }
};

premade.item.show = (req, res) => {
    const itemID = req.params.itemID;

    console.log(`trying to show ${itemID}`);
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

            //get files, select most recent
            if (item.file && item.file.length) {
                item.file = item.file.sort(function (a, b) {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                })[0];
            } else {
                item.file = null;
            }

            getDbs().then((dbs) => {
                return res.render('premade/item/show', {headings, values, dbs, item});
            }).catch(err => renderError(err, res));
        }).catch((err) => renderError(err, res));
};

premade.item.enable = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type) => {
        type.disabled = false;
        type.save().then(() => {
            return res.redirect(`/premade/item/${id}`);
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};
premade.item.disable = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type) => {
        type.disabled = true;
        type.save().then(() => {
            return res.redirect(`/premade/item/${id}`);
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

premade.item.edit = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type) => {

        type.fields = Type.getByTypeNumber(type.db.type).fields;

        Category.get(type.categoryID)
            .then((category) => {

                //get files, select most recent
                if (type.file && type.file.length) {
                    type.file = type.file.sort(function (a, b) {
                        return new Date(b.createdAt) - new Date(a.createdAt);
                    })[0];
                } else {
                    type.file = null;
                }

                getDbs().then((dbs) => {
                    return res.render('premade/item/edit.ejs', {type, dbs, category, db: type.db});
                }).catch(err => renderError(err, res));
            })
    }).catch((err) => renderError(err, res));
};
premade.item.delete = (req, res) => {
    const id = req.params.itemID;
    Type.getByID(id).then((type) => {
        type.delete().then(() => {
            return res.redirect(`/premade/category/${type.categoryID}`);
        }).catch((err) => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

module.exports = premade;
