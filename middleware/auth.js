const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const jwt = require('jsonwebtoken');

// Database connection
const db = new sqlite3.Database(path.join(__dirname, '../lms_database.db'));

/**
 * Authentication middleware for JWT-like session tokens
 * This middleware checks for session-based authentication
 */
function authenticateToken(req, res, next) {
    // Allow session-based auth first
    if (req.session && req.session.userId) {
        db.get('SELECT * FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err) {
                console.error('Database error during authentication:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            if (!user) {
                return res.status(401).json({ error: 'User not found' });
            }
            req.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                course_role: user.course_role
            };
            next();
        });
        return;
    }

    // Fallback to JWT via Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('JWT_SECRET is not set. Refusing token authentication.');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    try {
        const payload = jwt.verify(token, secret);
        const userId = payload.sub;
        if (!userId) {
            return res.status(403).json({ error: 'Invalid token payload' });
        }
        db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                console.error('Database error during token authentication:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            if (!user) {
                return res.status(403).json({ error: 'Invalid token' });
            }
            req.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                course_role: user.course_role
            };
            next();
        });
    } catch (e) {
        return res.status(401).json({ error: 'Token verification failed' });
    }
}

/**
 * Role-based authorization middleware
 * @param {string[]} allowedRoles - Array of roles that can access the route
 */
function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                required: allowedRoles,
                current: req.user.role
            });
        }
        
        next();
    };
}

/**
 * Check if user is admin
 */
function requireAdmin(req, res, next) {
    return requireRole(['admin'])(req, res, next);
}

/**
 * Check if user is admin or instructor
 */
function requireInstructor(req, res, next) {
    return requireRole(['admin', 'instructor', 'trainer'])(req, res, next);
}

/**
 * Check if user is student (or higher)
 */
function requireStudent(req, res, next) {
    return requireRole(['admin', 'instructor', 'trainer', 'student'])(req, res, next);
}

/**
 * Middleware to check if user owns resource or has admin privileges
 * @param {string} userIdParam - Parameter name containing the user ID to check
 */
function requireOwnershipOrAdmin(userIdParam = 'userId') {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const targetUserId = parseInt(req.params[userIdParam]);
        
        // Admin can access anything
        if (req.user.role === 'admin') {
            return next();
        }
        
        // User can access their own resources
        if (req.user.id === targetUserId) {
            return next();
        }
        
        return res.status(403).json({ 
            error: 'Access denied. You can only access your own resources.' 
        });
    };
}

/**
 * Generate a simple session token (in a real app, use proper JWT)
 * @param {Object} user - User object
 * @returns {string} - Session token
 */
function generateSessionToken(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }
    const payload = {
        sub: user.id,
        name: user.name,
        role: user.role
    };
    // 7 day expiry
    return jwt.sign(payload, secret, { expiresIn: '7d' });
}

/**
 * Validate session token
 * @param {string} token - Session token
 * @returns {Promise<Object>} - User object if valid
 */
function validateSessionToken(token) {
    return new Promise((resolve, reject) => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return reject(new Error('JWT_SECRET is not configured'));
        }
        let payload;
        try {
            payload = jwt.verify(token, secret);
        } catch (e) {
            return reject(new Error('Token verification failed'));
        }
        const userId = payload.sub;
        if (!userId) {
            return reject(new Error('Invalid token payload'));
        }
        db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                return reject(err);
            }
            if (!user) {
                return reject(new Error('User not found'));
            }
            resolve({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                course_role: user.course_role
            });
        });
    });
}

module.exports = {
    authenticateToken,
    requireRole,
    requireAdmin,
    requireInstructor,
    requireStudent,
    requireOwnershipOrAdmin,
    generateSessionToken,
    validateSessionToken
};
