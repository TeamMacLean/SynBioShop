const thinky = require("../../lib/thinky");
const type = thinky.type;
const Type3 = {};

Type3.fields = [
  { type: "text", name: "FiveOH", text: "5′ OH on 5′ Strand" },
  { type: "text", name: "ThreeOH", text: "3′ OH on 5′ Strand" },
  { type: "text", name: "levelOne", text: "Level 1 Position" },
  { type: "text", name: "selection", text: "Selection" },
  { type: "text", name: "source", text: "Source" },
];
Type3.typeName =
  "Vector Name, Comments, Module Description, 5′ OH on 5′ Strand, 3′ OH on 5′ Strand, Level 1 Position, Selection, Source";
Type3.type = 3;

Type3.model = thinky.createModel("Type3", {
  //FOR ALL
  id: type.string(),
  name: type.string().required(),
  comments: type.string().required().default(""),
  description: type.string().required(),
  dbID: type.string().required(),
  superSize: type.boolean().default(false),
  disabled: type.boolean().default(false),
  categoryID: type.string().required(),
  concentration: type.number().required().default(0),
  synBioID: type.string().required().default("unknown"),
  documentation: type.string().default(""),
  position: type.number().default(0),
  level: type.string(),
  includeOnRecentlyAdded: type.boolean().default(false),
  includeOnRecentlyAddedTimestamp: type.number().default(0),

  citations: type.array(),
  note: type.string(),

  //TYPE SPECIFIC
  FiveOH: type.string(),
  ThreeOH: type.string(),
  levelOne: type.string(),
  selection: type.string(),
  source: type.string(),
});

module.exports = Type3;

const File = require("../file");
Type3.model.hasMany(File, "mapFile", "id", "typeID");
const SequenceFile = require("../sequenceFile");
Type3.model.hasMany(SequenceFile, "sequenceFiles", "id", "typeID");
const Category = require("../category");
Type3.model.belongsTo(Category, "category", "categoryID", "id");
