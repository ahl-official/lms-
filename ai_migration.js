const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database connection
const db = new sqlite3.Database('./lms_database.db');

console.log('Starting AI features database migration...');

db.serialize(() => {
    // Create video_transcripts table
    db.run(`CREATE TABLE IF NOT EXISTS video_transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        transcript_text TEXT NOT NULL,
        transcription_status TEXT CHECK(transcription_status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating video_transcripts table:', err);
        } else {
            console.log('✓ video_transcripts table created successfully');
        }
    });

    // Create ai_generated_content table
    db.run(`CREATE TABLE IF NOT EXISTS ai_generated_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        content_type TEXT CHECK(content_type IN ('test', 'activity')) NOT NULL,
        generated_content TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending_review', 'approved', 'rejected', 'updated_pending')) DEFAULT 'pending_review',
        admin_feedback TEXT,
        version INTEGER DEFAULT 1,
        is_current_version BOOLEAN DEFAULT 1,
        original_content_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        reviewed_by INTEGER,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id),
        FOREIGN KEY (original_content_id) REFERENCES ai_generated_content(id)
    )`, (err) => {
        if (err) {
            console.error('Error creating ai_generated_content table:', err);
        } else {
            console.log('✓ ai_generated_content table created successfully');
        }
    });

    // Create student_qa_sessions table
    db.run(`CREATE TABLE IF NOT EXISTS student_qa_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        video_id INTEGER NOT NULL,
        question TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        rating INTEGER CHECK(rating >= 1 AND rating <= 5),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating student_qa_sessions table:', err);
        } else {
            console.log('✓ student_qa_sessions table created successfully');
        }
    });

    // Create ai_content_updates table for tracking update requests
    db.run(`CREATE TABLE IF NOT EXISTS ai_content_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        content_type TEXT CHECK(content_type IN ('test', 'activity')) NOT NULL,
        current_content_id INTEGER NOT NULL,
        update_reason TEXT,
        requested_by INTEGER NOT NULL,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY (current_content_id) REFERENCES ai_generated_content(id),
        FOREIGN KEY (requested_by) REFERENCES users(id)
    )`, (err) => {
        if (err) {
            console.error('Error creating ai_content_updates table:', err);
        } else {
            console.log('✓ ai_content_updates table created successfully');
        }
    });

    // Add indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_video_transcripts_video_id ON video_transcripts(video_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ai_generated_content_video_id ON ai_generated_content(video_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ai_generated_content_status ON ai_generated_content(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_student_qa_video_id ON student_qa_sessions(video_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_student_qa_student_id ON student_qa_sessions(student_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ai_content_updates_video_id ON ai_content_updates(video_id)`);

    console.log('✓ Database indexes created successfully');

    // Add OpenAI configuration columns to a settings table (create if not exists)
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating system_settings table:', err);
        } else {
            console.log('✓ system_settings table created successfully');
            
            // Insert default AI settings
            const defaultSettings = [
                ['openai_api_key', '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'],
                ['ai_enabled', 'true'],
                ['max_transcript_length', '50000'],
                ['ai_generation_timeout', '30000'],
                ['whisper_model', 'whisper-1'],
                ['gpt_model', 'gpt-4']
            ];

            let settingsInserted = 0;
            const totalSettings = defaultSettings.length;
            
            defaultSettings.forEach(([key, value]) => {
                db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)`, 
                    [key, value], (err) => {
                    settingsInserted++;
                    if (err) {
                        console.error(`Error inserting setting ${key}:`, err);
                    }
                    
                    if (settingsInserted === totalSettings) {
                        console.log('✓ Default AI settings inserted');
                        
                        // Close database after all operations are complete
                        db.close((err) => {
                            if (err) {
                                console.error('Error closing database:', err);
                            } else {
                                console.log('\n🎉 AI features database migration completed successfully!');
                                console.log('\nNew tables created:');
                                console.log('- video_transcripts: Store video transcriptions');
                                console.log('- ai_generated_content: Store AI-generated tests and activities');
                                console.log('- student_qa_sessions: Store student Q&A interactions');
                                console.log('- ai_content_updates: Track content update requests');
                                console.log('- system_settings: Store AI configuration settings');
                                console.log('\nYou can now proceed with implementing the AI features!');
                            }
                        });
                    }
                });
            });
        }
    });
});