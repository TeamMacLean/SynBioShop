var thinky = require('../lib/thinky.js');
var type = thinky.type;
var r = thinky.r;


var db = thinky.createModel('DB', {
  id: type.string(),
  name: type.string().required(),
  createdAt: type.date().default(r.now())
});


module.exports = db;

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