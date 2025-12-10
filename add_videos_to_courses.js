const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

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

async function addVideosToExistingCourses() {
  console.log('Adding videos to existing courses...');
  
  try {
    // Get courses that have no videos
    const coursesWithoutVideos = await new Promise((resolve, reject) => {
      db.all(`
        SELECT c.id, c.role_name, c.title 
        FROM courses c 
        LEFT JOIN videos v ON c.id = v.course_id 
        WHERE v.id IS NULL
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('Courses without videos:', coursesWithoutVideos.map(c => c.role_name));
    
    // Add videos to each course that doesn't have any
    for (const course of coursesWithoutVideos) {
      const videos = courseVideos[course.role_name];
      if (videos) {
        console.log(`\nAdding videos to ${course.title}...`);
        
        for (const video of videos) {
          const videoId = await new Promise((resolve, reject) => {
            db.run('INSERT INTO videos (course_id, title, gumlet_url, sequence) VALUES (?, ?, ?, ?)',
              [course.id, video.title, video.gumlet_url, video.sequence],
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
    
    console.log('\nVideos added successfully!');
    
    // Show final summary
    const finalSummary = await new Promise((resolve, reject) => {
      db.all(`
        SELECT c.role_name, c.title, COUNT(v.id) as video_count 
        FROM courses c 
        LEFT JOIN videos v ON c.id = v.course_id 
        GROUP BY c.id, c.role_name, c.title 
        ORDER BY c.role_name
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\nFinal course summary:');
    finalSummary.forEach(course => {
      console.log(`- ${course.role_name}: ${course.video_count} videos`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    db.close();
  }
}

addVideosToExistingCourses();