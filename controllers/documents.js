const Document = require('../models/document');
const renderError = require('../lib/renderError');


const docs = {};

docs.index = (req, res) => {

    Document.run().then((documents)=> {
        return res.render('documents/index', {documents});
    });
};

docs.show = (req, res) => {
    Document.get(req.params.id).then((doc)=> {
        return res.render('documents/show', {document: doc});
    }).error((err)=> {
        renderError(err, res);
    })
};

docs.save = (req, res) => {
    const title = req.body.title;
    const id = req.body.id;
    const content = req.body.content;

    if (id) {
        Document.get(id).then((document)=> {
            document.disabled = false;
            document.save().then(()=> {
                return res.render('documents/show', {document});
            })
                .error((error)=> {
                    return renderError(error, res);
                });
        }).error((error)=> {
            return renderError(error, res);
        });
    } else {
        const doc = new Document({
            title,
            content
        });
        doc.save().then((saved)=> {
            return res.render('documents/show', {document: saved});
        }).error((error)=> {
            return renderError(error, res);
        });
    }
};

docs.new = (req, res) => {
    return res.render('documents/edit');
};

docs.edit = (req, res) => {
    const id = req.params.id;
    Document.get(id).then((document)=> {
        // console.log(document);
        return res.render('documents/edit', {document});
    }).error((error)=> {
        return renderError(error, res);
    });
};

docs.disable = (req, res) => {
    const id = req.params.id;
    Document.get(id).then((document)=> {
        document.disabled = true;
        document.save().then(()=> {
            return res.redirect('/docs')
        })
            .error((error)=> {
                return renderError(error, res);
            });
    }).error((error)=> {
        return renderError(error, res);
    });
};

docs.enable = (req, res) => {
    const id = req.params.id;
    Document.get(id).then((document)=> {
        document.disabled = false;
        document.save().then(()=> {
            return res.redirect('/docs')
        })
            .error((error)=> {
                return renderError(error, res);
            });
    }).error((error)=> {
        return renderError(error, res);
    });
};

module.exports = docs;