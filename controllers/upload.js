const renderError = require('../lib/renderError');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');
const File = require('../models/file');
const Flash = require('../lib/flash');
const upload = {};

upload.fileManager = (req, res)=> {

    File
    // .filter(function (file) {
    //     return file('originalName').contains('.gb');
    // })

        .run().then((files)=> {
        files = files.filter((file)=> {
            return file.originalName.indexOf('.gb') < 0;
        });
        files = files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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

    const files = req.files;
    const file = files.file;
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

upload.download = (req, res)=> {
    const id = req.params.id;

    File.get(id)
        .then((file)=> {
            return res.download(file.path, file.originalName);
        })
        .catch((err)=> {
            return renderError(err, res);
        })
};

upload.deleteFile = (req, res)=> {
    const id = req.params.id;


    File.get(id)
        .then((file)=> {
            file.delete()
                .then(()=> {
                    Flash.success(req, `${file.originalName} deleted successfully`);
                    return res.redirect('/filemanager');
                })
                .catch((err)=> {
                    return renderError(err, res);
                });
        })
        .catch((err)=> {
            return renderError(err, res);
        });
};

upload.uploadImagePost = (req, res) => {
    console.log('uploaded files', req.files);
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