const sqlite3 = require('sqlite3').verbose();

// Simulate the exact server approval logic
async function testFinalApproval() {
    const db = new sqlite3.Database('./lms_database.db');
    
    try {
        console.log('=== Testing Final Approval Logic ===');
        
        // Reset content ID 50 to pending_review
        await new Promise((resolve, reject) => {
            db.run('UPDATE ai_generated_content SET status = "pending_review" WHERE id = 50', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log('✅ Reset content ID 50 to pending_review');
        
        // Get the content (simulating server logic)
        const content = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM ai_generated_content WHERE id = 50', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        console.log('✅ Retrieved content for approval');
        
        // Update status to approved (simulating server logic)
        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE ai_generated_content 
                SET status = ?, admin_feedback = ?, reviewed_at = datetime('now'), reviewed_by = ?
                WHERE id = ?
            `, ['approved', 'Test approval', 1, 50], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log('✅ Updated status to approved');
        
        // Now simulate the content processing logic
        let rawContent = content.generated_content;
        
        // Parse outer JSON string if needed
        if (typeof rawContent === 'string' && rawContent.startsWith('"') && rawContent.endsWith('"')) {
            try {
                rawContent = JSON.parse(rawContent);
                console.log('✅ Parsed outer JSON string');
            } catch (e) {
                console.log('❌ Failed to parse outer JSON string:', e.message);
            }
        }
        
        // Strip markdown code blocks if present
        if (typeof rawContent === 'string') {
            rawContent = rawContent.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
            console.log('✅ Stripped markdown code blocks');
        }
        
        const contentData = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
        console.log('✅ Parsed content data');
        
        // Get video info
        const video = await new Promise((resolve, reject) => {
            db.get('SELECT title FROM videos WHERE id = ?', [content.video_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        const testTitle = video ? `${video.title} - Test` : 'Video Test';
        const testDescription = `Test questions for ${video ? video.title : 'this video'}`;
        
        console.log('✅ Video info retrieved:', testTitle);
        
        // Create test
        const testId = await new Promise((resolve, reject) => {
            db.run('INSERT INTO tests (video_id, title, description) VALUES (?, ?, ?)',
                [content.video_id, testTitle, testDescription], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
        
        console.log('✅ Created test with ID:', testId);
        
        // Handle different data structures
        let questions;
        if (Array.isArray(contentData)) {
            questions = contentData;
        } else if (contentData && contentData.questions && Array.isArray(contentData.questions)) {
            questions = contentData.questions;
        } else {
            throw new Error('Invalid content data structure');
        }
        
        console.log('✅ Found', questions.length, 'questions to process');
        
        // Insert questions
        const insertQuestion = db.prepare(`
            INSERT INTO test_questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        let questionsInserted = 0;
        
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            
            // Handle different option formats
            let optionA, optionB, optionC, optionD, correctAnswer;
            
            if (Array.isArray(q.options)) {
                // Options as array format
                optionA = q.options[0];
                optionB = q.options[1];
                optionC = q.options[2];
                optionD = q.options[3];
            } else if (typeof q.options === 'object') {
                // Options as object format (A, B, C, D)
                optionA = q.options.A;
                optionB = q.options.B;
                optionC = q.options.C;
                optionD = q.options.D;
            }
            
            correctAnswer = q.correct_answer;
            
            await new Promise((resolve, reject) => {
                insertQuestion.run(testId, q.question, optionA, optionB, optionC, optionD, correctAnswer, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            questionsInserted++;
        }
        
        insertQuestion.finalize();
        
        console.log('✅ Successfully inserted', questionsInserted, 'questions');
        
        // Verify the test was created properly
        const finalCheck = await new Promise((resolve, reject) => {
            db.get(`
                SELECT t.*, COUNT(tq.id) as question_count 
                FROM tests t 
                LEFT JOIN test_questions tq ON t.id = tq.test_id 
                WHERE t.id = ? 
                GROUP BY t.id
            `, [testId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        console.log('\n=== FINAL VERIFICATION ===');
        console.log('Test ID:', finalCheck.id);
        console.log('Test Title:', finalCheck.title);
        console.log('Video ID:', finalCheck.video_id);
        console.log('Questions Created:', finalCheck.question_count);
        console.log('\n🎉 APPROVAL PROCESS COMPLETED SUCCESSFULLY! 🎉');
        
    } catch (error) {
        console.error('❌ Error during approval process:', error.message);
        console.error(error.stack);
    } finally {
        db.close();
    }
}

testFinalApproval().catch(console.error);