const Document = require('../models/document');
const renderError = require('../lib/renderError');

const Subject = require('../models/subject');

const docs = {};
docs.subject = {};
docs.document = {};

docs.index = (req, res) => {
    Subject.then((subjects)=> {
        return res.render('documents/index', {subjects});
    });
};


//NEW LAYOUT
docs.subject.new = (req, res) => {
    return res.render('documents/subject/new');
};

docs.subject.show = (req, res) => {
    const subjectID = req.params.subjectID;
    Subject.get(subjectID).getJoin({documents: true}).then((subject) => {
        console.log('subject', subject);
        return res.render('documents/subject/show', {subject});
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
    Subject.get(subjectID).then((subject)=> {
        Document.get(itemID).then((document)=> {
            return res.render('documents/item/show', {document, subject});
        }).catch((err)=> renderError(err, res));
    }).catch((err)=> renderError(err, res));
};


docs.document.save = (req, res) => {
    const subjectID = req.params.subjectID;
    const title = req.body.title;
    const id = req.body.id;
    const content = req.body.content;

    if (id) {
        Document.get(id).then((document)=> {
            document.disabled = false;
            document.save().then(()=> {
                return res.render('documents/show', {document});
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
            return res.render('documents/item/show', {document: saved});
        }).catch((error)=> renderError(error, res));
    }
};

docs.document.new = (req, res) => {

    const subjectID = req.params.subjectID;

    Subject.get(subjectID).then((subject)=> {
        return res.render('documents/item/edit', {subject});
    }).catch((error)=> renderError(error, res));

};

docs.document.edit = (req, res) => {
    const subjectID = req.params.subjectID;
    const itemID = req.params.itemID;

    Subject.get(subjectID).then((subject)=> {
        Document.get(itemID).then((document)=> {
            return res.render('documents/item/edit', {subject,document});
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

module.exports = docs;