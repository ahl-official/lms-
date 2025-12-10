const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

class GumletService {
    constructor(db) {
        this.db = db;
        this.apiKey = 'gumlet_2b56615cad5c31d50849b8030eef28df';
        this.baseUrl = 'https://api.gumlet.com/v1/video';
        this.videoBaseUrl = 'https://video.gumlet.io';
    }

    extractAssetId(gumletUrl) {
        if (!gumletUrl || typeof gumletUrl !== 'string') return null;
        const patterns = [
            /embed\/([a-zA-Z0-9]+)/,
            /assets\/([a-zA-Z0-9]+)/,
            /video\.gumlet\.io\/[a-zA-Z0-9]+\/([a-zA-Z0-9]+)/,
            /asset[_-]?id=([a-zA-Z0-9]+)/i
        ];
        for (const p of patterns) {
            const m = gumletUrl.match(p);
            if (m && m[1]) return m[1];
        }
        return null;
    }

    // Get video asset details from Gumlet API
    async getAssetDetails(assetId) {
        try {
            const response = await axios.get(`${this.baseUrl}/assets/${assetId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error(`Failed to get asset details for ${assetId}:`, error.message);
            throw new Error(`Failed to retrieve video asset details: ${error.message}`);
        }
    }

    // Get collection ID from asset details
    getCollectionId(assetDetails) {
        // Collection ID is typically in the asset details response
        // This might need adjustment based on actual Gumlet API response structure
        return assetDetails.collection_id || assetDetails.collectionId;
    }

    // Download subtitle file from Gumlet
    async downloadSubtitle(collectionId, assetId, language = 'en') {
        try {
            const subtitleUrl = `${this.videoBaseUrl}/${collectionId}/${assetId}/${language}.vtt`;
            console.log(`Downloading subtitle from: ${subtitleUrl}`);
            
            const response = await axios.get(subtitleUrl, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            });
            
            return response.data;
        } catch (error) {
            console.error(`Failed to download subtitle for ${assetId}:`, error.response?.status || 'Unknown', error.message);
            if (error.response?.status === 403) {
                throw new Error(`Access denied to subtitle file. Check if subtitles are enabled and publicly accessible.`);
            } else if (error.response?.status === 404) {
                throw new Error(`Subtitle file not found. Video may not have ${language} subtitles generated.`);
            }
            throw new Error(`Failed to download subtitle file: ${error.message}`);
        }
    }

    // Check if subtitles are available and provide guidance
    async tryDirectVttDownload(collectionId, assetId) {
        // Based on Gumlet documentation, subtitle files cannot be accessed via API
        // They can only be uploaded manually or generated through AI settings
        console.log('Gumlet API does not support direct subtitle file access');
        
        throw new Error(
            'No subtitles available for this video. To fix this:\n\n' +
            '1. In Gumlet Dashboard → Processing Settings:\n' +
            '   • Turn on "AI generated subtitles"\n' +
            '   • Select at least one language in "Additional subtitle languages"\n' +
            '   • Save and re-process your video\n\n' +
            '2. Or via API, ensure generate_subtitles.subtitle_languages includes at least one language code.\n\n' +
            'The video needs to be re-processed after changing these settings.\n\n' +
            'Note: Gumlet\'s API does not currently support direct access to subtitle files. ' +
            'Subtitles must be configured in the Gumlet Dashboard processing settings.'
        );
    }

    // Convert VTT format to plain text
    vttToPlainText(vttContent) {
        try {
            // Remove VTT header
            let text = vttContent.replace(/^WEBVTT\s*\n/, '');
            
            // Remove timestamp lines (format: 00:00:00.000 --> 00:00:00.000)
            text = text.replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\s*\n/g, '');
            
            // Remove cue identifiers (lines that are just numbers or IDs)
            text = text.replace(/^\d+\s*\n/gm, '');
            text = text.replace(/^[a-zA-Z0-9-_]+\s*\n/gm, '');
            
            // Remove HTML tags that might be in subtitles
            text = text.replace(/<[^>]*>/g, '');
            
            // Remove extra whitespace and empty lines
            text = text.replace(/\n\s*\n/g, '\n');
            text = text.replace(/^\s+|\s+$/gm, '');
            
            // Join lines with spaces
            text = text.split('\n').filter(line => line.trim().length > 0).join(' ');
            
            return text.trim();
        } catch (error) {
            console.error('Error converting VTT to plain text:', error);
            throw new Error('Failed to convert subtitle format');
        }
    }

    // Main method to get transcript from Gumlet
    async getTranscript(videoId, gumletUrl) {
        try {
            console.log(`Starting Gumlet transcript retrieval for video ${videoId}`);
            
            // Update transcription status to processing
            await this.updateTranscriptionStatus(videoId, 'processing');
            
            // Extract asset ID from URL
            const assetId = this.extractAssetId(gumletUrl);
            if (!assetId) {
                throw new Error('Could not extract asset ID from Gumlet URL');
            }
            
            console.log(`Extracted asset ID: ${assetId}`);
            
            // Get asset details to verify transcript availability
            const assetDetails = await this.getAssetDetails(assetId);
            
            // Debug: Log the asset details to understand the structure
            console.log('Asset details response:', JSON.stringify(assetDetails, null, 2));
            
            const transcriptUrl = assetDetails.output?.transcription_word_level_timestamps;
            let transcriptData;
            if (transcriptUrl) {
                const response = await axios.get(transcriptUrl, { timeout: 30000 });
                transcriptData = response.data;
            } else {
                const response = await axios.get(`${this.baseUrl}/assets/${assetId}/transcription-word-level-timestamps`, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });
                transcriptData = response.data;
            }
            
            // Debug: Log the actual structure of transcript data
            console.log('Transcript data structure:', JSON.stringify(transcriptData, null, 2));
            console.log('Transcript data type:', typeof transcriptData);
            console.log('Is array:', Array.isArray(transcriptData));
            
            // Convert word-level data to plain text
            const transcriptText = this.wordLevelToPlainText(transcriptData);
            
            // Save transcript to database
            await this.saveTranscript(videoId, transcriptText);
            
            // Clean up any duplicate or empty records
            await this.cleanupDuplicateTranscripts(videoId);
            
            console.log(`✅ Successfully retrieved transcript for video ${videoId}`);
            return transcriptText;
            
        } catch (error) {
            console.error(`❌ Gumlet transcript retrieval failed for video ${videoId}:`, error);
            await this.updateTranscriptionStatus(videoId, 'failed');
            throw error;
        }
    }



    // Convert word-level transcript data to plain text
    wordLevelToPlainText(wordLevelData) {
        // Handle nested object structure from Gumlet API
        let wordsArray;
        
        console.log('Processing word-level data:', typeof wordLevelData, Array.isArray(wordLevelData));
        
        if (Array.isArray(wordLevelData)) {
            // Direct array format
            wordsArray = wordLevelData;
        } else if (wordLevelData && Array.isArray(wordLevelData.words)) {
            // Nested object with 'words' property
            wordsArray = wordLevelData.words;
        } else if (wordLevelData && typeof wordLevelData === 'object') {
            // Check if the object itself contains word data
            const keys = Object.keys(wordLevelData);
            console.log('Object keys:', keys);
            const arrayKey = keys.find(key => Array.isArray(wordLevelData[key]));
            console.log('Found array key:', arrayKey);
            if (arrayKey) {
                wordsArray = wordLevelData[arrayKey];
                console.log('Words array length:', wordsArray.length);
            }
        }
        
        if (!Array.isArray(wordsArray)) {
            console.error('Unexpected transcript data structure:', JSON.stringify(wordLevelData, null, 2));
            throw new Error('Invalid word-level transcript data format');
        }
        
        const words = wordsArray.map(item => {
            const word = item.word || item.text || '';
            console.log('Processing word:', word);
            return word;
        }).filter(word => word.trim().length > 0);
        
        const result = words.join(' ');
        console.log('Final transcript result:', result.substring(0, 100) + '...');
        return result;
    }

    // Update transcription status in database
    updateTranscriptionStatus(videoId, status) {
        return new Promise((resolve, reject) => {
            // First check if a record exists
            this.db.get('SELECT id FROM video_transcripts WHERE video_id = ?', [videoId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (row) {
                    // Update existing record, preserving transcript_text
                    this.db.run(`UPDATE video_transcripts 
                                SET transcription_status = ?, updated_at = CURRENT_TIMESTAMP 
                                WHERE video_id = ?`,
                        [status, videoId], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                } else {
                    // Insert new record
                    this.db.run(`INSERT INTO video_transcripts 
                                (video_id, transcript_text, transcription_status, updated_at) 
                                VALUES (?, '', ?, CURRENT_TIMESTAMP)`,
                        [videoId, status], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                }
            });
        });
    }

    // Clean up duplicate transcript records
    cleanupDuplicateTranscripts(videoId) {
        return new Promise((resolve, reject) => {
            // Keep only the latest completed record with actual transcript text
            this.db.run(`DELETE FROM video_transcripts 
                        WHERE video_id = ? AND (
                            transcription_status != 'completed' OR 
                            transcript_text = '' OR 
                            transcript_text IS NULL
                        ) AND id NOT IN (
                            SELECT id FROM video_transcripts 
                            WHERE video_id = ? AND transcription_status = 'completed' 
                            AND transcript_text != '' AND transcript_text IS NOT NULL 
                            ORDER BY updated_at DESC LIMIT 1
                        )`,
                [videoId, videoId], (err) => {
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
    getTranscriptFromDb(videoId) {
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
}

module.exports = GumletService;
