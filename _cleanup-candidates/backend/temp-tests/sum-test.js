const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db/database.sqlite');
const startIso = '2026-07-05T19:00:00.000Z';
const endIso = '2026-07-06T18:59:59.999Z';

db.all("SELECT payload FROM fuel_entries WHERE event_time >= ? AND event_time <= ? AND json_extract(payload, '$.eventsType') IN (131,132)", [startIso, endIso], (err, rows) => {
  let sumCounter = 0;
  let sumDut = 0;
  let sumHybrid = 0;
  
  rows.forEach(r => {
    let p = JSON.parse(r.payload);
    
    // Parse helper
    const getNum = (v) => {
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    
    // Simulate what normalizeExternalRow computes for row.liters:
    let rowLiters = getNum(p.issuedDut ?? p.issuedVirtual ?? p.differenceRefuel ?? p.issuedValue ?? p.value);
    
    // sumCounter (Default for getOperations if AZS_OPERATIONS_LITERS_MODE=counter)
    let valCounter = getNum(p.value) ?? getNum(p.issuedValue) ?? getNum(p.issuedDut) ?? getNum(p.issuedVirtual) ?? getNum(p.differenceRefuel) ?? rowLiters ?? 0;
    sumCounter += valCounter;
    
    // sumDut
    let valDut = getNum(p.issuedDut) ?? getNum(p.issuedVirtual) ?? rowLiters ?? 0;
    sumDut += valDut;
    
    // sumHybrid
    let valHybrid = getNum(p.issuedDut) ?? getNum(p.issuedVirtual) ?? getNum(p.differenceRefuel) ?? getNum(p.issuedValue) ?? getNum(p.value) ?? rowLiters ?? 0;
    sumHybrid += valHybrid;
  });
  
  console.log('Rows:', rows.length);
  console.log('Counter Sum (value first):', sumCounter);
  console.log('DUT Sum (dut first):', sumDut);
  console.log('Hybrid Sum (dut->vir->diff->val):', sumHybrid);
});
