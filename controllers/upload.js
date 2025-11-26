const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const File = require("../models/file");
const SequenceFile = require("../models/sequenceFile");
const Flash = require("../lib/flash");
const Log = require("../lib/log");
const renderError = require("../lib/renderError");
const config = require("../config.json");
const { r } = require("../lib/thinky");

const uploadController = {};

// --- Helper Functions ---

/**
 * Checks if a file exists at the given path.
 * @param {string} filePath - The path to the file.
 * @returns {Promise<boolean>} True if the file exists, false otherwise.
 */
async function fileExists(filePath) {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * A consistent way to handle errors in upload-related operations.
 * @param {Error} err - The error object.
 * @param {Object} res - The Express response object.
 * @param {string} [message] - An optional custom error message.
 */
const handleError = (
  err,
  res,
  message = "An error occurred during the upload process.",
) => {
  // Using string concatenation for Node v12 compatibility
  Log.error("Upload controller error: " + err.message, err);
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
async function processFileUpload(file, savePath, modelName, associatedID) {
  console.log("reached DEBG for file upload"); // Updated log
  if (!file) {
    throw new Error("No file provided for upload.");
  }

  const dir = path.dirname(savePath);
  await fsPromises.mkdir(dir, { recursive: true });

  // Multer stores the temp file path in file.path
  const sourcePath = file.path || file.filepath || file.tempFilePath;
  if (!sourcePath) {
    throw new Error("No source file path found.");
  }

  await fsPromises.rename(sourcePath, savePath);

  // Extract the final filename from savePath for the 'name' field
  const finalFileName = path.basename(savePath);

  const modelData = {
    path: savePath,
    name: finalFileName,
    originalName: file.originalname || file.name || finalFileName,
  };
  if (associatedID) {
    modelData.typeID = associatedID;
  }

  const Model = modelName === "SequenceFile" ? SequenceFile : File;
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
    files = files.filter((file) => !file.originalName.includes(".gb"));

    // Sort by createdAt descending (newest first)
    files.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    res.render("upload/index", { files });
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Handles the POST request for uploading a general file (e.g., from filemanager).
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.uploadFilePost = async (req, res) => {
  const files = req.files;
  // Check if files and files.file exist (replaces files?.file)
  const file = files && files.file;

  if (!file) {
    return renderError("No file received.", res);
  }

  // Use originalname for the destination (or filename if you want the temp name)
  const fileName = file.originalname || file.filename || file.name;
  if (!fileName) {
    return renderError("Invalid file - no filename found.", res);
  }

  const savePath = path.join(config.uploadRoot, fileName);

  try {
    await processFileUpload(file, savePath, "File");
    Flash.success(req, "Uploaded new file: " + file.originalname);
    res.redirect("/filemanager");
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Handles the POST request for uploading a sequence file specific to an item.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.uploadSequenceFile = async (req, res) => {
  const { itemID } = req.params;
  // Check if req.files exists and then req.files.file (replaces req.files?.file)
  const seqFile = req.files && req.files.file;

  if (!seqFile) {
    Flash.error(req, "No sequence file uploaded.");
    return res.redirect("/premade/item/" + itemID); // Redirect back to the item
  }

  // Get filename - express-fileupload uses 'name', multer uses 'filename' or 'originalname'
  const fileName = seqFile.name || seqFile.filename || seqFile.originalname;
  if (!fileName) {
    Flash.error(req, "Invalid file upload - no filename found.");
    return res.redirect("/premade/item/" + itemID);
  }

  const newPath = path.join(config.uploadRoot, fileName);

  try {
    await fsPromises.mkdir(config.uploadRoot, { recursive: true });

    // express-fileupload provides a mv() method for moving files
    if (typeof seqFile.mv === "function") {
      await seqFile.mv(newPath);
    } else if (seqFile.path || seqFile.filepath || seqFile.tempFilePath) {
      // Fallback for multer/formidable style uploads
      const sourcePath =
        seqFile.path || seqFile.filepath || seqFile.tempFilePath;
      await fsPromises.rename(sourcePath, newPath);
    } else {
      throw new Error("Cannot move file - no source path or mv method");
    }

    // Save metadata to database
    await new SequenceFile({
      path: newPath,
      name: fileName,
      originalName: seqFile.originalname || fileName,
      typeID: itemID,
    }).save();

    Flash.success(
      req,
      `Sequence file "${seqFile.originalname || fileName}" uploaded.`,
    );
    res.redirect("/premade/item/" + itemID); // Redirect back to the item
  } catch (err) {
    handleError(err, res, "Failed to upload sequence file.");
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
      throw new Error("File metadata not found in DB.");
    }

    const exists = await fileExists(file.path);
    if (exists) {
      return res.download(file.path, file.originalName);
    } else {
      throw new Error();
    }
  } catch (err) {
    handleError(err, res, `File ${id} not found`);
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
      throw new Error("Sequence file metadata not found in DB.");
    }
    return res.download(sequenceFile.path, sequenceFile.originalName);
  } catch (err) {
    handleError(err, res);
  }
};

/**
 * Deletes a general file from the server and the database (from the File model).
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.deleteFile = async (req, res) => {
  const fileIdToDelete = req.body.fileId || req.params.id || req.query.id;

  if (!fileIdToDelete) {
    Flash.error(req, "Error: No file ID provided for deletion.");
    return res.redirect("back");
  }

  try {
    const file = await File.get(fileIdToDelete); // Use the general File model
    if (!file) {
      Flash.error(req, "File not found or already deleted.");
      return res.redirect("back");
    }

    // Optionally, delete the actual file from disk:
    // await fsPromises.unlink(file.path);

    await file.delete(); // Delete from File model
    Flash.success(req, `${file.originalName} deleted successfully.`);
    res.redirect("back");
  } catch (err) {
    handleError(err, res, `Failed to delete file: ${err.message}`);
  }
};

/**
 * Deletes a sequence file from the server and the database (from the SequenceFile model).
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.deleteSequenceFile = async (req, res) => {
  // The ID can come from req.body.sequenceFileID or req.params.id or req.query.id
  // This is from a form submission, so req.body.sequenceFileID is most likely.
  const fileIdToDelete =
    req.body.sequenceFileID || req.params.id || req.query.id;

  if (!fileIdToDelete) {
    console.error(
      "ERROR: No valid file ID could be extracted for deletion. Preventing DB query.",
    );
    Flash.error(req, "Error: No sequence file ID provided for deletion.");
    return res.redirect("back");
  }

  try {
    console.log(`Attempting to get SequenceFile with ID: ${fileIdToDelete}`);
    const sequenceFile = await SequenceFile.get(fileIdToDelete);

    if (!sequenceFile) {
      console.warn(
        `WARNING: Sequence file with ID ${fileIdToDelete} not found in DB.`,
      );
      Flash.error(req, "Sequence file not found or already deleted.");
      return res.redirect("back");
    }

    console.log(
      `Found sequence file: ${sequenceFile.originalName}, proceeding with deletion.`,
    );
    // Optionally, delete the actual file from disk:
    // await fsPromises.unlink(sequenceFile.path);

    await sequenceFile.delete();
    console.log(
      `Successfully deleted sequence file ${sequenceFile.originalName} (ID: ${fileIdToDelete}).`,
    );
    Flash.success(req, `${sequenceFile.originalName} deleted successfully.`);
    return res.redirect("back");
  } catch (err) {
    // Specific logging for deletion failure.
    console.error("FATAL ERROR in deleteSequenceFile handler:", err);
    handleError(err, res, `Failed to delete sequence file: ${err.message}`); // Use general handler for consistency
  }
};

/**
 * Handles the upload of user profile images (e.g., for editor/WYSIWYG integration).
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
uploadController.uploadImagePost = async (req, res) => {
  Log.info("Received file upload for user image.");
  const files = req.files;
  const userFile = files && files.userfile; // Replaced optional chaining

  if (!userFile) {
    Log.warn("No userfile found in image upload request.");
    return res.status(400).json({ error: "No file uploaded." });
  }

  const newPath = path.join(config.uploadRoot, userFile.name);

  try {
    await fsPromises.mkdir(path.dirname(newPath), { recursive: true });
    await fsPromises.rename(userFile.path, newPath);

    const savedFile = await new File({
      path: newPath,
      name: userFile.name,
      originalName: userFile.originalname,
    }).save();

    // Path.join replaced backticks for Node v12 compatibility.
    res.json({ location: path.join(config.uploadRootURL, userFile.name) });
  } catch (err) {
    handleError(err, res, "Failed to upload user image.");
    res.status(500).json({ error: "File upload failed." });
  }
};

module.exports = uploadController;
