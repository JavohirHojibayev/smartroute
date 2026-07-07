const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db/database.sqlite');
db.get("SELECT payload FROM fuel_entries WHERE external_id='2599818'", (err, row) => {
  console.log(row ? row.payload : 'Not found');
});
