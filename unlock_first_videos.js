const sqlite3 = require('sqlite3').verbose();

// Ensure first videos are unlocked for all students
async function unlockFirstVideos() {
    const db = new sqlite3.Database('./lms_database.db');
    
    console.log('\n=== Unlocking First Videos for All Students ===\n');
    
    // Get all students
    const students = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM users WHERE role = 'student'", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    
    // Get first video of each course (sequence = 1)
    const firstVideos = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM videos WHERE sequence = 1 ORDER BY course_id", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    
    console.log(`Found ${students.length} students and ${firstVideos.length} first videos`);
    
    let unlockedCount = 0;
    
    // Unlock first video of each course for each student
    for (const student of students) {
        for (const video of firstVideos) {
            // Check if progress already exists
            const existingProgress = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM progress WHERE user_id = ? AND video_id = ?", 
                    [student.id, video.id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (!existingProgress) {
                // Create progress record to unlock the video
                await new Promise((resolve, reject) => {
                    db.run(`INSERT INTO progress (user_id, video_id, status, completed_at) 
                            VALUES (?, ?, 'not_started', CURRENT_TIMESTAMP)`,
                        [student.id, video.id], function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    });
                });
                
                unlockedCount++;
                console.log(`✓ Unlocked "${video.title}" for student ${student.name}`);
            } else {
                console.log(`- "${video.title}" already accessible for student ${student.name}`);
            }
        }
    }
    
    console.log(`\n🎯 Summary: ${unlockedCount} first videos unlocked for students`);
    
    // Verify the unlocking worked
    console.log('\n=== Verification ===');
    
    for (const student of students) {
        const accessibleVideos = await new Promise((resolve, reject) => {
            db.all(`
                SELECT v.title, v.sequence, c.title as course_name
                FROM progress p
                JOIN videos v ON p.video_id = v.id
                JOIN courses c ON v.course_id = c.id
                WHERE p.user_id = ?
                ORDER BY c.title, v.sequence
            `, [student.id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log(`\nStudent ${student.name} can access ${accessibleVideos.length} videos:`);
        if (accessibleVideos.length === 0) {
            console.log('  No videos accessible yet.');
        }
        accessibleVideos.forEach(video => {
            console.log(`  - ${video.course_name}: ${video.title} (seq: ${video.sequence})`);
        });
    }
    
    db.close();
    console.log('\n✅ First video unlocking completed!');
}

// Run the script
unlockFirstVideos().catch(console.error);