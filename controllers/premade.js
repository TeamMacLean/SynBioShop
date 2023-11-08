const DB = require('../models/db');
const renderError = require('../lib/renderError');
const Type = require('../models/type');
const Category = require('../models/category');
const File = require('../models/file');
const SequenceFile = require('../models/sequenceFile');
const config = require('../config.json');
const path = require('path');
const fs = require('fs');
const Flash = require('../lib/flash');
const Log = require('../lib/log');
const mkdirp = require('mkdirp');

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
    DB.getJoin({ categories: true }).then((dbs) => {
        return res.render('premade/index', { dbs });
    }).catch(err => renderError(err, res));
};


//TEST
premade.export = (req, res) => {


    Category.getJoin({ db: true }).then((categories) => {
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
                    category: category.name,
                    position: (category.db.position * 100) + category.position,
                    items: items.map(i => {
                        return { name: i.name, description: i.items[0], position: i.position }
                    })
                }
            })
        }))

    })
        .then(out => {

            //to csv
            let csv = '';
            out
                .sort((a, b) => a.position - b.position)
                .map(o => {
                    csv = csv + o.category + '\n';
                    o.items
                        .sort((a, b) => a.position - b.position)
                        .map(i => {
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

function safeJSONStringify(obj) {
  return JSON.stringify(obj).replace(/<\/script/g, '<\\/script').replace(/<!--/g, '<\\!--');
}

premade.rearrange = (req, res) => {
    DB.getJoin({ categories: true }).then(dbs => {
        // Combine all category type fetches into a single promise array
        let getTypesPromises = dbs.flatMap(db => 
            db.categories.map(cat => 
                Type.getByCategory(cat.id).then(types => 
                    ({ ...cat, items: types.map(t => ({ id: t.id, position: t.position, name: t.name })) })
                )
            )
        );

        Promise.all(getTypesPromises)
            .then(fullCats => {
                // Merge the full categories back into their respective dbs
                let fullDbs = dbs.map(db => ({
                    ...db,
                    categories: fullCats.filter(cat => db.categories.some(dbCat => dbCat.id === cat.id))
                }));
                
                // Stringify the fullDbs safely for the client-side
                let safeDbsStr = safeJSONStringify(fullDbs);

                // checked that safeDbsStr is a valid JSON string
                let safeDbs = JSON.parse(safeDbsStr);

                // safeDbs is verified as an array of objects

                console.log('JREME', safeDbs)

                return res.render('premade/rearrange', { dbs: safeDbs });
            })
            .catch(err => renderError(err, res));
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
            return res.sendStatus(400).json({ error: err });
        });

};


premade.db.new = (req, res) => {
    getDbs().then((dbs) => {
        return res.render('premade/db/edit', { types: Type.TYPES, dbs });
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

    DB.get(req.params.id).getJoin({ categories: true }).then(db => {
        getDbs().then((dbs) => {
            return res.render('premade/db/show', { db, dbs });
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
                return res.render('premade/db/edit', { db, dbs, types: [Type.TYPES[db.type]] });
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
            return res.render('premade/category/edit', { dbs, db });
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
    Category.get(id).getJoin({ db: true })
        .then((category) => {
            getDbs().then((dbs) => {
                return res.render('premade/category/edit', { category, dbs, db: category.db });
            }).catch(err => renderError(err, res));
        })
        .catch((err) => {
            return renderError(err, res);
        });

};

premade.category.show = (req, res) => {

    const categoryID = req.params.categoryID;

    Category.get(categoryID).getJoin({ db: true }).then((category) => {

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
                return res.render('premade/category/show', { db: category.db, dbs, headings, items, category });
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
    Category.get(categoryID).getJoin({ db: true }).then((category) => {
        // DB.get(dbID).run().then(db => {
        const type = Type.getByTypeNumber(category.db.type);


        getDbs().then((dbs) => {
            return res.render('premade/item/edit', { dbs, db: category.db, category, type });
        }).catch((err) => renderError(err, res));
        // }).catch(err => renderError(err, res));
    }).catch(err => renderError(err, res));
};

function processMapFile(savedType, req) {
    return new Promise((good, bad) => {
        if (req.files && req.files.mapFile) {
            const file = req.files.mapFile;
            // take temporary file path and give it new path
            // i.e. from tmp directory to uploadRoot
            // e.g. from /tmp/file.ex to public/uploads/file.ex
            const newPath = path.join(config.uploadRoot, file.name);
            // ensure newPath is there:
            // Use it to run function that requires the directory. 
            // Callback is called after path is created or if path did already exists. 
            // Error err is set if mkdirp failed to create directory path.
            mkdirp(config.uploadRoot).then(made => {
                //Carry on, all good, directory exists / created.

                fs.rename(file.path, newPath, (err) => {
                    if (err) {
                        console.error('ERROR', err);
                    }
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
                });
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

    // hidden field of id, if it's in edit mode
    if (id) {

        // console.log('edit item mode')

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

                type.note = req.body.note;

                type.includeOnRecentlyAdded = 
                    (req.body.includeonrecentlyadded && req.body.includeonrecentlyadded === 'on') ? 
                        true : false;

                type.includeOnRecentlyAddedTimestamp = Date.now();
    
                if (req.body.linkurl && req.body.linkurl.length){
                    let citationsArray = [];
                    req.body.linkurl.forEach(function(url, index){
                        // include entry if either field has been edited

                        var bothFieldsEmpty = (url === '' && req.body.linkdesc[index] === '');
                        var bothFieldsStillDefaultValue = (url === 'Enter URL here' && req.body.linkdesc[index] === 'Enter description here');
                        var canPush = !bothFieldsEmpty && !bothFieldsStillDefaultValue;
                        if (canPush){
                            citationsArray.push({
                                url,
                                description: req.body.linkdesc[index],
                            });
                        }
                    });
                    type.citations = citationsArray;
                }

                type.level = req.body.level;

                type.save()
                    .then((savedType) => {

                        processMapFile(savedType, req)
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

        console.log('new item mode')

        DB.get(dbID).then((db) => {
            const type = Type.getByTypeNumber(db.type);
            const obj = {};
            obj.dbID = dbID;
            obj.categoryID = categoryID;

            Object.keys(req.body).forEach(key => {
                obj[key] = req.body[key];
            });

            obj.includeOnRecentlyAdded = (obj.includeonrecentlyadded && obj.includeonrecentlyadded === 'on') ? true : false;
            delete obj.includeonrecentlyadded;

            if (obj.linkurl && obj.linkurl.length){
                let citationsArray = [];
                obj.linkurl.forEach(function(url, index){
                    citationsArray.push({
                        url,
                        description: obj.linkdesc[index],
                    });
                });
                obj.citations = citationsArray;
            }
            delete obj.linkurl;
            delete obj.linkdesc;

            obj.level = req.body.level;
            const newType = type.model(obj);
            newType.name = req.body.name;

            // newType.file = 'TODO';
            newType.save().then((savedType) => {

                processMapFile(savedType, req)
                    .then(() => {
                        return res.redirect(`/premade/item/${savedType.id}`);
                    })
                    .catch((err) => {
                        return renderError(err, res);
                    });

            }).catch(err => renderError(err, res))
        }).catch(err => renderError(err, res));
    }
};

premade.item.uploadSequenceFile = (req, res) => {
    const seqFile = req.files.file;
    const { itemID} = req.params;

    const newPath = path.join(config.uploadRoot, seqFile.name);

    mkdirp(config.uploadRoot).then(made => {
        fs.rename(seqFile.path, newPath, (err) => {
            if (err) {
                console.error('ERROR', err);
            }
            new SequenceFile({
                path: newPath,
                name: seqFile.name,
                originalName: seqFile.originalname,
                typeID: itemID
            })
                .save()
                .then(() => {
                    return res.redirect(200);
                })
                .catch((err) => {
                    return renderError(err, res)
                });
        });
    });
}

premade.item.deleteSequenceFile = (req, res) => {
    const { sequenceFileID } = req.body;
    const { itemID } = req.params;

    // unpack sequenceFile ID, remove from database

    SequenceFile.get(sequenceFileID)
        .then((sequenceFile)=> {
            sequenceFile.delete()
                .then(()=> {
                    Flash.success(req, `${sequenceFile.originalName} deleted successfully`);
                    // TODO can we make this refresh not occur, i.e. nicer like other parts of website?
                    return res.redirect(`/premade/item/${itemID}`);
                })
                .catch((err)=> {
                    return renderError(err, res);
                });
        })
        .catch((err)=> {
            return renderError(err, res);
        })
    ;

}

var possibleLevels = ['0', '1', '2', 'M', 'P', '-1 (pUAP)'];

var getItemLevelStr = (level) => {
    if (possibleLevels.includes(level)){
        return level;
    } else {
        return 'Unknown';
    }
}

premade.item.show = (req, res) => {
    const itemID = req.params.itemID;

    Type.getByID(itemID)
        .then((item) => {
            
            const type = Type.getByTypeNumber(item.db.type);
            const headings = ['Description', 'Level', 'Comments'];
            const values = [item.description, item.comments];

            type.fields.map(t => {
                headings.push(t.text);
            });

            type.fields.map(tt => {
                if (item[tt.name]) {
                    values.push(item[tt.name])
                }
            });

            //get map files, select most recent
            if (item.mapFile && item.mapFile.length) {
                item.mapFile = item.mapFile.sort(function (a, b) {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                })[0];
            } else {
                item.mapFile = null;
            }

            var itemLevelStr = getItemLevelStr(item.level)
            
            values.splice(1, 0, itemLevelStr);

            getDbs().then((dbs) => {
                return res.render('premade/item/show', { headings, values, dbs, item });
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
                if (type.mapFile && type.mapFile.length) {
                    type.mapFile = type.mapFile.sort(function (a, b) {
                        return new Date(b.createdAt) - new Date(a.createdAt);
                    })[0];
                } else {
                    type.mapFile = null;
                }

                var typeLevelStr = getItemLevelStr(type.level)

                type.level = typeLevelStr;

                getDbs().then((dbs) => {
                    return res.render('premade/item/edit.ejs', { type, dbs, category, db: type.db });
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
