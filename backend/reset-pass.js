const { randomBytes, scryptSync } = require('crypto');
const sqlite3 = require('sqlite3');

const SALT_BYTES = 16;
const HASH_BYTES = 64;
const plainPassword = 'QW1665gety';

const salt = randomBytes(SALT_BYTES).toString('hex');
const hash = scryptSync(plainPassword, salt, HASH_BYTES).toString('hex');
const newPasswordHash = `${salt}:${hash}`;

const db = new sqlite3.Database('db/database.sqlite');
db.run('UPDATE users SET password_hash = ? WHERE username = "dkzadmin"', [newPasswordHash], function(err) {
  if (err) {
    console.error(err);
  } else {
    console.log(`Updated dkzadmin password. Rows affected: ${this.changes}`);
  }
});
