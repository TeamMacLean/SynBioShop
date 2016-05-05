const thinky = require('../lib/thinky.js');

const titles = [
  'Golden Gate Acceptor Plasmids',
  'Standard Parts for Plants',
  'Complete Transcriptional Units',
  'RNA-guided Cas9-mediated Genome Engineering Parts',
  'Polycistronic Expression',
  'User Cloning',
  'Viral Replicons'
];


const typeModels = {};

titles.map(title => {
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
});


//  TYPES:
//    Code,	Description,	Species of Origin,	Who Made it
//
//    name, download
//
//    Name, Inside Overhangs (clone in),	Outside overhangs(clone out),	Description,	Resistance