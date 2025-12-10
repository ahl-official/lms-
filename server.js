const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const logger = require('./utils/logger');
const path = require('path');
const { authenticateToken: requireAuth, requireRole } = require('./middleware/auth');
const AIService = require('./ai_service');
const AdaptiveLearningService = require('./adaptive_learning_service');

// Import AI test routes
const aiTestRoutes = require('./routes/ai-test-routes');
const mockCallRoutes = require('./routes/mock-call-routes');
const audioRoutes = require('./routes/audio-routes');

// WhatsApp WAHA Configuration
const WAHA_CONFIG = {
  baseUrl: 'https://waha.amankhan.space',
  apiKey: 'Americanhairline@123',
  sessionName: 'aman'
};

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Middleware
// Security headers with CSP adjusted for current frontend
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "script-src-attr": ["'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "blob:", "https://*"],
      "connect-src": ["'self'", "https://*"],
      "frame-src": ["'self'", "https://play.gumlet.io"]
    }
  }
}));

// Strict CORS
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000').split(',');
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin like mobile apps or curl
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
// HTTP request logging
const morganFormat = isProd ? 'combined' : 'dev';
app.use(morgan(morganFormat));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Handle favicon requests to avoid 404 noise
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Handle Chrome DevTools app-specific probe to avoid 404s
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.json({ name: 'AHL Training LMS', status: 'ok' });
});

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
});
app.use(limiter);

// Session configuration
app.use(session({
  name: 'lms.sid',
  secret: process.env.SESSION_SECRET || 'change-me-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? 'lax' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Use AI test routes
app.use('/api/ai-test', aiTestRoutes);

// Use mock call routes
app.use('/api/mock-call', mockCallRoutes);

// Use audio routes
app.use('/api/audio', audioRoutes);

// Use learning tools routes
const learningToolsRoutes = require('./routes/learning-tools-routes');
app.use('/api/tools', learningToolsRoutes);

// Database connection
const db = new sqlite3.Database('./lms_database.db');

// Helper functions for async/await database access
const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const dbGetAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const dbRunAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
};

// Initialize AI Service
const aiService = new AIService();
const adaptiveLearningService = new AdaptiveLearningService();

// Initialize AI Service with API keys from database
db.all('SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ("openai_api_key", "openrouter_api_key")', (err, rows) => {
  if (!err && rows) {
    let openaiKey = null;
    let openrouterKey = null;

    rows.forEach(row => {
      if (row.setting_key === 'openai_api_key') {
        openaiKey = row.setting_value;
      } else if (row.setting_key === 'openrouter_api_key') {
        openrouterKey = row.setting_value;
      }
    });

    if (openaiKey || openrouterKey) {
      aiService.initialize(openaiKey, openrouterKey);
      console.log('AI Service initialized with stored API keys');
    } else {
      console.log('No AI API keys found in database. AI features will be disabled until keys are set.');
    }
  } else {
    console.log('Error loading AI API keys from database. AI features will be disabled.');
  }
});

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'trainer', 'student')),
    course_role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Roles table (used by admin role management UI and APIs)
  db.run(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Ensure core system roles exist
  ['admin', 'trainer', 'student'].forEach((r) => {
    db.run('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)', [r, 'Core system role']);
  });

  // Courses table
  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Trainer-course assignments table
  db.run(`CREATE TABLE IF NOT EXISTS trainer_course_assignments (
    trainer_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    PRIMARY KEY (trainer_id, course_id),
    FOREIGN KEY (trainer_id) REFERENCES users (id),
    FOREIGN KEY (course_id) REFERENCES courses (id)
  )`);

  // Videos table
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    title TEXT NOT NULL,
    gumlet_url TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    gumlet_asset_id TEXT,
    gumlet_collection_id TEXT,
    level_id INTEGER,
    chapter_id INTEGER,
    FOREIGN KEY (course_id) REFERENCES courses (id)
  )`);

  // Course levels table
  db.run(`CREATE TABLE IF NOT EXISTS course_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    sequence INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses (id)
  )`);

  // Course chapters table
  db.run(`CREATE TABLE IF NOT EXISTS course_chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    level_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    sequence INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses (id),
    FOREIGN KEY (level_id) REFERENCES course_levels (id)
  )`);

  // Activities table
  db.run(`CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    questions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos (id)
  )`, (err) => {
    if (err) console.error('Error creating activities table:', err);
  });

  // Progress table
  db.run(`CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    video_id INTEGER,
    status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started', 'watching', 'completed')),
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (video_id) REFERENCES videos (id)
  )`);

  // Submissions table
  db.run(`CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER,
    video_id INTEGER,
    user_id INTEGER,
    content TEXT,
    submission_text TEXT,
    file_path TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    trainer_comment TEXT,
    feedback TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    FOREIGN KEY (activity_id) REFERENCES activities (id),
    FOREIGN KEY (video_id) REFERENCES videos (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Add new columns if they don't exist (for existing databases)
  db.run(`ALTER TABLE submissions ADD COLUMN submission_text TEXT`, (err) => {
    // Ignore error if column already exists
  });
  db.run(`ALTER TABLE submissions ADD COLUMN file_path TEXT`, (err) => {
    // Ignore error if column already exists
  });
  db.run(`ALTER TABLE submissions ADD COLUMN feedback TEXT`, (err) => {
    // Ignore error if column already exists
  });

  // Add hierarchy columns for videos if they don't exist
  db.run(`ALTER TABLE videos ADD COLUMN level_id INTEGER`, (err) => {
    // Ignore error if column already exists
  });
  db.run(`ALTER TABLE videos ADD COLUMN chapter_id INTEGER`, (err) => {
    // Ignore error if column already exists
  });

  // Add trainer-specific columns to users table
  db.run(`ALTER TABLE users ADD COLUMN specialization TEXT`, (err) => {
    // Ignore error if column already exists
  });
  db.run(`ALTER TABLE users ADD COLUMN experience TEXT`, (err) => {
    // Ignore error if column already exists
  });

  // Tests table
  db.run(`CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    passing_score INTEGER DEFAULT 70,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos (id)
  )`);

  // Test questions table
  db.run(`CREATE TABLE IF NOT EXISTS test_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER,
    question TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer TEXT NOT NULL CHECK(correct_answer IN ('A', 'B', 'C', 'D')),
    points INTEGER DEFAULT 1,
    FOREIGN KEY (test_id) REFERENCES tests (id)
  )`);

  // Test results table
  db.run(`CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER,
    user_id INTEGER,
    video_id INTEGER,
    score INTEGER,
    total_questions INTEGER,
    passed BOOLEAN,
    answers TEXT, -- JSON string of user answers
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (test_id) REFERENCES tests (id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (video_id) REFERENCES videos (id)
  )`);

  // Create default users
  const adminPassword = bcrypt.hashSync('admin123', 10);
  const trainerPassword = bcrypt.hashSync('trainer123', 10);
  const studentPassword = bcrypt.hashSync('student123', 10);

  db.run(`INSERT OR IGNORE INTO users (name, email, password, role, course_role) 
          VALUES ('Admin User', 'admin@ahl.com', ?, 'admin', NULL)`, [adminPassword]);

  db.run(`INSERT OR IGNORE INTO users (name, email, phone, password, role, course_role) 
          VALUES ('Demo Trainer', 'trainer@ahl.com', '+1234567890', ?, 'trainer', 'AI Intern')`, [trainerPassword]);

  db.run(`INSERT OR IGNORE INTO users (name, email, phone, password, role, course_role) 
          VALUES ('Demo Student', 'student@ahl.com', '+1234567891', ?, 'student', 'AI Intern')`, [studentPassword]);
});

// Authentication middleware is provided by ./middleware/auth

// API Routes

// Login endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    req.session.userCourseRole = user.course_role;

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        course_role: user.course_role
      }
    });
  });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/user', requireAuth, (req, res) => {
  db.get('SELECT id, name, email, role, course_role FROM users WHERE id = ?',
    [req.session.userId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(user);
    });
});

// Admin Routes

// Create user (admin only)
app.post('/api/users', requireAuth, requireRole(['admin']), (req, res) => {
  const { name, email, phone, password, role, course_role, specialization, experience, trainer_courses } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required' });
  }

  // Validate that the role exists in the roles table
  db.get('SELECT name FROM roles WHERE name = ?', [role], (err, roleExists) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!roleExists) {
      return res.status(400).json({ error: 'Invalid role selected' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run('INSERT INTO users (name, email, phone, password, role, course_role, specialization, experience) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, email, phone, hashedPassword, role, course_role, specialization || null, experience || null], function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Email already exists' });
          }
          return res.status(400).json({ error: 'User creation failed' });
        }

        const userId = this.lastID;

        // Handle trainer course assignments if role is trainer and courses are provided
        if (role === 'trainer' && trainer_courses && trainer_courses.length > 0) {
          handleTrainerCourseAssignments(userId, trainer_courses, (assignmentErr) => {
            if (assignmentErr) {
              console.error('Error assigning courses to trainer:', assignmentErr);
              return res.status(500).json({ error: 'User created but course assignment failed' });
            }
            res.json({ success: true, userId: userId });
          });
        } else {
          res.json({ success: true, userId: userId });
        }
      });
  });
});

// Get all users (admin only)
app.get('/api/users', requireAuth, requireRole(['admin']), (req, res) => {
  db.all('SELECT id, name, email, phone, role, course_role, created_at FROM users', (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

// Update user information (admin only)
app.put('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { name, email, phone, role, course_role, specialization, experience, trainer_courses } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Function to handle trainer course assignments
  const handleTrainerCourseAssignments = (userId, courseIds) => {
    if (!courseIds || !Array.isArray(courseIds)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // First, remove all existing assignments for this trainer
      db.run('DELETE FROM trainer_course_assignments WHERE trainer_id = ?', [userId], (err) => {
        if (err) {
          return reject(err);
        }

        // If no courses to assign, we're done
        if (courseIds.length === 0) {
          return resolve();
        }

        // Insert new assignments
        const placeholders = courseIds.map(() => '(?, ?)').join(', ');
        const values = [];
        courseIds.forEach(courseId => {
          values.push(userId, courseId);
        });

        db.run(`INSERT INTO trainer_course_assignments (trainer_id, course_id) VALUES ${placeholders}`, values, (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    });
  };

  // If role is being updated, validate it exists
  if (role) {
    db.get('SELECT name FROM roles WHERE name = ?', [role], (err, roleExists) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!roleExists) {
        return res.status(400).json({ error: 'Invalid role selected' });
      }

      // Update with role
      db.run('UPDATE users SET name = ?, email = ?, phone = ?, role = ?, course_role = ?, specialization = ?, experience = ? WHERE id = ?',
        [name, email, phone, role, course_role, specialization, experience, id], async function (err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
              return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(400).json({ error: 'User update failed' });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
          }

          // Handle trainer course assignments if user is a trainer
          if (role === 'trainer' && trainer_courses) {
            try {
              await handleTrainerCourseAssignments(id, trainer_courses);
            } catch (assignmentErr) {
              console.error('Failed to update trainer course assignments:', assignmentErr);
              return res.status(500).json({ error: 'Failed to update course assignments' });
            }
          }

          res.json({ success: true });
        });
    });
  } else {
    // Update without role change
    db.run('UPDATE users SET name = ?, email = ?, phone = ?, course_role = ?, specialization = ?, experience = ? WHERE id = ?',
      [name, email, phone, course_role, specialization, experience, id], async function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Email already exists' });
          }
          return res.status(400).json({ error: 'User update failed' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Check if this user is a trainer and handle course assignments
        db.get('SELECT role FROM users WHERE id = ?', [id], async (err, user) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          if (user && user.role === 'trainer' && trainer_courses) {
            try {
              await handleTrainerCourseAssignments(id, trainer_courses);
            } catch (assignmentErr) {
              console.error('Failed to update trainer course assignments:', assignmentErr);
              return res.status(500).json({ error: 'Failed to update course assignments' });
            }
          }

          res.json({ success: true });
        });
      });
  }
});

// Delete user (admin only)
app.delete('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const userId = req.params.id;

  // Check if user exists and is not an admin
  db.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin users' });
    }

    // Delete user and related data
    db.serialize(() => {
      db.run('DELETE FROM progress WHERE user_id = ?', [userId]);
      db.run('DELETE FROM submissions WHERE user_id = ?', [userId]);
      db.run('DELETE FROM test_results WHERE user_id = ?', [userId]);
      db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete user' });
        }
        res.json({ message: 'User deleted successfully' });
      });
    });
  });
});

// Role Management API Endpoints

// Get all roles
app.get('/api/roles', requireAuth, requireRole(['admin']), (req, res) => {
  db.all('SELECT * FROM roles ORDER BY name', (err, roles) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(roles);
  });
});

// Create new role
app.post('/api/roles', requireAuth, requireRole(['admin']), (req, res) => {
  const { name, description } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Role name is required' });
  }

  db.run('INSERT INTO roles (name, description) VALUES (?, ?)',
    [name.trim(), description || ''], function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(400).json({ error: 'Role name already exists' });
        }
        return res.status(500).json({ error: 'Failed to create role' });
      }
      res.json({
        success: true,
        roleId: this.lastID,
        message: 'Role created successfully'
      });
    });
});

// Update role
app.put('/api/roles/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Role name is required' });
  }

  // Check if role exists
  db.get('SELECT * FROM roles WHERE id = ?', [id], (err, role) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Prevent updating core system roles
    if (['admin', 'trainer', 'student'].includes(role.name)) {
      return res.status(403).json({ error: 'Cannot modify core system roles' });
    }

    db.run('UPDATE roles SET name = ?, description = ? WHERE id = ?',
      [name.trim(), description || '', id], function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Role name already exists' });
          }
          return res.status(500).json({ error: 'Failed to update role' });
        }
        res.json({ message: 'Role updated successfully' });
      });
  });
});

// Delete role
app.delete('/api/roles/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;

  // Check if role exists and get role details
  db.get('SELECT * FROM roles WHERE id = ?', [id], (err, role) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Prevent deleting core system roles
    if (['admin', 'trainer', 'student'].includes(role.name)) {
      return res.status(403).json({ error: 'Cannot delete core system roles' });
    }

    // Check if role is being used by any users
    db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', [role.name], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (result.count > 0) {
        return res.status(400).json({
          error: `Cannot delete role. ${result.count} user(s) are assigned to this role.`
        });
      }

      // Delete the role
      db.run('DELETE FROM roles WHERE id = ?', [id], function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete role' });
        }
        res.json({ message: 'Role deleted successfully' });
      });
    });
  });
});

// Get students for trainer (trainer can see students in their course)
app.get('/api/students', requireAuth, requireRole(['trainer', 'admin']), (req, res) => {
  let query, params;

  if (req.session.userRole === 'admin') {
    // Admin can see all students
    query = 'SELECT id, name, email, phone, role, course_role, created_at FROM users WHERE role = "student"';
    params = [];
  } else {
    // Trainer can only see students from courses they are assigned to
    query = `
      SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role, u.course_role, u.created_at 
      FROM users u
      JOIN courses c ON u.course_role = c.role_name
      JOIN trainer_course_assignments tca ON c.id = tca.course_id
      WHERE u.role = "student" AND tca.trainer_id = ?
    `;
    params = [req.session.userId];
  }

  db.all(query, params, (err, students) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(students);
  });
});

// Create course (admin only)
app.post('/api/courses', requireAuth, requireRole(['admin']), (req, res) => {
  const { role_name, title, trainer_id } = req.body;

  if (!role_name || !title) {
    return res.status(400).json({ error: 'Role name and title are required' });
  }

  if (!trainer_id) {
    return res.status(400).json({ error: 'Trainer assignment is required when creating a course' });
  }

  // Verify trainer exists and has trainer role
  db.get('SELECT id, role FROM users WHERE id = ? AND role = "trainer"', [trainer_id], (err, trainer) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!trainer) {
      return res.status(400).json({ error: 'Invalid trainer ID' });
    }

    // Create course first
    db.run('INSERT INTO courses (role_name, title) VALUES (?, ?)',
      [role_name, title], function (err) {
        if (err) {
          return res.status(400).json({ error: 'Course creation failed' });
        }

        const courseId = this.lastID;

        // Assign trainer to the course
        db.run('INSERT INTO trainer_course_assignments (trainer_id, course_id) VALUES (?, ?)',
          [trainer_id, courseId], function (err) {
            if (err) {
              // If assignment fails, delete the course to maintain consistency
              db.run('DELETE FROM courses WHERE id = ?', [courseId]);
              return res.status(400).json({ error: 'Failed to assign trainer to course' });
            }

            res.json({
              success: true,
              courseId: courseId,
              message: 'Course created and trainer assigned successfully'
            });
          });
      });
  });
});

// Get courses
app.get('/api/courses', requireAuth, (req, res) => {
  const { role_name } = req.query;
  let query = `
    SELECT c.*, u.name as trainer_name
    FROM courses c
    LEFT JOIN trainer_course_assignments tca ON c.id = tca.course_id
    LEFT JOIN users u ON tca.trainer_id = u.id AND u.role = 'trainer'
  `;
  let params = [];

  if (role_name) {
    query += ' WHERE c.role_name = ?';
    params.push(role_name);
  }

  db.all(query, params, (err, courses) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(courses);
  });
});

// Delete course (admin only)
app.delete('/api/courses/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const courseId = req.params.id;

  // Check if course exists
  db.get('SELECT id FROM courses WHERE id = ?', [courseId], (err, course) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Delete course and related data
    db.serialize(() => {
      // Delete activities related to videos in this course
      db.run('DELETE FROM activities WHERE video_id IN (SELECT id FROM videos WHERE course_id = ?)', [courseId]);
      // Delete user progress for videos in this course
      db.run('DELETE FROM progress WHERE video_id IN (SELECT id FROM videos WHERE course_id = ?)', [courseId]);
      // Delete submissions for videos in this course
      db.run('DELETE FROM submissions WHERE video_id IN (SELECT id FROM videos WHERE course_id = ?)', [courseId]);
      // Delete test results for videos in this course
      db.run('DELETE FROM test_results WHERE video_id IN (SELECT id FROM videos WHERE course_id = ?)', [courseId]);
      // Delete tests for videos in this course
      db.run('DELETE FROM tests WHERE video_id IN (SELECT id FROM videos WHERE course_id = ?)', [courseId]);
      // Delete videos in this course
      db.run('DELETE FROM videos WHERE course_id = ?', [courseId]);
      // Finally delete the course
      db.run('DELETE FROM courses WHERE id = ?', [courseId], function (err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete course' });
        }
        res.json({ message: 'Course deleted successfully' });
      });
    });
  });
});

// Trainer-Course Assignment Management

// Assign trainer to course (admin only)
app.post('/api/trainer-assignments', requireAuth, requireRole(['admin']), (req, res) => {
  const { trainer_id, course_id } = req.body;

  if (!trainer_id || !course_id) {
    return res.status(400).json({ error: 'Trainer ID and Course ID are required' });
  }

  // Verify trainer exists and has trainer role
  db.get('SELECT id, role FROM users WHERE id = ? AND role = "trainer"', [trainer_id], (err, trainer) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!trainer) {
      return res.status(400).json({ error: 'Invalid trainer ID' });
    }

    // Verify course exists
    db.get('SELECT id FROM courses WHERE id = ?', [course_id], (err, course) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!course) {
        return res.status(400).json({ error: 'Invalid course ID' });
      }

      // Insert assignment
      db.run('INSERT INTO trainer_course_assignments (trainer_id, course_id) VALUES (?, ?)',
        [trainer_id, course_id], function (err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
              return res.status(400).json({ error: 'Trainer is already assigned to this course' });
            }
            return res.status(400).json({ error: 'Assignment failed' });
          }
          res.json({ success: true, assignmentId: this.lastID });
        });
    });
  });
});

// Get trainer assignments (admin only)
app.get('/api/trainer-assignments', requireAuth, requireRole(['admin']), (req, res) => {
  const query = `
    SELECT tca.id, tca.trainer_id, tca.course_id, tca.assigned_at,
           u.name as trainer_name, u.email as trainer_email,
           c.title as course_title, c.role_name as course_role
    FROM trainer_course_assignments tca
    JOIN users u ON tca.trainer_id = u.id
    JOIN courses c ON tca.course_id = c.id
    ORDER BY tca.assigned_at DESC
  `;

  db.all(query, [], (err, assignments) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(assignments);
  });
});

// Get courses assigned to a specific trainer
app.get('/api/trainers/:trainerId/courses', requireAuth, requireRole(['admin', 'trainer']), (req, res) => {
  const { trainerId } = req.params;

  // Allow trainers to only see their own assignments
  if (req.session.userRole === 'trainer' && req.session.userId != trainerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const query = `
    SELECT c.id, c.title, c.role_name, tca.assigned_at
    FROM courses c
    JOIN trainer_course_assignments tca ON c.id = tca.course_id
    WHERE tca.trainer_id = ?
    ORDER BY c.title
  `;

  db.all(query, [trainerId], (err, courses) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(courses);
  });
});

// Get trainers assigned to a specific course (admin only)
app.get('/api/courses/:courseId/trainers', requireAuth, requireRole(['admin']), (req, res) => {
  const { courseId } = req.params;

  const query = `
    SELECT u.id, u.name, u.email, tca.assigned_at
    FROM users u
    JOIN trainer_course_assignments tca ON u.id = tca.trainer_id
    WHERE tca.course_id = ? AND u.role = 'trainer'
    ORDER BY u.name
  `;

  db.all(query, [courseId], (err, trainers) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(trainers);
  });
});

// Remove trainer assignment (admin only)
app.delete('/api/trainer-assignments/:trainerId/:courseId', requireAuth, requireRole(['admin']), (req, res) => {
  const { trainerId, courseId } = req.params;

  db.run('DELETE FROM trainer_course_assignments WHERE trainer_id = ? AND course_id = ?', [trainerId, courseId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to remove assignment' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ success: true, message: 'Assignment removed successfully' });
  });
});

// Add video lesson to course (admin only)
app.post('/api/videos', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { course_id, title, gumlet_url, sequence, chapter_id } = req.body;

    const courseIdNum = parseInt(course_id);
    const chapterIdNum = parseInt(chapter_id);
    let sequenceNum = sequence !== undefined ? parseInt(sequence) : NaN;

    if (!title || !gumlet_url || !courseIdNum || !chapterIdNum) {
      return res.status(400).json({ error: 'Course, chapter, title, and Gumlet URL are required' });
    }

    const chapter = await dbGetAsync(
      `SELECT cc.id, cc.course_id, cc.level_id, cc.sequence as chapter_sequence, cl.sequence as level_sequence
       FROM course_chapters cc
       JOIN course_levels cl ON cc.level_id = cl.id
       WHERE cc.id = ? AND cc.course_id = ?`,
      [chapterIdNum, courseIdNum]
    );

    if (!chapter) {
      return res.status(400).json({ error: 'Invalid chapter for course' });
    }

    if (isNaN(sequenceNum)) {
      const result = await dbGetAsync('SELECT MAX(sequence) as maxSequence FROM videos WHERE course_id = ?', [courseIdNum]);
      sequenceNum = (result?.maxSequence || 0) + 1;
    }

    const insertResult = await dbRunAsync(
      'INSERT INTO videos (course_id, title, gumlet_url, sequence, level_id, chapter_id) VALUES (?, ?, ?, ?, ?, ?)',
      [courseIdNum, title, gumlet_url, sequenceNum, chapter.level_id, chapter.id]
    );

    res.json({
      success: true,
      videoId: insertResult.lastID,
      sequence: sequenceNum,
      level_id: chapter.level_id,
      chapter_id: chapter.id
    });
  } catch (error) {
    console.error('Failed to create video lesson:', error);
    res.status(400).json({ error: 'Video creation failed', details: error.message });
  }
});

// AI Endpoints

// Transcribe video
app.post('/api/videos/:id/transcribe', requireAuth, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    // Get video details
    db.get('SELECT * FROM videos WHERE id = ?', [id], async (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      // Check if transcript already exists and is completed
      db.get('SELECT * FROM video_transcripts WHERE video_id = ? AND transcription_status = "completed"', [id], async (err, existingTranscript) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        if (existingTranscript) {
          return res.status(400).json({ error: 'Video already transcribed' });
        }

        try {
          const transcript = await aiService.transcribeVideo(id, video.gumlet_url);
          res.json({ success: true, transcript });
        } catch (error) {
          console.error('Transcription error:', error);
          res.status(500).json({ error: 'Transcription failed: ' + error.message });
        }
      });
    });
  } catch (error) {
    console.error('Transcription endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate AI content for video
app.post('/api/videos/:id/generate-content', requireAuth, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { contentType, numQuestions } = req.body;

  if (!contentType || !['test', 'activity'].includes(contentType)) {
    return res.status(400).json({ error: 'Valid content type (test or activity) is required' });
  }

  try {
    // Get video and transcript (get the latest completed transcript)
    db.get(`
      SELECT v.*, vt.transcript_text 
      FROM videos v 
      LEFT JOIN video_transcripts vt ON v.id = vt.video_id 
        AND vt.transcription_status = 'completed'
        AND vt.transcript_text IS NOT NULL 
        AND vt.transcript_text != ''
      WHERE v.id = ?
      ORDER BY vt.id DESC
      LIMIT 1
    `, [id], async (err, video) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }
      if (!video.transcript_text) {
        return res.status(400).json({ error: 'Video must be transcribed first' });
      }

      try {
        // Get current AI provider and model settings
        const provider = await aiService.getCurrentProvider();
        const model = await aiService.getCurrentModel(provider);

        let generatedContent;
        if (contentType === 'test') {
          generatedContent = await aiService.generateTestQuestions(id, video.title, video.transcript_text, null, provider, model);
        } else {
          generatedContent = await aiService.generateActivity(id, video.title, video.transcript_text, null, provider, model);
        }

        // Save generated content for admin review
        if (generatedContent && !generatedContent.error) {
          const contentId = await aiService.saveGeneratedContent(id, contentType, generatedContent, 'pending_review');
          res.json({ success: true, content: generatedContent, contentId: contentId, message: 'Content generated and saved for admin review' });
        } else {
          res.json({ success: false, error: generatedContent.error || 'Content generation failed' });
        }
      } catch (error) {
        console.error('Content generation error:', error);
        res.status(500).json({ error: 'Content generation failed: ' + error.message });
      }
    });
  } catch (error) {
    console.error('Generate content endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get AI generated content for approval
app.get('/api/ai-content/pending', requireAuth, requireRole(['admin']), (req, res) => {
  console.log('=== AI Content Pending API called ===');
  console.log('Request timestamp:', new Date().toISOString());
  console.log('User ID:', req.session.userId);
  console.log('User Role:', req.session.userRole);

  // First, let's check all AI content to see what's in the database
  db.all('SELECT id, video_id, content_type, status, created_at FROM ai_generated_content ORDER BY created_at DESC LIMIT 10', (err, allContent) => {
    if (err) {
      console.error('Error fetching all AI content:', err);
    } else {
      console.log('=== All AI Content (last 10) ===');
      allContent.forEach(item => {
        console.log(`ID: ${item.id}, Video: ${item.video_id}, Type: ${item.content_type}, Status: ${item.status}, Created: ${item.created_at}`);
      });
    }

    // Now fetch pending content
    db.all(`
      SELECT ac.*, v.title as video_title, v.course_id
      FROM ai_generated_content ac
      LEFT JOIN videos v ON ac.video_id = v.id
      WHERE ac.status IN ('pending_review', 'updated_pending')
      ORDER BY ac.created_at DESC
    `, (err, content) => {
      if (err) {
        console.error('Database error in AI content pending:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('=== Pending AI Content Query Results ===');
      console.log('Found items:', content ? content.length : 0);

      if (content && content.length > 0) {
        content.forEach(item => {
          console.log(`Pending Item - ID: ${item.id}, Video: ${item.video_id} (${item.video_title}), Type: ${item.content_type}, Status: ${item.status}, Created: ${item.created_at}`);
        });
      } else {
        console.log('No pending content found. Checking if any content exists with pending_review status...');
        db.all("SELECT id, status, created_at FROM ai_generated_content WHERE status = 'pending_review'", (err, pendingCheck) => {
          if (err) {
            console.error('Error checking pending_review status:', err);
          } else {
            console.log('Direct pending_review check found:', pendingCheck.length, 'items');
            pendingCheck.forEach(item => {
              console.log(`Direct check - ID: ${item.id}, Status: ${item.status}, Created: ${item.created_at}`);
            });
          }
        });
      }

      console.log('=== End AI Content Pending API ===');
      res.json(content);
    });
  });
});

// Approve/Reject AI generated content
app.put('/api/ai-content/:id/review', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { action, feedback } = req.body; // action: 'approve' or 'reject'

  console.log('=== AI Content Review API called ===');
  console.log('Content ID:', id);
  console.log('Action:', action);
  console.log('Feedback:', feedback);
  console.log('User ID:', req.session.userId);
  console.log('Timestamp:', new Date().toISOString());

  if (!action || !['approve', 'reject'].includes(action)) {
    console.log('Invalid action provided:', action);
    return res.status(400).json({ error: 'Valid action (approve or reject) is required' });
  }

  db.get('SELECT * FROM ai_generated_content WHERE id = ?', [id], (err, content) => {
    if (err) {
      console.error('Database error fetching content for review:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!content) {
      console.log('Content not found for ID:', id);
      return res.status(404).json({ error: 'Content not found' });
    }

    console.log('Current content status:', content.status);
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    console.log('Changing status from', content.status, 'to', newStatus);

    db.run(`
      UPDATE ai_generated_content 
      SET status = ?, admin_feedback = ?, reviewed_at = datetime('now'), reviewed_by = ?
      WHERE id = ?
    `, [newStatus, feedback || null, req.session.userId, id], function (err) {
      if (err) {
        console.error('Database error updating content status:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('Status update successful. Rows affected:', this.changes);
      console.log('=== Status Change Completed ===');

      // If approved, create actual test or activity
      if (action === 'approve') {
        let rawContent = content.generated_content;

        // First, check if it's a JSON string that needs parsing
        if (typeof rawContent === 'string' && (rawContent.startsWith('"') || rawContent.startsWith("'")) && (rawContent.endsWith('"') || rawContent.endsWith("'"))) {
          try {
            rawContent = JSON.parse(rawContent);
          } catch (e) {
            console.log('Failed to parse outer JSON string:', e.message);
          }
        }

        // Strip markdown code blocks if present
        if (typeof rawContent === 'string') {
          if (rawContent.startsWith('```json')) {
            rawContent = rawContent.replace(/^```json\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
          } else if (rawContent.startsWith('```')) {
            rawContent = rawContent.replace(/^```\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
          }
        }

        const contentData = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
        console.log('Debug - Raw generated_content (first 100 chars):', content.generated_content.substring(0, 100));
        console.log('Debug - Cleaned content (first 100 chars):', rawContent.substring(0, 100));
        console.log('Debug - Parsed contentData type:', typeof contentData);
        console.log('Debug - Is Array:', Array.isArray(contentData));
        console.log('Debug - contentData.questions:', contentData.questions);

        if (content.content_type === 'test') {
          // Get video title for the test
          db.get('SELECT title FROM videos WHERE id = ?', [content.video_id], (err, video) => {
            if (err) {
              console.error('Error fetching video:', err);
              return res.status(500).json({ error: 'Failed to fetch video details' });
            }

            const testTitle = video ? `${video.title} - Test` : 'Video Test';
            const testDescription = `Test questions for ${video ? video.title : 'this video'}`;

            console.log('Debug - Video object:', video);
            console.log('Debug - Test title:', testTitle);
            console.log('Debug - Test description:', testDescription);
            console.log('Debug - Video ID:', content.video_id);

            // Create test and questions
            db.run('INSERT INTO tests (video_id, title, description) VALUES (?, ?, ?)',
              [content.video_id, testTitle, testDescription], function (err) {
                if (err) {
                  console.error('Error creating test:', err);
                  return res.status(500).json({ error: 'Failed to create test' });
                }

                const testId = this.lastID;
                let questions;

                // Handle different data structures
                if (Array.isArray(contentData)) {
                  questions = contentData;
                } else if (contentData && contentData.questions && Array.isArray(contentData.questions)) {
                  questions = contentData.questions;
                } else {
                  console.error('Invalid content data structure:', contentData);
                  return res.status(500).json({ error: 'Invalid content data structure' });
                }

                console.log('Debug - Questions to process:', questions.length);

                // Insert questions
                const insertQuestion = db.prepare(`
                INSERT INTO test_questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `);

                questions.forEach((q, index) => {
                  console.log(`Processing question ${index + 1}:`, q.question);

                  // Handle different option formats
                  let optionA, optionB, optionC, optionD, correctAnswer;

                  if (Array.isArray(q.options)) {
                    // Options as array format
                    optionA = q.options[0];
                    optionB = q.options[1];
                    optionC = q.options[2];
                    optionD = q.options[3];
                    correctAnswer = ['A', 'B', 'C', 'D'][q.correct];
                  } else if (q.options && typeof q.options === 'object') {
                    // Options as object format {A: "...", B: "...", C: "...", D: "..."}
                    optionA = q.options.A;
                    optionB = q.options.B;
                    optionC = q.options.C;
                    optionD = q.options.D;
                    correctAnswer = q.correct_answer || q.correct;
                  } else {
                    console.error(`Invalid options format for question ${index + 1}:`, q.options);
                    return;
                  }

                  insertQuestion.run([
                    testId,
                    q.question,
                    optionA,
                    optionB,
                    optionC,
                    optionD,
                    correctAnswer
                  ]);
                });

                insertQuestion.finalize();
                res.json({ success: true, message: 'Test approved and created', testId });
              });
          });
        } else {
          // Create activity
          db.run('INSERT INTO activities (video_id, title, description) VALUES (?, ?, ?)',
            [content.video_id, contentData.title, contentData.description], function (err) {
              if (err) {
                console.error('Error creating activity:', err);
                return res.status(500).json({ error: 'Failed to create activity' });
              }

              res.json({ success: true, message: 'Activity approved and created', activityId: this.lastID });
            });
        }
      } else {
        res.json({ success: true, message: 'Content rejected' });
      }
    });
  });
});

// Get video transcript
app.get('/api/videos/:id/transcript', requireAuth, requireRole(['admin', 'trainer', 'student']), (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT transcript_text, transcription_status, updated_at 
    FROM video_transcripts 
    WHERE video_id = ? AND transcription_status = 'completed'
    ORDER BY id DESC 
    LIMIT 1
  `, [id], (err, transcript) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!transcript) {
      return res.status(404).json({ error: 'No transcript found for this video' });
    }

    res.json(transcript);
  });
});

// Delete video transcript
app.delete('/api/videos/:id/transcript', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM video_transcripts WHERE video_id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'No transcript found for this video' });
    }

    res.json({ success: true, message: 'Transcript deleted successfully' });
  });
});

// Student Q&A with AI
app.post('/api/videos/:id/ask-ai', requireAuth, (req, res) => {
  const { id } = req.params;
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  // Get video transcript (get the latest completed transcript)
  db.get(`
    SELECT v.title, vt.transcript_text 
    FROM videos v 
    LEFT JOIN video_transcripts vt ON v.id = vt.video_id 
      AND vt.transcription_status = 'completed'
      AND vt.transcript_text IS NOT NULL 
      AND vt.transcript_text != ''
    WHERE v.id = ?
    ORDER BY vt.id DESC
    LIMIT 1
  `, [id], async (err, video) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    if (!video.transcript_text) {
      return res.status(400).json({ error: 'Video transcript not available' });
    }

    try {
      // Get current AI provider and model settings
      const provider = await aiService.getCurrentProvider();
      const model = await aiService.getCurrentModel(provider);

      const answer = await aiService.answerStudentQuestion(req.session.userId, id, question, provider, model);

      // Save Q&A session
      db.run(`
        INSERT INTO student_qa_sessions (student_id, video_id, question, ai_response)
        VALUES (?, ?, ?, ?)
      `, [req.session.userId, id, question, answer], (err) => {
        if (err) {
          console.error('Error saving Q&A session:', err);
        }
      });

      res.json({ success: true, answer });
    } catch (error) {
      console.error('AI Q&A error:', error);
      res.status(500).json({ error: 'Failed to get AI response: ' + error.message });
    }
  });
});

// Request content update
app.post('/api/ai-content/:id/request-update', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { updateReason, newRequirements } = req.body;

  if (!updateReason) {
    return res.status(400).json({ error: 'Update reason is required' });
  }

  // Check if content exists and is approved
  db.get('SELECT * FROM ai_generated_content WHERE id = ? AND status = "approved"', [id], (err, content) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!content) {
      return res.status(404).json({ error: 'Approved content not found' });
    }

    // Create update request
    db.run(`
      INSERT INTO ai_content_updates (original_content_id, requested_by, update_reason, new_requirements)
      VALUES (?, ?, ?, ?)
    `, [id, req.session.userId, updateReason, newRequirements || null], function (err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({ success: true, updateRequestId: this.lastID, message: 'Update request created' });
    });
  });
});

// Generate updated content
app.post('/api/ai-content/update/:updateId/generate', requireAuth, requireRole(['admin']), async (req, res) => {
  const { updateId } = req.params;

  try {
    // Get update request and original content
    db.get(`
      SELECT acu.*, ac.video_id, ac.content_type, ac.content_json, v.title, vt.transcript_text
      FROM ai_content_updates acu
      JOIN ai_generated_content ac ON acu.original_content_id = ac.id
      JOIN videos v ON ac.video_id = v.id
      LEFT JOIN video_transcripts vt ON v.id = vt.video_id
      WHERE acu.id = ? AND acu.status = 'pending'
    `, [updateId], async (err, updateRequest) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!updateRequest) {
        return res.status(404).json({ error: 'Update request not found' });
      }
      if (!updateRequest.transcript_text) {
        return res.status(400).json({ error: 'Video transcript not available' });
      }

      try {
        let updatedContent;
        const originalContent = JSON.parse(updateRequest.content_json);
        const updateContext = `Original content: ${JSON.stringify(originalContent)}\n\nUpdate reason: ${updateRequest.update_reason}\n\nNew requirements: ${updateRequest.new_requirements || 'None specified'}`;

        if (updateRequest.content_type === 'test') {
          updatedContent = await aiService.generateTestQuestions(
            updateRequest.video_id,
            updateRequest.title,
            updateRequest.transcript_text,
            updateContext
          );
        } else {
          updatedContent = await aiService.generateActivity(
            updateRequest.video_id,
            updateRequest.title,
            updateRequest.transcript_text,
            updateContext
          );
        }

        // Save updated content
        db.run(`
          INSERT INTO ai_generated_content (video_id, content_type, content_json, status, version, parent_content_id)
          VALUES (?, ?, ?, 'pending', ?, ?)
        `, [
          updateRequest.video_id,
          updateRequest.content_type,
          JSON.stringify(updatedContent),
          (originalContent.version || 1) + 1,
          updateRequest.original_content_id
        ], function (err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          // Update request status
          db.run('UPDATE ai_content_updates SET status = "completed", updated_content_id = ? WHERE id = ?',
            [this.lastID, updateId], (err) => {
              if (err) {
                console.error('Error updating request status:', err);
              }
            });

          res.json({ success: true, content: updatedContent, newContentId: this.lastID });
        });
      } catch (error) {
        console.error('Content update generation error:', error);
        res.status(500).json({ error: 'Content update failed: ' + error.message });
      }
    });
  } catch (error) {
    console.error('Update generation endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save AI settings (both OpenAI and OpenRouter)
app.post('/api/ai/settings', requireAuth, requireRole(['admin']), (req, res) => {
  const settings = req.body;

  if (!settings) {
    return res.status(400).json({ error: 'Settings are required' });
  }

  // Prepare settings to save
  const settingsToSave = [];

  // Add all settings to the array
  Object.keys(settings).forEach(key => {
    if (settings[key] !== undefined && settings[key] !== null) {
      settingsToSave.push([key, settings[key]]);
    }
  });

  if (settingsToSave.length === 0) {
    return res.status(400).json({ error: 'No valid settings provided' });
  }

  // Save all settings to database
  let savedCount = 0;
  let hasError = false;

  settingsToSave.forEach(([key, value]) => {
    db.run(`
      INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, datetime('now'))
    `, [key, value], function (err) {
      if (err && !hasError) {
        hasError = true;
        return res.status(500).json({ error: 'Database error' });
      }

      savedCount++;

      // When all settings are saved, reinitialize AI service
      if (savedCount === settingsToSave.length && !hasError) {
        try {
          // Reinitialize AI service with new settings
          const openaiKey = settings.openai_api_key;
          const openrouterKey = settings.openrouter_api_key;

          if (openaiKey || openrouterKey) {
            aiService.initialize(openaiKey, openrouterKey);
          }

          res.json({ success: true, message: 'AI settings saved successfully' });
        } catch (error) {
          res.status(400).json({ error: 'Settings saved but initialization failed: ' + error.message });
        }
      }
    });
  });
});

// Test AI connection
app.post('/api/ai/test-connection', requireAuth, requireRole(['admin']), async (req, res) => {
  const { apiKey, provider = 'openai' } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    let response;

    if (provider === 'openrouter') {
      // Test OpenRouter API
      response = await axios.get('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'AHL Training LMS'
        }
      });
    } else {
      // Test OpenAI API
      response = await axios.get('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });
    }

    if (response.status === 200) {
      const providerName = provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
      const modelCount = provider === 'openrouter'
        ? (response.data.data ? response.data.data.length : 0)
        : (response.data.data ? response.data.data.length : 0);

      res.json({
        success: true,
        message: `${providerName} API connection successful`,
        models: modelCount
      });
    } else {
      res.status(400).json({ error: 'Invalid API response' });
    }
  } catch (error) {
    console.error('AI connection test error:', error.message);

    if (error.response) {
      // API responded with an error
      const status = error.response.status;
      if (status === 401) {
        res.status(400).json({ error: 'Invalid API key' });
      } else if (status === 429) {
        res.status(400).json({ error: 'Rate limit exceeded' });
      } else {
        res.status(400).json({ error: `API error: ${error.response.data?.error?.message || 'Unknown error'}` });
      }
    } else if (error.code === 'ECONNABORTED') {
      res.status(400).json({ error: 'Connection timeout' });
    } else {
      res.status(500).json({ error: 'Network error: ' + error.message });
    }
  }
});

// Get AI settings
app.get('/api/ai/settings', requireAuth, requireRole(['admin']), (req, res) => {
  db.all('SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE "ai_%" OR setting_key LIKE "%openai%" OR setting_key LIKE "%openrouter%" OR setting_key = "default_ai_provider"', (err, settings) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const settingsObj = {};
    settings.forEach(setting => {
      // Don't expose the full API keys, just show if they're set
      if (setting.setting_key === 'openai_api_key' || setting.setting_key === 'openrouter_api_key') {
        settingsObj[setting.setting_key] = setting.setting_value ? '***' + setting.setting_value.slice(-4) : null;
      } else {
        settingsObj[setting.setting_key] = setting.setting_value;
      }
    });

    res.json(settingsObj);
  });
});

// Get video transcripts count
app.get('/api/video-transcripts/count', requireAuth, requireRole(['admin']), (req, res) => {
  db.get('SELECT COUNT(*) as count FROM video_transcripts WHERE transcription_status = "completed"', (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ count: result.count });
  });
});

// Get AI generated content count
app.get('/api/ai-generated-content/count', requireAuth, requireRole(['admin']), (req, res) => {
  db.get('SELECT COUNT(*) as count FROM ai_generated_content', (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ count: result.count });
  });
});

// Get student QA sessions count
app.get('/api/student-qa-sessions/count', requireAuth, requireRole(['admin']), (req, res) => {
  db.get('SELECT COUNT(*) as count FROM student_qa_sessions', (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ count: result.count });
  });
});

// Get all video transcripts for export
app.get('/api/video-transcripts', requireAuth, requireRole(['admin']), (req, res) => {
  db.all(`
    SELECT vt.*, v.title as video_title, v.course_id
    FROM video_transcripts vt
    JOIN videos v ON vt.video_id = v.id
    ORDER BY vt.created_at DESC
  `, (err, transcripts) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(transcripts);
  });
});

// Get all AI generated content for export
app.get('/api/ai-generated-content', requireAuth, requireRole(['admin']), (req, res) => {
  db.all(`
    SELECT agc.*, v.title as video_title, v.course_id
    FROM ai_generated_content agc
    JOIN videos v ON agc.video_id = v.id
    ORDER BY agc.created_at DESC
  `, (err, content) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(content);
  });
});

// Get all student QA sessions for export
app.get('/api/student-qa-sessions', requireAuth, requireRole(['admin']), (req, res) => {
  db.all(`
    SELECT sqa.*, u.name as student_name, v.title as video_title, v.course_id
    FROM student_qa_sessions sqa
    JOIN users u ON sqa.student_id = u.id
    JOIN videos v ON sqa.video_id = v.id
    ORDER BY sqa.created_at DESC
  `, (err, sessions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(sessions);
  });
});

// Get pending AI content update requests
app.get('/api/ai-content-updates/pending', requireAuth, requireRole(['admin']), (req, res) => {
  db.all(`
    SELECT acu.*, v.title as video_title, v.course_id, agc.content_type
    FROM ai_content_updates acu
    JOIN videos v ON acu.video_id = v.id
    LEFT JOIN ai_generated_content agc ON acu.content_id = agc.id
    WHERE acu.status = 'pending'
    ORDER BY acu.created_at DESC
  `, (err, updates) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(updates);
  });
});

// Get videos for course with hierarchy metadata
app.get('/api/courses/:courseId/videos', requireAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const videos = await dbAll(
      `SELECT v.*, 
              cl.title as level_title,
              cl.sequence as level_sequence,
              cc.title as chapter_title,
              cc.sequence as chapter_sequence
       FROM videos v
       LEFT JOIN course_levels cl ON v.level_id = cl.id
       LEFT JOIN course_chapters cc ON v.chapter_id = cc.id
       WHERE v.course_id = ?
       ORDER BY 
         COALESCE(cl.sequence, 9999),
         COALESCE(cc.sequence, 9999),
         v.sequence`,
      [courseId]
    );

    res.json(videos);
  } catch (error) {
    console.error('Failed to load videos:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get nested course structure (levels -> chapters -> lessons)
app.get('/api/courses/:courseId/structure', requireAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const courseIdNum = parseInt(courseId);

    if (!courseIdNum) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const course = await dbGetAsync('SELECT * FROM courses WHERE id = ?', [courseIdNum]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const levels = await dbAll(
      'SELECT * FROM course_levels WHERE course_id = ? ORDER BY sequence, id',
      [courseIdNum]
    );

    const chapters = await dbAll(
      'SELECT * FROM course_chapters WHERE course_id = ? ORDER BY sequence, id',
      [courseIdNum]
    );

    const lessons = await dbAll(
      `SELECT v.*, 
              cl.sequence as level_sequence,
              cc.sequence as chapter_sequence
       FROM videos v
       LEFT JOIN course_levels cl ON v.level_id = cl.id
       LEFT JOIN course_chapters cc ON v.chapter_id = cc.id
       WHERE v.course_id = ?
       ORDER BY 
         COALESCE(cl.sequence, 9999),
         COALESCE(cc.sequence, 9999),
         v.sequence`,
      [courseIdNum]
    );

    const chapterMap = new Map();
    chapters.forEach(chapter => {
      chapterMap.set(chapter.id, {
        ...chapter,
        lessons: []
      });
    });

    lessons.forEach(lesson => {
      if (lesson.chapter_id && chapterMap.has(lesson.chapter_id)) {
        chapterMap.get(lesson.chapter_id).lessons.push(lesson);
      }
    });

    const levelMap = new Map();
    levels.forEach(level => {
      levelMap.set(level.id, {
        ...level,
        chapters: []
      });
    });

    chapters.forEach(chapter => {
      const levelContainer = levelMap.get(chapter.level_id);
      if (levelContainer) {
        const chapterData = chapterMap.get(chapter.id) || { ...chapter, lessons: [] };
        chapterData.lessons.sort((a, b) => a.sequence - b.sequence || a.id - b.id);
        levelContainer.chapters.push(chapterData);
      }
    });

    const structuredLevels = Array.from(levelMap.values())
      .sort((a, b) => a.sequence - b.sequence || a.id - b.id)
      .map(level => ({
        ...level,
        chapters: level.chapters.sort((a, b) => a.sequence - b.sequence || a.id - b.id)
      }));

    const unassignedLessons = lessons.filter(lesson => !lesson.chapter_id);

    res.json({
      course,
      levels: structuredLevels,
      unassignedLessons
    });
  } catch (error) {
    console.error('Failed to load course structure:', error);
    res.status(500).json({ error: 'Failed to load course structure' });
  }
});

// Create course level
app.post('/api/courses/:courseId/levels', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, sequence } = req.body;

    const courseIdNum = parseInt(courseId);
    if (!courseIdNum) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    if (!title) {
      return res.status(400).json({ error: 'Level title is required' });
    }

    const course = await dbGetAsync('SELECT id FROM courses WHERE id = ?', [courseIdNum]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    let sequenceNum = sequence !== undefined ? parseInt(sequence) : NaN;
    if (isNaN(sequenceNum)) {
      const result = await dbGetAsync('SELECT MAX(sequence) as maxSequence FROM course_levels WHERE course_id = ?', [courseIdNum]);
      sequenceNum = (result?.maxSequence || 0) + 1;
    }

    const insertResult = await dbRunAsync(
      'INSERT INTO course_levels (course_id, title, description, sequence) VALUES (?, ?, ?, ?)',
      [courseIdNum, title, description || null, sequenceNum]
    );

    const level = await dbGetAsync('SELECT * FROM course_levels WHERE id = ?', [insertResult.lastID]);
    res.json({ success: true, level });
  } catch (error) {
    console.error('Failed to create course level:', error);
    res.status(500).json({ error: 'Failed to create level' });
  }
});

// Update course level
app.put('/api/levels/:levelId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { levelId } = req.params;
    const { title, description, sequence } = req.body;

    const level = await dbGetAsync('SELECT * FROM course_levels WHERE id = ?', [levelId]);
    if (!level) {
      return res.status(404).json({ error: 'Level not found' });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (sequence !== undefined) {
      const sequenceNum = parseInt(sequence);
      if (isNaN(sequenceNum)) {
        return res.status(400).json({ error: 'Invalid sequence value' });
      }
      updates.push('sequence = ?');
      params.push(sequenceNum);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    params.push(levelId);

    await dbRunAsync(`UPDATE course_levels SET ${updates.join(', ')} WHERE id = ?`, params);

    const updatedLevel = await dbGetAsync('SELECT * FROM course_levels WHERE id = ?', [levelId]);
    res.json({ success: true, level: updatedLevel });
  } catch (error) {
    console.error('Failed to update level:', error);
    res.status(500).json({ error: 'Failed to update level' });
  }
});

// Delete course level (requires no chapters)
app.delete('/api/levels/:levelId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { levelId } = req.params;

    const level = await dbGetAsync('SELECT * FROM course_levels WHERE id = ?', [levelId]);
    if (!level) {
      return res.status(404).json({ error: 'Level not found' });
    }

    const chapterCount = await dbGetAsync('SELECT COUNT(*) as total FROM course_chapters WHERE level_id = ?', [levelId]);
    if (chapterCount?.total > 0) {
      return res.status(400).json({ error: 'Cannot delete level with existing chapters. Remove chapters first.' });
    }

    await dbRunAsync('DELETE FROM course_levels WHERE id = ?', [levelId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete level:', error);
    res.status(500).json({ error: 'Failed to delete level' });
  }
});

// Create chapter under level
app.post('/api/levels/:levelId/chapters', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { levelId } = req.params;
    const { title, description, sequence } = req.body;

    const level = await dbGetAsync('SELECT * FROM course_levels WHERE id = ?', [levelId]);
    if (!level) {
      return res.status(404).json({ error: 'Level not found' });
    }

    if (!title) {
      return res.status(400).json({ error: 'Chapter title is required' });
    }

    let sequenceNum = sequence !== undefined ? parseInt(sequence) : NaN;
    if (isNaN(sequenceNum)) {
      const result = await dbGetAsync('SELECT MAX(sequence) as maxSequence FROM course_chapters WHERE level_id = ?', [levelId]);
      sequenceNum = (result?.maxSequence || 0) + 1;
    }

    const insertResult = await dbRunAsync(
      'INSERT INTO course_chapters (course_id, level_id, title, description, sequence) VALUES (?, ?, ?, ?, ?)',
      [level.course_id, level.id, title, description || null, sequenceNum]
    );

    const chapter = await dbGetAsync('SELECT * FROM course_chapters WHERE id = ?', [insertResult.lastID]);
    res.json({ success: true, chapter });
  } catch (error) {
    console.error('Failed to create chapter:', error);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

// Update chapter details or assignment
app.put('/api/chapters/:chapterId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { title, description, sequence, level_id } = req.body;

    const chapter = await dbGetAsync('SELECT * FROM course_chapters WHERE id = ?', [chapterId]);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    let newLevelId = chapter.level_id;

    if (level_id !== undefined) {
      const level = await dbGetAsync('SELECT * FROM course_levels WHERE id = ?', [level_id]);
      if (!level) {
        return res.status(400).json({ error: 'Target level not found' });
      }
      if (level.course_id !== chapter.course_id) {
        return res.status(400).json({ error: 'Chapter and level must belong to the same course' });
      }
      newLevelId = level.id;
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (sequence !== undefined) {
      const sequenceNum = parseInt(sequence);
      if (isNaN(sequenceNum)) {
        return res.status(400).json({ error: 'Invalid sequence value' });
      }
      updates.push('sequence = ?');
      params.push(sequenceNum);
    }

    if (newLevelId !== chapter.level_id) {
      updates.push('level_id = ?');
      params.push(newLevelId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    params.push(chapterId);

    await dbRunAsync(`UPDATE course_chapters SET ${updates.join(', ')} WHERE id = ?`, params);

    const updatedChapter = await dbGetAsync('SELECT * FROM course_chapters WHERE id = ?', [chapterId]);
    if (newLevelId !== chapter.level_id) {
      // Update existing videos to new level as well
      await dbRunAsync('UPDATE videos SET level_id = ? WHERE chapter_id = ?', [newLevelId, chapterId]);
    }

    res.json({ success: true, chapter: updatedChapter });
  } catch (error) {
    console.error('Failed to update chapter:', error);
    res.status(500).json({ error: 'Failed to update chapter' });
  }
});

// Delete chapter (requires no lessons)
app.delete('/api/chapters/:chapterId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { chapterId } = req.params;

    const chapter = await dbGetAsync('SELECT * FROM course_chapters WHERE id = ?', [chapterId]);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const lessonCount = await dbGetAsync('SELECT COUNT(*) as total FROM videos WHERE chapter_id = ?', [chapterId]);
    if (lessonCount?.total > 0) {
      return res.status(400).json({ error: 'Cannot delete chapter with lessons. Remove or reassign lessons first.' });
    }

    await dbRunAsync('DELETE FROM course_chapters WHERE id = ?', [chapterId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete chapter:', error);
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

// Update video
app.put('/api/videos/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, gumlet_url, sequence, chapter_id } = req.body;

    if (!title || !gumlet_url) {
      return res.status(400).json({ error: 'Title and Gumlet URL are required' });
    }

    const video = await dbGetAsync('SELECT * FROM videos WHERE id = ?', [id]);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    let sequenceNum = sequence !== undefined ? parseInt(sequence) : video.sequence;
    if (isNaN(sequenceNum)) {
      sequenceNum = video.sequence;
    }

    let chapterIdToUse = video.chapter_id;
    let levelIdToUse = video.level_id;

    if (chapter_id !== undefined) {
      const chapterIdNum = parseInt(chapter_id);
      if (!chapterIdNum) {
        return res.status(400).json({ error: 'Invalid chapter ID' });
      }

      const chapter = await dbGetAsync(
        `SELECT cc.id, cc.course_id, cc.level_id
         FROM course_chapters cc
         WHERE cc.id = ?`,
        [chapterIdNum]
      );

      if (!chapter || chapter.course_id !== video.course_id) {
        return res.status(400).json({ error: 'Chapter does not belong to the same course' });
      }

      chapterIdToUse = chapter.id;
      levelIdToUse = chapter.level_id;
    }

    if (!chapterIdToUse || !levelIdToUse) {
      return res.status(400).json({ error: 'Video must belong to a chapter. Please assign a chapter.' });
    }

    const result = await dbRunAsync(
      'UPDATE videos SET title = ?, gumlet_url = ?, sequence = ?, chapter_id = ?, level_id = ? WHERE id = ?',
      [title, gumlet_url, sequenceNum, chapterIdToUse, levelIdToUse, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json({ success: true, message: 'Video updated successfully' });
  } catch (error) {
    console.error('Failed to update video:', error);
    res.status(400).json({ error: 'Video update failed', details: error.message });
  }
});

// Delete video
app.delete('/api/videos/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;

  // Start a transaction to delete video and related data
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // Delete related progress records
    db.run('DELETE FROM progress WHERE video_id = ?', [id], (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to delete video progress' });
      }
    });

    // Delete related submissions
    db.run('DELETE FROM submissions WHERE video_id = ?', [id], (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to delete video submissions' });
      }
    });

    // Delete related test results
    db.run('DELETE FROM test_results WHERE video_id = ?', [id], (err) => {
      if (err) {
        // Test results table might not exist, continue
      }
    });

    // Delete related tests
    db.run('DELETE FROM tests WHERE video_id = ?', [id], (err) => {
      if (err) {
        // Tests table might not exist, continue
      }
    });

    // Delete related activities
    db.run('DELETE FROM activities WHERE video_id = ?', [id], (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to delete video activities' });
      }
    });

    // Finally delete the video
    db.run('DELETE FROM videos WHERE id = ?', [id], function (err) {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Failed to delete video' });
      }
      if (this.changes === 0) {
        db.run('ROLLBACK');
        return res.status(404).json({ error: 'Video not found' });
      }

      db.run('COMMIT', (err) => {
        if (err) {
          return res.status(500).json({ error: 'Transaction commit failed' });
        }
        res.json({ success: true, message: 'Video and all related data deleted successfully' });
      });
    });
  });
});

// Get activities count
app.get('/api/activities/count', requireAuth, requireRole(['admin']), (req, res) => {
  db.get('SELECT COUNT(*) as count FROM activities', (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ count: result.count });
  });
});

// Get enrolled students count
app.get('/api/students/count', requireAuth, requireRole(['admin']), (req, res) => {
  db.get('SELECT COUNT(*) as count FROM users WHERE course_role IS NOT NULL AND course_role != ""', (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ count: result.count });
  });
});

// Mark video as completed with adaptive learning integration
app.post('/api/videos/:id/complete', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId;

  try {
    // Mark video as completed
    await new Promise((resolve, reject) => {
      db.run(`INSERT OR REPLACE INTO progress (user_id, video_id, status, completed_at) 
              VALUES (?, ?, 'completed', CURRENT_TIMESTAMP)`,
        [userId, id], function (err) {
          if (err) reject(err);
          else resolve();
        });
    });

    // Check if adaptive test should be triggered
    const testTrigger = await adaptiveLearningService.shouldTriggerAdaptiveTest(userId, id);

    res.json({
      success: true,
      adaptiveTest: testTrigger
    });
  } catch (error) {
    console.error('Error completing video:', error);
    res.status(400).json({ error: 'Failed to mark video as complete' });
  }
});

// Adaptive Learning API Endpoints

// Generate adaptive test for a video
app.post('/api/adaptive-test/generate', requireAuth, async (req, res) => {
  const { videoId, options = {} } = req.body;
  const userId = req.session.userId;

  try {
    const adaptiveTest = await adaptiveLearningService.generateAdaptiveTest(userId, videoId, options);
    console.log('Generated adaptive test:', JSON.stringify(adaptiveTest, null, 2));
    res.json(adaptiveTest);
  } catch (error) {
    console.error('Error generating adaptive test:', error);
    res.status(500).json({ error: error.message || 'Failed to generate adaptive test' });
  }
});



// Submit adaptive test answers
app.post('/api/adaptive-test/submit', requireAuth, async (req, res) => {
  const { sessionId, answers } = req.body;

  try {
    const results = await adaptiveLearningService.submitAdaptiveTest(sessionId, answers);
    res.json(results);
  } catch (error) {
    console.error('Error submitting adaptive test:', error);
    res.status(500).json({ error: error.message || 'Failed to submit test' });
  }
});

// Clear/reset current adaptive test session
app.post('/api/adaptive-test/reset', requireAuth, async (req, res) => {
  const { sessionId } = req.body;

  try {
    // Mark the session as incomplete/cancelled
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE adaptive_test_sessions SET is_completed = 0, completed_at = NULL WHERE id = ?',
        [sessionId],
        function (err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ success: true, message: 'Session reset successfully' });
  } catch (error) {
    console.error('Error resetting adaptive test session:', error);
    res.status(500).json({ error: 'Failed to reset session' });
  }
});

// Get user's learning progress
app.get('/api/learning-progress/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  const { courseId } = req.query;

  let query = `
    SELECT lpp.*, v.title as video_title, v.sequence as video_sequence
    FROM learning_path_progress lpp
    JOIN videos v ON lpp.video_id = v.id
    WHERE lpp.user_id = ?
  `;
  let params = [userId];

  if (courseId) {
    query += ' AND lpp.course_id = ?';
    params.push(courseId);
  }

  query += ' ORDER BY v.sequence';

  db.all(query, params, (err, progress) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(progress);
  });
});

// Check if adaptive test should be triggered
app.get('/api/adaptive/should-trigger/:videoId', requireAuth, async (req, res) => {
  const { videoId } = req.params;
  const userId = req.session.userId;

  try {
    const result = await adaptiveLearningService.shouldTriggerAdaptiveTest(userId, videoId);
    res.json(result);
  } catch (error) {
    console.error('Error checking adaptive test trigger:', error);
    res.status(500).json({ error: 'Failed to check adaptive test trigger' });
  }
});

// Get user's adaptive learning profile
app.get('/api/adaptive-profile/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;

  try {
    const profile = await adaptiveLearningService.initializeUserProfile(userId);
    res.json(profile);
  } catch (error) {
    console.error('Error getting adaptive profile:', error);
    res.status(500).json({ error: 'Failed to get learning profile' });
  }
});

// Get practice recommendations
app.get('/api/practice-recommendations/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;

  db.all(
    `SELECT pr.*, v.title as video_title 
     FROM practice_recommendations pr
     LEFT JOIN videos v ON pr.video_id = v.id
     WHERE pr.user_id = ? AND pr.is_completed = FALSE
     ORDER BY pr.priority, pr.created_at DESC`,
    [userId],
    (err, recommendations) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(recommendations);
    }
  );
});

// Get learning analytics
app.get('/api/learning-analytics/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  const { days = 30 } = req.query;

  db.all(
    `SELECT * FROM learning_analytics 
     WHERE user_id = ? AND analytics_date >= date('now', '-${days} days')
     ORDER BY analytics_date DESC`,
    [userId],
    (err, analytics) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(analytics);
    }
  );
});

// Get activities for a course (students can access)
app.get('/api/activities', requireAuth, (req, res) => {
  const { course_id } = req.query;

  let query = `
    SELECT a.*, v.title as video_title, v.sequence as video_sequence, v.course_id
    FROM activities a
    JOIN videos v ON a.video_id = v.id
  `;
  let params = [];

  if (course_id) {
    query += ' WHERE v.course_id = ?';
    params.push(course_id);
  }

  query += ' ORDER BY v.sequence, a.id';

  db.all(query, params, (err, activities) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(activities);
  });
});

// Create activity (admin only)
app.post('/api/activities', requireAuth, requireRole(['admin']), (req, res) => {
  const { video_id, title, description, questions } = req.body;

  if (!video_id || !title) {
    return res.status(400).json({ error: 'Video ID and title are required' });
  }

  // Validate questions JSON if provided
  if (questions) {
    try {
      JSON.parse(questions);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON format for questions' });
    }
  }

  db.run('INSERT INTO activities (video_id, title, description, questions) VALUES (?, ?, ?, ?)',
    [video_id, title, description, questions], function (err) {
      if (err) {
        return res.status(400).json({ error: 'Activity creation failed' });
      }
      res.json({ success: true, activityId: this.lastID });
    });
});

// Get activity by video ID
app.get('/api/activities/video/:videoId', requireAuth, (req, res) => {
  const { videoId } = req.params;

  const query = `
    SELECT a.*, v.title as video_title, v.sequence as video_sequence
    FROM activities a
    JOIN videos v ON a.video_id = v.id
    WHERE a.video_id = ?
    LIMIT 1
  `;

  db.get(query, [videoId], (err, activity) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found for this video' });
    }
    res.json(activity);
  });
});

// Submit activity (video-based)
app.post('/api/activities/submit', requireAuth, (req, res) => {
  const { video_id, content } = req.body;
  const userId = req.session.userId;

  db.run('INSERT INTO submissions (video_id, user_id, content, status, submitted_at) VALUES (?, ?, ?, "pending", CURRENT_TIMESTAMP)',
    [video_id, userId, content], function (err) {
      if (err) {
        return res.status(400).json({ error: 'Submission failed' });
      }

      // Send WhatsApp notification to trainer
      notifyTrainer(userId, video_id);

      res.json({ success: true, submissionId: this.lastID });
    });
});

// Approve/reject activity (trainer only)
app.put('/api/activities/:id/approve', requireAuth, requireRole(['trainer', 'admin']), (req, res) => {
  const { id } = req.params;
  const { status, feedback } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.run(`UPDATE submissions SET status = ?, feedback = ?, reviewed_at = CURRENT_TIMESTAMP 
          WHERE id = ?`, [status, feedback, id], function (err) {
    if (err) {
      return res.status(400).json({ error: 'Update failed' });
    }

    // If approved, unlock next video for the student
    if (status === 'approved') {
      unlockNextVideo(id);
    }

    // Send WhatsApp notification to student
    notifyStudent(id, status);

    res.json({ success: true });
  });
});

// Function to unlock next video after activity approval
function unlockNextVideo(submissionId) {
  const query = `
    SELECT s.user_id, s.video_id, v.sequence, v.course_id
    FROM submissions s
    JOIN videos v ON s.video_id = v.id
    WHERE s.id = ?
  `;

  db.get(query, [submissionId], (err, result) => {
    if (!err && result) {
      // Mark current video as completed
      db.run(`INSERT OR REPLACE INTO progress (user_id, video_id, status, completed_at) 
              VALUES (?, ?, 'completed', CURRENT_TIMESTAMP)`,
        [result.user_id, result.video_id]);

      // Find and unlock next video in sequence
      db.get(`SELECT id FROM videos WHERE course_id = ? AND sequence > ? ORDER BY sequence LIMIT 1`,
        [result.course_id, result.sequence], (err, nextVideo) => {
          if (!err && nextVideo) {
            db.run(`INSERT OR IGNORE INTO progress (user_id, video_id, status) 
                  VALUES (?, ?, 'not_started')`,
              [result.user_id, nextVideo.id]);
          }
        });
    }
  });
}

// Bulk approve/reject activities (trainer only)
app.put('/api/activities/bulk-review', requireAuth, requireRole(['trainer', 'admin']), (req, res) => {
  const { submissionIds, status, feedback } = req.body;

  if (!submissionIds || submissionIds.length === 0) {
    return res.status(400).json({ error: 'No submissions selected' });
  }

  const placeholders = submissionIds.map(() => '?').join(',');
  const query = `UPDATE submissions SET status = ?, feedback = ?, reviewed_at = CURRENT_TIMESTAMP
                 WHERE id IN (${placeholders})`;
  const params = [status, feedback, ...submissionIds];

  db.run(query, params, function (err) {
    if (err) {
      return res.status(400).json({ error: 'Bulk update failed' });
    }

    // If approved, unlock next videos for all students
    if (status === 'approved') {
      submissionIds.forEach(id => unlockNextVideo(id));
    }

    // Send WhatsApp notifications to students
    submissionIds.forEach(id => notifyStudent(id, status));

    res.json({ success: true, updated: this.changes });
  });
});

// Get user progress
app.get('/api/progress/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;

  // First get the user's course
  db.get('SELECT course_role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !user.course_role) {
      return res.json([]);
    }

    // Get all videos for the user's course with their progress (only latest progress entry per video)
    db.all(`SELECT v.id as video_id, v.title as video_title, v.sequence as video_sequence,
                   v.gumlet_url, v.course_id,
                   COALESCE(p.status, 'not_started') as status,
                   p.completed_at, p.id as progress_id
            FROM videos v
            JOIN courses c ON v.course_id = c.id
            LEFT JOIN progress p ON v.id = p.video_id AND p.user_id = ? AND p.id = (
              SELECT MAX(p2.id) FROM progress p2 WHERE p2.video_id = v.id AND p2.user_id = ?
            )
            WHERE c.role_name = ?
            ORDER BY v.sequence`, [userId, userId, user.course_role], (err, progress) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      // Transform the data to include completed boolean field
      const transformedProgress = progress.map(p => ({
        id: p.progress_id,
        user_id: userId,
        video_id: p.video_id,
        video_title: p.video_title,
        video_sequence: p.video_sequence,
        status: p.status,
        completed_at: p.completed_at,
        completed: p.status === 'completed'
      }));

      res.json(transformedProgress);
    });
  });
});

// Track video progress (for watch time)
app.post('/api/progress', requireAuth, (req, res) => {
  const { videoId, watchTime } = req.body;
  const userId = req.session.userId;

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  // Update or insert progress record
  db.run(`INSERT OR REPLACE INTO progress (user_id, video_id, status, completed_at) 
          VALUES (?, ?, 'watching', CURRENT_TIMESTAMP)`,
    [userId, videoId], function (err) {
      if (err) {
        return res.status(400).json({ error: 'Failed to track progress' });
      }
      res.json({ success: true });
    });
});

// Create or update submission (handles both new submissions and resubmissions)
app.post('/api/submissions', requireAuth, (req, res) => {
  const { user_id, video_id, submission_text, file_path } = req.body;
  const userId = req.session.userId;

  // Ensure the user can only submit for themselves
  if (user_id !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Check if there's already a submission for this video by this user
  db.get('SELECT id, status FROM submissions WHERE user_id = ? AND video_id = ?',
    [userId, video_id], (err, existingSubmission) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (existingSubmission) {
        // Update existing submission (resubmission)
        db.run(`UPDATE submissions SET 
                submission_text = ?, 
                file_path = ?, 
                status = 'pending', 
                submitted_at = CURRENT_TIMESTAMP,
                reviewed_at = NULL,
                feedback = NULL
              WHERE id = ?`,
          [submission_text, file_path, existingSubmission.id], function (err) {
            if (err) {
              return res.status(500).json({ error: 'Failed to update submission' });
            }

            // Send WhatsApp notification to trainer
            notifyTrainer(userId, video_id);

            res.json({ success: true, submissionId: existingSubmission.id, isResubmission: true });
          });
      } else {
        // Create new submission
        db.run(`INSERT INTO submissions (user_id, video_id, submission_text, file_path, status, submitted_at) 
              VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
          [userId, video_id, submission_text, file_path], function (err) {
            if (err) {
              return res.status(500).json({ error: 'Failed to create submission' });
            }

            // Send WhatsApp notification to trainer
            notifyTrainer(userId, video_id);

            res.json({ success: true, submissionId: this.lastID, isResubmission: false });
          });
      }
    });
});

// Get student submissions
app.get('/api/submissions/student/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;

  db.all('SELECT * FROM submissions WHERE user_id = ? ORDER BY submitted_at DESC',
    [userId], (err, submissions) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(submissions);
    });
});

// Get all submissions (for trainers)
app.get('/api/submissions', requireAuth, requireRole(['trainer', 'admin']), (req, res) => {
  let query, params;

  if (req.session.userRole === 'admin') {
    // Admin can see all submissions
    query = `
      SELECT s.*, u.name as student_name, u.email as student_email, 
             v.title as video_title, v.sequence as video_sequence,
             a.title as activity_title, c.title as course_title
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN videos v ON s.video_id = v.id
      JOIN courses c ON v.course_id = c.id
      LEFT JOIN activities a ON s.activity_id = a.id
      ORDER BY s.submitted_at DESC
    `;
    params = [];
  } else {
    // Trainer can only see submissions from courses they are assigned to
    query = `
      SELECT s.*, u.name as student_name, u.email as student_email, 
             v.title as video_title, v.sequence as video_sequence,
             a.title as activity_title, c.title as course_title
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN videos v ON s.video_id = v.id
      JOIN courses c ON v.course_id = c.id
      JOIN trainer_course_assignments tca ON c.id = tca.course_id
      LEFT JOIN activities a ON s.activity_id = a.id
      WHERE tca.trainer_id = ?
      ORDER BY s.submitted_at DESC
    `;
    params = [req.session.userId];
  }

  db.all(query, params, (err, submissions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(submissions);
  });
});

// Get pending submissions (trainer)
app.get('/api/submissions/pending', requireAuth, requireRole(['trainer', 'admin']), (req, res) => {
  let query, params;

  if (req.session.userRole === 'admin') {
    // Admin can see all pending submissions
    query = `
      SELECT s.*, u.name as student_name, u.email as student_email,
             a.title as activity_title, v.title as video_title, c.title as course_title
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN activities a ON s.activity_id = a.id
      JOIN videos v ON a.video_id = v.id
      JOIN courses c ON v.course_id = c.id
      WHERE s.status = 'pending'
      ORDER BY s.submitted_at DESC
    `;
    params = [];
  } else {
    // Trainer can only see pending submissions from courses they are assigned to
    query = `
      SELECT s.*, u.name as student_name, u.email as student_email,
             a.title as activity_title, v.title as video_title, c.title as course_title
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN activities a ON s.activity_id = a.id
      JOIN videos v ON a.video_id = v.id
      JOIN courses c ON v.course_id = c.id
      JOIN trainer_course_assignments tca ON c.id = tca.course_id
      WHERE s.status = 'pending' AND tca.trainer_id = ?
      ORDER BY s.submitted_at DESC
    `;
    params = [req.session.userId];
  }

  db.all(query, params, (err, submissions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(submissions);
  });
});

// Test API endpoints

// Get test for video
app.get('/api/tests/video/:videoId', requireAuth, (req, res) => {
  const { videoId } = req.params;

  // First get the test
  db.get('SELECT * FROM tests WHERE video_id = ?', [videoId], (err, test) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!test) {
      return res.status(404).json({ error: 'No test found for this video' });
    }

    // Then get the questions for this test
    db.all('SELECT id, question, option_a, option_b, option_c, option_d, points FROM test_questions WHERE test_id = ? ORDER BY id',
      [test.id], (err, questions) => {
        if (err) {
          return res.status(500).json({ error: 'Database error loading questions' });
        }

        test.questions = questions || [];
        res.json(test);
      });
  });
});

// Submit test answers
app.post('/api/tests/submit', requireAuth, (req, res) => {
  const { testId, videoId, answers } = req.body;
  const userId = req.session.userId;

  // Get test questions with correct answers
  db.all('SELECT id, correct_answer, points FROM test_questions WHERE test_id = ?',
    [testId], (err, questions) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      // Calculate score
      let score = 0;
      let totalPoints = 0;

      questions.forEach(question => {
        totalPoints += question.points;
        if (answers[question.id] === question.correct_answer) {
          score += question.points;
        }
      });

      const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

      // Get passing score
      db.get('SELECT passing_score FROM tests WHERE id = ?', [testId], (err, test) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        const passed = percentage >= (test?.passing_score || 70);

        // Save test result
        db.run(`INSERT INTO test_results 
              (test_id, user_id, video_id, score, total_questions, passed, answers) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [testId, userId, videoId, percentage, questions.length, passed, JSON.stringify(answers)],
          function (err) {
            if (err) {
              return res.status(400).json({ error: 'Failed to save test result' });
            }

            res.json({
              success: true,
              resultId: this.lastID,
              score: percentage,
              passed: passed,
              totalQuestions: questions.length
            });
          }
        );
      });
    });
});

// Get test result for user and video
app.get('/api/tests/result/:videoId', requireAuth, (req, res) => {
  const { videoId } = req.params;
  const userId = req.session.userId;

  db.get(`SELECT * FROM test_results 
          WHERE user_id = ? AND video_id = ? 
          ORDER BY completed_at DESC LIMIT 1`,
    [userId, videoId], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(result);
    });
});

// Create test (admin only)
app.post('/api/tests', requireAuth, requireRole(['admin']), (req, res) => {
  const { videoId, title, description, passingScore, questions } = req.body;

  db.run('INSERT INTO tests (video_id, title, description, passing_score) VALUES (?, ?, ?, ?)',
    [videoId, title, description, passingScore || 70], function (err) {
      if (err) {
        return res.status(400).json({ error: 'Test creation failed' });
      }

      const testId = this.lastID;

      // Insert questions
      if (questions && questions.length > 0) {
        const questionPromises = questions.map(q => {
          return new Promise((resolve, reject) => {
            db.run(`INSERT INTO test_questions 
                  (test_id, question, option_a, option_b, option_c, option_d, correct_answer, points) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [testId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.points || 1],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        });

        Promise.all(questionPromises)
          .then(() => {
            res.json({ success: true, testId: testId });
          })
          .catch(err => {
            res.status(400).json({ error: 'Failed to create test questions' });
          });
      } else {
        res.json({ success: true, testId: testId });
      }
    });
});

// Delete activity endpoint
app.delete('/api/activities/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;

  // First check if activity exists
  db.get('SELECT * FROM activities WHERE id = ?', [id], (err, activity) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Delete the activity
    db.run('DELETE FROM activities WHERE id = ?', [id], function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete activity' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      // Also delete any submissions for this activity
      db.run('DELETE FROM submissions WHERE activity_id = ?', [id], (err) => {
        if (err) {
          console.error('Error deleting activity submissions:', err);
        }
      });

      res.json({ success: true, message: 'Activity deleted successfully' });
    });
  });
});

// Delete test endpoint
app.delete('/api/tests/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { id } = req.params;

  // First check if test exists
  db.get('SELECT * FROM tests WHERE id = ?', [id], (err, test) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Delete test questions first
    db.run('DELETE FROM test_questions WHERE test_id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete test questions' });
      }

      // Delete test results
      db.run('DELETE FROM test_results WHERE test_id = ?', [id], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete test results' });
        }

        // Finally delete the test
        db.run('DELETE FROM tests WHERE id = ?', [id], function (err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to delete test' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Test not found' });
          }

          res.json({ success: true, message: 'Test deleted successfully' });
        });
      });
    });
  });
});

// WhatsApp notification functions
function notifyTrainer(userId, videoId) {
  console.log('=== NOTIFY TRAINER FUNCTION CALLED ===');
  console.log('Parameters - userId:', userId, 'videoId:', videoId);

  // Get user, video details and trainer info using proper trainer-course assignments
  const query = `
    SELECT u.name as student_name, u.phone as student_phone, u.course_role,
           v.title as video_title, v.sequence as video_sequence, c.title as course_title,
           t.phone as trainer_phone, t.name as trainer_name, t.id as trainer_id
    FROM users u
    JOIN videos v ON v.id = ?
    JOIN courses c ON v.course_id = c.id
    JOIN trainer_course_assignments tc ON tc.course_id = c.id
    JOIN users t ON t.id = tc.trainer_id
    WHERE u.id = ? AND t.role = 'trainer'
  `;

  console.log('Executing query to find trainer for notification...');

  db.get(query, [videoId, userId], (err, result) => {
    if (err) {
      console.error('❌ Error in notifyTrainer query:', err);
      return;
    }

    console.log('Query result:', result);

    if (result) {
      if (result.trainer_phone) {
        const message = `🎓 AHL Training Alert\n\nNew Activity Submission:\n👤 Student: ${result.student_name}\n📹 Video: ${result.video_title} (Sequence ${result.video_sequence})\n📚 Course: ${result.course_title}\n\nPlease review and approve/reject the submission.`;
        console.log(`✅ Found trainer: ${result.trainer_name} (ID: ${result.trainer_id})`);
        console.log(`📱 Trainer phone: ${result.trainer_phone}`);
        console.log('Sending WhatsApp notification to trainer...');
        sendWhatsAppMessage(result.trainer_phone, message);
      } else {
        console.log('❌ Trainer found but has no phone number');
        console.log('Trainer details:', result.trainer_name, 'Phone:', result.trainer_phone);
      }
    } else {
      console.log('❌ No trainer found for this video/course combination');
      console.log('Debug: Checking trainer assignments for this course...');

      // Additional debug query to check trainer assignments
      const debugQuery = `
        SELECT c.title as course_title, t.name as trainer_name, t.phone as trainer_phone, t.role
        FROM videos v
        JOIN courses c ON v.course_id = c.id
        LEFT JOIN trainer_course_assignments tc ON tc.course_id = c.id
        LEFT JOIN users t ON t.id = tc.trainer_id
        WHERE v.id = ?
      `;

      db.all(debugQuery, [videoId], (debugErr, debugResults) => {
        if (debugErr) {
          console.error('Debug query error:', debugErr);
        } else {
          console.log('Debug - All trainer assignments for this video\'s course:', debugResults);
        }
      });
    }
  });
}

function notifyStudent(submissionId, status) {
  const query = `
    SELECT u.phone, u.name as student_name, v.title as video_title, 
           v.sequence as video_sequence, s.feedback
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN videos v ON s.video_id = v.id
    WHERE s.id = ?
  `;

  db.get(query, [submissionId], (err, result) => {
    if (!err && result && result.phone) {
      const statusEmoji = status === 'approved' ? '✅' : '❌';
      const statusText = status === 'approved' ? 'APPROVED' : 'REJECTED';

      let message = `${statusEmoji} AHL Training Update\n\nHi ${result.student_name}!\n\nYour activity submission for:\n📹 ${result.video_title} (Sequence ${result.video_sequence})\n\nStatus: ${statusText}`;

      if (result.feedback) {
        message += `\n\n💬 Trainer Feedback:\n${result.feedback}`;
      }

      if (status === 'approved') {
        message += '\n\n🎉 Great job! Your next video is now unlocked.';
      } else {
        message += '\n\n📚 Please review and resubmit your activity.';
      }

      sendWhatsAppMessage(result.phone, message);
    }
  });
}

// Format phone number for WhatsApp (ensure Indian country code)
function formatPhoneForWhatsApp(phone) {
  // Clean phone number - remove all non-digits
  let cleanPhone = phone.toString().replace(/\D/g, '');

  // Ensure Indian number format - if 10 digits, add 91 prefix
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  // If already has 91 prefix but ensure it's correct
  else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
    return cleanPhone;
  }
  // If 11 digits starting with 1, assume user meant 91
  else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
    cleanPhone = '9' + cleanPhone;
  }

  return cleanPhone;
}

async function sendWhatsAppMessage(phone, message) {
  let payload = null;

  try {
    console.log('=== SENDING WHATSAPP MESSAGE ===');

    // Format phone number with Indian country code
    const formattedPhone = formatPhoneForWhatsApp(phone);

    // Ensure phone number is properly formatted
    if (!formattedPhone || formattedPhone.length < 10) {
      console.error('Invalid phone number format:', phone, '-> formatted:', formattedPhone);
      return false;
    }

    payload = {
      session: WAHA_CONFIG.sessionName,
      chatId: formattedPhone + '@c.us',
      text: message
    };

    console.log(`Sending to: ${formattedPhone}@c.us using session: ${WAHA_CONFIG.sessionName}`);
    console.log('Message:', message);

    const response = await axios.post(WAHA_CONFIG.baseUrl + '/api/sendText', payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': WAHA_CONFIG.apiKey
      }
    });

    console.log('✅ WhatsApp message sent successfully:', response.status, response.data);
    return true;

  } catch (err) {
    console.error('❌ WhatsApp notification failed:');
    console.error('Error details:', err.response?.status, err.response?.data || err.message);
    if (payload) {
      console.error('Payload used:', JSON.stringify(payload, null, 2));
    }
    return false;
  }
}

// Manual WhatsApp notification endpoint (admin/trainer only)
app.post('/api/whatsapp/send', requireAuth, requireRole(['admin', 'trainer']), async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone and message are required' });
  }

  try {
    const result = await sendWhatsAppMessage(phone, message);
    if (result) {
      res.json({ success: true, message: 'WhatsApp message sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send WhatsApp message' });
    }
  } catch (error) {
    console.error('WhatsApp send error:', error);
    res.status(500).json({ error: 'Failed to send WhatsApp message: ' + error.message });
  }
});

// Test endpoint for WhatsApp connection
app.get('/api/whatsapp/test', requireAuth, requireRole(['admin', 'trainer']), async (req, res) => {
  try {
    console.log('=== TESTING WHATSAPP CONNECTION ===');

    // Test WAHA API connection
    const healthResponse = await axios.get(WAHA_CONFIG.baseUrl + '/api/sessions', {
      headers: { 'X-Api-Key': WAHA_CONFIG.apiKey }
    });

    console.log('WAHA API Health Check:', healthResponse.status, healthResponse.data);

    const sessions = healthResponse.data;
    const ourSession = sessions.find(s => s.name === WAHA_CONFIG.sessionName);

    // Always return sessions data for frontend consistency
    const responseData = {
      sessions: sessions,
      config: {
        baseUrl: WAHA_CONFIG.baseUrl,
        sessionName: WAHA_CONFIG.sessionName
      }
    };

    if (!ourSession) {
      return res.status(400).json({
        ...responseData,
        success: false,
        error: `Session '${WAHA_CONFIG.sessionName}' not found`,
        message: `Session '${WAHA_CONFIG.sessionName}' not found`,
        availableSessions: sessions.map(s => s.name)
      });
    }

    if (ourSession.status !== 'WORKING') {
      return res.status(400).json({
        ...responseData,
        success: false,
        error: `Session '${WAHA_CONFIG.sessionName}' is not working (Status: ${ourSession.status})`,
        message: `Session '${WAHA_CONFIG.sessionName}' is not working (Status: ${ourSession.status})`,
        sessionStatus: ourSession.status,
        sessionInfo: ourSession
      });
    }

    res.json({
      ...responseData,
      success: true,
      message: 'WhatsApp connection is working',
      sessionInfo: ourSession
    });

  } catch (error) {
    console.error('WhatsApp test error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'WhatsApp connection test failed',
      message: 'WhatsApp connection test failed',
      details: error.response?.data || error.message,
      sessions: []
    });
  }
});

// Get WAHA Configuration
app.get('/api/whatsapp/config', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        baseUrl: WAHA_CONFIG.baseUrl,
        apiKey: WAHA_CONFIG.apiKey,
        sessionName: WAHA_CONFIG.sessionName
      }
    });
  } catch (error) {
    console.error('Failed to get WAHA configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get WAHA configuration',
      message: error.message
    });
  }
});

// Update WAHA Configuration
app.put('/api/whatsapp/config', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const { baseUrl, apiKey, sessionName } = req.body;

    if (!baseUrl || !apiKey || !sessionName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required configuration fields',
        message: 'Base URL, API Key, and Session Name are required'
      });
    }

    // Update the WAHA_CONFIG object
    WAHA_CONFIG.baseUrl = baseUrl.trim();
    WAHA_CONFIG.apiKey = apiKey.trim();
    WAHA_CONFIG.sessionName = sessionName.trim();

    console.log('WAHA Configuration updated:', {
      baseUrl: WAHA_CONFIG.baseUrl,
      sessionName: WAHA_CONFIG.sessionName,
      apiKeyLength: WAHA_CONFIG.apiKey.length
    });

    res.json({
      success: true,
      message: 'WAHA configuration updated successfully',
      config: {
        baseUrl: WAHA_CONFIG.baseUrl,
        apiKey: WAHA_CONFIG.apiKey,
        sessionName: WAHA_CONFIG.sessionName
      }
    });
  } catch (error) {
    console.error('Failed to update WAHA configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update WAHA configuration',
      message: error.message
    });
  }
});

// Serve static files
// Global error handler (placed before static and listen)
app.use((err, req, res, next) => {
  logger.error('Unhandled application error', {
    method: req.method,
    url: req.originalUrl,
    status: err.status || 500,
    message: err.message,
    stack: isProd ? undefined : err.stack
  });

  const status = err.status || 500;
  res.status(status).json({
    error: 'Internal Server Error',
    message: isProd ? 'An unexpected error occurred.' : err.message
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`AHL Training LMS Server running on port ${PORT}`);
  console.log(`Access the application at: http://localhost:${PORT}`);
});

module.exports = app;
