const sqlite3 = require('sqlite3').verbose();
const AIService = require('./ai_service');

const db = new sqlite3.Database('./lms_database.db');
const aiService = new AIService();

async function debugGeneration() {
    console.log('=== Debugging AI Content Generation ===');
    
    // Initialize AI service
    const apiKey = await new Promise((resolve, reject) => {
        db.get('SELECT setting_value FROM system_settings WHERE setting_key = "openai_api_key"', (err, row) => {
            if (err) reject(err);
            else resolve(row?.setting_value);
        });
    });
    
    if (apiKey) {
        aiService.initialize(apiKey, null);
        console.log('AI Service initialized');
    } else {
        console.log('No API key found');
        return;
    }
    
    // Check current count
    const beforeCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM ai_generated_content', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
    
    console.log(`Records before generation: ${beforeCount}`);
    
    try {
        // Check if video 34 has a transcript
        const transcript = await new Promise((resolve, reject) => {
            db.get('SELECT transcript_text FROM video_transcripts WHERE video_id = 34', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        console.log('Transcript found:', transcript ? 'Yes' : 'No');
        if (transcript) {
            console.log('Transcript length:', transcript.transcript_text.length);
        }
        
        // Test direct AI service call with proper parameters
        console.log('Calling aiService.generateTestQuestions for video 34...');
        const result = await aiService.generateTestQuestions(34, 'Test Video', transcript.transcript_text);
        console.log('Generation result:', result);
        
        // If generation was successful, save it to database
        if (result && !result.error) {
            console.log('Saving generated content to database...');
            const contentId = await aiService.saveGeneratedContent(34, 'test', result, 'pending_review');
            console.log('Content saved with ID:', contentId);
        }
        
        // Check count immediately after
        const afterCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM ai_generated_content', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        console.log(`Records after generation: ${afterCount}`);
        
        // Check the latest record status
        const latestRecord = await new Promise((resolve, reject) => {
            db.get('SELECT id, video_id, content_type, status, created_at FROM ai_generated_content ORDER BY created_at DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        console.log('Latest record:', latestRecord);
        
        // Wait 2 seconds and check again to see if status changes
        console.log('Waiting 2 seconds to check for status changes...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const latestRecordAfterWait = await new Promise((resolve, reject) => {
            db.get('SELECT id, video_id, content_type, status, created_at FROM ai_generated_content ORDER BY created_at DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        console.log('Latest record after wait:', latestRecordAfterWait);
        
    } catch (error) {
        console.error('Error during generation:', error.message);
    }
    
    db.close();
}

debugGeneration();