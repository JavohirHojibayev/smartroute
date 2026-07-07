const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('db/database.sqlite');
db.all(`SELECT payload FROM fuel_entries WHERE event_time >= '2026-07-02T19:00:00.000Z'`, (err, rows) => {
  let sumD = 0; let sumV = 0; let sumDiff = 0;
  rows.forEach(r => {
    const p = JSON.parse(r.payload);
    let vDut = p.issuedDut;
    if (vDut == null || vDut === '') vDut = null;
    else if (typeof vDut === 'string') vDut = parseFloat(vDut.replace(',', '.'));
    
    sumD += (vDut || 0);
    sumV += (p.value || p.issuedValue || 0);
    sumDiff += (p.differenceRefuel || 0);
  });
  console.log('DUT sum:', sumD, 'Value sum:', sumV, 'Diff sum:', sumDiff);
});
