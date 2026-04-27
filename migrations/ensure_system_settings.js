const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Default model setting if not exists
    db.run("INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('llm_model', 'openai/gpt-4o')");
});

db.close();
