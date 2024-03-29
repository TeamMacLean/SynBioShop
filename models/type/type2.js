const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type2 = {};

Type2.fields = [
    {type: 'text', name: 'code', text: 'Code'},
    {type: 'text', name: 'speciesOfOrigin', text: 'Species of Origin'},
    {type: 'text', name: 'whoMadeIt', text: 'Who made it'},
];
Type2.typeName = 'Code, Comments, Description, Species of Origin, Who Made it';
Type2.type = 2;
Type2.model = thinky.createModel('Type2', {

    //FOR ALL
    id: type.string(),
    name: type.string().required(),
    comments: type.string().required().default(''),
    description: type.string().required(),
    dbID: type.string().required(),
    superSize: type.boolean().default(false),
    disabled: type.boolean().default(false),
    categoryID: type.string().required(),
    concentration: type.number().required().default(0),
    synBioID: type.string().required().default('unknown'),
    documentation: type.string().default(''),
    position: type.number().default(0),
    level: type.string(),
    includeOnRecentlyAdded: type.boolean().default(false),
    includeOnRecentlyAddedTimestamp: type.number().default(0),

    citations: type.array(),
    note: type.string(),

    //TYPE SPECIFIC
    code: type.string(),
    speciesOfOrigin: type.string().required(),
    whoMadeIt: type.string().required()
});


module.exports = Type2;

const File = require('../file');
Type2.model.hasMany(File, 'mapFile', 'id', 'typeID');
const SequenceFile = require('../sequenceFile');
Type2.model.hasMany(SequenceFile, 'sequenceFiles', 'id', 'typeID');