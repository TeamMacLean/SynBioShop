const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type1 = {};

Type1.fields = [
    {type: 'text', name: 'insideOverhangLeft', text: 'Inside o\hang L'},
    {type: 'text', name: 'insideOverhangRight', text: 'Inside o\hang R'},
    {type: 'text', name: 'outsideOverhangLeft', text: 'Outside o\hang L'},
    {type: 'text', name: 'outsideOverhangRight', text: 'Outside o\hang R'},
    {type: 'text', name: 'resistance', text: 'Resistance'}
];
Type1.typeName = 'Comments, Inside Overhangs, Outside overhangs, Description, Resistance';
Type1.type = 1;
Type1.model = thinky.createModel('Type1', {

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


    //TYPE SPECIFIC
    insideOverhangLeft: type.string().required(),
    insideOverhangRight: type.string().required(),
    outsideOverhangLeft: type.string().required(),
    outsideOverhangRight: type.string().required(),
    resistance: type.string().required()
});


module.exports = Type1;

const File = require('../file');
Type1.model.hasOne(File, 'file', 'id', 'typeID');