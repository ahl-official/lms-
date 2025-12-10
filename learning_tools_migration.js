const sqlite3 = require('sqlite3').verbose();

class LearningToolsMigration {
    constructor() {
        this.db = new sqlite3.Database('./lms_database.db');
    }

    async runMigration() {
        console.log('🚀 Starting Learning Tools Migration...');
        
        try {
            await this.createTables();
            console.log('✅ Learning Tools Migration completed successfully!');
        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        } finally {
            this.close();
        }
    }

    createTables() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Flashcards Table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS flashcards (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        video_id INTEGER NOT NULL,
                        front_content TEXT NOT NULL,
                        back_content TEXT NOT NULL,
                        card_type TEXT DEFAULT 'text', -- 'text', 'concept'
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
                    )
                `);

                // Student Notes Table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS student_notes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        video_id INTEGER NOT NULL,
                        content TEXT, -- Markdown content
                        is_ai_generated BOOLEAN DEFAULT FALSE,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
                    )
                `);

                // Visual Aids Table (Diagrams/Flowcharts)
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS visual_aids (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        video_id INTEGER NOT NULL,
                        title TEXT,
                        type TEXT DEFAULT 'mermaid', -- 'mermaid', 'svg'
                        content TEXT NOT NULL, -- The code/markup
                        description TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
                    )
                `);

                // Mind Maps Table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS mind_maps (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER, -- Can be null for global/default maps
                        video_id INTEGER NOT NULL,
                        data_json TEXT NOT NULL, -- JSON structure for the map
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
                    )
                `, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('✅ Learning tools tables created successfully');
                        resolve();
                    }
                });
            });
        });
    }

    close() {
        this.db.close();
    }
}

// Run migration if called directly
if (require.main === module) {
    const migration = new LearningToolsMigration();
    migration.runMigration()
        .catch((error) => {
            console.error('💥 Migration failed:', error);
            process.exit(1);
        });
}

module.exports = LearningToolsMigration;
