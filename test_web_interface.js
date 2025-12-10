const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

async function testWebInterface() {
    try {
        console.log('Testing web interface content generation...');
        
        // First, login to get session cookie
        console.log('Logging in as admin...');
        const loginResponse = await axios.post('http://localhost:3000/api/login', {
            email: 'admin@ahl.com',
            password: 'admin123'
        });
        
        const sessionCookie = loginResponse.headers['set-cookie']?.[0];
        console.log('Login successful, got session cookie');
        
        // Check current count
        const db = new sqlite3.Database('./lms_database.db');
        const beforeCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM ai_generated_content', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        console.log('Records before generation:', beforeCount);
        
        // Make API call to generate content with authentication
        const response = await axios.post('http://localhost:3000/api/videos/34/generate-content', {
            contentType: 'test',
            provider: 'openrouter',
            model: 'meta-llama/llama-3.1-8b-instruct:free'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Cookie': sessionCookie
            }
        });
        
        console.log('API Response:', {
            success: response.data.success,
            contentId: response.data.contentId,
            message: response.data.message,
            hasContent: !!response.data.content
        });
        
        // Check count after generation
        const afterCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM ai_generated_content', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        console.log('Records after generation:', afterCount);
        
        // Check the latest record
        const latestRecord = await new Promise((resolve, reject) => {
            db.get('SELECT id, video_id, content_type, status, created_at FROM ai_generated_content ORDER BY id DESC LIMIT 1', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        console.log('Latest record:', latestRecord);
        
        db.close();
        
        if (latestRecord && latestRecord.status === 'pending_review') {
            console.log('✅ SUCCESS: Content generated with pending_review status!');
        } else {
            console.log('❌ ISSUE: Content not saved with pending_review status');
        }
        
    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testWebInterface();