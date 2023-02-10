const config = require('../config.json');
const path = require('path');
const Order = require('../models/order');
const fs = require('fs');
const { stringify } = require('csv-stringify');

const csv = {};

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
        'url'
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
            item.type.concentration,
            item.type.synBioID,
            config.baseURL + 'premade/item/' + item.typeID, // bit HACK-y
        ]
    });

    const formattedRows = [
        [ 'Order', order.janCode, 'User', user.username ],
        ...rows,
        [ 'Order', order.janCode, 'Print Job', 'Finished']
    ];

    const stringifier = stringify({header: true, columns: columns});

    formattedRows.forEach(formattedRow => {
        stringifier.write(formattedRow);
    });

    stringifier.pipe(writableStream);
    console.log('Finished writing data')
    return good();
});

module.exports = csv;