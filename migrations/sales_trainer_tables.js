const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('Finalizing Sales Trainer tables migration...');

db.serialize(() => {
    // Standard LMS tables might not be created if server hasn't run.
    // Let's create the courses table if it doesn't exist to avoid errors.
    db.run(`CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_name TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Ensure Sales Trainer course exists in LMS course table
    db.run("INSERT OR IGNORE INTO courses (role_name, title) VALUES ('Sales', 'Sales Trainer')");

    console.log('✓ Sales Trainer course entry ensured');
});

db.close();
