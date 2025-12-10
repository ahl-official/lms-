const sqlite3 = require('sqlite3').verbose();

class AdaptiveLearningMigration {
    constructor() {
        this.db = new sqlite3.Database('./lms_database.db');
    }

    async runMigration() {
        console.log('🚀 Starting Adaptive Learning System Migration...');
        
        try {
            await this.createAdaptiveLearningTables();
            await this.addIndexes();
            await this.insertDefaultSettings();
            console.log('✅ Adaptive Learning Migration completed successfully!');
        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }

    createAdaptiveLearningTables() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Adaptive Learning Profiles - Track individual learning patterns
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS adaptive_learning_profiles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        learning_style TEXT DEFAULT 'balanced', -- visual, auditory, kinesthetic, balanced
                        preferred_difficulty TEXT DEFAULT 'medium', -- easy, medium, hard, adaptive
                        question_type_preferences TEXT, -- JSON: {"multiple_choice": 0.4, "typing": 0.3, "audio": 0.2, "scenario": 0.1}
                        performance_trend TEXT DEFAULT 'stable', -- improving, declining, stable
                        mastery_score_average REAL DEFAULT 0.0,
                        total_tests_taken INTEGER DEFAULT 0,
                        total_study_time INTEGER DEFAULT 0, -- in minutes
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                `);

                // Question Performance Tracking - Individual question analytics
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS question_performance_tracking (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        video_id INTEGER NOT NULL,
                        question_id INTEGER,
                        question_type TEXT NOT NULL, -- multiple_choice, typing, audio, scenario
                        question_content TEXT NOT NULL,
                        correct_answer TEXT,
                        user_answer TEXT,
                        is_correct BOOLEAN NOT NULL,
                        time_spent INTEGER, -- seconds spent on question
                        difficulty_level TEXT DEFAULT 'medium',
                        attempt_number INTEGER DEFAULT 1,
                        confidence_score REAL, -- 0.0 to 1.0, how confident the user was
                        ai_feedback TEXT, -- AI-generated explanation
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
                    )
                `);

                // Learning Path Progress - Mastery tracking per topic/video
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS learning_path_progress (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        video_id INTEGER NOT NULL,
                        course_id INTEGER NOT NULL,
                        mastery_level REAL DEFAULT 0.0, -- 0.0 to 1.0 (0% to 100%)
                        attempts_count INTEGER DEFAULT 0,
                        max_attempts INTEGER DEFAULT 5,
                        best_score REAL DEFAULT 0.0,
                        latest_score REAL DEFAULT 0.0,
                        is_mastered BOOLEAN DEFAULT FALSE, -- TRUE when mastery_level >= 0.7
                        time_to_mastery INTEGER, -- minutes from first attempt to mastery
                        weak_areas TEXT, -- JSON array of topics needing improvement
                        strong_areas TEXT, -- JSON array of mastered topics
                        next_recommended_action TEXT, -- practice, review, advance, etc.
                        last_attempt_at DATETIME,
                        mastered_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
                        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
                    )
                `);

                // Practice Recommendations - Personalized suggestions
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS practice_recommendations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        video_id INTEGER,
                        course_id INTEGER,
                        recommendation_type TEXT NOT NULL, -- review, practice, advance, remedial
                        title TEXT NOT NULL,
                        description TEXT,
                        priority INTEGER DEFAULT 1, -- 1=high, 2=medium, 3=low
                        estimated_time INTEGER, -- minutes
                        difficulty_level TEXT DEFAULT 'medium',
                        question_types TEXT, -- JSON array of recommended question types
                        is_completed BOOLEAN DEFAULT FALSE,
                        ai_reasoning TEXT, -- Why this recommendation was made
                        expires_at DATETIME, -- When recommendation becomes stale
                        completed_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
                        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
                    )
                `);

                // Adaptive Test Sessions - Track each test session
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS adaptive_test_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        video_id INTEGER NOT NULL,
                        session_type TEXT DEFAULT 'assessment', -- assessment, practice, review
                        total_questions INTEGER NOT NULL,
                        questions_answered INTEGER DEFAULT 0,
                        correct_answers INTEGER DEFAULT 0,
                        score_percentage REAL DEFAULT 0.0,
                        time_spent INTEGER DEFAULT 0, -- total seconds
                        difficulty_progression TEXT, -- JSON: difficulty changes during test
                        question_sequence TEXT, -- JSON: order and types of questions
                        is_completed BOOLEAN DEFAULT FALSE,
                        is_passed BOOLEAN DEFAULT FALSE, -- TRUE if score >= 70%
                        ai_analysis TEXT, -- AI assessment of performance
                        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        completed_at DATETIME,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
                    )
                `);

                // Learning Analytics - Aggregate statistics
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS learning_analytics (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        course_id INTEGER,
                        analytics_date DATE NOT NULL,
                        total_study_time INTEGER DEFAULT 0, -- minutes
                        videos_completed INTEGER DEFAULT 0,
                        tests_taken INTEGER DEFAULT 0,
                        tests_passed INTEGER DEFAULT 0,
                        average_score REAL DEFAULT 0.0,
                        mastery_topics INTEGER DEFAULT 0,
                        struggling_topics INTEGER DEFAULT 0,
                        learning_velocity REAL DEFAULT 0.0, -- topics mastered per day
                        engagement_score REAL DEFAULT 0.0, -- 0.0 to 1.0
                        ai_insights TEXT, -- JSON with detailed analytics
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
                    )
                `, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('✅ Adaptive learning tables created successfully');
                        resolve();
                    }
                });
            });
        });
    }

    addIndexes() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Performance indexes
                this.db.run('CREATE INDEX IF NOT EXISTS idx_adaptive_profiles_user ON adaptive_learning_profiles(user_id)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_question_performance_user_video ON question_performance_tracking(user_id, video_id)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_learning_progress_user_course ON learning_path_progress(user_id, course_id)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_recommendations_user_priority ON practice_recommendations(user_id, priority)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_test_sessions_user_video ON adaptive_test_sessions(user_id, video_id)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_analytics_user_date ON learning_analytics(user_id, analytics_date)', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('✅ Indexes created successfully');
                        resolve();
                    }
                });
            });
        });
    }

    insertDefaultSettings() {
        return new Promise((resolve, reject) => {
            // Add adaptive learning system settings
            const settings = [
                ['adaptive_learning_enabled', 'true'],
                ['mastery_threshold', '0.7'], // 70% to pass
                ['max_test_attempts', '5'],
                ['default_question_count', '10'],
                ['adaptive_difficulty_enabled', 'true'],
                ['ai_feedback_enabled', 'true'],
                ['practice_recommendations_enabled', 'true'],
                ['learning_analytics_enabled', 'true']
            ];

            let completed = 0;
            settings.forEach(([key, value]) => {
                this.db.run(
                    'INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
                    [key, value],
                    (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        completed++;
                        if (completed === settings.length) {
                            console.log('✅ Default adaptive learning settings inserted');
                            resolve();
                        }
                    }
                );
            });
        });
    }

    close() {
        this.db.close();
    }
}

// Run migration if called directly
if (require.main === module) {
    const migration = new AdaptiveLearningMigration();
    migration.runMigration()
        .then(() => {
            console.log('🎉 Adaptive Learning System is ready!');
            migration.close();
        })
        .catch((error) => {
            console.error('💥 Migration failed:', error);
            migration.close();
            process.exit(1);
        });
}

module.exports = AdaptiveLearningMigration;