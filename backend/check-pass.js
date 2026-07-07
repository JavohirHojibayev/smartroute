const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('db/database.sqlite');
db.all('SELECT password FROM users WHERE username = "dkzadmin"', (err, rows) => {
  if (rows.length > 0) {
    console.log("Match:", bcrypt.compareSync('QW1665gety', rows[0].password));
  } else {
    console.log("No user found");
  }
});
