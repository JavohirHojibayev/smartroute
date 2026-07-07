const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db/database.sqlite');
const ops = JSON.parse(fs.readFileSync('azs_ops_2.json', 'utf8'));

const ids = ops.items.map(i => i.id);
const ph = ids.map(() => '?').join(',');

db.all(`SELECT external_id, payload FROM fuel_entries WHERE external_id IN (${ph})`, ids, (err, rows) => {
  const found = new Set(rows.map(r => r.external_id));
  const missing = ops.items.filter(i => !found.has(i.id));
  
  console.log('Missing IDs:', missing.map(i => i.id));
  console.log('Missing sum issuedValue:', missing.reduce((s,i) => s + (i.issuedValue||0), 0));
  
  let sumFoundVal = 0;
  rows.forEach(r => {
     let p = JSON.parse(r.payload);
     let val = p.value || 0;
     sumFoundVal += val;
  });
  console.log('Found Rows:', rows.length);
  console.log('Found sumVal (p.value):', sumFoundVal);
});
