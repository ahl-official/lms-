const sqlite3 = require('sqlite3').verbose();

async function debugContentStructure() {
    const db = new sqlite3.Database('./lms_database.db');
    
    // Get the latest generated content
    db.get('SELECT id, generated_content, content_type FROM ai_generated_content ORDER BY id DESC LIMIT 1', (err, content) => {
        if (err) {
            console.error('Database error:', err);
            return;
        }
        
        if (!content) {
            console.log('No content found');
            return;
        }
        
        console.log('Content ID:', content.id);
        console.log('Content Type:', content.content_type);
        console.log('Raw generated_content (first 200 chars):', content.generated_content.substring(0, 200));
        
        try {
            const contentData = JSON.parse(content.generated_content);
            console.log('\n=== Parsed Content Data ===');
            console.log('Type:', typeof contentData);
            console.log('Is Array:', Array.isArray(contentData));
            
            if (Array.isArray(contentData)) {
                console.log('Array length:', contentData.length);
                if (contentData.length > 0) {
                    console.log('First item structure:', Object.keys(contentData[0]));
                    console.log('First question:', contentData[0].question);
                    console.log('Options type:', typeof contentData[0].options);
                    console.log('Options keys:', Object.keys(contentData[0].options));
                    console.log('Correct answer field:', contentData[0].correct_answer || contentData[0].correct);
                }
            } else {
                console.log('Object keys:', Object.keys(contentData));
                console.log('Has questions property:', 'questions' in contentData);
                if (contentData.questions) {
                    console.log('Questions type:', typeof contentData.questions);
                    console.log('Questions is array:', Array.isArray(contentData.questions));
                }
            }
            
            // Test the validation logic
            let questions;
            if (Array.isArray(contentData)) {
                questions = contentData;
                console.log('\n✅ Would use contentData directly (array)');
            } else if (contentData && contentData.questions && Array.isArray(contentData.questions)) {
                questions = contentData.questions;
                console.log('\n✅ Would use contentData.questions');
            } else {
                console.log('\n❌ Invalid content data structure detected');
                console.log('contentData type:', typeof contentData);
                console.log('contentData.questions:', contentData.questions);
                return;
            }
            
            console.log('Questions to process:', questions.length);
            
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError.message);
        }
        
        db.close();
    });
}

debugContentStructure();