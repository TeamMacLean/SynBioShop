const config = require("../config");
const fs = require("fs");
const { stringify } = require("csv-stringify");

const csv = {};

const calculateBoxNumber = (synbio_id) => {
  return Math.ceil(synbio_id / 81);
};

/**
 * Send csv about new order to config path mounted volume
 * @param order
 * @param user
 */
csv.newOrder = (order, user) =>
  new Promise((good, bad) => {
    if (!fs.existsSync(config.csvDir)) {
      try {
        fs.mkdirSync(config.csvDir, { recursive: true });
      } catch (err) {
        return bad("csvDir not initiated, no csv made"); // Exit function without throwing error
      }
    }

    const csvFilePath = config.csvDir + order.janCode + ".csv";
    const writableStream = fs.createWriteStream(csvFilePath);

    const columns = [
      "item",
      "concentration",
      "synbio_id",
      "Box no.",
      "Printer",
      "Template",
    ];
    const rows = order.items.map((item) => {
      return [
        item.type.name,
        item.type.concentration + " ng/ul",
        item.type.synBioID,
        calculateBoxNumber(item.type.synBioID),
        "Brady BBP12",
        "C:\\Users\\tslbrady1\\Desktop\\Data Automation Templates\\AUTO Synbio Order Tube Label",
      ];
    });

    const footerRow = [
      "Job Finished",
      "",
      order.janCode,
      "",
      "Brady BBP12",
      "C:\\Users\\tslbrady1\\Desktop\\Data Automation Templates\\AUTO Order Number Template",
    ];

    const formattedRows = [...rows, footerRow];

    const stringifier = stringify({ header: true, columns: columns });

    stringifier.pipe(writableStream);

    // Close the writable stream when it's finished
    stringifier.on("finish", () => {
      console.log("Finished writing csv data, closing connection");
      writableStream.end(); // Close the writable stream
      return good();
    });

    // If there's an error, close the writable stream
    stringifier.on("error", (err) => {
      console.error("Error writing data:", err);
      console.error("Closing connection");
      writableStream.end(); // Close the writable stream
      return bad(err);
    });

    // Start writing the formatted rows
    formattedRows.forEach((formattedRow) => {
      stringifier.write(formattedRow);
    });

    // End the stringifier to trigger the 'finish' event
    stringifier.end();
  });

module.exports = csv;
