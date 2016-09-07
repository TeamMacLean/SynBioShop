const thinky = require('../lib/thinky');
const type = thinky.type;
const isImage = require('is-image');
const config = require('../config.json');
const r = thinky.r;
// const util = require('../lib/util');


const File = thinky.createModel('File', {
    id: type.string(),
    originalName: type.string().required(),
    name: type.string().required(),
    path: type.string().required(),
    createdAt: type.date().default(r.now())
    // relativePath: type.string().required()
});
module.exports = File;

File.define('relativePath', function () {
    return config.uploadRootURL + '/' + this.name;
});

File.define('isImage', function () {
    return isImage(this.path);
});