const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type3 = {};

Type3.model = thinky.createModel('Type3', {
    id: type.string(),
    disabled: type.boolean().default(false),
    name: type.string().required(),
    description: type.string().required(),
    dbID: type.string().required(),
    categoryID: type.string().required(),
    FiveOH: type.string(),
    ThreeOH: type.string(),
    levelOne: type.string(),
    selection: type.string(),
    source: type.string()
});
Type3.fields = [
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

