const thinky = require('../lib/thinky');
const type = thinky.type;
const util = require('../lib/util');


const Subject = thinky.createModel('Subject', {
    id: type.string(),
    subjectID: type.string(),
    name: type.string().required(),
    disabled: type.boolean().default(false)
});

module.exports = Subject;

const Document = require('./document');

Subject.hasMany(Subject, 'subjects', 'id', 'subjectID');
Subject.hasMany(Document, 'documents', 'id', 'subjectID');