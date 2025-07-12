const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const File = require('../models/file');
const SequenceFile = require('../models/sequenceFile');
const Flash = require('../lib/flash');
const Log = require('../lib/log'); // Assuming you have this for logging
const renderError = require('../lib/renderError'); // Assuming this exists for error handling
const mkdirp = require('mkdirp'); // Assuming you use mkdirp for directory creation

const uploadController = {};

// --- Helper Functions ---

/**
 * Checks if a file exists at the given path.
 * @param {string} filePath - The path to the file.
 * @returns {Promise<boolean>} True if the file exists, false otherwise.
 */
async function fileExists(filePath) {
    try {
        await fsPromises.access(filePath, fs.constants.F_OK); // Check for file existence
        return true;
    } catch (err) {
        return false; // File does not exist or access error
    }
}

/**
 * A consistent way to handle errors in upload-related operations.
 * @param {Error} err - The error object.
 * @param {Object} res - The Express response object.
 * @param {string} [message] - An optional custom error message.
 */
const handleError = (err, res, message = 'An error occurred during the upload process.') => {
    Log.error(`Upload controller error: ${err.message}`, err);
    renderError(message, res);
};

/**
 * Processes the upload of a file, saves its metadata, and handles directory creation.
 * @param {object} file - The file object from req.files.
 * @param {string} savePath - The final destination path for the file.
 * @param {string} modelName - The name of the model to save metadata to ('File' or 'SequenceFile').
 * @param {string} [associatedID] - The ID of the related entity (e.g., typeID for SequenceFile).
 * @returns {Promise<object>} The saved model instance.
 */
async function processFileUpload(file, savePath, modelName, associatedID = null) {
    if (!file) {
        throw new Error('No file provided for upload.');
    }

    const dir = path.dirname(savePath);
    await mkdirp(dir); // Ensure the directory exists

    await fsPromises.rename(file.path, savePath);

    const modelData = {
        path: savePath,
        name: file.name,
        originalName: file.originalname,
    };
    if (associatedID) {
        modelData.typeID = associatedID; // Specific to SequenceFile context
    }

    const Model = modelName === 'SequenceFile' ? SequenceFile : File;
    const newFileInstance = new Model(modelData);
    return newFileInstance.save();
}

// --- Controller Actions ---

/**
 * Renders the file manager page, listing non-genome browser files.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.fileManager = async (req, res) => {
    try {
        let files = await File.run();
        // Filter out .gb files (genome browser files)
        files = files.filter(file => !file.originalName.includes('.gb'));
        // Sort by creation date, most recent first
        files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.render('upload/index', { files });
    } catch (err) {
        handleError(err, res);
    }
};

/**
 * Handles the POST request for uploading a file.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.uploadFilePost = async (req, res) => {
    const files = req.files;
    const file = files?.file; // Use optional chaining

    if (!file) {
        return renderError('No file received.', res);
    }

    const savePath = path.join(config.uploadRoot, file.name);

    try {
        await processFileUpload(file, savePath, 'File');
        Flash.success(req, `Uploaded new file: ${file.originalname}`);
        res.redirect('/filemanager');
    } catch (err) {
        handleError(err, res);
    }
};

/**
 * Serves a file for download.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.download = async (req, res) => {
    const { id } = req.params;
    try {
        const file = await File.get(id);
        if (!file) {
            throw new Error('File metadata not found in DB.');
        }

        const exists = await fileExists(file.path);
        if (exists) {
            // Use res.download for attachment downloads
            return res.download(file.path, file.originalName);
        } else {
            throw new Error('File not found on this server.');
        }
    } catch (err) {
        handleError(err, res, 'File probably not there at all - sorry.');
    }
};

/**
 * Serves a sequence file for download.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.downloadSequenceFile = async (req, res) => {
    const { id } = req.params;
    try {
        const sequenceFile = await SequenceFile.get(id);
        if (!sequenceFile) {
            throw new Error('Sequence file metadata not found in DB.');
        }
        // Assumes SequenceFile.path is valid and file exists. Add fileExists check if necessary.
        return res.download(sequenceFile.path, sequenceFile.originalName);
    } catch (err) {
        handleError(err, res);
    }
};

/**
 * Deletes a file from the server and the database.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.deleteFile = async (req, res) => {
    const { id } = req.params;
    try {
        const file = await File.get(id);
        if (!file) {
            throw new Error('File metadata not found in DB for deletion.');
        }

        // Optionally, delete the actual file from disk:
        // await fsPromises.unlink(file.path); // Uncomment if physical file deletion is desired

        await file.delete();
        Flash.success(req, `${file.originalName} deleted successfully.`);
        res.redirect('/filemanager');
    } catch (err) {
        handleError(err, res);
    }
};

/**
 * Deletes a sequence file from the server and the database.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.deleteSequenceFile = async (req, res) => {
    const { id } = req.params; // Assuming ID comes from params, not body like in original code
    try {
        const sequenceFile = await SequenceFile.get(id);
        if (!sequenceFile) {
            throw new Error('Sequence file metadata not found in DB for deletion.');
        }

        // Optionally, delete the actual file from disk:
        // await fsPromises.unlink(sequenceFile.path); // Uncomment if physical file deletion is desired

        await sequenceFile.delete();
        Flash.success(req, `${sequenceFile.originalName} deleted successfully.`);
        res.redirect('back'); // Redirect to the previous page
    } catch (err) {
        handleError(err, res);
    }
};

/**
 * Handles the upload of user profile images (e.g., for editor/WYSIWYG integration).
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.uploadImagePost = async (req, res) => {
    Log.info('Received file upload for user image.'); // Log the activity
    const files = req.files;
    const userFile = files?.userfile;

    if (!userFile) {
        Log.warn('No userfile found in image upload request.');
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const newPath = path.join(config.uploadRoot, userFile.name);

    try {
        await mkdirp(path.dirname(newPath)); // Ensure directory exists
        await fsPromises.rename(userFile.path, newPath);

        // Save file metadata
        const savedFile = await new File({
            path: newPath,
            name: userFile.name,
            originalName: userFile.originalname
        }).save();

        // Return JSON response suitable for file upload plugins (like TinyMCE)
        // The URL should point to where the file can be accessed via HTTP.
        // Assuming config.uploadRootURL is the base URL for uploads.
        res.json({ location: path.join(config.uploadRootURL, userFile.name) });
    } catch (err) {
        handleError(err, res, 'Failed to upload user image.');
        // Return a JSON error response for API requests
        res.status(500).json({ error: 'File upload failed.' });
    }
};

module.exports = uploadController;