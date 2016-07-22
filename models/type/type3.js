const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type3 = {};

Type3.model = thinky.createModel('Type3', {
    id: type.string(),
    dbID: type.string().required(),
    categoryID: type.string().required(),
    vectorName: type.string(),
    moduleDescription: type.string(),
    FiveOH: type.string(),
    ThreeOH: type.string(),
    levelOne: type.string(),
    selection: type.string(),
    source: type.string()
});
Type3.fields = [
    {type: 'text', name: 'vectorName', text: 'Vector Name'},
    {type: 'text', name: 'moduleDescription', text: 'Module Description'},
    {type: 'text', name: 'FiveOH', text: '5′ OH on 5′ Strand'},
    {type: 'text', name: 'ThreeOH', text: '3′ OH on 5′ Strand'},
    {type: 'text', name: 'levelOne', text: 'Level 1 Position'},
    {type: 'text', name: 'selection', text: 'Selection'},
    {type: 'text', name: 'source', text: 'Source'}
];
Type3.type = 3;
Type3.typeName = 'Vector Name, Module Description, 5′ OH on 5′ Strand, 3′ OH on 5′ Strand, Level 1 Position, Selection, Source';


module.exports = Type3;

