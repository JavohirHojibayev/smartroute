const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
console.log('Connecting to', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');

    // We want to delete data before today (2026-06-18)
    // Or we can just use SQLite's date function to get start of today: date('now', 'localtime')
    // Wait, the timezone is Asia/Tashkent (+05:00).
    // It's safer to use a hardcoded date string if we know today is 2026-06-18.
    const todayStr = '2026-06-18 00:00:00';

    const deleteAccessLogs = `DELETE FROM access_logs WHERE access_time < '${todayStr}'`;
    const deleteEsmoLogs = `DELETE FROM medical_checks WHERE esmo_id IS NOT NULL AND check_time < '${todayStr}'`;

    db.serialize(() => {
        db.run(deleteAccessLogs, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                console.log(`Deleted ${this.changes} rows from access_logs (turniket events) before ${todayStr}`);
            }
        });

        db.run(deleteEsmoLogs, function(err) {
            if (err) {
                console.error(err.message);
            } else {
                console.log(`Deleted ${this.changes} rows from medical_checks (esmo events) before ${todayStr}`);
            }
        });
    });

    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Closed the database connection.');
    });
});
