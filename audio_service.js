const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const OpenAI = require('openai');

class AudioService {
    constructor() {
        this.uploadsDir = path.join(__dirname, 'uploads', 'audio');
        this.ttsDir = path.join(__dirname, 'uploads', 'tts');
        this.tempDir = path.join(__dirname, 'temp');
        this.openaiKey = process.env.OPENAI_API_KEY || null;
        this.openai = this.openaiKey ? new OpenAI({ apiKey: this.openaiKey }) : null;
        this.enableTTS = process.env.ENABLE_TTS === 'true';
        
        // Ensure directories exist
        this.ensureDirectories();
        
        // Configure multer for audio uploads
        this.audioStorage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadsDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, `audio-${uniqueSuffix}.${this.getFileExtension(file.originalname)}`);
            }
        });
        
        this.audioUpload = multer({
            storage: this.audioStorage,
            limits: {
                fileSize: 50 * 1024 * 1024 // 50MB limit
            },
            fileFilter: (req, file, cb) => {
                if (this.isAudioFile(file)) {
                    cb(null, true);
                } else {
                    cb(new Error('Only audio files are allowed'), false);
                }
            }
        });
        
        // TTS Configuration
        this.ttsConfig = {
            model: 'tts_models/en/ljspeech/tacotron2-DDC',
            vocoder: 'vocoder_models/en/ljspeech/hifigan_v2',
            sampleRate: 22050,
            outputFormat: 'wav'
        };
        
        // Initialize TTS only if explicitly enabled
        if (this.enableTTS) {
            this.initializeTTS();
        }
    }
    
    // Ensure required directories exist
    ensureDirectories() {
        const dirs = [this.uploadsDir, this.ttsDir, this.tempDir];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    // Initialize TTS system
    async initializeTTS() {
        try {
            // Check if Coqui TTS is installed
            await this.checkTTSInstallation();
            console.log('✅ Coqui TTS is available');
        } catch (error) {
            console.warn('⚠️ Coqui TTS not available:', error.message);
            console.log('📝 To install Coqui TTS: pip install TTS');
        }
    }
    
    // Check if TTS is installed
    checkTTSInstallation() {
        return new Promise((resolve, reject) => {
            exec('tts --help', (error, stdout, stderr) => {
                if (error) {
                    reject(new Error('Coqui TTS not installed'));
                } else {
                    resolve(true);
                }
            });
        });
    }
    
    // Get file extension
    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }
    
    // Check if file is audio
    isAudioFile(file) {
        const audioMimeTypes = [
            'audio/mpeg',
            'audio/wav',
            'audio/wave',
            'audio/x-wav',
            'audio/mp3',
            'audio/mp4',
            'audio/aac',
            'audio/ogg',
            'audio/webm',
            'audio/flac'
        ];
        
        const audioExtensions = ['mp3', 'wav', 'wave', 'mp4', 'aac', 'ogg', 'webm', 'flac', 'm4a'];
        
        return audioMimeTypes.includes(file.mimetype) || 
               audioExtensions.includes(this.getFileExtension(file.originalname));
    }
    
    // Convert audio to standard format
    async convertAudioFormat(inputPath, outputPath, targetFormat = 'wav') {
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat(targetFormat)
                .audioCodec('pcm_s16le')
                .audioFrequency(16000)
                .audioChannels(1)
                .on('end', () => {
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    reject(new Error(`Audio conversion failed: ${err.message}`));
                })
                .save(outputPath);
        });
    }
    
    // Get audio duration
    async getAudioDuration(filePath) {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    reject(new Error(`Failed to get audio duration: ${err.message}`));
                } else {
                    const duration = metadata.format.duration;
                    resolve(Math.round(duration));
                }
            });
        });
    }
    
    // Generate speech from text using Coqui TTS
    async generateSpeech(text, options = {}) {
        if (!this.enableTTS) {
            return {
                success: false,
                error: 'TTS is disabled. Set ENABLE_TTS=true to enable.'
            };
        }
        try {
            const outputFilename = `tts-${Date.now()}-${Math.round(Math.random() * 1E9)}.wav`;
            const outputPath = path.join(this.ttsDir, outputFilename);
            
            const ttsOptions = {
                model: options.model || this.ttsConfig.model,
                vocoder: options.vocoder || this.ttsConfig.vocoder,
                text: text.replace(/["']/g, ''), // Clean text
                outputPath: outputPath,
                speed: options.speed || 1.0,
                pitch: options.pitch || 1.0
            };
            
            await this.runTTSCommand(ttsOptions);
            
            // Get audio duration
            const duration = await this.getAudioDuration(outputPath);
            
            return {
                success: true,
                audioPath: outputPath,
                filename: outputFilename,
                duration: duration,
                url: `/api/audio/tts/${outputFilename}`
            };
            
        } catch (error) {
            console.error('TTS generation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Run TTS command
    async runTTSCommand(options) {
        return new Promise((resolve, reject) => {
            const args = [
                '--text', `"${options.text}"`,
                '--model_name', options.model,
                '--vocoder_name', options.vocoder,
                '--out_path', options.outputPath
            ];
            
            if (options.speed !== 1.0) {
                args.push('--speed', options.speed.toString());
            }
            
            const ttsProcess = spawn('tts', args);
            
            let stderr = '';
            
            ttsProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            ttsProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`TTS process failed with code ${code}: ${stderr}`));
                }
            });
            
            ttsProcess.on('error', (error) => {
                reject(new Error(`Failed to start TTS process: ${error.message}`));
            });
        });
    }
    
    // Process uploaded audio file
    async processAudioUpload(file) {
        try {
            const originalPath = file.path;
            const convertedFilename = `converted-${Date.now()}.wav`;
            const convertedPath = path.join(this.uploadsDir, convertedFilename);
            
            // Convert to standard format
            await this.convertAudioFormat(originalPath, convertedPath);
            
            // Get duration
            const duration = await this.getAudioDuration(convertedPath);
            
            // Clean up original file if different
            if (originalPath !== convertedPath) {
                try { await fsp.unlink(originalPath); } catch {}
            }
            
            return {
                success: true,
                audioPath: convertedPath,
                filename: convertedFilename,
                duration: duration,
                url: `/api/audio/uploads/${convertedFilename}`,
                originalName: file.originalname,
                size: file.size
            };
            
        } catch (error) {
            console.error('Audio processing failed:', error);
            
            // Clean up file on error
            if (file.path) {
                try { await fsp.unlink(file.path); } catch {}
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Transcribe audio using external service or local model
    async transcribeAudio(audioPath) {
        try {
            const duration = await this.getAudioDuration(audioPath);
            if (!this.openai) {
                return {
                    success: true,
                    transcription: '[No STT key configured] Placeholder transcription.',
                    confidence: 0.0,
                    duration
                };
            }

            const stream = fs.createReadStream(audioPath);
            const resp = await this.openai.audio.transcriptions.create({
                file: stream,
                model: 'whisper-1'
            });
            const text = resp.text || resp.transcription || '';
            return {
                success: true,
                transcription: text,
                confidence: resp.confidence || null,
                duration
            };
        } catch (error) {
            console.error('STT transcription error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Analyze audio quality
    async analyzeAudioQuality(audioPath) {
        try {
            return new Promise((resolve, reject) => {
                ffmpeg.ffprobe(audioPath, (err, metadata) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                    
                    if (!audioStream) {
                        reject(new Error('No audio stream found'));
                        return;
                    }
                    
                    const quality = {
                        duration: parseFloat(metadata.format.duration),
                        bitrate: parseInt(metadata.format.bit_rate) || 0,
                        sampleRate: parseInt(audioStream.sample_rate) || 0,
                        channels: parseInt(audioStream.channels) || 0,
                        codec: audioStream.codec_name,
                        size: parseInt(metadata.format.size) || 0
                    };
                    
                    // Determine quality score
                    let score = 100;
                    if (quality.sampleRate < 16000) score -= 20;
                    if (quality.bitrate < 64000) score -= 15;
                    if (quality.channels < 1) score -= 10;
                    if (quality.duration < 1) score -= 25;
                    
                    quality.score = Math.max(0, score);
                    quality.rating = this.getQualityRating(quality.score);
                    
                    resolve(quality);
                });
            });
        } catch (error) {
            throw new Error(`Audio quality analysis failed: ${error.message}`);
        }
    }
    
    // Get quality rating
    getQualityRating(score) {
        if (score >= 90) return 'excellent';
        if (score >= 75) return 'good';
        if (score >= 60) return 'fair';
        if (score >= 40) return 'poor';
        return 'very_poor';
    }
    
    // Clean up old files
    async cleanupOldFiles(maxAgeHours = 24) {
        const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
        const now = Date.now();
        
        const directories = [this.uploadsDir, this.ttsDir, this.tempDir];
        
        for (const dir of directories) {
            try {
                const files = fs.readdirSync(dir);
                
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (now - stats.mtime.getTime() > maxAge) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Cleaned up old file: ${file}`);
                    }
                }
            } catch (error) {
                console.error(`Error cleaning up directory ${dir}:`, error);
            }
        }
    }
    
    // Get audio file info
    async getAudioInfo(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const duration = await this.getAudioDuration(filePath);
            const quality = await this.analyzeAudioQuality(filePath);
            
            return {
                exists: true,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                duration: duration,
                quality: quality
            };
        } catch (error) {
            return {
                exists: false,
                error: error.message
            };
        }
    }
    
    // Generate audio for test questions
    async generateQuestionAudio(questionText, questionId) {
        try {
            const cleanText = this.cleanTextForTTS(questionText);
            const result = await this.generateSpeech(cleanText, {
                speed: 0.9, // Slightly slower for questions
                pitch: 1.0
            });
            
            if (result.success) {
                // Store reference in database or cache
                return {
                    success: true,
                    questionId: questionId,
                    audioUrl: result.url,
                    duration: result.duration
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error(`Failed to generate audio for question ${questionId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Clean text for TTS
    cleanTextForTTS(text) {
        return text
            .replace(/[<>]/g, '') // Remove HTML-like brackets
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/["']/g, '') // Remove quotes
            .trim();
    }
    
    // Get multer middleware
    getUploadMiddleware() {
        return this.audioUpload.single('audio');
    }
    
    // Get multiple files middleware
    getMultipleUploadMiddleware(maxCount = 5) {
        return this.audioUpload.array('audio', maxCount);
    }
}

module.exports = AudioService;
