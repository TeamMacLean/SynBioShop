// const CartItem = require('../models/cartItem');
//
// module.exports = function (io) {
//
//     io.on('toggle-quantity', function (data) {
//         CartItem.get(data.id)
//             .then((item)=> {
//                 item.largeScale = data.checked;
//                 item.save()
//                     .then(()=> {
//                         io.emit('item-updated');
//                     })
//                     .catch((err)=> {
//                         io.emit('item-updated-fail');
//                     })
//             })
//             .catch((err)=> {
//                 io.emit('item-updated-fail');
//             })
//     })
//
// };