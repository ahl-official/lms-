const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

db.run("UPDATE users SET course_role = 'Sales' WHERE email = 'student@ahl.com'", (err) => {
    if (err) console.error(err);
    else console.log('✓ Updated student@ahl.com to Sales role for testing');
    db.close();
});
