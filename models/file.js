const thinky = require('../lib/thinky');
const type = thinky.type;
const path = require('path');
const config = require('../config.json');
const r = thinky.r;

// Image file extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];


const File = thinky.createModel('File', {
    id: type.string(),
    originalName: type.string().required(),
    name: type.string().required(),
    path: type.string().required(),
    createdAt: type.date().default(r.now()),
    typeID: type.string() // ref to premade item
    // relativePath: type.string().required()
    // below are 'virtual' fields that are part of Model
});

File.define('relativePath', function () {
    // already relatively in public/ so uploadRootURL one dir shorter than uploadRoot
    return `${config.uploadRootURL}/${this.name}`;
});

// why file manager?
File.define('downloadPath', function(){
    return `/filemanager/${this.id}/download`;
});

File.define('isImage', function () {
    const ext = path.extname(this.path).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
});

module.exports = File;