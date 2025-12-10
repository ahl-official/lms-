const express = require('express');
const router = express.Router();
const AITestGenerator = require('../ai_test_generator');
const AITestScorer = require('../ai_test_scorer');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for audio file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/audio');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'));
        }
    }
});

// Initialize services
const testGenerator = new AITestGenerator();
const testScorer = new AITestScorer();

/**
 * Generate AI test for a video
 * POST /api/ai-test/generate
 */
router.post('/generate', authenticateToken, async (req, res) => {
    try {
        const { videoId, difficulty = 'medium', questionCount = 10 } = req.body;
        
        if (!videoId) {
            return res.status(400).json({ error: 'Video ID is required' });
        }
        
        // Check if user has admin privileges
        if (req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        console.log(`Generating AI test for video ${videoId}...`);
        
        const testId = await testGenerator.generateTestForVideo(
            videoId, 
            difficulty, 
            questionCount
        );
        
        res.json({ 
            success: true, 
            testId,
            message: 'AI test generated successfully'
        });
        
    } catch (error) {
        console.error('Error generating AI test:', error);
        res.status(500).json({ 
            error: 'Failed to generate AI test',
            details: error.message 
        });
    }
});

/**
 * Start a test attempt
 * POST /api/ai-test/start
 */
router.post('/start', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.body;
        const studentId = req.user.id;
        
        if (!videoId) {
            return res.status(400).json({ error: 'Video ID is required' });
        }
        
        console.log(`Starting test attempt for student ${studentId}, video ${videoId}`);
        
        const result = await testScorer.startTestAttempt(studentId, videoId);
        
        res.json({
            success: true,
            attemptId: result.attemptId,
            testDetails: result.testDetails,
            questions: result.questions,
            message: 'Test attempt started successfully'
        });
        
    } catch (error) {
        console.error('Error starting test attempt:', error);
        
        if (error.message.includes('No test found')) {
            return res.status(404).json({ 
                error: 'No test available for this video',
                details: error.message 
            });
        }
        
        if (error.message.includes('Maximum attempts')) {
            return res.status(429).json({ 
                error: 'Maximum attempts reached',
                details: error.message 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to start test attempt',
            details: error.message 
        });
    }
});

/**
 * Submit a single answer
 * POST /api/ai-test/answer
 */
router.post('/answer', authenticateToken, async (req, res) => {
    try {
        const { attemptId, questionId, answer } = req.body;
        const studentId = req.user.id;
        
        if (!attemptId || !questionId || answer === undefined) {
            return res.status(400).json({ 
                error: 'Attempt ID, question ID, and answer are required' 
            });
        }
        
        await testScorer.submitAnswer(attemptId, questionId, answer);
        
        res.json({ 
            success: true,
            message: 'Answer submitted successfully'
        });
        
    } catch (error) {
        console.error('Error submitting answer:', error);
        res.status(500).json({ 
            error: 'Failed to submit answer',
            details: error.message 
        });
    }
});

/**
 * Submit audio answer
 * POST /api/ai-test/audio-answer
 */
router.post('/audio-answer', authenticateToken, upload.single('audio'), async (req, res) => {
    try {
        const { attemptId, questionId } = req.body;
        const studentId = req.user.id;
        
        if (!attemptId || !questionId || !req.file) {
            return res.status(400).json({ 
                error: 'Attempt ID, question ID, and audio file are required' 
            });
        }
        
        const audioPath = req.file.path;
        // For audio questions, pass (attemptId, questionId, audioPath)
        const scoreResult = await testScorer.submitAnswer(attemptId, questionId, audioPath);
        
        res.json({ 
            success: true,
            message: 'Audio answer submitted successfully',
            score: {
                pointsEarned: scoreResult.pointsEarned,
                isCorrect: scoreResult.isCorrect,
                feedback: scoreResult.feedback
            }
        });
        
    } catch (error) {
        console.error('Error submitting audio answer:', error);
        
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            error: 'Failed to submit audio answer',
            details: error.message 
        });
    }
});

/**
 * Submit entire test
 * POST /api/ai-test/submit
 */
router.post('/submit', authenticateToken, async (req, res) => {
    try {
        const { attemptId, answers } = req.body;
        const studentId = req.user.id;
        
        if (!attemptId || !answers) {
            return res.status(400).json({ 
                error: 'Attempt ID and answers are required' 
            });
        }
        
        console.log(`Submitting test for student ${studentId}, attempt ${attemptId}`);
        
        // Submit all answers
        for (const [questionId, answer] of Object.entries(answers)) {
            if (answer !== null && answer !== undefined && answer !== '') {
                await testScorer.submitAnswer(attemptId, questionId, answer);
            }
        }
        
        // Score the test
        const result = await testScorer.scoreTest(attemptId);
        
        res.json({
            success: true,
            ...result,
            message: 'Test submitted and scored successfully'
        });
        
    } catch (error) {
        console.error('Error submitting test:', error);
        res.status(500).json({ 
            error: 'Failed to submit test',
            details: error.message 
        });
    }
});

/**
 * Get test results
 * GET /api/ai-test/results/:attemptId
 */
router.get('/results/:attemptId', authenticateToken, async (req, res) => {
    try {
        const { attemptId } = req.params;
        const studentId = req.user.id;
        
        const results = await testScorer.getTestResults(attemptId, studentId);
        
        res.json({
            success: true,
            results
        });
        
    } catch (error) {
        console.error('Error getting test results:', error);
        res.status(500).json({ 
            error: 'Failed to get test results',
            details: error.message 
        });
    }
});

/**
 * Get student's test history for a video
 * GET /api/ai-test/history/:videoId
 */
router.get('/history/:videoId', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.params;
        const studentId = req.user.id;
        
        const history = await testScorer.getStudentTestHistory(studentId, videoId);
        
        res.json({
            success: true,
            history
        });
        
    } catch (error) {
        console.error('Error getting test history:', error);
        res.status(500).json({ 
            error: 'Failed to get test history',
            details: error.message 
        });
    }
});

/**
 * Check if student can take test
 * GET /api/ai-test/can-take/:videoId
 */
router.get('/can-take/:videoId', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.params;
        const studentId = req.user.id;
        
        const canTake = await testScorer.canStudentTakeTest(studentId, videoId);
        
        res.json({
            success: true,
            canTake: canTake.allowed,
            reason: canTake.reason,
            attemptsRemaining: canTake.attemptsRemaining,
            lastAttemptScore: canTake.lastAttemptScore
        });
        
    } catch (error) {
        console.error('Error checking test eligibility:', error);
        res.status(500).json({ 
            error: 'Failed to check test eligibility',
            details: error.message 
        });
    }
});

/**
 * Get test statistics (admin/instructor only)
 * GET /api/ai-test/stats/:videoId
 */
router.get('/stats/:videoId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        const { videoId } = req.params;
        
        const stats = await testScorer.getTestStatistics(videoId);
        
        res.json({
            success: true,
            stats
        });
        
    } catch (error) {
        console.error('Error getting test statistics:', error);
        res.status(500).json({ 
            error: 'Failed to get test statistics',
            details: error.message 
        });
    }
});

/**
 * Regenerate test questions (admin/instructor only)
 * POST /api/ai-test/regenerate
 */
router.post('/regenerate', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        const { videoId, difficulty = 'medium', questionCount = 10 } = req.body;
        
        if (!videoId) {
            return res.status(400).json({ error: 'Video ID is required' });
        }
        
        console.log(`Regenerating AI test for video ${videoId}...`);
        
        // Delete existing test
        await testGenerator.deleteTestForVideo(videoId);
        
        // Generate new test
        const testId = await testGenerator.generateTestForVideo(
            videoId, 
            difficulty, 
            questionCount
        );
        
        res.json({ 
            success: true, 
            testId,
            message: 'AI test regenerated successfully'
        });
        
    } catch (error) {
        console.error('Error regenerating AI test:', error);
        res.status(500).json({ 
            error: 'Failed to regenerate AI test',
            details: error.message 
        });
    }
});

/**
 * Bulk generate tests for all videos (admin only)
 * POST /api/ai-test/bulk-generate
 */
router.post('/bulk-generate', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { difficulty = 'medium', questionCount = 10, courseId } = req.body;
        
        console.log('Starting bulk test generation...');
        
        const results = await testGenerator.bulkGenerateTests(
            difficulty, 
            questionCount, 
            courseId
        );
        
        res.json({ 
            success: true, 
            results,
            message: `Bulk test generation completed. Generated ${results.successful} tests, ${results.failed} failed.`
        });
        
    } catch (error) {
        console.error('Error in bulk test generation:', error);
        res.status(500).json({ 
            error: 'Failed to bulk generate tests',
            details: error.message 
        });
    }
});

/**
 * Get test preview (admin/instructor only)
 * GET /api/ai-test/preview/:videoId
 */
router.get('/preview/:videoId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        const { videoId } = req.params;
        
        const preview = await testGenerator.getTestPreview(videoId);
        
        res.json({
            success: true,
            preview
        });
        
    } catch (error) {
        console.error('Error getting test preview:', error);
        res.status(500).json({ 
            error: 'Failed to get test preview',
            details: error.message 
        });
    }
});

/**
 * Update test completion requirements
 * PUT /api/ai-test/requirements/:videoId
 */
router.put('/requirements/:videoId', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        const { videoId } = req.params;
        const { passingScore, maxAttempts, timeLimit, isRequired } = req.body;
        
        await testScorer.updateTestRequirements(videoId, {
            passingScore,
            maxAttempts,
            timeLimit,
            isRequired
        });
        
        res.json({
            success: true,
            message: 'Test requirements updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating test requirements:', error);
        res.status(500).json({ 
            error: 'Failed to update test requirements',
            details: error.message 
        });
    }
});

module.exports = router;
