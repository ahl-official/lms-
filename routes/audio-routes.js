const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const AudioService = require('../audio_service');
const { authenticateToken: requireAuth } = require('../middleware/auth');
const Joi = require('joi');

const router = express.Router();
const audioService = new AudioService();

// Basic filename sanitization to prevent traversal
function sanitizeFilename(filename) {
    const base = path.basename(filename);
    const isValid = /^[A-Za-z0-9._-]+$/.test(base);
    return isValid ? base : null;
}

// Middleware for all audio routes
router.use(requireAuth);

// Upload audio file
router.post('/upload', audioService.getUploadMiddleware(), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }
        
        const result = await audioService.processAudioUpload(req.file);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Audio uploaded successfully',
                audio: {
                    filename: result.filename,
                    url: result.url,
                    duration: result.duration,
                    originalName: result.originalName,
                    size: result.size
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
        
    } catch (error) {
        console.error('Audio upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload audio file'
        });
    }
});

// Upload multiple audio files
router.post('/upload-multiple', audioService.getMultipleUploadMiddleware(5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No audio files provided'
            });
        }
        
        const results = [];
        
        for (const file of req.files) {
            const result = await audioService.processAudioUpload(file);
            results.push({
                originalName: file.originalname,
                result: result
            });
        }
        
        const successful = results.filter(r => r.result.success);
        const failed = results.filter(r => !r.result.success);
        
        res.json({
            success: true,
            message: `Processed ${results.length} files: ${successful.length} successful, ${failed.length} failed`,
            results: {
                successful: successful.map(r => ({
                    originalName: r.originalName,
                    filename: r.result.filename,
                    url: r.result.url,
                    duration: r.result.duration
                })),
                failed: failed.map(r => ({
                    originalName: r.originalName,
                    error: r.result.error
                }))
            }
        });
        
    } catch (error) {
        console.error('Multiple audio upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload audio files'
        });
    }
});

// Generate speech from text (TTS)
router.post('/tts/generate', async (req, res) => {
    try {
        const schema = Joi.object({
            text: Joi.string().trim().min(1).max(1000).required(),
            options: Joi.object().optional()
        });
        const { value, error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, error: error.details[0].message });
        }
        const { text, options = {} } = value;
        
        if (!text || text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Text is required for TTS generation'
            });
        }
        
        if (text.length > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Text is too long (max 1000 characters)'
            });
        }
        
        const result = await audioService.generateSpeech(text, options);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Speech generated successfully',
                audio: {
                    filename: result.filename,
                    url: result.url,
                    duration: result.duration
                },
                text: text
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'TTS generation failed'
            });
        }
        
    } catch (error) {
        console.error('TTS generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate speech'
        });
    }
});

// Generate audio for test question
router.post('/tts/question/:questionId', async (req, res) => {
    try {
        const paramsSchema = Joi.object({ questionId: Joi.number().integer().required() });
        const bodySchema = Joi.object({ questionText: Joi.string().trim().min(1).required() });
        const { value: params, error: paramsError } = paramsSchema.validate(req.params);
        const { value: body, error: bodyError } = bodySchema.validate(req.body);
        if (paramsError || bodyError) {
            const err = paramsError || bodyError;
            return res.status(400).json({ success: false, error: err.details[0].message });
        }
        const { questionId } = params;
        const { questionText } = body;
        
        if (!questionText) {
            return res.status(400).json({
                success: false,
                error: 'Question text is required'
            });
        }
        
        const result = await audioService.generateQuestionAudio(questionText, questionId);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Question audio generated successfully',
                questionId: result.questionId,
                audioUrl: result.audioUrl,
                duration: result.duration
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
        
    } catch (error) {
        console.error('Question audio generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate question audio'
        });
    }
});

// Transcribe audio file
router.post('/transcribe', audioService.getUploadMiddleware(), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided for transcription'
            });
        }
        
        const processResult = await audioService.processAudioUpload(req.file);
        
        if (!processResult.success) {
            return res.status(400).json({
                success: false,
                error: processResult.error
            });
        }
        
        const transcriptionResult = await audioService.transcribeAudio(processResult.audioPath);
        
        if (transcriptionResult.success) {
            res.json({
                success: true,
                message: 'Audio transcribed successfully',
                transcription: transcriptionResult.transcription,
                confidence: transcriptionResult.confidence,
                duration: transcriptionResult.duration,
                audio: {
                    filename: processResult.filename,
                    url: processResult.url
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: transcriptionResult.error
            });
        }
        
    } catch (error) {
        console.error('Audio transcription error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to transcribe audio'
        });
    }
});

// Analyze audio quality
router.post('/analyze', audioService.getUploadMiddleware(), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided for analysis'
            });
        }
        
        const processResult = await audioService.processAudioUpload(req.file);
        
        if (!processResult.success) {
            return res.status(400).json({
                success: false,
                error: processResult.error
            });
        }
        
        const quality = await audioService.analyzeAudioQuality(processResult.audioPath);
        
        res.json({
            success: true,
            message: 'Audio analyzed successfully',
            quality: quality,
            audio: {
                filename: processResult.filename,
                url: processResult.url,
                duration: processResult.duration
            }
        });
        
    } catch (error) {
        console.error('Audio analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze audio'
        });
    }
});

// Get audio file info
router.get('/info/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const safe = sanitizeFilename(filename);
        if (!safe) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }
        
        // Check in uploads directory
        let filePath = path.join(audioService.uploadsDir, safe);
        let info = await audioService.getAudioInfo(filePath);
        
        if (!info.exists) {
            // Check in TTS directory
            filePath = path.join(audioService.ttsDir, safe);
            info = await audioService.getAudioInfo(filePath);
        }
        
        if (info.exists) {
            res.json({
                success: true,
                filename: safe,
                info: info
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Audio file not found'
            });
        }
        
    } catch (error) {
        console.error('Audio info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get audio info'
        });
    }
});

// Serve uploaded audio files
router.get('/uploads/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const safe = sanitizeFilename(filename);
        if (!safe) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }
        const filePath = path.join(audioService.uploadsDir, safe);
        try {
            await fsp.access(filePath);
        } catch {
            return res.status(404).json({ success: false, error: 'Audio file not found' });
        }
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Disposition', `inline; filename="${safe}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        // Stream the file
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        
    } catch (error) {
        console.error('Audio serve error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve audio file'
        });
    }
});

// Serve TTS generated audio files
router.get('/tts/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const safe = sanitizeFilename(filename);
        if (!safe) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }
        const filePath = path.join(audioService.ttsDir, safe);
        try {
            await fsp.access(filePath);
        } catch {
            return res.status(404).json({ success: false, error: 'TTS audio file not found' });
        }
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Disposition', `inline; filename="${safe}"`);
        res.setHeader('Cache-Control', 'public, max-age=7200'); // Cache for 2 hours
        
        // Stream the file
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        
    } catch (error) {
        console.error('TTS audio serve error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to serve TTS audio file'
        });
    }
});

// Delete audio file
router.delete('/:type/:filename', async (req, res) => {
    try {
        const { type, filename } = req.params;
        const safe = sanitizeFilename(filename);
        if (!safe) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }
        
        let filePath;
        if (type === 'uploads') {
            filePath = path.join(audioService.uploadsDir, safe);
        } else if (type === 'tts') {
            filePath = path.join(audioService.ttsDir, safe);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid audio type. Use "uploads" or "tts"'
            });
        }
        
        try {
            await fsp.access(filePath);
        } catch {
            return res.status(404).json({ success: false, error: 'Audio file not found' });
        }
        await fsp.unlink(filePath);
        
        res.json({
            success: true,
            message: 'Audio file deleted successfully',
            filename: safe
        });
        
    } catch (error) {
        console.error('Audio delete error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete audio file'
        });
    }
});

// Clean up old files
router.post('/cleanup', async (req, res) => {
    try {
        const schema = Joi.object({ maxAgeHours: Joi.number().integer().min(1).max(168).default(24) });
        const { value, error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, error: error.details[0].message });
        }
        const { maxAgeHours } = value;
        
        await audioService.cleanupOldFiles(maxAgeHours);
        
        res.json({
            success: true,
            message: `Cleanup completed for files older than ${maxAgeHours} hours`
        });
        
    } catch (error) {
        console.error('Audio cleanup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup audio files'
        });
    }
});

// Get audio statistics
router.get('/stats', async (req, res) => {
    try {
        const uploadsDir = audioService.uploadsDir;
        const ttsDir = audioService.ttsDir;
        
        const getDirectoryStats = async (dir) => {
            try {
                const files = await fsp.readdir(dir);
                let totalSize = 0;
                let totalFiles = files.length;
                
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stats = await fsp.stat(filePath);
                    totalSize += stats.size;
                }
                
                return {
                    totalFiles,
                    totalSize,
                    totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
                };
            } catch (error) {
                return {
                    totalFiles: 0,
                    totalSize: 0,
                    totalSizeMB: 0,
                    error: error.message
                };
            }
        };
        
        const uploadsStats = await getDirectoryStats(uploadsDir);
        const ttsStats = await getDirectoryStats(ttsDir);
        
        res.json({
            success: true,
            stats: {
                uploads: uploadsStats,
                tts: ttsStats,
                total: {
                    totalFiles: uploadsStats.totalFiles + ttsStats.totalFiles,
                    totalSize: uploadsStats.totalSize + ttsStats.totalSize,
                    totalSizeMB: uploadsStats.totalSizeMB + ttsStats.totalSizeMB
                }
            }
        });
        
    } catch (error) {
        console.error('Audio stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get audio statistics'
        });
    }
});

// Health check for audio services
router.get('/health', async (req, res) => {
    try {
        const health = {
            audioService: 'ok',
            uploadsDirectory: fs.existsSync(audioService.uploadsDir),
            ttsDirectory: fs.existsSync(audioService.ttsDir),
            tempDirectory: fs.existsSync(audioService.tempDir)
        };
        
        // Check TTS availability
        try {
            await audioService.checkTTSInstallation();
            health.ttsAvailable = true;
        } catch (error) {
            health.ttsAvailable = false;
            health.ttsError = error.message;
        }
        
        const allHealthy = Object.values(health).every(v => v === true || v === 'ok');
        
        res.status(allHealthy ? 200 : 503).json({
            success: allHealthy,
            health: health
        });
        
    } catch (error) {
        console.error('Audio health check error:', error);
        res.status(500).json({
            success: false,
            error: 'Health check failed'
        });
    }
});

module.exports = router;
