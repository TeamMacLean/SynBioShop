const thinky = require('../../lib/thinky');
const type = thinky.type;
const Type3 = {};

Type3.model = thinky.createModel('Type3', {
    id: type.string(),
    dbID: type.string().required(),
    categoryID: type.string().required(),
    nameName: type.string(),
    download: type.string()
});
Type3.fields = [
    {type: 'text', name: 'nameName', text: 'Name'},
    {type: 'text', name: 'download', text: 'Download'}
];
Type3.type = 3;
Type3.typeName = 'Name, Download';

module.exports = Type3;

