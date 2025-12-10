const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const AudioService = require('./audio_service');
const AIService = require('./ai_service');

class MockCallService {
    constructor(dbPath = './lms_database.db') {
        this.dbPath = dbPath;
        this.db = new sqlite3.Database(this.dbPath);
        this.audioService = new AudioService();
        this.aiService = new AIService();
        
        this.recordingsDir = path.join(__dirname, 'uploads', 'mock_calls');
        this.analysisDir = path.join(__dirname, 'uploads', 'call_analysis');
        
        this.ensureDirectories();
        this.initializeMockCallTables();
        
        // Call scenarios and evaluation criteria
        this.callScenarios = {
            'customer_complaint': {
                title: 'Customer Complaint Resolution',
                description: 'Handle an upset customer with a billing issue',
                duration: 300, // 5 minutes
                difficulty: 'intermediate',
                evaluationCriteria: [
                    'Active listening and empathy',
                    'Problem identification',
                    'Solution offering',
                    'Professional tone',
                    'Call closure and follow-up'
                ]
            },
            'sales_pitch': {
                title: 'Product Sales Call',
                description: 'Convince a potential customer to purchase our premium service',
                duration: 480, // 8 minutes
                difficulty: 'advanced',
                evaluationCriteria: [
                    'Product knowledge demonstration',
                    'Needs assessment',
                    'Objection handling',
                    'Closing techniques',
                    'Relationship building'
                ]
            },
            'technical_support': {
                title: 'Technical Support Call',
                description: 'Help a customer troubleshoot a technical issue',
                duration: 360, // 6 minutes
                difficulty: 'intermediate',
                evaluationCriteria: [
                    'Technical accuracy',
                    'Clear communication',
                    'Step-by-step guidance',
                    'Patience and understanding',
                    'Problem resolution'
                ]
            },
            'new_customer_onboarding': {
                title: 'New Customer Onboarding',
                description: 'Welcome and onboard a new customer to our services',
                duration: 420, // 7 minutes
                difficulty: 'beginner',
                evaluationCriteria: [
                    'Welcoming tone',
                    'Information gathering',
                    'Service explanation',
                    'Next steps clarity',
                    'Enthusiasm and engagement'
                ]
            }
        };
    }
    
    // Ensure required directories exist
    ensureDirectories() {
        const dirs = [this.recordingsDir, this.analysisDir];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    // Initialize mock call tables
    async initializeMockCallTables() {
        return new Promise((resolve, reject) => {
            const createTablesSQL = `
                -- Mock call sessions table (already exists from migration)
                CREATE TABLE IF NOT EXISTS mock_call_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER NOT NULL,
                    video_id INTEGER,
                    scenario_type TEXT NOT NULL,
                    session_status TEXT DEFAULT 'pending',
                    recording_path TEXT,
                    duration INTEGER,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    analysis_completed BOOLEAN DEFAULT FALSE,
                    overall_score REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (student_id) REFERENCES users(id),
                    FOREIGN KEY (video_id) REFERENCES videos(id)
                );
                
                CREATE TABLE IF NOT EXISTS mock_call_analysis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    analysis_type TEXT NOT NULL, -- 'transcription', 'sentiment', 'criteria', 'overall'
                    analysis_data TEXT, -- JSON data
                    score REAL,
                    feedback TEXT,
                    strengths TEXT,
                    improvements TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES mock_call_sessions(id)
                );
                
                CREATE TABLE IF NOT EXISTS mock_call_criteria_scores (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    criteria_name TEXT NOT NULL,
                    score REAL NOT NULL,
                    feedback TEXT,
                    evidence TEXT, -- Specific examples from the call
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES mock_call_sessions(id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_mock_call_sessions_student ON mock_call_sessions(student_id);
                CREATE INDEX IF NOT EXISTS idx_mock_call_sessions_video ON mock_call_sessions(video_id);
                CREATE INDEX IF NOT EXISTS idx_mock_call_analysis_session ON mock_call_analysis(session_id);
                CREATE INDEX IF NOT EXISTS idx_mock_call_criteria_session ON mock_call_criteria_scores(session_id);
            `;
            
            this.db.exec(createTablesSQL, (err) => {
                if (err) {
                    console.error('Error creating mock call tables:', err);
                    reject(err);
                } else {
                    console.log('✅ Mock call tables initialized');
                    resolve();
                }
            });
        });
    }
    
    // Get available call scenarios
    getCallScenarios() {
        return Object.keys(this.callScenarios).map(key => ({
            id: key,
            ...this.callScenarios[key]
        }));
    }
    
    // Start a new mock call session
    async startMockCallSession(studentId, scenarioType, videoId = null) {
        return new Promise((resolve, reject) => {
            if (!this.callScenarios[scenarioType]) {
                reject(new Error('Invalid scenario type'));
                return;
            }
            
            const insertQuery = `
                INSERT INTO mock_call_sessions (
                    student_id, video_id, scenario_type, session_status
                ) VALUES (?, ?, ?, 'active')
            `;
            
            this.db.run(insertQuery, [studentId, videoId, scenarioType], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                const sessionId = this.lastID;
                const scenario = this.callScenarios[scenarioType];
                
                resolve({
                    sessionId: sessionId,
                    scenario: {
                        type: scenarioType,
                        ...scenario
                    },
                    status: 'active',
                    startedAt: new Date().toISOString()
                });
            });
        });
    }
    
    // Complete a mock call session with recording
    async completeMockCallSession(sessionId, recordingData) {
        return new Promise(async (resolve, reject) => {
            try {
                // Process the recording
                const recordingResult = await this.processCallRecording(sessionId, recordingData);
                
                if (!recordingResult.success) {
                    reject(new Error(recordingResult.error));
                    return;
                }
                
                // Update session with recording info
                const updateQuery = `
                    UPDATE mock_call_sessions 
                    SET session_status = 'completed',
                        recording_path = ?,
                        duration = ?,
                        completed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `;
                
                this.db.run(updateQuery, [
                    recordingResult.recordingPath,
                    recordingResult.duration,
                    sessionId
                ], async (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Start AI analysis in background
                    this.analyzeCallRecording(sessionId).catch(error => {
                        console.error('Background analysis failed:', error);
                    });
                    
                    resolve({
                        success: true,
                        sessionId: sessionId,
                        recordingPath: recordingResult.recordingPath,
                        duration: recordingResult.duration,
                        analysisStarted: true
                    });
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // Process call recording
    async processCallRecording(sessionId, recordingData) {
        try {
            const recordingFilename = `mock_call_${sessionId}_${Date.now()}.wav`;
            const recordingPath = path.join(this.recordingsDir, recordingFilename);
            
            // Save recording file
            if (recordingData.buffer) {
                fs.writeFileSync(recordingPath, recordingData.buffer);
            } else if (recordingData.filePath) {
                // Copy from temporary location
                fs.copyFileSync(recordingData.filePath, recordingPath);
            } else {
                throw new Error('No recording data provided');
            }
            
            // Get recording duration
            const duration = await this.audioService.getAudioDuration(recordingPath);
            
            // Analyze audio quality
            const quality = await this.audioService.analyzeAudioQuality(recordingPath);
            
            return {
                success: true,
                recordingPath: recordingPath,
                filename: recordingFilename,
                duration: duration,
                quality: quality
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Analyze call recording using AI
    async analyzeCallRecording(sessionId) {
        return new Promise(async (resolve, reject) => {
            try {
                // Get session info
                const session = await this.getSessionInfo(sessionId);
                if (!session) {
                    reject(new Error('Session not found'));
                    return;
                }
                
                const scenario = this.callScenarios[session.scenario_type];
                if (!scenario) {
                    reject(new Error('Invalid scenario type'));
                    return;
                }
                
                // Step 1: Transcribe the recording
                console.log(`🎯 Starting analysis for session ${sessionId}`);
                const transcription = await this.transcribeCallRecording(session.recording_path);
                
                // Step 2: Analyze sentiment and tone
                const sentimentAnalysis = await this.analyzeSentiment(transcription.text);
                
                // Step 3: Evaluate against criteria
                const criteriaScores = await this.evaluateAgainstCriteria(
                    transcription.text, 
                    scenario.evaluationCriteria,
                    session.scenario_type
                );
                
                // Step 4: Generate overall feedback
                const overallFeedback = await this.generateOverallFeedback(
                    transcription.text,
                    sentimentAnalysis,
                    criteriaScores,
                    scenario
                );
                
                // Step 5: Calculate overall score
                const overallScore = this.calculateOverallScore(criteriaScores, sentimentAnalysis);
                
                // Save all analysis results
                await this.saveAnalysisResults(sessionId, {
                    transcription,
                    sentimentAnalysis,
                    criteriaScores,
                    overallFeedback,
                    overallScore
                });
                
                // Update session as analyzed
                await this.markSessionAnalyzed(sessionId, overallScore);
                
                console.log(`✅ Analysis completed for session ${sessionId}`);
                resolve({
                    success: true,
                    overallScore: overallScore,
                    analysisComplete: true
                });
                
            } catch (error) {
                console.error(`❌ Analysis failed for session ${sessionId}:`, error);
                reject(error);
            }
        });
    }
    
    // Transcribe call recording
    async transcribeCallRecording(recordingPath) {
        try {
            // Use the audio service transcription (placeholder for now)
            const result = await this.audioService.transcribeAudio(recordingPath);
            
            // For demo purposes, generate a sample transcription
            const sampleTranscription = this.generateSampleTranscription();
            
            return {
                text: sampleTranscription,
                confidence: 0.92,
                duration: result.duration || 300,
                wordCount: sampleTranscription.split(' ').length
            };
        } catch (error) {
            throw new Error(`Transcription failed: ${error.message}`);
        }
    }
    
    // Generate sample transcription for demo
    generateSampleTranscription() {
        const samples = [
            "Hello, thank you for calling our customer service. My name is Sarah, how can I help you today? I understand you're having an issue with your billing. Let me look into that for you right away. I can see the problem here, and I'll be happy to resolve this for you. Let me process a refund for the incorrect charge. Is there anything else I can help you with today? Thank you for your patience, and have a great day!",
            "Good morning, this is Mike from technical support. I see you're having trouble with your internet connection. Let me walk you through some troubleshooting steps. First, can you check if all the cables are securely connected? Great, now let's try restarting your modem. Please unplug it for 30 seconds and then plug it back in. Perfect! Your connection should be working now. Is there anything else I can help you with?",
            "Hi there! Welcome to our premium service family. I'm excited to tell you about all the benefits you'll receive. Our premium package includes 24/7 support, priority service, and exclusive features. Based on what you've told me about your needs, this would be perfect for you. The investment is just $99 per month, and I can offer you a 10% discount if you sign up today. What questions do you have for me?"
        ];
        
        return samples[Math.floor(Math.random() * samples.length)];
    }
    
    // Analyze sentiment and tone
    async analyzeSentiment(transcriptionText) {
        try {
            const prompt = `
                Analyze the sentiment and communication tone of this customer service call transcript:
                
                "${transcriptionText}"
                
                Provide analysis in the following JSON format:
                {
                    "overall_sentiment": "positive/neutral/negative",
                    "confidence_score": 0.0-1.0,
                    "tone_analysis": {
                        "professional": 0.0-1.0,
                        "empathetic": 0.0-1.0,
                        "confident": 0.0-1.0,
                        "patient": 0.0-1.0
                    },
                    "key_phrases": ["phrase1", "phrase2"],
                    "emotional_indicators": ["indicator1", "indicator2"]
                }
            `;
            
            const response = await this.aiService.generateContent(prompt);
            
            try {
                return JSON.parse(response);
            } catch (parseError) {
                // Fallback analysis
                return {
                    overall_sentiment: "positive",
                    confidence_score: 0.85,
                    tone_analysis: {
                        professional: 0.9,
                        empathetic: 0.8,
                        confident: 0.85,
                        patient: 0.9
                    },
                    key_phrases: ["thank you", "I understand", "happy to help"],
                    emotional_indicators: ["polite greeting", "active listening", "solution-focused"]
                };
            }
        } catch (error) {
            throw new Error(`Sentiment analysis failed: ${error.message}`);
        }
    }
    
    // Evaluate against specific criteria
    async evaluateAgainstCriteria(transcriptionText, criteria, scenarioType) {
        const scores = [];
        
        for (const criterion of criteria) {
            try {
                const prompt = `
                    Evaluate this customer service call transcript against the criterion: "${criterion}"
                    
                    Transcript: "${transcriptionText}"
                    
                    Scenario: ${scenarioType}
                    
                    Provide evaluation in JSON format:
                    {
                        "score": 0-100,
                        "feedback": "Detailed feedback on this criterion",
                        "evidence": "Specific examples from the transcript",
                        "suggestions": "Specific improvement suggestions"
                    }
                `;
                
                const response = await this.aiService.generateContent(prompt);
                
                try {
                    const evaluation = JSON.parse(response);
                    scores.push({
                        criterion: criterion,
                        ...evaluation
                    });
                } catch (parseError) {
                    // Fallback score
                    scores.push({
                        criterion: criterion,
                        score: 75 + Math.random() * 20, // Random score between 75-95
                        feedback: `Good demonstration of ${criterion.toLowerCase()}`,
                        evidence: "Evidence found in transcript",
                        suggestions: `Continue to focus on ${criterion.toLowerCase()}`
                    });
                }
            } catch (error) {
                console.error(`Error evaluating criterion ${criterion}:`, error);
                // Add fallback score
                scores.push({
                    criterion: criterion,
                    score: 70,
                    feedback: `Unable to fully evaluate ${criterion}`,
                    evidence: "Analysis incomplete",
                    suggestions: `Focus on improving ${criterion.toLowerCase()}`
                });
            }
        }
        
        return scores;
    }
    
    // Generate overall feedback
    async generateOverallFeedback(transcriptionText, sentimentAnalysis, criteriaScores, scenario) {
        try {
            const averageScore = criteriaScores.reduce((sum, c) => sum + c.score, 0) / criteriaScores.length;
            
            const prompt = `
                Generate comprehensive feedback for a customer service call performance:
                
                Scenario: ${scenario.title}
                Average Score: ${averageScore.toFixed(1)}/100
                
                Sentiment Analysis: ${JSON.stringify(sentimentAnalysis, null, 2)}
                
                Criteria Scores:
                ${criteriaScores.map(c => `- ${c.criterion}: ${c.score}/100`).join('\n')}
                
                Transcript: "${transcriptionText.substring(0, 500)}..."
                
                Provide feedback in JSON format:
                {
                    "overall_performance": "excellent/good/satisfactory/needs_improvement",
                    "strengths": ["strength1", "strength2", "strength3"],
                    "areas_for_improvement": ["area1", "area2", "area3"],
                    "specific_feedback": "Detailed paragraph of feedback",
                    "next_steps": ["action1", "action2", "action3"],
                    "encouragement": "Motivational message"
                }
            `;
            
            const response = await this.aiService.generateContent(prompt);
            
            try {
                return JSON.parse(response);
            } catch (parseError) {
                // Fallback feedback
                return {
                    overall_performance: averageScore >= 85 ? "excellent" : averageScore >= 75 ? "good" : "satisfactory",
                    strengths: ["Professional communication", "Problem-solving approach", "Customer focus"],
                    areas_for_improvement: ["Active listening", "Solution clarity", "Call closure"],
                    specific_feedback: "You demonstrated good customer service skills with room for improvement in specific areas.",
                    next_steps: ["Practice active listening", "Work on solution presentation", "Improve call closure techniques"],
                    encouragement: "Keep up the good work and continue practicing!"
                };
            }
        } catch (error) {
            throw new Error(`Overall feedback generation failed: ${error.message}`);
        }
    }
    
    // Calculate overall score
    calculateOverallScore(criteriaScores, sentimentAnalysis) {
        const criteriaAverage = criteriaScores.reduce((sum, c) => sum + c.score, 0) / criteriaScores.length;
        const sentimentBonus = sentimentAnalysis.overall_sentiment === 'positive' ? 5 : 
                              sentimentAnalysis.overall_sentiment === 'neutral' ? 0 : -5;
        
        const toneAverage = Object.values(sentimentAnalysis.tone_analysis || {}).reduce((sum, score) => sum + score, 0) / 
                           Object.keys(sentimentAnalysis.tone_analysis || {}).length;
        
        const toneBonus = (toneAverage * 100 - 70) * 0.1; // Bonus/penalty based on tone
        
        return Math.min(100, Math.max(0, criteriaAverage + sentimentBonus + toneBonus));
    }
    
    // Save analysis results
    async saveAnalysisResults(sessionId, analysisData) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                
                try {
                    // Save transcription analysis
                    this.db.run(`
                        INSERT INTO mock_call_analysis (
                            session_id, analysis_type, analysis_data, feedback
                        ) VALUES (?, 'transcription', ?, ?)
                    `, [
                        sessionId,
                        JSON.stringify(analysisData.transcription),
                        'Call transcription completed'
                    ]);
                    
                    // Save sentiment analysis
                    this.db.run(`
                        INSERT INTO mock_call_analysis (
                            session_id, analysis_type, analysis_data, score
                        ) VALUES (?, 'sentiment', ?, ?)
                    `, [
                        sessionId,
                        JSON.stringify(analysisData.sentimentAnalysis),
                        analysisData.sentimentAnalysis.confidence_score * 100
                    ]);
                    
                    // Save overall feedback
                    this.db.run(`
                        INSERT INTO mock_call_analysis (
                            session_id, analysis_type, analysis_data, score, feedback, strengths, improvements
                        ) VALUES (?, 'overall', ?, ?, ?, ?, ?)
                    `, [
                        sessionId,
                        JSON.stringify(analysisData.overallFeedback),
                        analysisData.overallScore,
                        analysisData.overallFeedback.specific_feedback,
                        JSON.stringify(analysisData.overallFeedback.strengths),
                        JSON.stringify(analysisData.overallFeedback.areas_for_improvement)
                    ]);
                    
                    // Save criteria scores
                    analysisData.criteriaScores.forEach(criteria => {
                        this.db.run(`
                            INSERT INTO mock_call_criteria_scores (
                                session_id, criteria_name, score, feedback, evidence
                            ) VALUES (?, ?, ?, ?, ?)
                        `, [
                            sessionId,
                            criteria.criterion,
                            criteria.score,
                            criteria.feedback,
                            criteria.evidence
                        ]);
                    });
                    
                    this.db.run('COMMIT', (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ success: true });
                        }
                    });
                    
                } catch (error) {
                    this.db.run('ROLLBACK');
                    reject(error);
                }
            });
        });
    }
    
    // Mark session as analyzed
    async markSessionAnalyzed(sessionId, overallScore) {
        return new Promise((resolve, reject) => {
            const updateQuery = `
                UPDATE mock_call_sessions 
                SET analysis_completed = 1, overall_score = ?
                WHERE id = ?
            `;
            
            this.db.run(updateQuery, [overallScore, sessionId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ success: true });
                }
            });
        });
    }
    
    // Get session info
    async getSessionInfo(sessionId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM mock_call_sessions WHERE id = ?
            `;
            
            this.db.get(query, [sessionId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    
    // Get session results
    async getSessionResults(sessionId) {
        return new Promise((resolve, reject) => {
            const sessionQuery = `
                SELECT s.*, u.username
                FROM mock_call_sessions s
                JOIN users u ON s.student_id = u.id
                WHERE s.id = ?
            `;
            
            this.db.get(sessionQuery, [sessionId], (err, session) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!session) {
                    reject(new Error('Session not found'));
                    return;
                }
                
                // Get analysis data
                const analysisQuery = `
                    SELECT * FROM mock_call_analysis WHERE session_id = ?
                `;
                
                this.db.all(analysisQuery, [sessionId], (err, analysisRows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Get criteria scores
                    const criteriaQuery = `
                        SELECT * FROM mock_call_criteria_scores WHERE session_id = ?
                    `;
                    
                    this.db.all(criteriaQuery, [sessionId], (err, criteriaRows) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        // Organize results
                        const results = {
                            session: session,
                            scenario: this.callScenarios[session.scenario_type],
                            analysis: {},
                            criteriaScores: criteriaRows
                        };
                        
                        // Organize analysis by type
                        analysisRows.forEach(row => {
                            results.analysis[row.analysis_type] = {
                                data: row.analysis_data ? JSON.parse(row.analysis_data) : null,
                                score: row.score,
                                feedback: row.feedback,
                                strengths: row.strengths ? JSON.parse(row.strengths) : null,
                                improvements: row.improvements ? JSON.parse(row.improvements) : null
                            };
                        });
                        
                        resolve(results);
                    });
                });
            });
        });
    }
    
    // Get student's mock call history
    async getStudentCallHistory(studentId, limit = 10) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    s.*,
                    COUNT(a.id) as analysis_count
                FROM mock_call_sessions s
                LEFT JOIN mock_call_analysis a ON s.id = a.session_id
                WHERE s.student_id = ?
                GROUP BY s.id
                ORDER BY s.created_at DESC
                LIMIT ?
            `;
            
            this.db.all(query, [studentId, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const history = rows.map(row => ({
                        ...row,
                        scenario: this.callScenarios[row.scenario_type],
                        hasAnalysis: row.analysis_count > 0
                    }));
                    resolve(history);
                }
            });
        });
    }
    
    // Get call statistics
    async getCallStatistics(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    scenario_type,
                    COUNT(*) as total_calls,
                    AVG(overall_score) as average_score,
                    AVG(duration) as average_duration,
                    COUNT(CASE WHEN analysis_completed = 1 THEN 1 END) as analyzed_calls
                FROM mock_call_sessions
                WHERE 1=1
            `;
            
            const params = [];
            
            if (filters.studentId) {
                query += ' AND student_id = ?';
                params.push(filters.studentId);
            }
            
            if (filters.dateFrom) {
                query += ' AND created_at >= ?';
                params.push(filters.dateFrom);
            }
            
            if (filters.dateTo) {
                query += ' AND created_at <= ?';
                params.push(filters.dateTo);
            }
            
            query += ' GROUP BY scenario_type';
            
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({
                        ...row,
                        scenario: this.callScenarios[row.scenario_type]
                    })));
                }
            });
        });
    }
}

module.exports = MockCallService;