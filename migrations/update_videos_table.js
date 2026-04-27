const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

db.serialize(() => {
    db.run("ALTER TABLE videos ADD COLUMN video_url TEXT", (err) => {});
    db.run("ALTER TABLE videos ADD COLUMN video_type TEXT DEFAULT 'gumlet' CHECK(video_type IN ('gumlet', 'youtube'))", (err) => {});
    // Migrate existing gumlet_url to video_url for consistency
    db.run("UPDATE videos SET video_url = gumlet_url, video_type = 'gumlet' WHERE video_url IS NULL");
});

db.close();
