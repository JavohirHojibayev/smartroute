const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db/database.sqlite');

const startIso = '2026-07-05T19:00:00.000Z'; // 2026-07-06 00:00 UTC+5
const endIso = '2026-07-06T18:59:59.999Z';   // 2026-07-06 23:59 UTC+5

db.all(`SELECT payload FROM fuel_entries WHERE event_time >= ? AND event_time <= ? AND json_extract(payload, '$.eventsType') IN (131,132)`, [startIso, endIso], (err, rows) => {
  let sumVal = 0;
  let sumDut = 0;
  let sumVir = 0;
  let sumLit = 0;
  let sumCounter = 0; // opsMode = counter
  let sumDiff = 0;
  
  let hours = {};
  
  rows.forEach(r => {
    let p = JSON.parse(r.payload);
    const getNum = (v) => {
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    
    let d = getNum(p.issuedDut) || 0;
    let v = getNum(p.issuedVirtual) || 0;
    let val = getNum(p.value) || 0;
    
    sumVal += val;
    
    let dt = new Date((p.timeEnd || p.timeStart) * 1000);
    let h = (dt.getUTCHours() + 5) % 24;
    hours[h] = (hours[h] || 0) + val;
  });
  
  console.log('10:00');
  console.log('Matched Rows (UTC+3):', rows.length);
  console.log('sumVal (value):', sumVal);
  Object.keys(hours).sort((a,b)=>a-b).forEach(h => console.log(h + ':00 = ' + hours[h]));
});
