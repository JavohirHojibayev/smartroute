const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT event_type, is_broken, SUM(JSON_EXTRACT(payload, '$.issuedVirtual')) as virt, SUM(JSON_EXTRACT(payload, '$.issuedDut')) as dut, SUM(JSON_EXTRACT(payload, '$.value')) as val FROM fuel_entries WHERE date(event_time) = '2026-06-22' GROUP BY event_type, is_broken", (err, rows) => {
  console.table(rows);
});
