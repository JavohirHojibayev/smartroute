const fs = require('fs');
let code = fs.readFileSync('test-azs-direct.js', 'utf8');
code = code.replace(/const url = .*;/g, 'const url = "https://api.azs-online.uz/api/events/deviceRefillEvents?dateStart=1783364400&dateEnd=1783450799&page=0&countOnPage=100";');
fs.writeFileSync('test-azs-tashkent.js', code);
