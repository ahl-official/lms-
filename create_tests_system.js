const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

// Test questions for each course type
const courseTestQuestions = {
  'Digital Marketing Intern': {
    1: [ // Video 1 questions
      {
        question: "What is the primary goal of digital marketing?",
        option_a: "To increase website traffic only",
        option_b: "To build brand awareness and drive conversions",
        option_c: "To create social media posts",
        option_d: "To send emails to customers",
        correct_answer: "B"
      },
      {
        question: "Which platform is NOT typically used for digital marketing?",
        option_a: "Facebook",
        option_b: "Google Ads",
        option_c: "Microsoft Word",
        option_d: "Instagram",
        correct_answer: "C"
      },
      {
        question: "What does ROI stand for in marketing?",
        option_a: "Return on Investment",
        option_b: "Rate of Interest",
        option_c: "Revenue over Income",
        option_d: "Reach of Influence",
        correct_answer: "A"
      }
    ],
    2: [ // Video 2 questions
      {
        question: "What is SEO?",
        option_a: "Social Engine Optimization",
        option_b: "Search Engine Optimization",
        option_c: "Site Enhancement Operations",
        option_d: "System Error Operations",
        correct_answer: "B"
      },
      {
        question: "Which factor is most important for SEO?",
        option_a: "Website color scheme",
        option_b: "Quality content and keywords",
        option_c: "Number of images",
        option_d: "Website loading speed only",
        correct_answer: "B"
      }
    ],
    3: [ // Video 3 questions
      {
        question: "What is PPC advertising?",
        option_a: "Pay Per Click",
        option_b: "Price Per Customer",
        option_c: "Profit Per Campaign",
        option_d: "Page Per Content",
        correct_answer: "A"
      },
      {
        question: "Which platform is primarily used for PPC advertising?",
        option_a: "Wikipedia",
        option_b: "Google Ads",
        option_c: "YouTube only",
        option_d: "Email",
        correct_answer: "B"
      }
    ]
  },
  'AI Intern': {
    1: [
      {
        question: "What is Machine Learning?",
        option_a: "A type of computer hardware",
        option_b: "A subset of AI that learns from data",
        option_c: "A programming language",
        option_d: "A database system",
        correct_answer: "B"
      },
      {
        question: "Which of these is an AI application?",
        option_a: "Image recognition",
        option_b: "Natural language processing",
        option_c: "Recommendation systems",
        option_d: "All of the above",
        correct_answer: "D"
      }
    ],
    2: [
      {
        question: "Python is popular for AI because:",
        option_a: "It's the only programming language for AI",
        option_b: "It has extensive AI/ML libraries",
        option_c: "It's the fastest language",
        option_d: "It's only used for web development",
        correct_answer: "B"
      },
      {
        question: "Which library is commonly used for machine learning in Python?",
        option_a: "jQuery",
        option_b: "scikit-learn",
        option_c: "Bootstrap",
        option_d: "React",
        correct_answer: "B"
      }
    ]
  },
  'CRM Mumbai': {
    1: [
      {
        question: "What does CRM stand for?",
        option_a: "Customer Relationship Management",
        option_b: "Customer Revenue Management",
        option_c: "Company Resource Management",
        option_d: "Customer Retention Method",
        correct_answer: "A"
      },
      {
        question: "The primary goal of CRM is to:",
        option_a: "Increase company profits only",
        option_b: "Manage customer relationships effectively",
        option_c: "Reduce employee workload",
        option_d: "Create more products",
        correct_answer: "B"
      }
    ],
    2: [
      {
        question: "Which is a key CRM best practice?",
        option_a: "Ignoring customer feedback",
        option_b: "Regular customer communication",
        option_c: "Focusing only on new customers",
        option_d: "Avoiding customer data collection",
        correct_answer: "B"
      }
    ]
  },
  'Hair Stylist Level 1': {
    1: [
      {
        question: "What is the first step in hair styling?",
        option_a: "Applying products immediately",
        option_b: "Understanding hair type and texture",
        option_c: "Cutting the hair",
        option_d: "Coloring the hair",
        correct_answer: "B"
      },
      {
        question: "Which tool is essential for basic hair styling?",
        option_a: "Hair dryer",
        option_b: "Curling iron",
        option_c: "Hair brush",
        option_d: "All of the above",
        correct_answer: "D"
      }
    ],
    2: [
      {
        question: "When cutting hair, you should always:",
        option_a: "Cut when hair is dirty",
        option_b: "Start with the longest length",
        option_c: "Use dull scissors",
        option_d: "Rush through the process",
        correct_answer: "B"
      }
    ]
  },
  'Video Editor Intern': {
    1: [
      {
        question: "What is the timeline in video editing?",
        option_a: "A clock showing current time",
        option_b: "The sequence where video clips are arranged",
        option_c: "A type of video effect",
        option_d: "A rendering setting",
        correct_answer: "B"
      },
      {
        question: "Which file format is commonly used for video editing?",
        option_a: "MP4",
        option_b: "MOV",
        option_c: "AVI",
        option_d: "All of the above",
        correct_answer: "D"
      }
    ],
    2: [
      {
        question: "Adobe Premiere Pro is:",
        option_a: "A photo editing software",
        option_b: "A professional video editing software",
        option_c: "A web browser",
        option_d: "An audio editing tool only",
        correct_answer: "B"
      }
    ]
  }
};

async function createTestsSystem() {
  console.log('Creating tests system for all videos...');
  
  try {
    // First, clear existing test questions that might be orphaned
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM test_questions WHERE test_id NOT IN (SELECT id FROM tests)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Get all videos with their course information
    const videos = await new Promise((resolve, reject) => {
      db.all(`
        SELECT v.id, v.title, v.sequence, c.role_name, c.title as course_title
        FROM videos v
        JOIN courses c ON v.course_id = c.id
        ORDER BY c.role_name, v.sequence
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`Found ${videos.length} videos to create tests for`);
    
    // Create tests for each video
    for (const video of videos) {
      console.log(`\nCreating test for: ${video.title} (${video.role_name})`);
      
      // Create the test
      const testId = await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO tests (video_id, title, description, passing_score) 
          VALUES (?, ?, ?, ?)
        `, [
          video.id,
          `${video.title} - Knowledge Check`,
          `Test your understanding of the concepts covered in: ${video.title}`,
          70
        ], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
      
      console.log(`  Created test (ID: ${testId})`);
      
      // Get questions for this video based on course and sequence
      const questions = courseTestQuestions[video.role_name]?.[video.sequence] || [];
      
      if (questions.length > 0) {
        // Add questions to the test
        for (const question of questions) {
          await new Promise((resolve, reject) => {
            db.run(`
              INSERT INTO test_questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer, points)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              testId,
              question.question,
              question.option_a,
              question.option_b,
              question.option_c,
              question.option_d,
              question.correct_answer,
              1
            ], function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            });
          });
        }
        
        console.log(`    Added ${questions.length} questions`);
      } else {
        // Add a default question if no specific questions are defined
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO test_questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer, points)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            testId,
            `What was the main topic covered in this video: ${video.title}?`,
            "The main concepts were clearly explained",
            "The video was not relevant",
            "I need to watch it again",
            "The content was too advanced",
            "A",
            1
          ], function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          });
        });
        
        console.log(`    Added 1 default question`);
      }
    }
    
    // Show final summary
    const testSummary = await new Promise((resolve, reject) => {
      db.all(`
        SELECT c.role_name, COUNT(DISTINCT t.id) as test_count, COUNT(tq.id) as question_count
        FROM courses c
        JOIN videos v ON c.id = v.course_id
        JOIN tests t ON v.id = t.video_id
        LEFT JOIN test_questions tq ON t.id = tq.test_id
        GROUP BY c.role_name
        ORDER BY c.role_name
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n=== TESTS SYSTEM CREATED SUCCESSFULLY ===');
    console.log('\nSummary by course:');
    testSummary.forEach(course => {
      console.log(`- ${course.role_name}: ${course.test_count} tests, ${course.question_count} questions`);
    });
    
    const totalTests = testSummary.reduce((sum, course) => sum + course.test_count, 0);
    const totalQuestions = testSummary.reduce((sum, course) => sum + course.question_count, 0);
    
    console.log(`\nTotal: ${totalTests} tests with ${totalQuestions} questions created`);
    console.log('\nStudents can now take tests after watching videos!');
    
  } catch (error) {
    console.error('Error creating tests system:', error);
  } finally {
    db.close();
  }
}

createTestsSystem();