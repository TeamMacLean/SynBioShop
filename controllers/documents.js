const Document = require('../models/document');
const renderError = require('../lib/renderError');
const Log = require('../lib/log');

const Subject = require('../models/subject');

const docs = {};
docs.subject = {};
docs.document = {};

function getSubjects() {
    return new Promise((resolve, reject) => {
        Subject.run().then(subjects => {
            subjects.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            resolve(subjects);
        })
            .error(err => {
                reject(err);
            });
    });
}

docs.index = (req, res) => {
    getSubjects().then((subjects)=> {
        return res.render('documents/index', {subjects});
    }).catch(err => renderError(err, res));
};


//NEW LAYOUT
docs.subject.new = (req, res) => {
    getSubjects().then((subjects)=> {
        return res.render('documents/subject/new', {subjects});
    }).catch(err => renderError(err, res));
};

docs.subject.show = (req, res) => {
    const subjectID = req.params.subjectID;
    Subject.get(subjectID).getJoin({documents: true}).then((subject) => {
        getSubjects().then((subjects)=> {
            return res.render('documents/subject/show', {subject, subjects});
        }).catch(err => renderError(err, res));
    }).catch((err) => renderError(err, res));
};

docs.subject.save = (req, res) => {
    const name = req.body.name;
    new Subject({name: name}).save().then((savedSubject) => {
        return res.redirect('/docs/' + savedSubject.id);
    }).catch((err) => renderError(err, res));
};


docs.document.show = (req, res) => {
    const itemID = req.params.itemID;
    const subjectID = req.params.subjectID;
    Document.get(itemID).getJoin({subject: true}).then((document)=> {
        if (document.subject.id != subjectID) {
            return renderError('subjectID does not match what was found', res)
        }
        getSubjects().then((subjects)=> {
            return res.render('documents/item/show', {document, subjects});
        }).catch((err) => renderError(err, res));
    }).catch((err)=> renderError(err, res));
};


docs.document.save = (req, res) => {
    const subjectID = req.params.subjectID;
    const title = req.body.title;
    const id = req.body.id;
    const content = req.body.content;

    Subject.get(subjectID).then(subject => {
            if (id) {
                Document.get(id).then((document)=> {
                    // document.disabled = false;
                    document.save().then(()=> {
                        document.subject = subject;
                        getSubjects().then((subjects)=> {
                            return res.render('documents/show', {document, subjects});
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
                    getSubjects().then((subjects)=> {
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
        getSubjects().then((subjects)=> {
            return res.render('documents/item/edit', {subject, subjects});
        }).catch((err) => renderError(err, res));
    }).catch((error)=> renderError(error, res));

};

docs.document.edit = (req, res) => {
    const subjectID = req.params.subjectID;
    const itemID = req.params.itemID;

    Subject.get(subjectID).then((subject)=> {
        Document.get(itemID).then((document)=> {
            getSubjects().then((subjects)=> {
                return res.render('documents/item/edit', {subject, document, subjects});
            }).catch((err) => renderError(err, res));
        }).catch((err)=> renderError(err, res));
    }).catch((err)=> renderError(err, res));
};

// docs.document.disable = (req, res) => {
//     const id = req.params.id;
//     Document.get(id).then((document)=> {
//         document.disabled = true;
//         document.save().then(()=> {
//             return res.redirect('/docs')
//         })
//             .catch((error)=> {
//                 return renderError(error, res);
//             });
//     }).catch((error)=> {
//         return renderError(error, res);
//     });
// };
//
// docs.document.enable = (req, res) => {
//     const id = req.params.id;
//     Document.get(id).then((document)=> {
//         document.disabled = false;
//         document.save().then(()=> {
//             return res.redirect('/docs')
//         })
//             .catch((error)=> {
//                 return renderError(error, res);
//             });
//     }).catch((error)=> {
//         return renderError(error, res);
//     });
// };

docs.uploadImage = (req, res, next)=> {

    fs.ensu

    console.log(req.body);

};

module.exports = docs;