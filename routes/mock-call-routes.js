const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const MockCallService = require('../mock_call_service');
const { authenticateToken: requireAuth, requireStudent } = require('../middleware/auth');
const Joi = require('joi');

// Initialize mock call service
const mockCallService = new MockCallService();

// Configure multer for call recordings
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'mock_calls', 'temp');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `temp_call_${uniqueSuffix}.wav`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'));
        }
    }
});

// Get available call scenarios
router.get('/scenarios', requireAuth, (req, res) => {
    try {
        const scenarios = mockCallService.getCallScenarios();
        res.json({
            success: true,
            scenarios: scenarios
        });
    } catch (error) {
        console.error('Error getting scenarios:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get scenarios'
        });
    }
});

// Start a new mock call session
router.post('/start', requireAuth, requireStudent, async (req, res) => {
    try {
        const schema = Joi.object({
            scenarioType: Joi.string().trim().required(),
            videoId: Joi.number().integer().optional()
        });
        const { value, error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, error: error.details[0].message });
        }
        const { scenarioType, videoId } = value;
        const studentId = req.user.id;
        
        if (!scenarioType) {
            return res.status(400).json({
                success: false,
                error: 'Scenario type is required'
            });
        }
        
        const session = await mockCallService.startMockCallSession(
            studentId, 
            scenarioType, 
            videoId
        );
        
        res.json({
            success: true,
            session: session
        });
        
    } catch (error) {
        console.error('Error starting mock call session:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to start session'
        });
    }
});

// Complete a mock call session with recording
router.post('/complete/:sessionId', requireAuth, requireStudent, upload.single('recording'), async (req, res) => {
    try {
        const paramsSchema = Joi.object({ sessionId: Joi.number().integer().required() });
        const { value: params, error: paramsError } = paramsSchema.validate(req.params);
        if (paramsError) {
            return res.status(400).json({ success: false, error: paramsError.details[0].message });
        }
        const { sessionId } = params;
        const studentId = req.user.id;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Recording file is required'
            });
        }
        
        // Verify session belongs to student
        const sessionInfo = await mockCallService.getSessionInfo(sessionId);
        if (!sessionInfo || sessionInfo.student_id !== studentId) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized access to session'
            });
        }
        
        const recordingData = {
            filePath: req.file.path,
            originalName: req.file.originalname,
            size: req.file.size
        };
        
        const result = await mockCallService.completeMockCallSession(sessionId, recordingData);
        
        // Clean up temp file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.json({
            success: true,
            result: result
        });
        
    } catch (error) {
        console.error('Error completing mock call session:', error);
        
        // Clean up temp file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to complete session'
        });
    }
});

// Get session results
router.get('/results/:sessionId', requireAuth, async (req, res) => {
    try {
        const paramsSchema = Joi.object({ sessionId: Joi.number().integer().required() });
        const { value: params, error: paramsError } = paramsSchema.validate(req.params);
        if (paramsError) {
            return res.status(400).json({ success: false, error: paramsError.details[0].message });
        }
        const { sessionId } = params;
        const userId = req.user.id;
        
        const results = await mockCallService.getSessionResults(sessionId);
        
        // Check if user has access to these results
        if (results.session.student_id !== userId && req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized access to results'
            });
        }
        
        res.json({
            success: true,
            results: results
        });
        
    } catch (error) {
        console.error('Error getting session results:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get results'
        });
    }
});

// Get student's call history
router.get('/history', requireAuth, requireStudent, async (req, res) => {
    try {
        const studentId = req.user.id;
        const querySchema = Joi.object({ limit: Joi.number().integer().min(1).max(100).default(10) });
        const { value: query, error: queryError } = querySchema.validate(req.query);
        if (queryError) {
            return res.status(400).json({ success: false, error: queryError.details[0].message });
        }
        const { limit } = query;
        
        const history = await mockCallService.getStudentCallHistory(studentId, limit);
        
        res.json({
            success: true,
            history: history
        });
        
    } catch (error) {
        console.error('Error getting call history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get call history'
        });
    }
});

// Get call statistics
router.get('/statistics', requireAuth, async (req, res) => {
    try {
        const filters = {};
        
        // Students can only see their own stats
        if (req.user.role === 'student') {
            filters.studentId = req.user.id;
        } else if (req.query.studentId) {
            filters.studentId = parseInt(req.query.studentId);
        }
        
        if (req.query.dateFrom) {
            filters.dateFrom = req.query.dateFrom;
        }
        
        if (req.query.dateTo) {
            filters.dateTo = req.query.dateTo;
        }
        
        const statistics = await mockCallService.getCallStatistics(filters);
        
        res.json({
            success: true,
            statistics: statistics
        });
        
    } catch (error) {
        console.error('Error getting call statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get statistics'
        });
    }
});

// Check session status
router.get('/session/:sessionId/status', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        
        const sessionInfo = await mockCallService.getSessionInfo(sessionId);
        
        if (!sessionInfo) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        // Check access permissions
        if (sessionInfo.student_id !== userId && req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized access'
            });
        }
        
        res.json({
            success: true,
            status: {
                sessionId: sessionInfo.id,
                status: sessionInfo.session_status,
                analysisCompleted: sessionInfo.analysis_completed,
                overallScore: sessionInfo.overall_score,
                duration: sessionInfo.duration,
                startedAt: sessionInfo.started_at,
                completedAt: sessionInfo.completed_at
            }
        });
        
    } catch (error) {
        console.error('Error checking session status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check session status'
        });
    }
});

// Trigger manual analysis (admin/instructor only)
router.post('/analyze/:sessionId', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }
        
        const { sessionId } = req.params;
        
        const sessionInfo = await mockCallService.getSessionInfo(sessionId);
        if (!sessionInfo) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        if (sessionInfo.session_status !== 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Session must be completed before analysis'
            });
        }
        
        // Start analysis in background
        mockCallService.analyzeCallRecording(sessionId)
            .then(result => {
                console.log(`✅ Manual analysis completed for session ${sessionId}`);
            })
            .catch(error => {
                console.error(`❌ Manual analysis failed for session ${sessionId}:`, error);
            });
        
        res.json({
            success: true,
            message: 'Analysis started',
            sessionId: sessionId
        });
        
    } catch (error) {
        console.error('Error triggering analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to trigger analysis'
        });
    }
});

// Get call recording (for playback)
router.get('/recording/:sessionId', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        
        const sessionInfo = await mockCallService.getSessionInfo(sessionId);
        
        if (!sessionInfo) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        // Check access permissions
        if (sessionInfo.student_id !== userId && req.user.role !== 'admin' && req.user.role !== 'instructor') {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized access'
            });
        }
        
        if (!sessionInfo.recording_path || !fs.existsSync(sessionInfo.recording_path)) {
            return res.status(404).json({
                success: false,
                error: 'Recording not found'
            });
        }
        
        // Set appropriate headers for audio streaming
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Disposition', `inline; filename="call_${sessionId}.wav"`);
        
        // Stream the file
        const fileStream = fs.createReadStream(sessionInfo.recording_path);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('Error serving recording:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve recording'
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'Mock Call System',
        status: 'operational',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
router.use((error, req, res, next) => {
    console.error('Mock Call Routes Error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 50MB.'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

module.exports = router;
