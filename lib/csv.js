const config = require("../config");
const fs = require("fs");
const path = require("path");
const { stringify } = require("csv-stringify");

const csv = {};

/**
 * Box number for a SynBio ID, or an empty cell when the ID is not numeric.
 *
 * synBioID is a schema-less string, so a non-numeric value used to render the
 * literal text "NaN" into the printer's box column.
 */
const calculateBoxNumber = (synbio_id) => {
  const numeric = Number(synbio_id);
  if (!Number.isFinite(numeric)) return "";
  return Math.ceil(numeric / 81);
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

    // path.join rather than concatenation: a csvDir without a trailing
    // separator previously wrote into the parent directory. janCode is
    // server-generated, but basename() keeps a malformed one from escaping.
    const csvFilePath = path.join(
      config.csvDir,
      `${path.basename(String(order.janCode))}.csv`,
    );
    const writableStream = fs.createWriteStream(csvFilePath);

    // csvDir is a mounted network volume. When it drops, fills up, or turns
    // read-only, this stream emits 'error'; with no listener that is an
    // unhandled 'error' event, which terminates the process mid-order.
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      console.error("Error writing order CSV:", err && err.message);
      writableStream.destroy();
      bad(err);
    };
    writableStream.on("error", fail);

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

    // Resolve on the writable stream's 'close', not the stringifier's
    // 'finish'. The stringifier finishes as soon as it has handed off its
    // rows, which is before the bytes are durable on disk — the promise used
    // to resolve while the file was still being written.
    writableStream.on("close", () => {
      if (settled) return;
      settled = true;
      console.log("Finished writing csv data, closing connection");
      good();
    });

    stringifier.on("error", fail);

    // Start writing the formatted rows
    formattedRows.forEach((formattedRow) => {
      stringifier.write(formattedRow);
    });

    // End the stringifier to trigger the 'finish' event
    stringifier.end();
  });

module.exports = csv;
