const OpenAI = require('openai');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const GumletService = require('./gumlet_service');
const OpenRouterService = require('./openrouter_service');
const ffmpegStatic = require('ffmpeg-static');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class AIService {
    constructor() {
        this.db = new sqlite3.Database('./lms_database.db');
        this.openai = null;
        this.openrouter = null;
        this.gumletService = new GumletService(this.db);
        this.initializeAIServices();
    }

    async initializeAIServices() {
        try {
            // Initialize OpenAI
            const openaiKey = await this.getSetting('openai_api_key');
            if (openaiKey) {
                this.openai = new OpenAI({
                    apiKey: openaiKey
                });
                console.log('✓ OpenAI API initialized successfully');
            } else {
                console.log('⚠️ OpenAI API key not found in settings');
            }

            // Initialize OpenRouter
            const openrouterKey = await this.getSetting('openrouter_api_key');
            if (openrouterKey) {
                this.openrouter = new OpenRouterService(openrouterKey);
                console.log('✓ OpenRouter API initialized successfully');
            } else {
                console.log('⚠️ OpenRouter API key not found in settings');
            }
        } catch (error) {
            console.error('❌ Failed to initialize AI services:', error);
        }
    }

    // Method to initialize with specific API keys
    initialize(openaiKey = null, openrouterKey = null) {
        if (openaiKey) {
            this.openai = new OpenAI({
                apiKey: openaiKey
            });
            console.log('✓ OpenAI API initialized with provided key');
        }

        if (openrouterKey) {
            this.openrouter = new OpenRouterService(openrouterKey);
            console.log('✓ OpenRouter API initialized with provided key');
        }
    }

    // Get current AI provider setting
    async getCurrentProvider() {
        return await this.getSetting('default_ai_provider') || 'openai';
    }

    // Get current model for a provider
    async getCurrentModel(provider = null) {
        if (!provider) {
            provider = await this.getCurrentProvider();
        }

        if (provider === 'openrouter') {
            return await this.getSetting('default_openrouter_model') || 'deepseek/deepseek-chat-v3.1:free';
        } else {
            return await this.getSetting('default_openai_model') || 'gpt-4';
        }
    }

    // Check availability of an AI provider instance
    isProviderAvailable(provider) {
        if (provider === 'openai') return !!this.openai;
        if (provider === 'openrouter') return !!this.openrouter;
        return false;
    }

    // Centralized safe provider/model selection with graceful fallback
    async getSafeProviderAndModel(preferredProvider = null, preferredModel = null) {
        const openaiAvailable = !!this.openai;
        const openrouterAvailable = !!this.openrouter;

        let provider = preferredProvider || await this.getCurrentProvider();
        let fallbackUsed = false;

        if (!this.isProviderAvailable(provider)) {
            // Prefer OpenAI by default if available; otherwise use OpenRouter
            provider = openaiAvailable ? 'openai' : (openrouterAvailable ? 'openrouter' : null);
            fallbackUsed = true;
        }

        if (!provider) {
            throw new Error('No AI provider available. Please configure OpenAI or OpenRouter API keys in Settings.');
        }

        let model = preferredModel || await this.getCurrentModel(provider);

        // Final model sanity defaults
        if (provider === 'openai' && !model) {
            model = 'gpt-4';
        }
        if (provider === 'openrouter' && !model) {
            model = 'deepseek/deepseek-chat-v3.1:free';
        }

        return { provider, model, fallbackUsed };
    }

    // Get available models for a provider
    getAvailableModels(provider) {
        if (provider === 'openrouter' && this.openrouter) {
            return this.openrouter.getModels();
        } else if (provider === 'openai') {
            return [
                { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
                { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
                { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' }
            ];
        }
        return [];
    }

    // Helper method to get settings from database
    getSetting(key) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.setting_value : null);
                }
            });
        });
    }

    // Helper method to update settings
    updateSetting(key, value) {
        return new Promise((resolve, reject) => {
            this.db.run('INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                [key, value], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
        });
    }

    // Extract audio from Gumlet video URL
    async extractAudioFromGumletUrl(gumletUrl, outputPath) {
        try {
            console.log('Extracting audio from Gumlet URL:', gumletUrl);

            // Extract video ID from Gumlet URL
            const videoIdMatch = gumletUrl.match(/embed\/(\w+)/);
            if (!videoIdMatch) {
                throw new Error('Invalid Gumlet URL format');
            }

            const videoId = videoIdMatch[1];
            console.log('Extracted video ID:', videoId);

            // Try multiple potential direct video URL formats
            const possibleUrls = [
                `https://video.gumlet.io/${videoId}/mp4/720.mp4`,
                `https://video.gumlet.io/${videoId}/main.mp4`,
                `https://video.gumlet.io/${videoId}.mp4`,
                `https://assets.gumlet.io/${videoId}/mp4/720.mp4`
            ];

            // Try each URL until one works
            for (const directVideoUrl of possibleUrls) {
                try {
                    console.log('Trying URL:', directVideoUrl);
                    await this.extractAudioWithUrl(directVideoUrl, outputPath);
                    console.log('✓ Audio extraction completed with URL:', directVideoUrl);
                    return outputPath;
                } catch (error) {
                    console.log('Failed with URL:', directVideoUrl, 'Error:', error.message);
                    continue;
                }
            }

            // If all direct URLs fail, try using yt-dlp as fallback
            console.log('All direct URLs failed, trying yt-dlp fallback...');
            return await this.extractAudioWithYtDlp(gumletUrl, outputPath);

        } catch (error) {
            console.error('❌ Error extracting audio:', error);
            throw new Error(`Audio extraction failed: ${error.message}. This may be due to Gumlet access restrictions. Please ensure the video is publicly accessible or configure Gumlet API credentials.`);
        }
    }

    // Helper method to extract audio with a specific URL
    async extractAudioWithUrl(directVideoUrl, outputPath) {
        return new Promise((resolve, reject) => {
            ffmpeg(directVideoUrl)
                .audioCodec('libmp3lame')
                .audioBitrate(128)
                .format('mp3')
                .on('end', () => {
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    reject(err);
                })
                .save(outputPath);
        });
    }

    // Fallback method using yt-dlp
    async extractAudioWithYtDlp(gumletUrl, outputPath) {
        const { spawn } = require('child_process');

        return new Promise((resolve, reject) => {
            // Try to use yt-dlp to extract audio directly
            const ytDlp = spawn('yt-dlp', [
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '128K',
                '--output', outputPath.replace('.mp3', '.%(ext)s'),
                gumletUrl
            ]);

            let errorOutput = '';

            ytDlp.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            ytDlp.on('close', (code) => {
                if (code === 0) {
                    resolve(outputPath);
                } else {
                    reject(new Error(`yt-dlp failed: ${errorOutput}`));
                }
            });

            ytDlp.on('error', (error) => {
                reject(new Error(`yt-dlp not available: ${error.message}. Please install yt-dlp or ensure Gumlet videos are publicly accessible.`));
            });
        });
    }

    // Get transcript using Gumlet subtitles (replaces expensive OpenAI Whisper)
    async transcribeVideo(videoId, gumletUrl) {
        try {
            console.log(`Starting Gumlet subtitle retrieval for video ${videoId}`);

            // Use GumletService to get transcript from subtitles
            const transcript = await this.gumletService.getTranscript(videoId, gumletUrl);

            console.log(`✓ Gumlet subtitle retrieval completed for video ${videoId}`);
            return transcript;

        } catch (error) {
            console.error(`❌ Gumlet subtitle retrieval failed for video ${videoId}:`, error);
            throw error;
        }
    }

    // Update transcription status
    updateTranscriptionStatus(videoId, status) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT OR REPLACE INTO video_transcripts 
                        (video_id, transcript_text, transcription_status, updated_at) 
                        VALUES (?, COALESCE((SELECT transcript_text FROM video_transcripts WHERE video_id = ?), ''), ?, CURRENT_TIMESTAMP)`,
                [videoId, videoId, status], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
        });
    }

    // Save transcript to database
    saveTranscript(videoId, transcriptText) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT OR REPLACE INTO video_transcripts 
                        (video_id, transcript_text, transcription_status, updated_at) 
                        VALUES (?, ?, 'completed', CURRENT_TIMESTAMP)`,
                [videoId, transcriptText], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
        });
    }

    // Get transcript for a video
    getTranscript(videoId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM video_transcripts WHERE video_id = ?', [videoId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Generate test questions from transcript
    async generateTestQuestions(videoId, videoTitle, transcript, existingContent = null, provider = null, model = null) {
        try {
            // Resolve provider/model safely with fallback
            const { provider: finalProvider, model: finalModel, fallbackUsed } = await this.getSafeProviderAndModel(provider, model);

            console.log(`Generating test questions for video: ${videoTitle} using ${finalProvider}/${finalModel}${fallbackUsed ? ' (fallback applied)' : ''}`);

            // Use OpenRouter if specified
            if (finalProvider === 'openrouter') {
                const response = await this.openrouter.generateTestQuestions(videoTitle, transcript, finalModel, existingContent);
                return response;
            }
            // Use OpenAI (default)
            else {
                let prompt = `Based on this video transcript about "${videoTitle}":\n\n${transcript}\n\n`;

                if (existingContent) {
                    prompt += `Here are the current test questions that need to be updated:\n${JSON.stringify(existingContent, null, 2)}\n\n`;
                    prompt += `Please generate 5 UPDATED multiple-choice questions that improve upon the existing ones. Make them more comprehensive and better aligned with the video content.`;
                } else {
                    prompt += `Generate 5 multiple-choice questions that test understanding of key concepts from this video.`;
                }

                prompt += `\n\nFormat the response as a JSON array with this structure:
[
  {
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Why this answer is correct"
  }
]

Ensure questions are:
- Directly related to video content
- Progressive in difficulty
- Clear and unambiguous
- Educational and meaningful`;

                const completion = await this.openai.chat.completions.create({
                    model: finalModel,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    temperature: 0.7,
                    max_tokens: 2000
                });

                const generatedContent = completion.choices[0].message.content;

                // Parse JSON response
                let questions;
                try {
                    questions = JSON.parse(generatedContent);
                } catch (parseError) {
                    // If JSON parsing fails, try to extract JSON from the response
                    const jsonMatch = generatedContent.match(/\[.*\]/s);
                    if (jsonMatch) {
                        questions = JSON.parse(jsonMatch[0]);
                    } else {
                        throw new Error('Failed to parse AI response as JSON');
                    }
                }

                // Save generated content for admin review
                const contentId = await this.saveGeneratedContent(videoId, 'test', questions, existingContent ? 'updated_pending' : 'pending_review');

                console.log(`✓ Test questions generated for video ${videoId}`);
                return { contentId, questions };
            }

        } catch (error) {
            console.error(`❌ Failed to generate test questions for video ${videoId}:`, error);
            throw error;
        }
    }

    // Generate activity from transcript
    async generateActivity(videoId, videoTitle, transcript, existingContent = null, provider = null, model = null) {
        try {
            // Resolve provider/model safely with fallback
            const { provider: finalProvider, model: finalModel, fallbackUsed } = await this.getSafeProviderAndModel(provider, model);

            console.log(`Generating activity for video: ${videoTitle} using ${finalProvider}/${finalModel}${fallbackUsed ? ' (fallback applied)' : ''}`);

            // Use OpenRouter if specified
            if (finalProvider === 'openrouter') {
                const response = await this.openrouter.generateActivity(videoTitle, transcript, finalModel, existingContent);

                // Parse JSON response
                let activity;
                try {
                    activity = JSON.parse(response);
                } catch (parseError) {
                    const jsonMatch = response.match(/\{.*\}/s);
                    if (jsonMatch) {
                        activity = JSON.parse(jsonMatch[0]);
                    } else {
                        throw new Error('Failed to parse AI response as JSON');
                    }
                }

                // Save generated content for admin review
                const contentId = await this.saveGeneratedContent(videoId, 'activity', activity, existingContent ? 'updated_pending' : 'pending_review');

                console.log(`✓ Activity generated for video ${videoId}`);
                return { contentId, activity };
            }
            // Use OpenAI (default)
            else {
                if (!this.openai) {
                    throw new Error('OpenAI not initialized');
                }

                let prompt = `Based on this video transcript about "${videoTitle}":\n\n${transcript}\n\n`;

                if (existingContent) {
                    prompt += `Here is the current activity that needs to be updated:\n${JSON.stringify(existingContent, null, 2)}\n\n`;
                    prompt += `Please generate an UPDATED practical activity that improves upon the existing one.`;
                } else {
                    prompt += `Generate a practical activity that helps students apply what they learned from this video.`;
                }

                prompt += `\n\nFormat the response as JSON with this structure:
{
  "title": "Activity title",
  "description": "Detailed description of what students need to do",
  "questions": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0
    }
  ]
}

The activity should be:
- Practical and hands-on
- Directly related to video content
- Engaging and educational
- Appropriate for the learning level`;

                const completion = await this.openai.chat.completions.create({
                    model: finalModel,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    temperature: 0.7,
                    max_tokens: 1500
                });

                const generatedContent = completion.choices[0].message.content;

                // Parse JSON response
                let activity;
                try {
                    activity = JSON.parse(generatedContent);
                } catch (parseError) {
                    // If JSON parsing fails, try to extract JSON from the response
                    const jsonMatch = generatedContent.match(/\{.*\}/s);
                    if (jsonMatch) {
                        activity = JSON.parse(jsonMatch[0]);
                    } else {
                        throw new Error('Failed to parse AI response as JSON');
                    }
                }

                // Save generated content for admin review
                const contentId = await this.saveGeneratedContent(videoId, 'activity', activity, existingContent ? 'updated_pending' : 'pending_review');

                console.log(`✓ Activity generated for video ${videoId}`);
                return { contentId, activity };
            }

        } catch (error) {
            console.error(`❌ Failed to generate activity for video ${videoId}:`, error);
            throw error;
        }
    }

    // Save generated content for admin review
    saveGeneratedContent(videoId, contentType, content, status = 'pending_review', originalContentId = null) {
        return new Promise((resolve, reject) => {
            const contentJson = JSON.stringify(content);

            this.db.run(`INSERT INTO ai_generated_content 
                        (video_id, content_type, generated_content, status, original_content_id, created_at) 
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [videoId, contentType, contentJson, status, originalContentId], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });
        });
    }

    // Get pending content for admin review
    getPendingContent() {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT agc.*, v.title as video_title, c.title as course_title 
                        FROM ai_generated_content agc
                        JOIN videos v ON agc.video_id = v.id
                        JOIN courses c ON v.course_id = c.id
                        WHERE agc.status IN ('pending_review', 'updated_pending')
                        ORDER BY agc.created_at DESC`, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Answer student question using video context
    async answerStudentQuestion(studentId, videoId, question, provider = null, model = null) {
        try {
            // Resolve provider/model safely with fallback
            const { provider: finalProvider, model: finalModel, fallbackUsed } = await this.getSafeProviderAndModel(provider, model);

            // Get video transcript
            const transcript = await this.getTranscript(videoId);
            if (!transcript || transcript.transcription_status !== 'completed') {
                throw new Error('Video transcript not available');
            }

            // Get video details
            const videoDetails = await this.getVideoDetails(videoId);

            const prompt = `You are an AI tutor helping a student understand a video about "${videoDetails.title}".

Video content: ${transcript.transcript_text}

Student question: ${question}

Provide a helpful, educational answer based ONLY on the video content. If the question is outside the video scope, politely redirect the student to focus on the video content. Keep your response concise but informative.`;

            let aiResponse;

            if (finalProvider === 'openrouter') {
                const response = await this.openrouter.createChatCompletion(
                    [{ role: 'user', content: prompt }],
                    finalModel,
                    { temperature: 0.7, max_tokens: 500 }
                );

                aiResponse = response.choices[0].message.content;
            } else {
                const completion = await this.openai.chat.completions.create({
                    model: finalModel,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    temperature: 0.7,
                    max_tokens: 500
                });

                aiResponse = completion.choices[0].message.content;
            }

            // Save Q&A session
            await this.saveQASession(studentId, videoId, question, aiResponse);

            return aiResponse;

        } catch (error) {
            console.error(`❌ Failed to answer student question:`, error);
            throw error;
        }
    }

    // Get video details
    getVideoDetails(videoId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM videos WHERE id = ?', [videoId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Save Q&A session
    saveQASession(studentId, videoId, question, aiResponse) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO student_qa_sessions 
                        (student_id, video_id, question, ai_response, created_at) 
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [studentId, videoId, question, aiResponse], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });
        });
    }

    // Approve generated content
    async approveContent(contentId, adminId) {
        try {
            // Get the content details
            const content = await this.getGeneratedContent(contentId);
            if (!content) {
                throw new Error('Content not found');
            }

            // Update content status
            await this.updateContentStatus(contentId, 'approved', adminId);

            // Create actual test or activity
            const generatedContent = JSON.parse(content.generated_content);

            if (content.content_type === 'test') {
                await this.createTestFromGenerated(content.video_id, generatedContent);
            } else if (content.content_type === 'activity') {
                await this.createActivityFromGenerated(content.video_id, generatedContent);
            }

            console.log(`✓ Content ${contentId} approved and created`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to approve content ${contentId}:`, error);
            throw error;
        }
    }

    // Reject generated content
    async rejectContent(contentId, adminId, feedback) {
        try {
            await this.updateContentStatus(contentId, 'rejected', adminId, feedback);
            console.log(`✓ Content ${contentId} rejected`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to reject content ${contentId}:`, error);
            throw error;
        }
    }

    // Helper methods
    getGeneratedContent(contentId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM ai_generated_content WHERE id = ?', [contentId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    updateContentStatus(contentId, status, adminId, feedback = null) {
        return new Promise((resolve, reject) => {
            this.db.run(`UPDATE ai_generated_content 
                        SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, admin_feedback = ?
                        WHERE id = ?`,
                [status, adminId, feedback, contentId], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
        });
    }

    createTestFromGenerated(videoId, questions) {
        return new Promise((resolve, reject) => {
            // First create the test
            this.db.run(`INSERT INTO tests (video_id, title, description, passing_score, created_at) 
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [videoId, `AI Generated Test`, `Auto-generated test based on video content`, 70], function (err) {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const testId = this.lastID;

                    // Insert questions
                    const insertPromises = questions.map((q, index) => {
                        return new Promise((resolveQ, rejectQ) => {
                            this.db.run(`INSERT INTO test_questions 
                                    (test_id, question, options, correct_answer, explanation, question_order) 
                                    VALUES (?, ?, ?, ?, ?, ?)`,
                                [testId, q.question, JSON.stringify(q.options), q.correct, q.explanation || '', index + 1], (err) => {
                                    if (err) {
                                        rejectQ(err);
                                    } else {
                                        resolveQ();
                                    }
                                });
                        });
                    });

                    Promise.all(insertPromises)
                        .then(() => resolve(testId))
                        .catch(reject);
                });
        });
    }

    createActivityFromGenerated(videoId, activity) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO activities (video_id, title, description, questions, created_at) 
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [videoId, activity.title, activity.description, JSON.stringify(activity.questions)], function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });
        });
    }

    // Generate Flashcards
    async generateFlashcards(videoId, videoTitle, transcript, count = 10, provider = null, model = null) {
        try {
            const { provider: finalProvider, model: finalModel, fallbackUsed } = await this.getSafeProviderAndModel(provider, model);

            console.log(`Generating ${count} flashcards for video: ${videoTitle} using ${finalProvider}/${finalModel}${fallbackUsed ? ' (fallback applied)' : ''}`);

            const prompt = `Based on this video transcript about "${videoTitle}":\n\n${transcript}\n\n` +
                `Generate ${count} flashcards for revision. Each flashcard should have a "front" (question/concept) and a "back" (answer/definition).\n` +
                `Focus on key concepts, definitions, and important facts.\n\n` +
                `Format the response as a JSON array with this structure:\n` +
                `[\n` +
                `  {\n` +
                `    "front": "Question or Concept",\n` +
                `    "back": "Answer or Definition",\n` +
                `    "type": "text" // or "concept"\n` +
                `  }\n` +
                `  ]\n`;

            let responseContent;

            if (finalProvider === 'openrouter') {
                const response = await this.openrouter.createChatCompletion(
                    [{ role: 'user', content: prompt }],
                    finalModel,
                    { temperature: 0.7 }
                );
                responseContent = response.choices[0].message.content;
            } else {
                const completion = await this.openai.chat.completions.create({
                    model: finalModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                });
                responseContent = completion.choices[0].message.content;
            }

            // Parse JSON
            let flashcards;
            try {
                flashcards = JSON.parse(responseContent);
            } catch (e) {
                const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    flashcards = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('Failed to parse AI response as JSON');
                }
            }

            // Save to database
            await this.saveFlashcards(videoId, flashcards);

            return flashcards;

        } catch (error) {
            console.error(`❌ Failed to generate flashcards for video ${videoId}:`, error);
            throw error;
        }
    }
    saveFlashcards(videoId, flashcards) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                this.db.run('DELETE FROM flashcards WHERE video_id = ?', [videoId]);

                const stmt = this.db.prepare('INSERT INTO flashcards (video_id, front_content, back_content, card_type) VALUES (?, ?, ?, ?)');

                flashcards.forEach(card => {
                    stmt.run(videoId, card.front, card.back, card.type || 'text');
                });

                stmt.finalize(err => {
                    if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                    } else {
                        this.db.run('COMMIT');
                        resolve();
                    }
                });
            });
        });
    }

    // Generate AI Notes
    async generateNotes(videoId, videoTitle, transcript, userId, provider = null, model = null) {
        try {
            const { provider: finalProvider, model: finalModel, fallbackUsed } = await this.getSafeProviderAndModel(provider, model);

            console.log(`Generating notes for video: ${videoTitle} using ${finalProvider}/${finalModel}${fallbackUsed ? ' (fallback applied)' : ''}`);

            const prompt = `Based on this video transcript about "${videoTitle}":\n\n${transcript}\n\n` +
                `Generate comprehensive study notes in Markdown format.\n` +
                `Structure the notes with:\n` +
                `1.  **Summary**: A brief overview of the video.\n` +
                `2.  **Key Concepts**: Bullet points of the main ideas.\n` +
                `3.  **Detailed Explanation**: In-depth explanation of important topics.\n` +
                `4.  **Actionable Takeaways**: Practical applications or steps.\n\n` +
                `Use bolding, headers, and lists to make it easy to read (ThetaWave style).`;

            let responseContent;

            if (finalProvider === 'openrouter') {
                const response = await this.openrouter.createChatCompletion(
                    [{ role: 'user', content: prompt }],
                    finalModel,
                    { temperature: 0.7 }
                );
                responseContent = response.choices[0].message.content;
            } else {
                const completion = await this.openai.chat.completions.create({
                    model: finalModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                });
                responseContent = completion.choices[0].message.content;
            }

            await this.saveNotes(videoId, userId, responseContent, true);

            return responseContent;

        } catch (error) {
            console.error(`❌ Failed to generate notes for video ${videoId}:`, error);
            throw error;
        }
    }

    saveNotes(videoId, userId, content, isAiGenerated = false) {
        return new Promise((resolve, reject) => {
            // Check if notes exist
            this.db.get('SELECT id FROM student_notes WHERE video_id = ? AND user_id = ?', [videoId, userId], (err, row) => {
                if (err) return reject(err);

                if (row) {
                    // Update
                    this.db.run('UPDATE student_notes SET content = ?, is_ai_generated = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [content, isAiGenerated, row.id], (err) => {
                            if (err) reject(err);
                            else resolve(row.id);
                        });
                } else {
                    // Insert
                    this.db.run('INSERT INTO student_notes (video_id, user_id, content, is_ai_generated) VALUES (?, ?, ?, ?)',
                        [videoId, userId, content, isAiGenerated], function (err) {
                            if (err) reject(err);
                            else resolve(this.lastID);
                        });
                }
            });
        });
    }

    // Generate Visual Aid (Mermaid.js)
    async generateVisualAid(videoId, videoTitle, transcript, type = 'mermaid', provider = null, model = null) {
        try {
            const { provider: finalProvider, model: finalModel, fallbackUsed } = await this.getSafeProviderAndModel(provider, model);

            console.log(`Generating visual aid for video: ${videoTitle} using ${finalProvider}/${finalModel}${fallbackUsed ? ' (fallback applied)' : ''}`);

            const prompt = `Based on this video transcript about "${videoTitle}":\n\n${transcript}\n\n` +
                `Generate a Mermaid.js diagram code to visualize the key concepts or process described.\n` +
                `The diagram should be a flowchart (graph TD) or sequence diagram, whichever is most appropriate.\n` +
                `IMPORTANT SYNTAX RULES:\n` +
                `1. ALL node labels MUST be wrapped in double quotes. Example: id1["Label Text"]\n` +
                `2. Do NOT use double quotes (") INSIDE the label text. Use single quotes (') instead if needed.\n` +
                `3. Example of correct syntax: A["Start"] --> B["Say: 'Hello'"]\n` +
                `4. Return ONLY the valid Mermaid code. Do not include markdown code blocks or explanations.\n` +
                `Just the code starting with 'graph' or 'sequenceDiagram'.`;

            let responseContent;

            if (finalProvider === 'openrouter') {
                const response = await this.openrouter.createChatCompletion(
                    [{ role: 'user', content: prompt }],
                    finalModel,
                    { temperature: 0.5 }
                );
                responseContent = response.choices[0].message.content;
            } else {
                const completion = await this.openai.chat.completions.create({
                    model: finalModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.5
                });
                responseContent = completion.choices[0].message.content;
            }

            // Clean up response (remove markdown blocks if present)
            // Clean up response
            let cleanCode = responseContent;

            // 1. Try to extract from markdown code block
            const codeBlockMatch = responseContent.match(/```mermaid\n([\s\S]*?)\n```/);
            if (codeBlockMatch) {
                cleanCode = codeBlockMatch[1].trim();
            } else {
                // 2. If no code block, try to find start of diagram (graph or sequenceDiagram)
                const graphMatch = responseContent.match(/(graph [A-Z]{2}|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)[\s\S]*/);
                if (graphMatch) {
                    cleanCode = graphMatch[0].trim();
                    // Remove any trailing backticks or text that looks like end of block
                    cleanCode = cleanCode.replace(/```[\s\S]*$/, '').trim();
                } else {
                    // 3. Fallback: just remove backticks
                    cleanCode = responseContent.replace(/```mermaid/g, '').replace(/```/g, '').trim();
                }
            }

            // 3. Post-processing: Fix common syntax errors (missing quotes)
            // Fix [Label] -> ["Label"]
            cleanCode = cleanCode.replace(/\[([^"\]\n]+)\]/g, '["$1"]');
            // Fix {Label} -> {"Label"}
            cleanCode = cleanCode.replace(/\{([^"\}\n]+)\}/g, '{"$1"}');
            // Fix (Label) -> ("Label") - careful not to break graph direction like -->
            // Only match (text) if it's not part of an arrow like --(text)--> which is valid? 
            // Actually, in graph TD, (text) is a rounded node. 
            // But let's be careful. The user's error was with [] and {}.
            // Let's stick to [] and {} which are the most common causes of errors with special chars.

            // Also fix double quotes inside the label if we just added them
            // This is tricky. Better to just rely on the prompt for internal quotes, 
            // but the wrapper quotes are the main missing piece.

            // Save to database
            await this.saveVisualAid(videoId, `Visual Summary of ${videoTitle}`, type, cleanCode);

            return cleanCode;

        } catch (error) {
            console.error(`❌ Failed to generate visual aid for video ${videoId}:`, error);
            throw error;
        }
    }

    saveVisualAid(videoId, title, type, content) {
        const db = this.db;
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run('DELETE FROM visual_aids WHERE video_id = ?', [videoId]); // Replace existing for now

                db.run('INSERT INTO visual_aids (video_id, title, type, content) VALUES (?, ?, ?, ?)',
                    [videoId, title, type, content], function (err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                        } else {
                            db.run('COMMIT');
                            resolve(this.lastID);
                        }
                    });
            });
        });
    }

    // Generate Mind Map
    async generateMindMap(videoId, videoTitle, transcript, userId, provider = null, model = null) {
        try {
            const { provider: finalProvider, model: finalModel, fallbackUsed } = await this.getSafeProviderAndModel(provider, model);

            console.log(`Generating mind map for video: ${videoTitle} using ${finalProvider}/${finalModel}${fallbackUsed ? ' (fallback applied)' : ''}`);

            const prompt = `Based on this video transcript about "${videoTitle}":\n\n${transcript}\n\n` +
                `Generate a hierarchical mind map structure in JSON format.\n` +
                `The structure should be a tree with a central root node (the video topic) and children nodes (key concepts), which can have their own children (details).\n` +
                `IMPORTANT GUIDELINES FOR CLARITY:\n` +
                `1. Keep node names VERY CONCISE (max 3-5 words). Avoid long sentences.\n` +
                `2. Limit depth to 3 levels (Root -> Concepts -> Details).\n` +
                `3. Limit number of children per node to 5-7 to prevent overcrowding.\n` +
                `Format the response as a JSON object with this structure:\n` +
                `{\n` +
                `  "name": "Root Topic",\n` +
                `  "children": [\n` +
                `    {\n` +
                `      "name": "Main Concept 1",\n` +
                `      "children": [\n` +
                `        { "name": "Detail 1" },\n` +
                `        { "name": "Detail 2" }\n` +
                `      ]\n` +
                `    }\n` +
                `  ]\n` +
                `}`;

            let responseContent;

            if (finalProvider === 'openrouter') {
                const response = await this.openrouter.createChatCompletion(
                    [{ role: 'user', content: prompt }],
                    finalModel,
                    { temperature: 0.5 }
                );
                responseContent = response.choices[0].message.content;
            } else {
                const completion = await this.openai.chat.completions.create({
                    model: finalModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.5
                });
                responseContent = completion.choices[0].message.content;
            }

            // Parse JSON
            let mindMapData;
            try {
                mindMapData = JSON.parse(responseContent);
            } catch (e) {
                const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    mindMapData = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('Failed to parse AI response as JSON');
                }
            }

            // Save to database
            await this.saveMindMap(videoId, userId, mindMapData);

            return mindMapData;

        } catch (error) {
            console.error(`❌ Failed to generate mind map for video ${videoId}:`, error);
            throw error;
        }
    }

    saveMindMap(videoId, userId, data) {
        const db = this.db;
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                // We can have multiple maps per video, or one per user per video. 
                // Let's assume one per user per video for now.
                db.run('DELETE FROM mind_maps WHERE video_id = ? AND user_id = ?', [videoId, userId]);

                db.run('INSERT INTO mind_maps (video_id, user_id, data_json) VALUES (?, ?, ?)',
                    [videoId, userId, JSON.stringify(data)], function (err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                        } else {
                            db.run('COMMIT');
                            resolve(this.lastID);
                        }
                    });
            });
        });
    }
}

module.exports = AIService;
