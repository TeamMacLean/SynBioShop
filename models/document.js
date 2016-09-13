const thinky = require( '../lib/thinky');
const type = thinky.type;
const r = thinky.r;


const Document = thinky.createModel('Document', {
    id: type.string(),
    subjectID: type.string(),
    title: type.string().required(),
    content: type.string().required(),
    createdAt: type.date().default(r.now()),
    editedAt: type.date(),
    editedBt: type.string(),
    position: type.number().default(0),
    disabled: type.boolean().default(false)
});

module.exports = Document;
const Subject = require('./subject');
Document.belongsTo(Subject, 'subject', 'subjectID', 'id');