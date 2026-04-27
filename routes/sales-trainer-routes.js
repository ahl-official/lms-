const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const SalesTrainingService = require('../services/sales-training-service');
const SalesPineconeService = require('../services/sales-pinecone-service');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');
const salesService = new SalesTrainingService(db);
const pineconeService = new SalesPineconeService(db);
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');

router.use(authenticateToken);

// --- Admin Endpoints ---

// Upload content
router.post('/admin/upload', upload.single('file'), async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { category, video_name, course_id = 1 } = req.body;
    if (!req.file || !category || !video_name) return res.status(400).json({ error: 'Missing fields' });

    try {
        const content = fs.readFileSync(req.file.path, 'utf8');
        const result = await pineconeService.processAndUpload(content, category, video_name, course_id);

        db.run('INSERT INTO sales_uploads (category, video_name, filename, chunks_created, uploaded_by, course_id) VALUES (?, ?, ?, ?, ?, ?)',
            [category, video_name, req.file.originalname, result.chunks, req.user.id, course_id],
            function(err) {
                fs.unlinkSync(req.file.path);
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json({ success: true, ...result });
            });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dashboard stats
router.get('/admin/dashboard', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const courseId = req.query.course_id || 1;
    // Simplified dashboard data for now
    db.all('SELECT * FROM users WHERE role = "student"', (err, users) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ candidates: users });
    });
});

// --- Training Endpoints ---

router.get('/courses', async (req, res) => {
    db.all('SELECT * FROM courses', (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ courses: rows });
    });
});

router.get('/categories', async (req, res) => {
    const courseId = req.query.course_id || 1;
    db.all('SELECT category, COUNT(DISTINCT video_name) as video_count FROM sales_uploads WHERE course_id = ? GROUP BY category', [courseId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ categories: rows.map(r => ({ name: r.category, video_count: r.video_count })) });
    });
});

router.post('/start', async (req, res) => {
    const { category, difficulty, duration_minutes, mode, course_id = 1 } = req.body;
    db.run('INSERT INTO sales_sessions (user_id, category, difficulty, duration_minutes, mode, course_id) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, category, difficulty, duration_minutes, mode, course_id], async function(err) {
            if (err) return res.status(500).json({ error: 'Failed to create session' });
            const sessionId = this.lastID;
            try {
                await salesService.prepareQuestions(sessionId, category, difficulty, duration_minutes, mode, course_id);
                res.json({ success: true, session_id: sessionId });
            } catch (error) {
                res.status(500).json({ error: 'Failed to prepare questions' });
            }
        });
});

router.post('/get-next-question', async (req, res) => {
    const { session_id } = req.body;
    db.get(`SELECT qb.* FROM sales_question_bank qb
            LEFT JOIN sales_evaluations se ON se.question_id = qb.id
            WHERE qb.session_id = ? AND se.id IS NULL
            ORDER BY qb.position ASC LIMIT 1`, [session_id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.json({ done: true });
        res.json({ done: false, question: row });
    });
});

router.post('/evaluate-answer', async (req, res) => {
    const { session_id, question_id, user_answer } = req.body;
    db.get('SELECT * FROM sales_question_bank WHERE id = ?', [question_id], async (err, question) => {
        if (err || !question) return res.status(404).json({ error: 'Question not found' });
        db.get('SELECT category FROM sales_sessions WHERE id = ?', [session_id], async (err, session) => {
            if (err || !session) return res.status(404).json({ error: 'Session not found' });
            const evaluation = await salesService.evaluateAnswer(session_id, question, user_answer, session.category);
            db.run(`INSERT INTO sales_evaluations (session_id, question_id, user_answer, overall_score, feedback, what_correct, what_missed)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [session_id, question_id, user_answer, evaluation.overall_score, evaluation.feedback, evaluation.what_correct, evaluation.what_missed],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Failed to save evaluation' });
                    res.json({ success: true, evaluation });
                });
        });
    });
});

router.post('/message', async (req, res) => {
    const { session_id, role, content, context_source, evaluation_data } = req.body;
    db.run('INSERT INTO sales_messages (session_id, role, content, context_source, evaluation_data) VALUES (?, ?, ?, ?, ?)',
        [session_id, role, content, context_source, evaluation_data ? JSON.stringify(evaluation_data) : null],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ success: true, message_id: this.lastID });
        });
});

router.post('/end', async (req, res) => {
    const { session_id } = req.body;
    db.run('UPDATE sales_sessions SET status = "completed", ended_at = CURRENT_TIMESTAMP WHERE id = ?', [session_id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true });
    });
});

router.get('/report/:session_id', async (req, res) => {
    const { session_id } = req.params;
    // Return a simple JSON report for now, frontend will render it
    db.get('SELECT * FROM sales_sessions WHERE id = ?', [session_id], (err, session) => {
        if (err || !session) return res.status(404).json({ error: 'Session not found' });
        db.all('SELECT * FROM sales_evaluations WHERE session_id = ?', [session_id], (err, evals) => {
            res.json({ success: true, session, evaluations: evals, report_html: "Report data loaded" });
        });
    });
});

router.get('/progress', async (req, res) => {
    res.json({ items: [{ label: 'Setup Account', completed: true }] });
});

router.get('/deepgram-token', async (req, res) => {
    res.json({ key: process.env.DEEPGRAM_API_KEY });
});

module.exports = router;
