const thinky = require('../lib/thinky');
const type = thinky.type;
const isImage = require('is-image');
const config = require('../config.json');
const r = thinky.r;


const SequenceFile = thinky.createModel('SequenceFile', {
    id: type.string(),
    originalName: type.string().required(),
    name: type.string().required(),
    path: type.string().required(),
    createdAt: type.date().default(r.now()),
    typeID: type.string() // ref to premade item
    // relativePath: type.string().required()
    // below are 'virtual' fields that are part of Model
});

SequenceFile.define('relativePath', function () {
    // already relatively in public/ so uploadRootURL one dir shorter than uploadRoot
    return `${config.uploadRootURL}/${this.name}`;
});

// why file manager?
SequenceFile.define('downloadPath', function(){
    return `/filemanager/${this.id}/download`;
});

SequenceFile.define('isImage', function () {
    return isImage(this.path);
});

module.exports = SequenceFile;