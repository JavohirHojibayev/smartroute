const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('db/database.sqlite');
db.all(`SELECT payload FROM fuel_entries WHERE event_time >= '2026-06-26T19:00:00.000Z' AND event_time <= '2026-07-03T18:59:59.000Z'`, (err, rows) => {
  let sum131 = 0; let sum132 = 0;
  rows.forEach(r => {
    const p = JSON.parse(r.payload);
    let vDut = p.issuedDut;
    if (vDut == null || vDut === '') vDut = null;
    else if (typeof vDut === 'string') vDut = parseFloat(vDut.replace(',', '.'));
    if (p.eventsType === 131) sum131 += (vDut || 0);
    else if (p.eventsType === 132) sum132 += (vDut || 0);
  });
  console.log('131 DUT:', sum131, '132 DUT:', sum132);
});
