const thinky = require( '../../lib/thinky');
const type = thinky.type;
const Type1 = {};

Type1.fields = [
    {type: 'text', name: 'comments', text: 'Comments'},
    {type: 'text', name: 'insideOverhangs', text: 'Inside Overhangs'},
    {type: 'text', name: 'outsideOverhangs', text: 'Outside Overhangs'},
    {type: 'text', name: 'description', text: 'Description'},
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

    //TYPE SPECIFIC
    insideOverhangs: type.string().required(),
    outsideOverhangs: type.string().required(),
    resistance: type.string().required()
});


module.exports = Type1;