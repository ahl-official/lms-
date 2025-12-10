const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

db.serialize(() => {
    // Insert test for video 1
    db.run(`INSERT OR IGNORE INTO tests (video_id, title, description, passing_score) 
            VALUES (1, 'Introduction to Programming Test', 'Test your understanding of basic programming concepts', 70)`);
    
    // Insert test questions
    db.run(`INSERT OR IGNORE INTO test_questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer) 
            VALUES (1, 'What is a variable?', 'A container for storing data', 'A type of loop', 'A function', 'A class', 'A')`);
    
    db.run(`INSERT OR IGNORE INTO test_questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer) 
            VALUES (1, 'Which of the following is a programming language?', 'HTML', 'CSS', 'JavaScript', 'All of the above', 'C')`);
    
    // Insert activity for video 1
    db.run(`INSERT OR IGNORE INTO activities (video_id, title, description, questions) 
            VALUES (1, 'Programming Exercise', 'Complete the following programming tasks to demonstrate your understanding of the concepts covered in this video.', 'What did you learn from this video? How will you apply these concepts in your projects?')`);
    
    setTimeout(() => {
        // Log inserted data
        db.all('SELECT * FROM tests WHERE video_id = 1', (err, tests) => {
            if (err) console.error('Error fetching tests:', err);
            else console.log('Inserted tests:', tests);
        });
        
        db.all('SELECT * FROM test_questions WHERE test_id = 1', (err, questions) => {
            if (err) console.error('Error fetching questions:', err);
            else console.log('Inserted questions:', questions);
        });
        
        db.all('SELECT * FROM activities WHERE video_id = 1', (err, activities) => {
            if (err) console.error('Error fetching activities:', err);
            else console.log('Inserted activities:', activities);
        });
        
        db.close();
    }, 1000);
});