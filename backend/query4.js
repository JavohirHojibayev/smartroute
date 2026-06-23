const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT SUM(JSON_EXTRACT(payload, '$.issuedDut')) as dut, SUM(JSON_EXTRACT(payload, '$.issuedVirtual')) as virt, SUM(JSON_EXTRACT(payload, '$.issuedMassDut')) as mdut, SUM(JSON_EXTRACT(payload, '$.issuedMassVirtual')) as mvirt, SUM(JSON_EXTRACT(payload, '$.differenceRefuel')) as diff, SUM(JSON_EXTRACT(payload, '$.value')) as val FROM fuel_entries WHERE date(event_time) = '2026-06-22'", (err, rows) => {
  console.log(rows);
});
