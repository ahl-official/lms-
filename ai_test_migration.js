const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database connection
const db = new sqlite3.Database('./lms_database.db');

console.log('Starting AI test system database migration...');

db.serialize(() => {
    // Enhanced AI tests table (replaces basic tests table)
    db.run(`CREATE TABLE IF NOT EXISTS ai_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        passing_score INTEGER DEFAULT 70,
        max_attempts INTEGER DEFAULT 5,
        time_limit_minutes INTEGER DEFAULT 30,
        question_count INTEGER DEFAULT 10,
        difficulty_level TEXT CHECK(difficulty_level IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
        test_type TEXT CHECK(test_type IN ('auto_generated', 'manual', 'mixed')) DEFAULT 'auto_generated',
        generation_status TEXT CHECK(generation_status IN ('pending', 'generating', 'completed', 'failed')) DEFAULT 'pending',
        generated_content TEXT, -- JSON structure of questions
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating ai_tests table:', err);
        } else {
            console.log('✓ ai_tests table created successfully');
        }
    });

    // AI test questions with enhanced types
    db.run(`CREATE TABLE IF NOT EXISTS ai_test_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_type TEXT CHECK(question_type IN ('multiple_choice', 'typing', 'audio_response', 'true_false', 'fill_blank')) NOT NULL,
        question_data TEXT NOT NULL, -- JSON with options, correct answers, etc.
        points INTEGER DEFAULT 1,
        difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
        sequence_order INTEGER NOT NULL,
        audio_file_path TEXT, -- For audio questions
        expected_keywords TEXT, -- For typing questions (JSON array)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES ai_tests(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating ai_test_questions table:', err);
        } else {
            console.log('✓ ai_test_questions table created successfully');
        }
    });

    // Student test attempts
    db.run(`CREATE TABLE IF NOT EXISTS student_test_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        attempt_number INTEGER NOT NULL,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        total_score DECIMAL(5,2) DEFAULT 0,
        percentage_score DECIMAL(5,2) DEFAULT 0,
        passed BOOLEAN DEFAULT FALSE,
        status TEXT CHECK(status IN ('in_progress', 'completed', 'abandoned', 'timed_out')) DEFAULT 'in_progress',
        time_taken_minutes INTEGER,
        answers_data TEXT, -- JSON structure of all answers
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_id) REFERENCES ai_tests(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(test_id, student_id, attempt_number)
    )`, (err) => {
        if (err) {
            console.error('Error creating student_test_attempts table:', err);
        } else {
            console.log('✓ student_test_attempts table created successfully');
        }
    });

    // Individual question responses
    db.run(`CREATE TABLE IF NOT EXISTS test_question_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        student_answer TEXT, -- The actual answer provided
        is_correct BOOLEAN DEFAULT FALSE,
        points_earned DECIMAL(3,1) DEFAULT 0,
        response_time_seconds INTEGER,
        audio_response_path TEXT, -- For audio responses
        ai_feedback TEXT, -- AI-generated feedback for this specific answer
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attempt_id) REFERENCES student_test_attempts(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES ai_test_questions(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating test_question_responses table:', err);
        } else {
            console.log('✓ test_question_responses table created successfully');
        }
    });

    // AI feedback and recommendations
    db.run(`CREATE TABLE IF NOT EXISTS ai_test_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_id INTEGER NOT NULL,
        overall_feedback TEXT NOT NULL,
        strengths TEXT, -- JSON array of identified strengths
        weaknesses TEXT, -- JSON array of areas for improvement
        recommendations TEXT, -- JSON array of specific recommendations
        study_materials TEXT, -- JSON array of suggested resources
        next_steps TEXT,
        feedback_type TEXT CHECK(feedback_type IN ('pass', 'fail', 'retry_suggestion')) NOT NULL,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attempt_id) REFERENCES student_test_attempts(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating ai_test_feedback table:', err);
        } else {
            console.log('✓ ai_test_feedback table created successfully');
        }
    });

    // Test completion requirements (for video unlocking)
    db.run(`CREATE TABLE IF NOT EXISTS test_completion_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        requires_test_completion BOOLEAN DEFAULT TRUE,
        minimum_score_required INTEGER DEFAULT 70,
        max_attempts_before_unlock INTEGER DEFAULT 5, -- Unlock even if not passed after X attempts
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating test_completion_requirements table:', err);
        } else {
            console.log('✓ test_completion_requirements table created successfully');
        }
    });

    // Mock call sessions for practical exercises
    db.run(`CREATE TABLE IF NOT EXISTS mock_call_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        session_title TEXT NOT NULL,
        scenario_description TEXT,
        audio_recording_path TEXT,
        duration_seconds INTEGER,
        ai_analysis TEXT, -- JSON with detailed analysis
        communication_score DECIMAL(3,1),
        technical_score DECIMAL(3,1),
        overall_score DECIMAL(3,1),
        feedback TEXT,
        status TEXT CHECK(status IN ('recorded', 'analyzing', 'completed', 'failed')) DEFAULT 'recorded',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating mock_call_sessions table:', err);
        } else {
            console.log('✓ mock_call_sessions table created successfully');
        }
    });

    // Add indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_ai_tests_video_id ON ai_tests(video_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ai_tests_status ON ai_tests(generation_status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_test_questions_test_id ON ai_test_questions(test_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_student_attempts_test_student ON student_test_attempts(test_id, student_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_student_attempts_status ON student_test_attempts(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_question_responses_attempt ON test_question_responses(attempt_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_test_feedback_attempt ON ai_test_feedback(attempt_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_completion_requirements_video ON test_completion_requirements(video_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_mock_calls_video_student ON mock_call_sessions(video_id, student_id)`);

    console.log('✓ All indexes created successfully');

    // Insert default test completion requirements for existing videos
    db.run(`INSERT OR IGNORE INTO test_completion_requirements (video_id, requires_test_completion, minimum_score_required, max_attempts_before_unlock)
            SELECT id, TRUE, 70, 5 FROM videos`, (err) => {
        if (err) {
            console.error('Error inserting default test requirements:', err);
        } else {
            console.log('✓ Default test completion requirements added for existing videos');
        }
    });

    console.log('\n🎉 AI test system database migration completed successfully!');
    console.log('\nNew tables created:');
    console.log('- ai_tests: Enhanced test management with AI generation');
    console.log('- ai_test_questions: Multi-type questions (MC, typing, audio)');
    console.log('- student_test_attempts: Detailed attempt tracking');
    console.log('- test_question_responses: Individual answer analysis');
    console.log('- ai_test_feedback: AI-generated feedback and recommendations');
    console.log('- test_completion_requirements: Video unlock logic');
    console.log('- mock_call_sessions: Practical exercise recordings');
    
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('\n✓ Database connection closed');
        }
    });
});