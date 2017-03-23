const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;

const Subject = thinky.createModel('Subject', {
    id: type.string(),
    subjectID: type.string(),
    position: type.number().default(0),
    name: type.string().required(),
    createdAt: type.date().default(r.now()),
    disabled: type.boolean().default(false)
});

module.exports = Subject;
const Document = require('./document');

Subject.hasMany(Subject, 'subjects', 'id', 'subjectID');
Subject.hasMany(Document, 'documents', 'id', 'subjectID');