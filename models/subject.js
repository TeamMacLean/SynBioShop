const thinky = require('../lib/thinky');
const type = thinky.type;


const Subject = thinky.createModel('Subject', {
    id: type.string(),
    subjectID: type.string(),
    order:type.number().default(0),
    name: type.string().required(),
    disabled: type.boolean().default(false)
});

module.exports = Subject;

const Document = require('./document');

Subject.hasMany(Subject, 'subjects', 'id', 'subjectID');
Subject.hasMany(Document, 'documents', 'id', 'subjectID');