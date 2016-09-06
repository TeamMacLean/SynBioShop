const renderError = require('../lib/renderError');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');
const File = require('../models/file');
var uuid = require('node-uuid');

var upload = {};

upload.fileManager = (req, res)=> {

    File.run().then((files)=> {

        files = files.sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        return res.render('upload/index', {files});
    }).catch((err)=> {
        return renderError(err, res);
    });

    // return res.render('upload/index', {
    //     files: [{
    //         relativePath: '/uploads/test.txt',
    //         id: "abcd",
    //         name: 'test_file.txt'
    //     }]
    // });
};

upload.uploadFilePost = (req, res) => {

    if (!fs.existsSync(config.uploadRoot)) {
        fs.mkdirSync(config.uploadRoot);
    }

    var files = req.files;
    var file = files.file;
    if (file) {

        const newPath = path.join(config.uploadRoot, file.name);
        fs.rename(file.path, newPath);

        new File({
            path: newPath,
            name: file.name,
            originalName: file.originalname

        }).save().then(()=> {
            return res.redirect('/filemanager');
        }).catch((err)=> {
            return renderError(err, res);
        })


    } else {
        return renderError('File not received', res);
    }

};

// Auth.uploadImage = (req, res, next) => {
//     return res.render('upload/dialog');
// };

// upload.availableImages = (req, res) => {
//     fs.readdir(config.imageUploadRoot, function (err, files) {
//         if (err) {
//             return res.json([]);
//         } else {
//             return res.json(files.map((file)=> {
//                 const url = path.join(config.imageUploadRootURL, file);
//                 return {
//                     imageUrl: url,
//                     name: file,
//                     value: url
//                 };
//             }))
//         }
//
//     });
//
// };

upload.uploadImagePost = (req, res, next) => {
    console.log('uploaded files', req.files);
    const newName = uuid.v1();
    const file = req.files.userfile;
    const newPath = path.join(config.uploadRoot, file.name);
    fs.rename(file.path, newPath);

    new File({
        path: newPath,
        name: file.name,
        originalName: file.originalname

    }).save().then(()=> {
        return res.json({location: path.join(config.uploadRootURL, file.name)});
    }).catch((err)=> {
        return renderError(err, res);
    });


};
module.exports = upload;