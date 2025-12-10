const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// We need to access the services initialized in server.js or create new instances
// Since we can't easily access the instances from server.js without exporting them, 
// we'll instantiate them here or pass them via middleware. 
// For this architecture, it's better to instantiate them if they are stateless or manage their own DB connection.
// AIService and AdaptiveLearningService manage their own DB connections.

const AIService = require('../ai_service');
const aiService = new AIService();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

// --- Flashcards ---

// Generate Flashcards
router.post('/flashcards/generate', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.body;
        if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

        // Get video details and transcript
        const video = await aiService.getVideoDetails(videoId);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const transcriptData = await aiService.getTranscript(videoId);
        if (!transcriptData || !transcriptData.transcript_text) {
            return res.status(400).json({ error: 'Transcript not available for this video' });
        }

        const flashcards = await aiService.generateFlashcards(videoId, video.title, transcriptData.transcript_text);
        res.json({ success: true, flashcards });

    } catch (error) {
        console.error('Error generating flashcards:', error);
        res.status(500).json({ error: 'Failed to generate flashcards' });
    }
});

// Get Flashcards
router.get('/flashcards/:videoId', authenticateToken, (req, res) => {
    const { videoId } = req.params;
    db.all('SELECT * FROM flashcards WHERE video_id = ? ORDER BY created_at DESC', [videoId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true, flashcards: rows });
    });
});

// --- AI Notes ---

// Generate Notes
router.post('/notes/generate', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.body;
        const userId = req.user.id;

        if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

        // Get video details and transcript
        const video = await aiService.getVideoDetails(videoId);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const transcriptData = await aiService.getTranscript(videoId);
        if (!transcriptData || !transcriptData.transcript_text) {
            return res.status(400).json({ error: 'Transcript not available for this video' });
        }

        const notes = await aiService.generateNotes(videoId, video.title, transcriptData.transcript_text, userId);
        res.json({ success: true, notes });

    } catch (error) {
        console.error('Error generating notes:', error);
        res.status(500).json({ error: 'Failed to generate notes' });
    }
});

// Get Notes
router.get('/notes/:videoId', authenticateToken, (req, res) => {
    const { videoId } = req.params;
    const userId = req.user.id;

    db.get('SELECT * FROM student_notes WHERE video_id = ? AND user_id = ?', [videoId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true, notes: row });
    });
});

// Save/Update Notes (Manual edit)
router.post('/notes/save', authenticateToken, (req, res) => {
    const { videoId, content } = req.body;
    const userId = req.user.id;

    if (!videoId || !content) return res.status(400).json({ error: 'Video ID and content are required' });

    const aiServiceInstance = new AIService(); // Or use the existing one if it exposes saveNotes
    // Since saveNotes is in AIService, let's use it.
    // Note: We are re-instantiating AIService which might be inefficient but works for now. 
    // Better to use the one imported at top if possible, but `aiService` variable is available.

    aiService.saveNotes(videoId, userId, content, false)
        .then(() => res.json({ success: true }))
        .catch(err => {
            console.error('Error saving notes:', err);
            res.status(500).json({ error: 'Failed to save notes' });
        });
});

// --- Visual Aids ---

// Generate Visual Aid
router.post('/visuals/generate', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.body;
        if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

        const video = await aiService.getVideoDetails(videoId);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const transcriptData = await aiService.getTranscript(videoId);
        if (!transcriptData || !transcriptData.transcript_text) {
            return res.status(400).json({ error: 'Transcript not available for this video' });
        }

        const visualCode = await aiService.generateVisualAid(videoId, video.title, transcriptData.transcript_text);
        res.json({ success: true, visualCode });

    } catch (error) {
        console.error('Error generating visual aid:', error);
        res.status(500).json({ error: 'Failed to generate visual aid' });
    }
});

// Get Visual Aids
router.get('/visuals/:videoId', authenticateToken, (req, res) => {
    const { videoId } = req.params;
    db.get('SELECT * FROM visual_aids WHERE video_id = ? ORDER BY created_at DESC LIMIT 1', [videoId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true, visualAid: row });
    });
});

// --- Mind Maps ---

// Generate Mind Map
router.post('/mindmap/generate', authenticateToken, async (req, res) => {
    try {
        const { videoId } = req.body;
        const userId = req.user.id;
        if (!videoId) return res.status(400).json({ error: 'Video ID is required' });

        const video = await aiService.getVideoDetails(videoId);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const transcriptData = await aiService.getTranscript(videoId);
        if (!transcriptData || !transcriptData.transcript_text) {
            return res.status(400).json({ error: 'Transcript not available for this video' });
        }

        const mindMapData = await aiService.generateMindMap(videoId, video.title, transcriptData.transcript_text, userId);
        res.json({ success: true, mindMapData });

    } catch (error) {
        console.error('Error generating mind map:', error);
        res.status(500).json({ error: 'Failed to generate mind map' });
    }
});

// Get Mind Map
router.get('/mindmap/:videoId', authenticateToken, (req, res) => {
    const { videoId } = req.params;
    const userId = req.user.id;
    db.get('SELECT * FROM mind_maps WHERE video_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1', [videoId, userId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true, mindMap: row });
    });
});

module.exports = router;
