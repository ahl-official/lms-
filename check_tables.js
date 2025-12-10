const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('Tables:', rows.map(r => r.name));
    }
    db.close();
});