const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type2 = {};

Type2.model = thinky.createModel('Type2', {
    id: type.string(),
    name: type.string().required(),
    dbID: type.string().required(),
    categoryID: type.string().required(),
    code: type.string().required(),
    description: type.string().required(),
    speciesOfOrigin: type.string().required(),
    whoMadeIt: type.string().required()
});
Type2.fields = [
    {type: 'text', name: 'code', text: 'Code'},
    {type: 'text', name: 'description', text: 'Description'},
    {type: 'text', name: 'speciesOfOrigin', text: 'Species of Origin'},
    {type: 'text', name: 'whoMadeIt', text: 'Who made it'}
];
Type2.type = 2;
Type2.typeName = 'Code, Description, Species of Origin, Who Made it';


module.exports = Type2;