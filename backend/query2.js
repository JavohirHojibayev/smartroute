const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT * FROM fuel_entries WHERE date(event_time) = '2026-06-22' LIMIT 5", (err, rows) => {
  console.log(rows);
});
