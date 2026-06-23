const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT station_name, SUM(liters) as total_liters FROM fuel_entries WHERE date(event_time) = '2026-06-22' GROUP BY station_name", (err, rows) => {
  if(err) console.error(err);
  else console.table(rows);
});
