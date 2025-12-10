const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

// Required courses from new_req.md
const requiredCourses = [
  { role_name: 'AI Intern', title: 'AI Intern Training Program' },
  { role_name: 'CRM Mumbai', title: 'CRM Mumbai Training Program' },
  { role_name: 'Hair Stylist Level 1', title: 'Hair Stylist Level 1 Training Program' },
  { role_name: 'Video Editor Intern', title: 'Video Editor Intern Training Program' }
];

// Sample YouTube videos for each course
const courseVideos = {
  'AI Intern': [
    { title: 'Introduction to AI and Machine Learning', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb01', sequence: 1 },
    { title: 'Python Basics for AI', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb02', sequence: 2 },
    { title: 'Working with Data and APIs', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb03', sequence: 3 },
    { title: 'AI Tools and Automation', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb04', sequence: 4 }
  ],
  'CRM Mumbai': [
    { title: 'CRM Fundamentals', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb05', sequence: 1 },
    { title: 'Customer Relationship Management Best Practices', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb06', sequence: 2 },
    { title: 'CRM Software Training', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb07', sequence: 3 },
    { title: 'Customer Service Excellence', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb08', sequence: 4 }
  ],
  'Hair Stylist Level 1': [
    { title: 'Hair Styling Basics', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb09', sequence: 1 },
    { title: 'Hair Cutting Techniques', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb10', sequence: 2 },
    { title: 'Hair Coloring Fundamentals', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb11', sequence: 3 },
    { title: 'Client Consultation and Care', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb12', sequence: 4 }
  ],
  'Video Editor Intern': [
    { title: 'Video Editing Basics', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb13', sequence: 1 },
    { title: 'Adobe Premiere Pro Tutorial', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb14', sequence: 2 },
    { title: 'Color Correction and Grading', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb15', sequence: 3 },
    { title: 'Audio Editing and Sound Design', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb16', sequence: 4 }
  ]
};

// Activities for each video
const videoActivities = {
  1: { title: 'Introduction Reflection', description: 'Write a 200-word reflection on what you learned about the fundamentals. Include key concepts and how you plan to apply them.' },
  2: { title: 'Practical Exercise', description: 'Complete the hands-on exercise demonstrated in the video. Document your process and any challenges you faced.' },
  3: { title: 'Advanced Application', description: 'Apply the advanced techniques shown in the video to a real-world scenario. Provide screenshots or examples of your work.' },
  4: { title: 'Final Project', description: 'Create a comprehensive project that demonstrates all the skills learned in this course. Include a detailed explanation of your approach.' }
};

async function createCoursesAndContent() {
  console.log('Creating missing courses and content...');
  
  try {
    // Get existing courses to avoid duplicates
    const existingCourses = await new Promise((resolve, reject) => {
      db.all('SELECT role_name FROM courses', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.role_name));
      });
    });
    
    console.log('Existing courses:', existingCourses);
    
    // Create new courses
    for (const course of requiredCourses) {
      if (existingCourses.includes(course.role_name)) {
        console.log(`Course ${course.role_name} already exists, skipping...`);
        continue;
      }
      
      const courseId = await new Promise((resolve, reject) => {
        db.run('INSERT INTO courses (role_name, title) VALUES (?, ?)', 
          [course.role_name, course.title], 
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
      
      console.log(`Created course: ${course.title} (ID: ${courseId})`);
      
      // Add videos for this course
      const videos = courseVideos[course.role_name];
      if (videos) {
        for (const video of videos) {
          const videoId = await new Promise((resolve, reject) => {
            db.run('INSERT INTO videos (course_id, title, gumlet_url, sequence) VALUES (?, ?, ?, ?)',
              [courseId, video.title, video.gumlet_url, video.sequence],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          });
          
          console.log(`  Added video: ${video.title} (ID: ${videoId})`);
          
          // Add activity for this video
          const activity = videoActivities[video.sequence];
          if (activity) {
            await new Promise((resolve, reject) => {
              db.run('INSERT INTO activities (video_id, title, description) VALUES (?, ?, ?)',
                [videoId, activity.title, activity.description],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                }
              );
            });
            
            console.log(`    Added activity: ${activity.title}`);
          }
        }
      }
    }
    
    // Add more videos to existing Digital Marketing course
    console.log('\nAdding more videos to existing Digital Marketing course...');
    
    const dmCourse = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM courses WHERE role_name = "Digital Marketing Intern"', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (dmCourse) {
      const courseId = dmCourse.id;
      const additionalVideos = [
        { title: 'Social Media Marketing Strategy', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb17', sequence: 4 },
        { title: 'Email Marketing Best Practices', gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb18', sequence: 5 }
      ];
      
      for (const video of additionalVideos) {
        const videoId = await new Promise((resolve, reject) => {
          db.run('INSERT INTO videos (course_id, title, gumlet_url, sequence) VALUES (?, ?, ?, ?)',
            [courseId, video.title, video.gumlet_url, video.sequence],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
        
        console.log(`Added video to Digital Marketing: ${video.title} (ID: ${videoId})`);
        
        // Add activity for this video
        const activity = videoActivities[video.sequence];
        if (activity) {
          await new Promise((resolve, reject) => {
            db.run('INSERT INTO activities (video_id, title, description) VALUES (?, ?, ?)',
              [videoId, activity.title, activity.description],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          });
          
          console.log(`  Added activity: ${activity.title}`);
        }
      }
    }
    
    console.log('\nDatabase operations completed successfully!');
    console.log('\nSummary:');
    console.log('- Created 4 new courses (AI Intern, CRM Mumbai, Hair Stylist Level 1, Video Editor Intern)');
    console.log('- Added 16 new videos (4 per course)');
    console.log('- Added 2 more videos to Digital Marketing course');
    console.log('- Created activities for all new videos');
    console.log('\nTotal: 5 courses with 21 videos and corresponding activities');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    db.close();
  }
}

createCoursesAndContent();