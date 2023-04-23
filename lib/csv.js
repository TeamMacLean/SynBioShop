const config = require('../config.json');
const fs = require('fs');
const { stringify } = require('csv-stringify');

const csv = {};

const calculateBoxNumber = (synbio_id) => {
    return Math.ceil(synbio_id / 81);
}

// Test the function with the given input numbers
// const testSynbioIds = [1, 81, 82, 132, 800];
// testSynbioIds.forEach(synbio_id => {
// console.log(`Box number for synbio_id ${synbio_id}:`, calculateBoxNumber(synbio_id));
// });
// Box number for synbio_id 1: 1
// Box number for synbio_id 81: 1
// Box number for synbio_id 82: 2
// Box number for synbio_id 132: 2
// Box number for synbio_id 800: 10

/**
 * Send csv about new order to config path mounted volume
 * @param order
 * @param user
*/
csv.newOrder = (order, user) => new Promise((good, bad)=> {
    
    const csvFilePath = config.csvDir + order.janCode + '.csv';
    const writableStream = fs.createWriteStream(csvFilePath);

    const columns = [
        'item',
        'concentration',
        'synbio_id',
        'Box no.'
    ];

    /**   ORDER 
    complete: false,
    costCode: 'tempo-rar-y',
    createdAt: 2023-02-10T17:22:37.770Z,
    id: '0b34b576-6789-4112-bcaa-24cfac520460',
    items: [
        model {
            cartID: '1677fa3e-3389-414d-b179-d3614abcead7',
            id: '6e358e02-eba0-4976-aa57-3c72d78d142c',
            largeScale: false,
            orderID: '0b34b576-6789-4112-bcaa-24cfac520460',
            quantity: 1,
            typeID: '1d3f4762-f7c9-4a25-a615-925918b2b86b',
            type: [model]
        }
    ],
    janCode: '2870',
    pricePerUnit: '5',
    totalCost: '5',
    totalQuantity: '1',
    username: 'deeks'
    */

    const rows = order.items.map(item => {
        return [
            item.type.name,
            item.type.concentration + ` ng/ul`, // µ does not display nicely in Microsoft Excel
            item.type.synBioID,
            // Box no.:
            calculateBoxNumber(item.type.synBioID),
            //config.baseURL + 'premade/item/' + item.typeID, // bit HACK-y
        ]
    });
    
    
    //const headerRow = [ 'Order', order.janCode, 'User', user.username ]
    const footerRow = [ 'Job Finished', '', order.janCode, ''];
    
    const formattedRows = [
        // item,concentration,synbio_id,url
        // Order,2887,User,benthama
        // pPGC-K (pOPIN-F6_RFP_K),528,0908,http://synbio.tsl.ac.uk/premade/item/68bacc3a-517b-4987-a661-8ffd45691fa8
        // Order,2887,Print Job,Finished
        //headerRow,
        ...rows,
        footerRow
    ];

    const stringifier = stringify({header: true, columns: columns});

    stringifier.pipe(writableStream);

    // Close the writable stream when it's finished
    stringifier.on('finish', () => {
        console.log('Finished writing csv data, closing connection');
        writableStream.end(); // Close the writable stream
        return good();
    });

    // If there's an error, close the writable stream
    stringifier.on('error', (err) => {
        console.error('Error writing data:', err);
        console.error('Closing connection');
        writableStream.end(); // Close the writable stream
        return bad(err);
    });

    // Start writing the formatted rows
    formattedRows.forEach(formattedRow => {
        stringifier.write(formattedRow);
    });

    // End the stringifier to trigger the 'finish' event
    stringifier.end();
});

module.exports = csv;