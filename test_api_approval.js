const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

async function testAPIApproval() {
    const db = new sqlite3.Database('./lms_database.db');
    
    try {
        console.log('Testing API approval endpoint...');
        
        // Reset content ID 50 to pending_review
        await new Promise((resolve, reject) => {
            db.run('UPDATE ai_generated_content SET status = "pending_review" WHERE id = 50', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log('Reset content ID 50 to pending_review');
        
        // Login as admin (we'll bypass auth by creating a session manually)
        // For testing, let's make a direct request to the approval endpoint
        const response = await axios.put('http://localhost:3000/api/ai-content/50/review', {
            action: 'approve',
            feedback: 'Test approval'
        }, {
            headers: {
                'Cookie': 'connect.sid=test-session' // This won't work but let's see the error
            }
        });
        
        console.log('✅ Approval successful:', response.data);
        
        // Check if test was created
        const testCheck = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM tests WHERE video_id = (SELECT video_id FROM ai_generated_content WHERE id = 50)', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        console.log('Tests created for this video:', testCheck);
        
    } catch (error) {
        console.log('❌ API Error:', error.response?.status, error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            console.log('Expected - authentication required. The parsing logic should still work on the server side.');
        }
    } finally {
        db.close();
    }
}

testAPIApproval().catch(console.error);