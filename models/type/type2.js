const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type2 = {};

Type2.fields = [
    {type: 'text', name: 'code', text: 'Code'},
    {type: 'text', name: 'comments', text: 'Comments'},
    {type: 'text', name: 'description', text: 'Description'},
    {type: 'text', name: 'speciesOfOrigin', text: 'Species of Origin'},
    {type: 'text', name: 'whoMadeIt', text: 'Who made it'}
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

    //TYPE SPECIFIC
    code: type.string().required(),
    speciesOfOrigin: type.string().required(),
    whoMadeIt: type.string().required()
});


module.exports = Type2;