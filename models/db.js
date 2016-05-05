const thinky = require('../lib/thinky');
const type = thinky.type;
const r = thinky.r;
const util = require('../lib/util');


const DB = thinky.createModel('DB', {
    id: type.string(),
    name: type.string().required(),
    safeName: type.string().required(),
    createdAt: type.date().default(r.now())
});

DB.pre('save', function(next) {
    const db = this;
    const unsafeName = db.name;
    if (!db.safeName) {

        DB.run().then(result => {
            //TODO works to here (without additional)
            util.generateSafeName(unsafeName, result, name => {
                db.safeName = name;
                next();
            });
        });
    }
});

module.exports = DB;

//var titles = [
//  'Golden Gate Acceptor Plasmids',
//  'Standard Parts for Plants',
//  'Complete Transcriptional Units',
//  'RNA-guided Cas9-mediated Genome Engineering Parts',
//  'Polycistronic Expression',
//  'User Cloning',
//  'Viral Replicons'
//];


//var typeModels = {};

//titles.map(function (title) {
//typeModels[title] = thinky.createModel(title, {
//processed: type.boolean().required(),
//id: type.string(),
//runID: type.string().required(),
//name: type.string().required(),
//MD5: type.string().required(),
//fastQCLocation: type.string(),
//safeName: type.string().required(),
//fileName: type.string().required(),
//path: type.string().required(),
//siblingID: type.string(),
//legacyPath: type.string()
//});
//});


//  TYPES:
//    Code,	Description,	Species of Origin,	Who Made it
//
//    name, download
//
//    Name, Inside Overhangs (clone in),	Outside overhangs(clone out),	Description,	Resistance