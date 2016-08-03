const Document = require('../models/document');
const renderError = require('../lib/renderError');

const Subject = require('../models/subject');
// const r = require('../lib/thinky').r;

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
        return res.render('documents/index', {subjects});
    }).catch(err => renderError(err, res));
};


//NEW LAYOUT
docs.subject.new = (req, res) => {

    const parentSubjectID = req.params.subjectID;
    getTopLevelSubjects().then((subjects)=> {
        return res.render('documents/subject/new', {parentSubjectID, subjects});
    }).catch(err => renderError(err, res));
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
            return res.redirect('/docs/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

docs.subject.enable = (req, res) => {
    const id = req.params.subjectID;
    Subject.get(id).then((subject)=> {
        subject.disabled = false;
        subject.save().then((saved)=> {
            return res.redirect('/docs/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};

docs.subject.save = (req, res) => {
    const name = req.body.name;
    const parentSubjectID = req.body.parentSubjectID;
    const newSubject = new Subject({name: name});

    if (parentSubjectID) {
        newSubject.subjectID = parentSubjectID;
    }

    newSubject.save().then((savedSubject) => {
        return res.redirect('/docs/' + savedSubject.id);
    }).catch((err) => renderError(err, res));
};


docs.document.show = (req, res) => {
    const itemID = req.params.itemID;
    // const subjectID = req.params.subjectID;
    Document.get(itemID).getJoin({subject: true}).then((document)=> {
        // if (document.subject.id != subjectID) {
        //     return renderError('subjectID does not match what was found', res)
        // }
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
            return res.redirect('/docs/item/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};
docs.document.enable = (req, res) => {
    const id = req.params.itemID;
    Document.get(id).then((document)=> {
        document.disabled = false;
        document.save().then((saved)=> {
            return res.redirect('/docs/item/' + id);
        }).catch((err)=>renderError(err, res));
    }).catch((err)=>renderError(err, res));
};


docs.document.save = (req, res) => {
    const subjectID = req.params.subjectID;
    const title = req.body.title;
    const id = req.body.id;
    const content = req.body.content;

    Subject.get(subjectID).getJoin({documents: true}).then(subject => {
            if (id) {
                Document.get(id).then((document)=> {
                    document.title = req.body.title;
                    document.content = req.body.content;
                    document.save().then(()=> {
                        document.subject = subject;
                        getTopLevelSubjects({documents: true}).then((subjects)=> {
                            subject.documents.map(function (document) {
                                console.log(document);
                            });
                            return res.render('documents/subject/show', {document, subjects, subject});
                        }).catch((err) => renderError(err, res));
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
    const subjectID = req.params.subjectID;
    const itemID = req.params.itemID;

    Subject.get(subjectID).then((subject)=> {
        Document.get(itemID).then((document)=> {
            getTopLevelSubjects().then((subjects)=> {
                return res.render('documents/item/edit', {subject, document, subjects});
            }).catch((err) => renderError(err, res));
        }).catch((err)=> renderError(err, res));
    }).catch((err)=> renderError(err, res));
};


module.exports = docs;