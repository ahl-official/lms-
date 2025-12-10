const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./lms_database.db');

async function testContentGeneration() {
    console.log('Testing AI content generation...');
    
    // Check current count
    const beforeCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM ai_generated_content', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
    
    console.log(`Records before generation: ${beforeCount}`);
    
    try {
        // Test with video ID 34
        const response = await axios.post('http://localhost:3000/api/videos/34/generate-content', {
            contentType: 'test'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Cookie': 'connect.sid=s%3AyourSessionId.signature' // This will need to be updated
            }
        });
        
        console.log('Generation response:', response.data);
        
        // Wait a moment for database write
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check count after
        const afterCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM ai_generated_content', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        console.log(`Records after generation: ${afterCount}`);
        
        // Check the latest record
        const latestRecord = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM ai_generated_content ORDER BY created_at DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        console.log('Latest record:', latestRecord);
        
    } catch (error) {
        console.error('Error during generation:', error.response?.data || error.message);
    }
    
    db.close();
}

testContentGeneration();