const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Open database
const db = new sqlite3.Database('./lms_database.db');

console.log('Starting demo data population...');

db.serialize(() => {
  // Insert demo courses
  const courses = [
    { role_name: 'AI Intern', title: 'Artificial Intelligence Fundamentals' },
    { role_name: 'CRM Mumbai', title: 'Customer Relationship Management' },
    { role_name: 'Hair Stylist Level 1', title: 'Basic Hair Styling Techniques' },
    { role_name: 'Digital Marketing Intern', title: 'Digital Marketing Essentials' },
    { role_name: 'Video Editor Intern', title: 'Video Editing Fundamentals' }
  ];

  courses.forEach((course, index) => {
    db.run('INSERT OR IGNORE INTO courses (id, role_name, title) VALUES (?, ?, ?)',
      [index + 1, course.role_name, course.title], function(err) {
      if (err) {
        console.error('Error inserting course:', err);
      } else {
        console.log(`Inserted course: ${course.title}`);
      }
    });
  });

  // Insert demo videos for AI Intern course
  const aiVideos = [
    {
      course_id: 1,
      title: 'Introduction to Artificial Intelligence',
      gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb01',
      sequence: 1
    },
    {
      course_id: 1,
      title: 'Machine Learning Basics',
      gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb02',
      sequence: 2
    },
    {
      course_id: 1,
      title: 'Neural Networks Explained',
      gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb03',
      sequence: 3
    },
    {
      course_id: 1,
      title: 'Deep Learning Applications',
      gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb04',
      sequence: 4
    },
    {
      course_id: 1,
      title: 'AI Ethics and Future',
      gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb05',
      sequence: 5
    }
  ];

  aiVideos.forEach((video, index) => {
    db.run('INSERT OR IGNORE INTO videos (id, course_id, title, gumlet_url, sequence) VALUES (?, ?, ?, ?, ?)',
      [index + 1, video.course_id, video.title, video.gumlet_url, video.sequence], function(err) {
      if (err) {
        console.error('Error inserting video:', err);
      } else {
        console.log(`Inserted video: ${video.title}`);
      }
    });
  });

  // Insert demo videos for Digital Marketing course
  const marketingVideos = [
    {
      course_id: 4,
      title: 'Digital Marketing Overview',
      gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb06',
      sequence: 1
    },
    {
      course_id: 4,
      title: 'Social Media Marketing',
      gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb07',
      sequence: 2
    },
    {
      course_id: 4,
      title: 'SEO Fundamentals',
      gumlet_url: 'https://play.gumlet.io/embed/68411fb92ea48d13d446fb08',
      sequence: 3
    }
  ];

  marketingVideos.forEach((video, index) => {
    db.run('INSERT OR IGNORE INTO videos (id, course_id, title, gumlet_url, sequence) VALUES (?, ?, ?, ?, ?)',
      [index + 6, video.course_id, video.title, video.gumlet_url, video.sequence], function(err) {
      if (err) {
        console.error('Error inserting marketing video:', err);
      } else {
        console.log(`Inserted marketing video: ${video.title}`);
      }
    });
  });

  // Insert demo users with WhatsApp number
  const demoUsers = [
    {
      name: 'Rahul Sharma',
      email: 'rahul.student@ahl.com',
      phone: '7021247525',
      password: bcrypt.hashSync('student123', 10),
      role: 'student',
      course_role: 'AI Intern'
    },
    {
      name: 'Priya Patel',
      email: 'priya.student@ahl.com',
      phone: '7021247525',
      password: bcrypt.hashSync('student123', 10),
      role: 'student',
      course_role: 'Digital Marketing Intern'
    },
    {
      name: 'Amit Kumar',
      email: 'amit.trainer@ahl.com',
      phone: '7021247525',
      password: bcrypt.hashSync('trainer123', 10),
      role: 'trainer',
      course_role: 'AI Intern'
    },
    {
      name: 'Sneha Gupta',
      email: 'sneha.trainer@ahl.com',
      phone: '7021247525',
      password: bcrypt.hashSync('trainer123', 10),
      role: 'trainer',
      course_role: 'Digital Marketing Intern'
    }
  ];

  demoUsers.forEach((user) => {
    db.run('INSERT OR IGNORE INTO users (name, email, phone, password, role, course_role) VALUES (?, ?, ?, ?, ?, ?)',
      [user.name, user.email, user.phone, user.password, user.role, user.course_role], function(err) {
      if (err) {
        console.error('Error inserting user:', err);
      } else {
        console.log(`Inserted user: ${user.name} (${user.role})`);
      }
    });
  });

  // Insert demo tests
  const tests = [
    {
      id: 1,
      video_id: 1,
      title: 'AI Introduction Quiz',
      description: 'Test your understanding of AI basics',
      passing_score: 70
    },
    {
      id: 2,
      video_id: 2,
      title: 'Machine Learning Quiz',
      description: 'Test your ML knowledge',
      passing_score: 75
    },
    {
      id: 3,
      video_id: 6,
      title: 'Digital Marketing Quiz',
      description: 'Test your digital marketing understanding',
      passing_score: 70
    }
  ];

  tests.forEach((test) => {
    db.run('INSERT OR IGNORE INTO tests (id, video_id, title, description, passing_score) VALUES (?, ?, ?, ?, ?)',
      [test.id, test.video_id, test.title, test.description, test.passing_score], function(err) {
      if (err) {
        console.error('Error inserting test:', err);
      } else {
        console.log(`Inserted test: ${test.title}`);
      }
    });
  });

  // Insert demo test questions
  const testQuestions = [
    // AI Introduction Quiz Questions
    {
      test_id: 1,
      question: 'What does AI stand for?',
      option_a: 'Artificial Intelligence',
      option_b: 'Automated Integration',
      option_c: 'Advanced Information',
      option_d: 'Algorithmic Interface',
      correct_answer: 'A',
      points: 1
    },
    {
      test_id: 1,
      question: 'Which of the following is a type of machine learning?',
      option_a: 'Supervised Learning',
      option_b: 'Unsupervised Learning',
      option_c: 'Reinforcement Learning',
      option_d: 'All of the above',
      correct_answer: 'D',
      points: 1
    },
    // Machine Learning Quiz Questions
    {
      test_id: 2,
      question: 'What is the main goal of supervised learning?',
      option_a: 'Find hidden patterns',
      option_b: 'Predict outcomes based on labeled data',
      option_c: 'Maximize rewards',
      option_d: 'Reduce data dimensions',
      correct_answer: 'B',
      points: 1
    },
    {
      test_id: 2,
      question: 'Which algorithm is commonly used for classification?',
      option_a: 'Linear Regression',
      option_b: 'K-Means',
      option_c: 'Decision Tree',
      option_d: 'PCA',
      correct_answer: 'C',
      points: 1
    },
    // Digital Marketing Quiz Questions
    {
      test_id: 3,
      question: 'What does SEO stand for?',
      option_a: 'Search Engine Optimization',
      option_b: 'Social Engagement Online',
      option_c: 'Strategic Email Operations',
      option_d: 'Systematic Electronic Outreach',
      correct_answer: 'A',
      points: 1
    },
    {
      test_id: 3,
      question: 'Which platform is best for B2B marketing?',
      option_a: 'Instagram',
      option_b: 'TikTok',
      option_c: 'LinkedIn',
      option_d: 'Snapchat',
      correct_answer: 'C',
      points: 1
    }
  ];

  testQuestions.forEach((question, index) => {
    db.run('INSERT OR IGNORE INTO test_questions (id, test_id, question, option_a, option_b, option_c, option_d, correct_answer, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [index + 1, question.test_id, question.question, question.option_a, question.option_b, question.option_c, question.option_d, question.correct_answer, question.points], function(err) {
      if (err) {
        console.error('Error inserting test question:', err);
      } else {
        console.log(`Inserted test question: ${question.question}`);
      }
    });
  });

  // Insert demo activities
  const activities = [
    {
      id: 1,
      video_id: 1,
      title: 'AI Reflection Activity',
      description: 'Write a short reflection on how AI impacts your daily life',
      questions: 'Describe three ways AI is already present in your daily routine and explain how it helps you.'
    },
    {
      id: 2,
      video_id: 2,
      title: 'ML Application Ideas',
      description: 'Brainstorm machine learning applications',
      questions: 'Think of a problem in your field that could be solved using machine learning. Describe the problem and propose a solution.'
    },
    {
      id: 3,
      video_id: 6,
      title: 'Marketing Strategy Plan',
      description: 'Create a basic digital marketing strategy',
      questions: 'Choose a product or service and create a simple digital marketing plan including target audience, channels, and key messages.'
    }
  ];

  activities.forEach((activity) => {
    db.run('INSERT OR IGNORE INTO activities (id, video_id, title, description, questions) VALUES (?, ?, ?, ?, ?)',
      [activity.id, activity.video_id, activity.title, activity.description, activity.questions], function(err) {
      if (err) {
        console.error('Error inserting activity:', err);
      } else {
        console.log(`Inserted activity: ${activity.title}`);
      }
    });
  });

  // Insert some demo progress for students
  const demoProgress = [
    { user_id: 4, video_id: 1, status: 'completed' }, // Rahul completed first AI video
    { user_id: 4, video_id: 2, status: 'watching' },   // Rahul watching second AI video
    { user_id: 5, video_id: 6, status: 'completed' }   // Priya completed first marketing video
  ];

  demoProgress.forEach((progress, index) => {
    db.run('INSERT OR IGNORE INTO progress (id, user_id, video_id, status, completed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [index + 1, progress.user_id, progress.video_id, progress.status], function(err) {
      if (err) {
        console.error('Error inserting progress:', err);
      } else {
        console.log(`Inserted progress for user ${progress.user_id}, video ${progress.video_id}`);
      }
    });
  });

  // Insert some demo submissions
  const demoSubmissions = [
    {
      id: 1,
      activity_id: 1,
      video_id: 1,
      user_id: 4, // Rahul
      content: 'AI is everywhere in my daily life. First, my smartphone uses AI for voice recognition when I use Siri. Second, Netflix uses AI to recommend movies I might like. Third, Google Maps uses AI to find the best routes and avoid traffic. These AI systems make my life more convenient and efficient.',
      status: 'pending'
    },
    {
      id: 2,
      activity_id: 3,
      video_id: 6,
      user_id: 5, // Priya
      content: 'Product: Organic skincare line\nTarget Audience: Women aged 25-40 who care about natural products\nChannels: Instagram, Facebook, Google Ads\nKey Messages: "Natural beauty starts with natural ingredients" - Focus on ingredient transparency, sustainability, and results.',
      status: 'approved',
      trainer_comment: 'Great work! Your target audience is well-defined and the messaging is clear.',
      reviewed_at: new Date().toISOString()
    }
  ];

  demoSubmissions.forEach((submission) => {
    db.run('INSERT OR IGNORE INTO submissions (id, activity_id, video_id, user_id, content, status, trainer_comment, submitted_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
      [submission.id, submission.activity_id, submission.video_id, submission.user_id, submission.content, submission.status, submission.trainer_comment, submission.reviewed_at], function(err) {
      if (err) {
        console.error('Error inserting submission:', err);
      } else {
        console.log(`Inserted submission for user ${submission.user_id}`);
      }
    });
  });

  console.log('\n✅ Demo data population completed!');
  console.log('\n📋 Summary:');
  console.log('- 5 courses created');
  console.log('- 8 videos added (5 AI + 3 Marketing)');
  console.log('- 4 demo users created (2 students + 2 trainers)');
  console.log('- 3 tests with 6 questions');
  console.log('- 3 activities');
  console.log('- Demo progress and submissions');
  console.log('\n🔐 Login Credentials:');
  console.log('Admin: admin@ahl.com / admin123');
  console.log('Trainer (AI): amit.trainer@ahl.com / trainer123');
  console.log('Trainer (Marketing): sneha.trainer@ahl.com / trainer123');
  console.log('Student (AI): rahul.student@ahl.com / student123');
  console.log('Student (Marketing): priya.student@ahl.com / student123');
  console.log('\n📱 WhatsApp notifications will be sent to: 7021247525');
});

// Close database connection after all operations
setTimeout(() => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('\n🔒 Database connection closed.');
    }
  });
}, 2000);