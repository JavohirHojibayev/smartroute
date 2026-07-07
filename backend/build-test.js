const fs = require('fs');
let code = fs.readFileSync('test-azs-direct.js', 'utf8');
code = code.replace(/const url = .*;/g, 'const url = "https://api.azs-online.uz/api/events/deviceRefillEvents?dateStart=1783371600&dateEnd=1783457999&page=0&countOnPage=100";');
fs.writeFileSync('test-azs-exact.js', code);
