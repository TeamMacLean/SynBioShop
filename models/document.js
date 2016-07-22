const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;
const util = require('../lib/util');


const Document = thinky.createModel('Document', {
    id: type.string(),
    subjectID: type.string(),
    title: type.string().required(),
    content: type.string().required(),
    createdAt: type.date().default(r.now()),
    editedAt: type.date(),
    editedBt: type.string(),
    disabled: type.boolean().default(false)
});

// DB.pre('save', function(next) {
//     const db = this;
//     const unsafeName = db.name;
//     if (!db.safeName) {
//
//         DB.run().then(result => {
//             //TODO works to here (without additional)
//             util.generateSafeName(unsafeName, result, name => {
//                 db.safeName = name;
//                 next();
//             });
//         });
//     }
// });

module.exports = Document;

const Subject = require('./subject');
Document.belongsTo(Subject, 'subject', 'subjectID', 'id');