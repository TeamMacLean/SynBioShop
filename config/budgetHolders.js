/**
 * Budget Holders Configuration
 *
 * This module now reads budget holders from the database instead of
 * using hardcoded values. The database allows administrators to manage
 * budget holders through the /budget admin interface.
 *
 * Legacy hardcoded data has been moved to the database via seedBudgetHolders.js
 */

const BudgetHolder = require("../models/budgetHolder");

/**
 * Get all budget holders as an array of {value, label} objects
 * suitable for rendering in select dropdowns
 *
 * @returns {Promise<Array<{value: string, label: string}>>}
 */
async function getBudgetHoldersForSelect() {
  try {
    const holders = await BudgetHolder.orderBy({ index: "username" }).run();

    // Sort by description (display name) for better UX
    return holders
      .map((holder) => ({
        value: holder.username,
        label: holder.description,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (err) {
    console.error("Error fetching budget holders for select:", err);
    return [];
  }
}

/**
 * Get the display name for a specific budget holder
 *
 * @param {string} username - The budget holder's username
 * @returns {Promise<string|null>} The display name or null if not found
 */
async function getBudgetHolderName(username) {
  try {
    const holders = await BudgetHolder.filter({ username }).run();
    return holders.length > 0 ? holders[0].description : null;
  } catch (err) {
    console.error(`Error fetching budget holder name for ${username}:`, err);
    return null;
  }
}

/**
 * Check if a username is a valid budget holder
 *
 * @param {string} username - The username to check
 * @returns {Promise<boolean>}
 */
async function isValidBudgetHolder(username) {
  try {
    const holders = await BudgetHolder.filter({ username }).run();
    return holders.length > 0;
  } catch (err) {
    console.error(`Error validating budget holder ${username}:`, err);
    return false;
  }
}

/**
 * Get all budget holders
 *
 * @returns {Promise<Array<Object>>} Array of budget holder objects
 */
async function getAllBudgetHolders() {
  try {
    return await BudgetHolder.orderBy({ index: "username" }).run();
  } catch (err) {
    console.error("Error fetching all budget holders:", err);
    return [];
  }
}

/**
 * Legacy: BUDGET_HOLDERS object for backward compatibility
 *
 * This object contains the original hardcoded budget holders.
 * It is maintained here for reference and for the seed script.
 * New code should use the database-backed functions above.
 */
const BUDGET_HOLDERS = {
  adriaens:
    "ADRIAENSSENS Evelien Adriaenssens [Food, Microbiome and Health (QIB)]",
  ahnjarj: "AHN-JARVIS Jennifer Ahn-Jarvis [Food, Microbiome and Health (QIB)]",
  yel23dof: "ALDRIDGE Alan Aldridge [Facilities (NBIP)]",
  angiolie: "ANGIOLINI Emily Angiolini [Advanced Training (EI)]",
  aroras: "ARORA Sanu Arora [Biochemistry and Metabolism (JIC)]",
  dbaker: "BAKER David Baker [Science Operations (QIB)]",
  bakht: "BAKHT Saleha Bakht [Crop Genetics (JIC)]",
  balkj: "BALK Janneke Balk [Biochemistry and Metabolism (JIC)]",
  banfielm: "BANFIELD Mark Banfield [Biochemistry and Metabolism (JIC)]",
  bealesj: "BEALES Jessica Beales [Finance & Accounts (NBIP)]",
  bella: "BELL Andrew Bell [Science Operations (QIB)]",
  timmonss: "BENNION Sarah Bennion [Finance & Accounts (NBIP)]",
  berazan: "BERAZA Naiara Beraza [Food, Microbiome and Health (QIB)]",
  bestj: "BEST Julia Best [Directorate (QIB)]",
  bexson: "BEXSON Grant Bexson [Operations (EI)]",
  bibb: "BIBB Mervyn Bibb [Molecular Microbiology (JIC)]",
  symonl: "BOLTON Lisa Bolton [Finance & Accounts (NBIP)]",
  bornemas: "BORNEMANN Stephen Bornemann [Sainsbury Laboratory (TSL)]",
  borrillp: "BORRILL Philippa Borrill [Crop Genetics (JIC)]",
  gjones: "BOWKER Greg Bowker [Communications (EI)]",
  brailsfo: "BRAILSFORD Alan Brailsford [QIB Extra (QIBX)]",
  briona: "BRION Arlaine Brion [Core Science Resources (QIB)]",
  browng: "BROWN Graeme Brown [Directorate (QIB)]",
  jbrown: "BROWN James Brown [Crop Genetics (JIC)]",
  byers: "BYERS Kelsey Byers [Cell & Developmental Biology (JIC)]",
  cardings: "CARDING Simon Carding [Food, Microbiome and Health (QIB)]",
  carellap: "CARELLA Phil Carella [Cell & Developmental Biology (JIC)]",
  clissold: "CATCHPOLE Leah Catchpole [Genomics Pipelines (EI)]",
  chalmerl: "CHALMERS Lee Chalmers [Finance & Accounts (NBIP)]",
  charlesi: "CHARLES Ian Charles [Directorate (QIB)]",
  charpenm:
    "CHARPENTIER Myriam Charpentier [Cell & Developmental Biology (JIC)]",
  chayutn: "CHAYUT Noam Chayut [Crop Genetics (JIC)]",
  jclarke: "CLARKE Jonathan Clarke [Business Development (JIC)]",
  coenen: "COEN Enrico COEN [Cell & Developmental Biology (JIC)]",
  cosseys: "COSSEY Sarah Cossey [Directors Office (EI)]",
  creissen: "CREISSEN Gary Creissen [Laboratory Support (JIC)]",
  cdarby: "DARBY Chris Darby [Crop Genetics (JIC)]",
  deolivl:
    "DE OLIVEIRA MARTINS Leonardo de Oliveira Martins [Science Operations (QIB)]",
  devegaj: "DE VEGA Jose De Vega [Research Faculty (EI)]",
  deanc: "DEAN Caroline Dean [Cell & Developmental Biology (JIC)]",
  devine: "DEVINE Rebecca Devine [Molecular Microbiology (JIC)]",
  yding: "DING Yiliang Ding [Cell & Developmental Biology (JIC)]",
  dixonr: "DIXON Ray Dixon [Molecular Microbiology (JIC)]",
  dodd: "DODD Antony Dodd [Cell & Developmental Biology (JIC)]",
  domoney: "DOMONEY Claire Domoney [Biochemistry and Metabolism (JIC)]",
  cip23wis: "DORAI-RAJ Siobhan Dorai-Raj [Operations (EI)]",
  downie: "DOWNIE Allan Downie [Molecular Microbiology (JIC)]",
  dunford: "DUNFORD Roy Dunford [Laboratory Support (JIC)]",
  eastman: "EASTMAN Michelle Eastman [Graduate School Office (GSO)]",
  edwardsc: "EDWARDS Cathrina Edwards [Food, Microbiome and Health (QIB)]",
  ellispa: "ELLIS Paul Ellis [Finance & Accounts (NBIP)]",
  elumogo: "ELUMOGO Ngozi Elumogo [Food, Microbiome and Health (QIB)]",
  faulknec: "FAULKNER Christine Faulkner [Cell & Developmental Biology (JIC)]",
  feather: "FEATHER Debbie Feather [Sainsbury Laboratory (TSL)]",
  wifey: "FINDLAY Kim Findlay [Cell & Developmental Biology (JIC)]",
  finglas: "FINGLAS Paul Finglas [Food and Nutrition – NBRI (QIB)]",
  dforeman: "FOREMAN Dave Foreman [Directors Office (JIC)]",
  birdc: "FOSKER Christine Fosker [Research Faculty Office (EI)]",
  fosters: "FOSTER Simon Foster [Sainsbury Laboratory (TSL)]",
  funnells: "FUNNELL Simon Funnell [Food, Microbiome and Health (QIB)]",
  garrido: "GARRIDO-OTER Ruben Garrido-Oter [Research Faculty (EI)]",
  gharbik: "GHARBI Karim Gharbi [Genomics Pipelines (EI)]",
  ghilarov: "GHILAROV Dmitry Ghilarov [Molecular Microbiology (JIC)]",
  gilmour: "GILMOUR Matthew Gilmour [Microbes and Food Safety (QIB)]",
  goramr: "GORAM Richard Goram [Crop Genetics (JIC)]",
  sharpe: "GORDON-SHARPE Eva Gordon-Sharpe [Directors Office (JIC)]",
  gottsk: "GOTTS Kathryn Gotts [Core Science Resources (QIB)]",
  fos24jas: "GRAHAM Anne Graham [Directors Office (JIC)]",
  grandell: "GRANDELLIS Carolina Grandellis [Research Faculty (EI)]",
  griff: "GRIFFITHS Simon Griffiths [Crop Genetics (JIC)]",
  reg23vok: "GUIZIOU Sarah Guiziou [Research Faculty (EI)]",
  guys: "GUY Steven Guy [Facilities (NBIP)]",
  haertyw: "HAERTY Wilfried Haerty [Research Faculty (EI)]",
  halla: "HALL Anthony Hall [Research Faculty (EI)]",
  hallli: "HALL Lindsay Hall [Food, Microbiome and Health (QIB)]",
  halln: "HALL Neil Hall [Directors Office (EI)]",
  hartp: "HART Patricia Hart [Directorate (QIB)]",
  harwood: "HARWOOD Wendy Harwood [Crop Genetics (JIC)]",
  melchina: "HAYHOE Antonietta Hayhoe [Science Operations (QIB)]",
  haytas: "HAYTA Sadiye Hayta [Crop Genetics (JIC)]",
  hazardb: "HAZARD Brittany Hazard [Food, Microbiome and Health (QIB)]",
  hildebra: "HILDEBRAND Falk Hildebrand [Food, Microbiome and Health (QIB)]",
  hilll: "HILL Lionel Hill [Biochemistry and Metabolism (JIC)]",
  hindmars: "HINDMARSH Steve Hindmarsh [Research Computing (NBIP)]",
  hinkova: "HINKOVA Andrea Hinkova [Science Operations (QIB)]",
  hogenhos: "HOGENHOUT Saskia Hogenhout [Crop Genetics (JIC)]",
  hopwood: "HOPWOOD David Hopwood [Molecular Microbiology (JIC)]",
  horlerr: "HORLER Richard Horler [Research Computing (NBIP)]",
  howardm: "HOWARD Martin Howard [Computational and Systems Biology (JIC)]",
  sparrow: "HUNDLEBY Penny Hundleby [Directors Office (JIC)]",
  hutchinm: "HUTCHINGS Matt Hutchings [Molecular Microbiology (JIC)]",
  yar24wap: "JABBUR Luisa Jabbur [Cell & Developmental Biology (JIC)]",
  jachec: "JACHEC Chris Jachec [Finance & Accounts (NBIP)]",
  janeckon: "JANECKO Nicol Janecko [Microbes and Food Safety (QIB)]",
  blakesle: "JONES Emily Jones [Food, Microbiome and Health (QIB)]",
  jonesj: "JONES Jonathan Jones [Sainsbury Laboratory (JJ) (TSL)]",
  jugen: "JUGE Nathalie Juge [Food, Microbiome and Health (QIB)]",
  juodeiki: "JUODEIKIS Rokas Juodeikis [Science Operations (QIB)]",
  kamouns: "KAMOUN Sophien Kamoun [Sainsbury Laboratory (SK) (TSL)]",
  katsikia: "KATSIKIDES Andrew Katsikides [Finance & Accounts (NBIP)]",
  kingsler: "KINGSLEY Rob Kingsley [Microbes and Food Safety (QIB)]",
  kroon: "KROON Paul Kroon [Food, Microbiome and Health (QIB)]",
  lamprindi: "LAMPRINAKI Dimitra Lamprinaki [Science Operations (QIB)]",
  langridg: "LANGRIDGE Gemma Langridge [Microbes and Food Safety (QIB)]",
  lawrenso: "LAWRENSON Tom Lawrenson [Crop Genetics (JIC)]",
  lawsond: "LAWSON David Lawson [Biochemistry and Metabolism (JIC)]",
  lazenby: "LAZENBY James Lazenby [Microbes and Food Safety (QIB)]",
  letu: "LE Tung Le [Molecular Microbiology (JIC)]",
  leggettr: "LEGGETT Richard Leggett [Research Faculty (EI)]",
  lomonoss:
    "LOMONOSSOFF George Lomonossoff [Biochemistry and Metabolism (JIC)]",
  lordj: "LORD John Lord [Horticultural Services (JIC)]",
  maw: "MA Wenbo Ma [Sainsbury Laboratory (WM) (TSL)]",
  macaulai: "MACAULAY Iain Macaulay [Research Faculty (EI)]",
  macleand: "MACLEAN Dan MacLean [Sainsbury Laboratory (TSL)]",
  malonej: "MALONE Jacob Malone [Molecular Microbiology (JIC)]",
  maqbool: "MAQBOOL Abbas Maqbool [Biochemistry and Metabolism (JIC)]",
  marchiol: "MARCHIORETTO Lisa Marchioretto [Microbes and Food Safety (QIB)]",
  martin: "MARTIN Cathie Martin [Biochemistry and Metabolism (JIC)]",
  mathera: "MATHER Alison Mather [Microbes and Food Safety (QIB)]",
  maxwellt: "MAXWELL Tony Maxwell [Molecular Microbiology (JIC)]",
  mcmullam: "MCMULLAN Mark McMullan [Research Faculty (EI)]",
  mctaggar: "MCTAGGART Seanna McTaggart [Research Faculty Office (EI)]",
  meadows: "MEADOWS Lizzie Meadows [Directorate (QIB)]",
  menkef: "MENKE Frank Menke [Sainsbury Laboratory (TSL)]",
  amiller: "MILLER Tony Miller [Biochemistry and Metabolism (JIC)]",
  mooreg: "MOORE Graham Moore [Directors Office (JIC)]",
  morganch: "MORGAN Chris Morgan [Cell & Developmental Biology (JIC)]",
  morrisr: "MORRIS Richard Morris [Computational and Systems Biology (JIC)]",
  morrison: "MORRISON Ben Morrison [Research Grants and Contracts (NBIP)]",
  moscoum: "MOSCOU Matthew Moscou [Sainsbury Laboratory (TSL)]",
  moubayil: "MOUBAYIDIN Laila Moubayidin [Cell & Developmental Biology (JIC)]",
  narbad: "NARBAD Arjan Narbad [Food, Microbiome and Health (QIB)]",
  neequaye: "NEEQUAYE Mikhaela Neequaye [Cell & Developmental Biology (JIC)]",
  nicholsn: "NICHOLSON Paul Nicholson [Crop Genetics (JIC)]",
  nieduszc: "NIEDUSZYNSKI Conrad Nieduszynski [Research Faculty (EI)]",
  jep23kod: "NOBORI Tatsuya Nobori [Sainsbury Laboratory (TN) (TSL)]",
  nolan: "NOLAN Laura Nolan [Microbes and Food Safety (QIB)]",
  palop: "NUENO PALOP Carmen Nueno Palop [QIB Extra (QIBX)]",
  ohallera: "O'HALLERON Anne O'Halleron [Human Resources (NBIP)]",
  osbourna: "OSBOURN Anne Osbourn [Biochemistry and Metabolism (JIC)]",
  pallenm: "PALLEN Mark Pallen [Microbes and Food Safety (QIB)]",
  taz23zir: "PAPATHEODOROU Irene Papatheodorou [Research Faculty (EI)]",
  patronn: "PATRON Nicola Patron [Research Faculty (EI)]",
  paynes: "PAYNE Sally Payne [Purchasing (NBIP)]",
  penfiels: "PENFIELD Steve Penfield [Crop Genetics (JIC)]",
  perryf: "PERRY Felicity Perry [Communications & Engagement (JIC)]",
  philom: "PHILO Mark Philo [Core Science Resources (QIB)]",
  playford: "PLAYFORD Darryl Playford [Crop Genetics (JIC)]",
  quince: "QUINCE Christopher Quince [Research Faculty (EI)]",
  ridout: "RIDOUT Chris Ridout [Crop Genetics (JIC)]",
  robinsop: "ROBINSON Phil Robinson [Cell & Developmental Biology (JIC)]",
  robinsst: "ROBINSON Stephen Robinson [Food, Microbiome and Health (QIB)]",
  sablow: "SABLOWSKI Robert Sablowski [Cell & Developmental Biology (JIC)]",
  saha: "SAHA Shikha Saha [Food, Microbiome and Health (QIB)]",
  saunderd: "SAUNDERS Diane Saunders [Crop Genetics (JIC)]",
  sayavedl: "SAYAVEDRA Lizbeth Sayavedra [Food, Microbiome and Health (QIB)]",
  schlimps: "SCHLIMPERT Susan Schlimpert [Molecular Microbiology (JIC)]",
  jaf24yik: "SELF Andy Self [Human Resources (NBIP)]",
  serazetd:
    "SERAZETDINOVA Liliya Serazetdinova [Business Development and Impact (EI)]",
  seungd: "SEUNG David Seung [Biochemistry and Metabolism (JIC)]",
  fshaw: "SHAW Felix Shaw [Research Faculty (EI)]",
  singh: "SINGH Dipali Singh [Science Operations (QIB)]",
  smitha: "SMITH Alison Smith [Biochemistry and Metabolism (JIC)]",
  smithe: "SMITH Emily Smith [Food, Microbiome and Health (QIB)]",
  smithh: "SMITH Phil Smith [Teacher Scientist Network (TSN)]",
  rismith: "SMITH Richard Smith [Computational and Systems Biology (JIC)]",
  soranzon: "SORANZO Nicola Soranzo [Research Faculty (EI)]",
  soriaca: "SORIA-CARRASCO Victor Soria-Carrasco [Crop Genetics (JIC)]",
  southwol: "SOUTHWOOD Louise Southwood [Finance & Accounts (NBIP)]",
  steuernb:
    "STEUERNAGEL Burkhard Steuernagel [Computational and Systems Biology (JIC)]",
  cwilliam: "STEVENSON Clare Stevenson [Directors Office (JIC)]",
  stringer: "STRINGER Sandra Stringer [Science Operations (QIB)]",
  stronaca: "STRONACH Andrew Stronach [Communications (QIB)]",
  suligojt: "SULIGOJ Tanja Suligoj [Food, Microbiome and Health (QIB)]",
  swarbred: "SWARBRECK David Swarbreck [Research Faculty (EI)]",
  talbotn: "TALBOT Nick Talbot [Sainsbury Laboratory (NT) (TSL)]",
  telatina: "TELATIN Andrea Telatin [Food, Microbiome and Health (QIB)]",
  tomlinsl:
    "TOMLINSON Laurence Tomlinson [Health, Safety, Environment and Quality Assurance (NBIP)]",
  traka: "TRAKA Maria Traka [Food and Nutrition – NBRI (QIB)]",
  trumana: "TRUMAN Andrew Truman [Molecular Microbiology (JIC)]",
  uauyc: "UAUY Cristobal Uauy [Crop Genetics (JIC)]",
  wainj: "WAIN John Wain [Microbes and Food Safety (QIB)]",
  warrenf: "WARREN Fred Warren [Food, Microbiome and Health (QIB)]",
  warrenm: "WARREN Martin Warren [Food, Microbiome and Health (QIB)]",
  watkinsc: "WATKINS Chris Watkins [Genomics Pipelines (EI)]",
  webberm: "WEBBER Mark Webber [Microbes and Food Safety (QIB)]",
  websterm: "WEBSTER Michael Webster [Biochemistry and Metabolism (JIC)]",
  wellsr: "WELLS Rachel Wells [Crop Genetics (JIC)]",
  dudleyk: "WEST Kate West [Library (NBIP)]",
  whitchur: "WHITCHURCH Cynthia Whitchurch [Microbes and Food Safety (QIB)]",
  wilde: "WILDE Pete Wilde [Food, Microbiome and Health (QIB)]",
  wilemant: "WILEMAN Tom Wileman [Food, Microbiome and Health (QIB)]",
  wilkinsb: "WILKINSON Barrie Wilkinson [Molecular Microbiology (JIC)]",
  witekk: "WITEK Kamil Witek [Sainsbury Laboratory (2Blades) (TSL)]",
  wojtowic: "WOJTOWICZ Edyta Wojtowicz [Research Faculty (EI)]",
  jon23ran: "WOODHOUSE Shannon Woodhouse [Communications & Engagement (JIC)]",
  woodsh: "WOODS Hannah Woods [Facilities (NBIP)]",
  wortleyg: "WORTLEY Gary Wortley [Laboratory Support (JIC)]",
  zanchir: "ZANCHI Roberto Zanchi [Business Development (QIB)]",
  zipfelc: "ZIPFEL Cyril Zipfel [Sainsbury Laboratory (CZ) (TSL)]",
};

module.exports = {
  BUDGET_HOLDERS, // Legacy - kept for seed script
  getBudgetHoldersForSelect,
  getBudgetHolderName,
  isValidBudgetHolder,
  getAllBudgetHolders,
};
