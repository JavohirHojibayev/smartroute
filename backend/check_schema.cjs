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

    const queries = [
        // Delete old access logs (turnstile events)
        // Let's first check what columns exist
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('access_logs', 'turnstile_status_events', 'medical_checks')"
    ];

    db.all(queries[0], [], (err, rows) => {
        if (err) {
            throw err;
        }
        rows.forEach((row) => {
            console.log(row.name);
            console.log(row.sql);
            console.log('---');
        });
        db.close();
    });
});
