const thinky = require("../lib/thinky");
const type = thinky.type;

const CartItem = thinky.createModel("CartItem", {
  id: type.string(),
  cartID: type.string().required(),
  typeID: type.string().required(),
  largeScale: type.boolean().default(false), //@DEPRECIATED - now optional
  orderID: type.string(),
  quantity: type.number().default(1),
});

CartItem.define("getType", function () {
  const Type = require("./type");
  return Type.getByID(this.typeID);
});

module.exports = CartItem;
const Cart = require("./cart");
CartItem.belongsTo(Cart, "cart", "id", "cartID");

CartItem.ensureIndex("type");
CartItem.ensureIndex("typeID");
