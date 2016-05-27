const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;
// const Type = require('./type');
const util = require('../lib/util');


const DB = thinky.createModel('DB', {
    id: type.string(),
    name: type.string().required(),
    // safeName: type.string().required(),
    type: type.number().required(),
    createdAt: type.date().default(r.now())
});

// DB.pre('save', function (next) {
//     const db = this;
//     const unsafeName = db.name;
//     if (!db.safeName) {
//         DB.run().then(result => {
//             util.generateSafeName(unsafeName, result, name => {
//                 db.safeName = name;
//                 next();
//             });
//         });
//     }
// });

module.exports = DB;