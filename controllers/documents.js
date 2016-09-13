const Document = require('../models/document');
const renderError = require('../lib/renderError');
const Flash = require('../lib/flash');
const Log = require('../lib/log');
const Subject = require('../models/subject');

const docs = {};
docs.subject = {};
docs.document = {};

function getTopLevelSubjects() {
    return Subject.filter((s)=> {
        return s.hasFields('subjectID').not().or(s('subjectID').eq(''));
    })
}

docs.index = (req, res) => {
    getTopLevelSubjects().getJoin({documents: true, subjects: {documents: true}}).then(subjects => {
        subjects = subjects.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        return res.render('documents/index', {subjects});
    }).catch(err => renderError(err, res));
};

docs.rearrange = (req, res) => {
    getTopLevelSubjects().getJoin({documents: true, subjects: {documents: true}}).then(subjects => {

        const output = [];

        subjects.map((subject)=> {
            const obj = {id: subject.id, name: subject.name, position: subject.position, documents: [], subjects: []};

            subject.documents.map((document)=> {
                obj.documents.push({id: document.id, name: document.title, position: document.position});
            });
            subject.subjects.map((s)=> {
                const ss = {id: s.id, name: s.name, position: s.position, documents: []};
                obj.subjects.push(ss);
                s.documents.map((d)=> {
                    ss.documents.push({id: d.id, name: d.title, position: d.position});
                })
            });
            output.push(obj)
        });


        return res.render('documents/rearrange', {subjects: output});
    }).catch(err => renderError(err, res));
};

docs.rearrangeSave = (req, res)=> {

    const newOrder = JSON.parse(req.body.newOrder);

    const toDo = [];

    function process(obj) {

        function update(objType, item) {
            return new Promise((good, bad) => {
                objType.get(item.id)
                    .then((doc)=> {
                        doc.position = item.position;
                        doc.save().then(good).catch(err=>bad);
                    })
                    .catch(err=>bad);
            })
        }

        if (!('documents' in obj) && !('subjects' in obj)) {
            toDo.push(
                update(Document, obj)
            )
        } else {
            if (obj.subjects) {
                obj.subjects.map((o)=> {
                    process(o)
                });
                toDo.push(
                    update(Subject, obj)
                )
            }
            if (obj.documents) {
                obj.documents.map((o)=> {
                    process(o)
                });
                toDo.push(
                    update(Subject, obj)
                )
            }
        }


    }

    newOrder.map(no=> {
        process(no);
    });

    Promise.all(toDo)
        .then(()=> {
            Flash.success(req, 'Rearrange saved');
            Log.error('Rearrange saved');
            return res.sendStatus(200);
        })
        .catch(err=> {
            Flash.error(req, err);
            Log.error(err);
            return res.sendStatus(400).json({error: err});
        })
};


//NEW LAYOUT
docs.subject.new = (req, res) => {

    const parentSubjectID = req.params.subjectID;
    getTopLevelSubjects().then((subjects)=> {
        return res.render('documents/subject/new', {parentSubjectID, subjects});
    }).catch(err => renderError(err, res));
};

docs.subject.rename = (req, res) => {
    const parentSubjectID = req.params.subjectID;

    Subject.get(parentSubjectID)
        .then((subject)=> {
            getTopLevelSubjects().then((subjects)=> {
                return res.render('documents/subject/rename', {subject, subjects});
            }).catch(err => renderError(err, res));
        })
        .catch(err => renderError(err, res));
};

docs.subject.show = (req, res) => {
    const subjectID = req.params.subjectID;
    Subject.get(subjectID).getJoin({documents: true, subjects: {documents: true}}).then((subject) => {
        getTopLevelSubjects().then((subjects)=> {
            return res.render('documents/subject/show', {subject, subjects});
        }).catch(err => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

docs.subject.disable = (req, res) => {
    const id = req.params.subjectID;
    Subject.get(id).then((subject)=> {
        subject.disabled = true;
        subject.save().then((saved)=> {
            return res.redirect(`/docs/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

docs.subject.enable = (req, res) => {
    const id = req.params.subjectID;
    Subject.get(id).then((subject)=> {
        subject.disabled = false;
        subject.save().then((saved)=> {
            return res.redirect(`/docs/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

docs.subject.delete = (req, res) => {
    const id = req.params.subjectID;
    Subject.get(id).then((subject)=> {
        subject.deleteAll({documents: true, subjects: true}).then(()=> {
            return res.redirect('/docs/');
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

docs.subject.save = (req, res) => {
    const name = req.body.name;
    const parentSubjectID = req.body.parentSubjectID;
    const subjectID = req.params.subjectID;

    if (subjectID) {
        Subject.get(subjectID)
            .then((subject)=> {
                subject.name = name;

                subject.save()
                    .then(()=> {
                        return res.redirect(`/docs/${subject.id}`);
                    })
                    .catch((err) => renderError(err, res));
            })
            .catch((err) => renderError(err, res));
    } else {
        const newSubject = new Subject({name});
        if (parentSubjectID) {
            newSubject.subjectID = parentSubjectID;
        }
        newSubject.save().then((savedSubject) => {
            return res.redirect(`/docs/${savedSubject.id}`);
        }).catch((err) => renderError(err, res));
    }
};


docs.document.show = (req, res) => {
    const itemID = req.params.itemID;
    Document.get(itemID).getJoin({subject: true}).then((document)=> {
        getTopLevelSubjects().then((subjects)=> {
            return res.render('documents/item/show', {document, subjects});
        }).catch((err) => renderError(err, res));
    }).catch((err)=> renderError(err, res));
};

docs.document.disable = (req, res) => {
    const id = req.params.itemID;
    Document.get(id).then((document)=> {
        document.disabled = true;
        document.save().then((saved)=> {
            return res.redirect(`/docs/item/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

docs.document.enable = (req, res) => {
    const id = req.params.itemID;
    Document.get(id).then((document)=> {
        document.disabled = false;
        document.save().then((saved)=> {
            return res.redirect(`/docs/item/${id}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

docs.document.delete = (req, res) => {
    const id = req.params.itemID;
    Document.get(id).then((document)=> {
        document.delete().then(()=> {
            return res.redirect(`/docs/item/${document.subjectID}`);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};


docs.document.save = (req, res) => {
    const subjectID = req.body.subjectID;
    const title = req.body.title;
    const id = req.body.id;
    const content = req.body.content;

    Subject.get(subjectID).getJoin({documents: true}).then(subject => {
            if (id) {
                Document.get(id).then((document)=> {
                    document.title = req.body.title;
                    document.content = req.body.content;
                    document.save().then(()=> {
                        // document.subject = subject;
                        return res.redirect(`/docs/item/${document.id}`);
                    })
                        .catch((error)=> {
                            return renderError(error, res);
                        });
                }).catch((error)=> {
                    return renderError(error, res);
                });
            } else {
                const doc = new Document({
                    subjectID,
                    title,
                    content
                });
                doc.save().then((saved)=> {
                    saved.subject = subject;
                    getTopLevelSubjects().then((subjects)=> {
                        return res.render('documents/item/show', {document: saved, subjects});
                    }).catch((err) => renderError(err, res));
                }).catch((error)=> renderError(error, res));
            }
        }
    ).catch((error)=> renderError(error, res));
};

docs.document.new = (req, res) => {

    const subjectID = req.params.subjectID;

    Subject.get(subjectID).then((subject)=> {
        getTopLevelSubjects().then((subjects)=> {
            return res.render('documents/item/edit', {subject, subjects});
        }).catch((err) => renderError(err, res));
    }).catch((error)=> renderError(error, res));

};

docs.document.edit = (req, res) => {
    const itemID = req.params.itemID;


    Document.get(itemID).getJoin({subject: true}).then((document)=> {
        getTopLevelSubjects().then((subjects)=> {
            return res.render('documents/item/edit', {subject: document.subject, document, subjects});
        }).catch((err) => renderError(err, res));
    }).catch((err)=> renderError(err, res));
};


module.exports = docs;