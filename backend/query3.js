const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');

db.all("SELECT SUM(JSON_EXTRACT(payload, '$.issuedDut')) as dut, SUM(JSON_EXTRACT(payload, '$.issuedVirtual')) as virt, SUM(JSON_EXTRACT(payload, '$.issuedValue')) as val FROM fuel_entries WHERE date(event_time) = '2026-06-22'", (err, rows) => {
  console.log('All stations:', rows);
});

db.all("SELECT station_name, SUM(JSON_EXTRACT(payload, '$.issuedVirtual')) as virt FROM fuel_entries WHERE date(event_time) = '2026-06-22' GROUP BY station_name", (err, rows) => {
  console.table(rows);
});
