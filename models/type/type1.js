const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type1 = {};

Type1.fields = [
    {type: 'text', name: 'codeSequence', text: 'Code Sequence'},
    {type: 'text', name: 'insideOverhangs', text: 'Inside Overhangs'},
    {type: 'text', name: 'outsideOverhangs', text: 'Outside Overhangs'},
    {type: 'text', name: 'description', text: 'Description'},
    {type: 'text', name: 'resistance', text: 'Resistance'}
];
Type1.type = 1;
Type1.typeName = 'Code/Sequence, Inside Overhangs, Outside overhangs, Description, Resistance';
Type1.model = thinky.createModel('Type1', {
    id: type.string(),
    superSize: type.boolean().default(false),
    disabled: type.boolean().default(false),
    name: type.string().required(),
    description: type.string().required(),
    dbID: type.string().required(),
    categoryID: type.string().required(),
    codeSequence: type.string().required(),
    insideOverhangs: type.string().required(),
    outsideOverhangs: type.string().required(),
    resistance: type.string().required()
});


// Type1.model.defineStatic('fields', () => Type1.fields);


module.exports = Type1;