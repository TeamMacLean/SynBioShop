const fs = require('fs');
let content = fs.readFileSync('controllers/upload.js', 'utf8');
content = content.replace(/res\.redirect\("back"\)/g, 'res.redirect(req.get("Referrer") || "/")');
fs.writeFileSync('controllers/upload.js', content);
