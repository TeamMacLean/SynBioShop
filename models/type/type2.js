const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type2 = {};

Type2.model = thinky.createModel('Type2', {
    id: type.string(),
    dbID: type.string().required(),
    categoryID: type.string().required(),
    code: type.string(),
    description: type.string(),
    speciesOfOrigin: type.string(),
    whoMadeIt: type.string()
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