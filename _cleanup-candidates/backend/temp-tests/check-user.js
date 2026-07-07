const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('db/database.sqlite');
db.all('SELECT * FROM users WHERE username = "dkzadmin"', (err, rows) => {
  console.log(rows);
});
