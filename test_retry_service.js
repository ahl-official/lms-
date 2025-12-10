const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class TestRetryService {
    constructor(dbPath = './lms_database.db') {
        this.dbPath = dbPath;
        this.db = new sqlite3.Database(this.dbPath);
        this.maxAttempts = 5;
        this.cooldownPeriods = {
            1: 0,        // No cooldown after 1st attempt
            2: 5,        // 5 minutes after 2nd attempt
            3: 15,       // 15 minutes after 3rd attempt
            4: 30,       // 30 minutes after 4th attempt
            5: 60        // 60 minutes after 5th attempt (final)
        };
        
        this.initializeRetryTracking();
    }
    
    // Initialize retry tracking tables
    async initializeRetryTracking() {
        return new Promise((resolve, reject) => {
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS test_retry_tracking (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER NOT NULL,
                    video_id INTEGER NOT NULL,
                    attempt_number INTEGER NOT NULL,
                    attempt_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    score REAL,
                    passed BOOLEAN DEFAULT FALSE,
                    time_taken INTEGER, -- in seconds
                    next_attempt_allowed DATETIME,
                    retry_reason TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (student_id) REFERENCES users(id),
                    FOREIGN KEY (video_id) REFERENCES videos(id),
                    UNIQUE(student_id, video_id, attempt_number)
                );
            `;
            
            this.db.run(createTableSQL, (err) => {
                if (err) {
                    console.error('Error creating test_retry_tracking table:', err);
                    reject(err);
                } else {
                    console.log('✅ Test retry tracking table initialized');
                    resolve();
                }
            });
        });
    }
    
    // Check if student can attempt the test
    async canAttemptTest(studentId, videoId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_attempts,
                    MAX(attempt_number) as last_attempt_number,
                    MAX(next_attempt_allowed) as next_allowed,
                    MAX(CASE WHEN passed = 1 THEN score ELSE NULL END) as best_passing_score,
                    MAX(score) as best_score,
                    COUNT(CASE WHEN passed = 1 THEN 1 END) as passed_attempts
                FROM test_retry_tracking 
                WHERE student_id = ? AND video_id = ?
            `;
            
            this.db.get(query, [studentId, videoId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const now = new Date();
                const totalAttempts = row.total_attempts || 0;
                const lastAttemptNumber = row.last_attempt_number || 0;
                const nextAllowed = row.next_allowed ? new Date(row.next_allowed) : null;
                const hasPassed = row.passed_attempts > 0;
                
                // Check if already passed
                if (hasPassed) {
                    resolve({
                        canAttempt: true, // Allow retaking even if passed
                        reason: 'already_passed',
                        attemptsUsed: totalAttempts,
                        attemptsRemaining: Math.max(0, this.maxAttempts - totalAttempts),
                        bestScore: row.best_passing_score,
                        nextAttemptNumber: totalAttempts + 1,
                        cooldownRemaining: 0,
                        hasPassed: true
                    });
                    return;
                }
                
                // Check if max attempts reached
                if (totalAttempts >= this.maxAttempts) {
                    resolve({
                        canAttempt: false,
                        reason: 'max_attempts_reached',
                        attemptsUsed: totalAttempts,
                        attemptsRemaining: 0,
                        bestScore: row.best_score,
                        nextAttemptNumber: null,
                        cooldownRemaining: 0,
                        hasPassed: false
                    });
                    return;
                }
                
                // Check cooldown period
                if (nextAllowed && now < nextAllowed) {
                    const cooldownRemaining = Math.ceil((nextAllowed - now) / (1000 * 60)); // minutes
                    resolve({
                        canAttempt: false,
                        reason: 'cooldown_active',
                        attemptsUsed: totalAttempts,
                        attemptsRemaining: this.maxAttempts - totalAttempts,
                        bestScore: row.best_score,
                        nextAttemptNumber: totalAttempts + 1,
                        cooldownRemaining: cooldownRemaining,
                        nextAllowedAt: nextAllowed,
                        hasPassed: false
                    });
                    return;
                }
                
                // Can attempt
                resolve({
                    canAttempt: true,
                    reason: 'allowed',
                    attemptsUsed: totalAttempts,
                    attemptsRemaining: this.maxAttempts - totalAttempts,
                    bestScore: row.best_score,
                    nextAttemptNumber: totalAttempts + 1,
                    cooldownRemaining: 0,
                    hasPassed: false
                });
            });
        });
    }
    
    // Record a test attempt
    async recordAttempt(studentId, videoId, attemptData) {
        return new Promise(async (resolve, reject) => {
            try {
                // Get current attempt status
                const canAttempt = await this.canAttemptTest(studentId, videoId);
                
                if (!canAttempt.canAttempt && canAttempt.reason !== 'already_passed') {
                    reject(new Error(`Cannot attempt test: ${canAttempt.reason}`));
                    return;
                }
                
                const attemptNumber = canAttempt.nextAttemptNumber;
                const score = attemptData.score || 0;
                const passed = score >= 70; // 70% passing threshold
                const timeTaken = attemptData.timeTaken || 0;
                
                // Calculate next attempt allowed time
                let nextAttemptAllowed = null;
                if (!passed && attemptNumber < this.maxAttempts) {
                    const cooldownMinutes = this.cooldownPeriods[attemptNumber] || 0;
                    if (cooldownMinutes > 0) {
                        nextAttemptAllowed = new Date(Date.now() + cooldownMinutes * 60 * 1000);
                    }
                }
                
                const insertQuery = `
                    INSERT INTO test_retry_tracking (
                        student_id, video_id, attempt_number, score, passed, 
                        time_taken, next_attempt_allowed, retry_reason, 
                        ip_address, user_agent
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                const values = [
                    studentId,
                    videoId,
                    attemptNumber,
                    score,
                    passed ? 1 : 0,
                    timeTaken,
                    nextAttemptAllowed ? nextAttemptAllowed.toISOString() : null,
                    attemptData.retryReason || null,
                    attemptData.ipAddress || null,
                    attemptData.userAgent || null
                ];
                
                this.db.run(insertQuery, values, function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    resolve({
                        success: true,
                        attemptId: this.lastID,
                        attemptNumber: attemptNumber,
                        score: score,
                        passed: passed,
                        nextAttemptAllowed: nextAttemptAllowed,
                        attemptsRemaining: Math.max(0, 5 - attemptNumber),
                        cooldownMinutes: nextAttemptAllowed ? 
                            Math.ceil((nextAttemptAllowed - new Date()) / (1000 * 60)) : 0
                    });
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // Get attempt history for a student and video
    async getAttemptHistory(studentId, videoId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    id,
                    attempt_number,
                    attempt_date,
                    score,
                    passed,
                    time_taken,
                    next_attempt_allowed,
                    retry_reason
                FROM test_retry_tracking 
                WHERE student_id = ? AND video_id = ?
                ORDER BY attempt_number ASC
            `;
            
            this.db.all(query, [studentId, videoId], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const history = rows.map(row => ({
                    id: row.id,
                    attemptNumber: row.attempt_number,
                    date: row.attempt_date,
                    score: row.score,
                    passed: row.passed === 1,
                    timeTaken: row.time_taken,
                    nextAttemptAllowed: row.next_attempt_allowed,
                    retryReason: row.retry_reason
                }));
                
                // Calculate statistics
                const stats = {
                    totalAttempts: history.length,
                    bestScore: Math.max(...history.map(h => h.score), 0),
                    averageScore: history.length > 0 ? 
                        history.reduce((sum, h) => sum + h.score, 0) / history.length : 0,
                    passedAttempts: history.filter(h => h.passed).length,
                    averageTime: history.length > 0 ? 
                        history.reduce((sum, h) => sum + (h.timeTaken || 0), 0) / history.length : 0,
                    improvementTrend: this.calculateImprovementTrend(history)
                };
                
                resolve({
                    history: history,
                    stats: stats
                });
            });
        });
    }
    
    // Calculate improvement trend
    calculateImprovementTrend(history) {
        if (history.length < 2) return 'insufficient_data';
        
        const scores = history.map(h => h.score);
        let improvements = 0;
        let declines = 0;
        
        for (let i = 1; i < scores.length; i++) {
            if (scores[i] > scores[i-1]) improvements++;
            else if (scores[i] < scores[i-1]) declines++;
        }
        
        if (improvements > declines) return 'improving';
        if (declines > improvements) return 'declining';
        return 'stable';
    }
    
    // Get retry statistics for admin/instructor
    async getRetryStatistics(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    v.title as video_title,
                    u.username,
                    COUNT(*) as total_attempts,
                    MAX(t.attempt_number) as max_attempt_number,
                    AVG(t.score) as average_score,
                    MAX(t.score) as best_score,
                    COUNT(CASE WHEN t.passed = 1 THEN 1 END) as passed_attempts,
                    MIN(t.attempt_date) as first_attempt,
                    MAX(t.attempt_date) as last_attempt
                FROM test_retry_tracking t
                JOIN users u ON t.student_id = u.id
                JOIN videos v ON t.video_id = v.id
                WHERE 1=1
            `;
            
            const params = [];
            
            if (filters.studentId) {
                query += ' AND t.student_id = ?';
                params.push(filters.studentId);
            }
            
            if (filters.videoId) {
                query += ' AND t.video_id = ?';
                params.push(filters.videoId);
            }
            
            if (filters.dateFrom) {
                query += ' AND t.attempt_date >= ?';
                params.push(filters.dateFrom);
            }
            
            if (filters.dateTo) {
                query += ' AND t.attempt_date <= ?';
                params.push(filters.dateTo);
            }
            
            query += ' GROUP BY t.student_id, t.video_id ORDER BY last_attempt DESC';
            
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Calculate overall statistics
                const overallStats = {
                    totalStudents: new Set(rows.map(r => r.username)).size,
                    totalVideos: new Set(rows.map(r => r.video_title)).size,
                    totalAttempts: rows.reduce((sum, r) => sum + r.total_attempts, 0),
                    averageAttemptsPerTest: rows.length > 0 ? 
                        rows.reduce((sum, r) => sum + r.total_attempts, 0) / rows.length : 0,
                    passRate: rows.length > 0 ? 
                        rows.filter(r => r.passed_attempts > 0).length / rows.length * 100 : 0,
                    multipleAttemptsRate: rows.length > 0 ? 
                        rows.filter(r => r.total_attempts > 1).length / rows.length * 100 : 0
                };
                
                resolve({
                    statistics: rows,
                    overallStats: overallStats
                });
            });
        });
    }
    
    // Reset attempts for a student (admin function)
    async resetAttempts(studentId, videoId, reason = 'Admin reset') {
        return new Promise((resolve, reject) => {
            const deleteQuery = `
                DELETE FROM test_retry_tracking 
                WHERE student_id = ? AND video_id = ?
            `;
            
            this.db.run(deleteQuery, [studentId, videoId], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                resolve({
                    success: true,
                    deletedAttempts: this.changes,
                    reason: reason
                });
            });
        });
    }
    
    // Extend attempts for a student (admin function)
    async extendAttempts(studentId, videoId, additionalAttempts, reason = 'Admin extension') {
        return new Promise(async (resolve, reject) => {
            try {
                // This would require modifying the max attempts logic
                // For now, we'll clear the cooldown to allow immediate retry
                const updateQuery = `
                    UPDATE test_retry_tracking 
                    SET next_attempt_allowed = NULL,
                        retry_reason = ?
                    WHERE student_id = ? AND video_id = ? 
                    AND id = (SELECT MAX(id) FROM test_retry_tracking 
                             WHERE student_id = ? AND video_id = ?)
                `;
                
                this.db.run(updateQuery, [reason, studentId, videoId, studentId, videoId], function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    resolve({
                        success: true,
                        message: 'Cooldown cleared, student can attempt immediately',
                        reason: reason
                    });
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // Get cooldown information
    async getCooldownInfo(studentId, videoId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    attempt_number,
                    next_attempt_allowed,
                    score,
                    passed
                FROM test_retry_tracking 
                WHERE student_id = ? AND video_id = ?
                ORDER BY attempt_number DESC
                LIMIT 1
            `;
            
            this.db.get(query, [studentId, videoId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    resolve({
                        hasCooldown: false,
                        canAttemptNow: true
                    });
                    return;
                }
                
                const now = new Date();
                const nextAllowed = row.next_attempt_allowed ? new Date(row.next_attempt_allowed) : null;
                
                if (!nextAllowed || now >= nextAllowed) {
                    resolve({
                        hasCooldown: false,
                        canAttemptNow: true,
                        lastAttempt: {
                            number: row.attempt_number,
                            score: row.score,
                            passed: row.passed === 1
                        }
                    });
                } else {
                    const remainingMinutes = Math.ceil((nextAllowed - now) / (1000 * 60));
                    resolve({
                        hasCooldown: true,
                        canAttemptNow: false,
                        remainingMinutes: remainingMinutes,
                        nextAllowedAt: nextAllowed,
                        lastAttempt: {
                            number: row.attempt_number,
                            score: row.score,
                            passed: row.passed === 1
                        }
                    });
                }
            });
        });
    }
    
    // Clean up old retry records
    async cleanupOldRecords(daysOld = 90) {
        return new Promise((resolve, reject) => {
            const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
            
            const deleteQuery = `
                DELETE FROM test_retry_tracking 
                WHERE attempt_date < ? AND passed = 0
            `;
            
            this.db.run(deleteQuery, [cutoffDate.toISOString()], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                resolve({
                    success: true,
                    deletedRecords: this.changes,
                    cutoffDate: cutoffDate
                });
            });
        });
    }
}

module.exports = TestRetryService;