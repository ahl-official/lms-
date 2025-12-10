const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const API_BASE = 'http://localhost:3000/api';

async function testDirectApproval() {
  console.log('Testing direct approval with existing content...');
  
  try {
    // First, login as admin
    const loginResponse = await axios.post(`${API_BASE}/login`, {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('Login successful');
    
    // Reset content 50 to pending_review status
    const db = new sqlite3.Database('./lms_database.db');
    
    await new Promise((resolve, reject) => {
      db.run('UPDATE ai_generated_content SET status = ? WHERE id = ?', ['pending_review', 50], function(err) {
        if (err) reject(err);
        else {
          console.log(`Reset content 50 to pending_review status. Rows affected: ${this.changes}`);
          resolve();
        }
      });
    });
    
    db.close();
    
    // Now test approval
    console.log('Testing approval for content ID: 50');
    
    const approvalResponse = await axios.put(
      `${API_BASE}/ai-content/50/review`,
      {
        action: 'approve',
        feedback: 'Test approval with fixed parsing'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Test passed!');
    console.log('Response status:', approvalResponse.status);
    console.log('Response data:', approvalResponse.data);
    
  } catch (error) {
    console.log('❌ Test failed:', error.response?.data || error.message);
    console.log('Response status:', error.response?.status);
    console.log('Response data:', error.response?.data);
  }
}

testDirectApproval();