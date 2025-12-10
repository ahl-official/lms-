const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');

// Test the approval logic directly by simulating the server logic
const db = new sqlite3.Database('./lms_database.db');

async function testApprovalLogic() {
    console.log('Testing approval logic directly...');
    
    // First, reset content ID 50 to pending_review
    await new Promise((resolve, reject) => {
        db.run('UPDATE ai_generated_content SET status = "pending_review" WHERE id = 50', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    
    console.log('Reset content ID 50 to pending_review');
    
    // Get the content data
    const content = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM ai_generated_content WHERE id = 50', (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
    
    console.log('Raw generated_content:', content.generated_content.substring(0, 100) + '...');
    
    // Simulate the server's parsing logic
    let rawContent = content.generated_content;
    
    // Parse outer JSON string if it starts and ends with quotes
    if (rawContent.startsWith('"') && rawContent.endsWith('"')) {
        try {
            rawContent = JSON.parse(rawContent);
            console.log('Parsed outer JSON string');
        } catch (e) {
            console.log('Failed to parse outer JSON string:', e.message);
        }
    }
    
    // Strip markdown code blocks if rawContent is still a string
    if (typeof rawContent === 'string') {
        const cleanedContent = rawContent.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        console.log('Cleaned content:', cleanedContent.substring(0, 100) + '...');
        
        try {
            const contentData = JSON.parse(cleanedContent);
            console.log('Successfully parsed contentData');
            console.log('contentData type:', typeof contentData);
            console.log('contentData.questions type:', typeof contentData.questions);
            console.log('contentData.questions length:', contentData.questions ? contentData.questions.length : 'undefined');
            
            // Handle different data structures like the server does
            let questions;
            if (Array.isArray(contentData)) {
                questions = contentData;
                console.log('✅ Content structure is valid - direct array!');
            } else if (contentData && contentData.questions && Array.isArray(contentData.questions)) {
                questions = contentData.questions;
                console.log('✅ Content structure is valid - object with questions!');
            } else {
                console.log('❌ Invalid content structure');
                questions = null;
            }
            
            if (questions) {
                console.log('Questions count:', questions.length);
                console.log('First question:', JSON.stringify(questions[0], null, 2));
            }
        } catch (e) {
            console.log('❌ Failed to parse cleaned content:', e.message);
        }
    } else {
        console.log('rawContent is already parsed:', typeof rawContent);
    }
    
    db.close();
}

testApprovalLogic().catch(console.error);