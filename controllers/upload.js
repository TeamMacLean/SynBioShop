const renderError = require('../lib/renderError');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');
const File = require('../models/file');
const SequenceFile = require('../models/sequenceFile');
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

        fs.promises.rename(file.path, newPath).then( _ => {
            new File({
                path: newPath,
                name: file.name,
                originalName: file.originalname
    
            }).save().then(() => {
                Flash.success(req, `Uploaded new file successfully`);                
                return res.redirect('/filemanager');
            }).catch((err)=> {
                return renderError(err, res);
            })
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

upload.download = async (req, res) => {
    const id = req.params.id;

    try {
        const file = await File.get(id);

        // Check if file exists
        await fs.access(file.path);

        // If the file exists, proceed with download
        return res.download(file.path, file.originalName, (downloadErr) => {
            if (downloadErr) {
                console.error('Error during file download:', downloadErr);
                return res.status(500).send('An error occurred while downloading the file.');
            }
        });
    } catch (err) {
        // Handle file not found error or any other error
        if (err.code === 'ENOENT') {
            return res.status(404).send("Unfortunately, this file doesn't exist.");
        }
        // Other errors (e.g., database issues)
        return renderError(err, res);
    }
};

upload.downloadSequenceFile = (req, res)=> {
    const id = req.params.id;

    SequenceFile.get(id)
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

upload.deleteSequenceFile = (req, res)=> {
    const id = req.params.id;

    SequenceFile.get(id)
        .then((sequenceFile)=> {
            file.delete()
                .then(()=> {
                    Flash.success(req, `${sequenceFile.originalName} deleted successfully`);
                    return res.redirect('back');
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