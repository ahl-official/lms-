const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

async function testReviewEndpoint() {
    try {
        console.log('Testing AI Content Review Endpoint...');
        
        // First, login to get session cookie
        console.log('Logging in as admin...');
        const loginResponse = await axios.post('http://localhost:3000/api/login', {
            email: 'admin@ahl.com',
            password: 'admin123'
        });
        
        const sessionCookie = loginResponse.headers['set-cookie']?.[0];
        console.log('Login successful');
        
        // Check if there are any pending content items
        const db = new sqlite3.Database('./lms_database.db');
        const pendingContent = await new Promise((resolve, reject) => {
            db.all('SELECT id, video_id, content_type, status FROM ai_generated_content WHERE status = "pending_review" ORDER BY id DESC LIMIT 1', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log('Pending content found:', pendingContent.length);
        
        if (pendingContent.length === 0) {
            console.log('No pending content to test with. Creating test content first...');
            
            // Generate test content first
            const generateResponse = await axios.post('http://localhost:3000/api/videos/34/generate-content', {
                contentType: 'test',
                provider: 'openrouter',
                model: 'meta-llama/llama-3.1-8b-instruct:free'
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': sessionCookie
                }
            });
            
            console.log('Generated content:', {
                success: generateResponse.data.success,
                contentId: generateResponse.data.contentId
            });
            
            if (generateResponse.data.success) {
                // Test approval with the newly created content
                const contentId = generateResponse.data.contentId;
                console.log(`Testing approval for content ID: ${contentId}`);
                
                const reviewResponse = await axios.put(`http://localhost:3000/api/ai-content/${contentId}/review`, {
                    action: 'approve',
                    feedback: 'Test approval'
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': sessionCookie
                    }
                });
                
                console.log('Review response:', reviewResponse.data);
                
                // Check if status was updated
                const updatedContent = await new Promise((resolve, reject) => {
                    db.get('SELECT id, status, reviewed_at FROM ai_generated_content WHERE id = ?', [contentId], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
                
                console.log('Updated content status:', updatedContent);
                
                if (updatedContent.status === 'approved') {
                    console.log('✅ SUCCESS: Content approval endpoint is working correctly!');
                } else {
                    console.log('❌ ISSUE: Content status was not updated properly');
                }
            }
        } else {
            // Test with existing pending content
            const contentId = pendingContent[0].id;
            console.log(`Testing approval for existing content ID: ${contentId}`);
            
            const reviewResponse = await axios.put(`http://localhost:3000/api/ai-content/${contentId}/review`, {
                action: 'approve',
                feedback: 'Test approval'
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': sessionCookie
                }
            });
            
            console.log('Review response:', reviewResponse.data);
            console.log('✅ SUCCESS: Content approval endpoint is working!');
        }
        
        db.close();
        
    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testReviewEndpoint();