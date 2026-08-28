// DVARY GAMES - Main Server
// ================================================

// Import dependencies
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

// ================================================
// SECURITY MIDDLEWARE
// ================================================

// Helmet for security headers
app.use(helmet());

// CORS
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5000', 'https://dvarygames.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ================================================
// SERVE STATIC FILES (HTML, CSS, JS)
// ================================================

// Serve all static files from root directory
app.use(express.static(__dirname));

// ================================================
// MULTER SETUP FOR FILE UPLOADS
// ================================================

// Ensure upload directories exist
const uploadDirs = ['uploads/profile', 'uploads/games', 'uploads/chat'];
uploadDirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = 'uploads/';
        if (file.fieldname === 'profileImage') uploadPath = 'uploads/profile/';
        else if (file.fieldname === 'gameImage') uploadPath = 'uploads/games/';
        else if (file.fieldname === 'chatAttachment') uploadPath = 'uploads/chat/';
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mp3|pdf|doc|docx/;
        const ext = path.extname(file.originalname).toLowerCase();
        const mimeType = allowedTypes.test(file.mimetype);
        if (mimeType && allowedTypes.test(ext)) {
            return cb(null, true);
        }
        cb(new Error('Invalid file type. Only images and documents allowed.'));
    }
});

// ================================================
// FIREBASE ADMIN SDK SETUP
// ================================================

// Initialize Firebase Admin SDK
let admin;
let db;
let firebaseApp;

try {
    // Try to use service account if exists
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(path.resolve(serviceAccountPath));
        admin = require('firebase-admin');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID
        });
    } else {
        // Fallback to default credentials (for development)
        admin = require('firebase-admin');
        admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID
        });
    }
    db = admin.firestore();
    console.log('✅ Firebase Admin SDK initialized successfully');
} catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error.message);
    // Use in-memory database as fallback
    console.log('⚠️ Using in-memory database fallback');
}

// ================================================
// IN-MEMORY DATABASE FALLBACK (for development)
// ================================================

const memoryDB = {
    users: new Map(),
    games: new Map(),
    messages: new Map(),
    reports: new Map(),
    notifications: new Map(),
    chatTyping: new Map(),
    onlineUsers: new Map(),
    
    // Initialize with default admin user
    init() {
        const adminId = 'admin_' + uuidv4();
        const hashedPassword = bcrypt.hashSync('Admin@12345', 10);
        this.users.set(adminId, {
            userId: adminId,
            fullName: 'DVARY Admin',
            username: 'dvary_admin',
            email: 'admin@dvarygames.com',
            phone: '+255700000000',
            profileImage: 'https://ui-avatars.com/api/?name=DVARY+Admin&background=7c3aed&color=fff&size=128',
            onlineStatus: false,
            lastSeen: new Date().toISOString(),
            role: 'admin',
            createdAt: new Date().toISOString(),
            isActive: true,
            password: hashedPassword
        });
        console.log('✅ In-memory database initialized with admin user');
    }
};

// Initialize memory DB
memoryDB.init();

// ================================================
// DATABASE HELPER FUNCTIONS
// ================================================

const getDB = () => {
    if (db) {
        return { type: 'firestore', instance: db };
    }
    return { type: 'memory', instance: memoryDB };
};

const database = getDB();

// ================================================
// AUTHENTICATION MIDDLEWARE
// ================================================

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    try {
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Get user from database
        let user = null;
        if (database.type === 'firestore') {
            const userDoc = await database.instance.collection('users').doc(decoded.userId).get();
            if (userDoc.exists) {
                user = { userId: userDoc.id, ...userDoc.data() };
            }
        } else {
            user = database.instance.users.get(decoded.userId) || null;
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        if (user.isActive === false) {
            return res.status(403).json({ success: false, message: 'Account is blocked' });
        }

        req.userData = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

const authenticateAdmin = async (req, res, next) => {
    await authenticateToken(req, res, () => {
        if (req.userData.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        next();
    });
};

// ================================================
// HELPER FUNCTIONS
// ================================================

const generateToken = (user) => {
    return jwt.sign(
        { userId: user.userId, email: user.email, role: user.role || 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

const getRandomAvatar = (name) => {
    const colors = ['7c3aed', '8b5cf6', 'a78bfa', '6366f1', '4f46e5', '3b82f6', '06b6d4', '10b981', 'f59e0b', 'ef4444'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${randomColor}&color=fff&size=128`;
};

// ================================================
// API ROUTES - AUTHENTICATION
// ================================================

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { fullName, username, email, phone, password, confirmPassword } = req.body;

        // Validate
        if (!fullName || !username || !email || !phone || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Check if user exists
        let existingUser = null;
        if (database.type === 'firestore') {
            const emailCheck = await database.instance.collection('users').where('email', '==', email).get();
            if (!emailCheck.empty) {
                return res.status(400).json({ success: false, message: 'Email already registered' });
            }
            const usernameCheck = await database.instance.collection('users').where('username', '==', username).get();
            if (!usernameCheck.empty) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }
        } else {
            for (const [id, user] of database.instance.users) {
                if (user.email === email) {
                    return res.status(400).json({ success: false, message: 'Email already registered' });
                }
                if (user.username === username) {
                    return res.status(400).json({ success: false, message: 'Username already taken' });
                }
            }
        }

        // Create user
        const userId = 'user_' + uuidv4();
        const hashedPassword = await hashPassword(password);
        const profileImage = getRandomAvatar(fullName);

        const newUser = {
            userId,
            fullName,
            username,
            email,
            phone,
            profileImage,
            onlineStatus: false,
            lastSeen: new Date().toISOString(),
            role: 'user',
            createdAt: new Date().toISOString(),
            isActive: true,
            password: hashedPassword
        };

        // Save to database
        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).set({
                fullName,
                username,
                email,
                phone,
                profileImage,
                onlineStatus: false,
                lastSeen: new Date().toISOString(),
                role: 'user',
                createdAt: new Date().toISOString(),
                isActive: true
            });
        } else {
            database.instance.users.set(userId, newUser);
        }

        // Generate token
        const token = generateToken({ userId, email, role: 'user' });

        // Return user data (without password)
        const { password: _, ...userData } = newUser;
        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: userData
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ success: false, message: 'Server error during signup' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        // Find user
        let user = null;
        let userId = null;

        if (database.type === 'firestore') {
            const userQuery = await database.instance.collection('users').where('email', '==', email).get();
            if (userQuery.empty) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }
            const userDoc = userQuery.docs[0];
            userId = userDoc.id;
            user = { userId, ...userDoc.data() };
        } else {
            for (const [id, userData] of database.instance.users) {
                if (userData.email === email) {
                    userId = id;
                    user = { userId, ...userData };
                    break;
                }
            }
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Check if account is active
        if (user.isActive === false) {
            return res.status(403).json({ success: false, message: 'Your account has been blocked' });
        }

        // Verify password
        const passwordMatch = await comparePassword(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Update online status
        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).update({
                onlineStatus: true,
                lastSeen: new Date().toISOString()
            });
        } else {
            user.onlineStatus = true;
            user.lastSeen = new Date().toISOString();
            database.instance.users.set(userId, user);
        }

        // Generate token
        const token = generateToken({ userId, email: user.email, role: user.role || 'user' });

        // Return user data (without password)
        const { password: _, ...userData } = user;
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: userData
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.userData
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).update({
                onlineStatus: false,
                lastSeen: new Date().toISOString()
            });
        } else {
            const user = database.instance.users.get(userId);
            if (user) {
                user.onlineStatus = false;
                user.lastSeen = new Date().toISOString();
                database.instance.users.set(userId, user);
            }
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// API ROUTES - USERS
// ================================================

// Get user profile
app.get('/api/users/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        let user = null;

        if (database.type === 'firestore') {
            const userDoc = await database.instance.collection('users').doc(userId).get();
            if (userDoc.exists) {
                user = { userId: userDoc.id, ...userDoc.data() };
            }
        } else {
            user = database.instance.users.get(userId) || null;
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const { password, ...userData } = user;
        res.json({ success: true, user: userData });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { fullName, username, phone } = req.body;

        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (username) updates.username = username;
        if (phone) updates.phone = phone;

        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).update(updates);
        } else {
            const user = database.instance.users.get(userId);
            if (user) {
                Object.assign(user, updates);
                database.instance.users.set(userId, user);
            }
        }

        res.json({ success: true, message: 'Profile updated successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Change password
app.put('/api/users/password', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'All fields required' });
        }

        let user = null;
        if (database.type === 'firestore') {
            const userDoc = await database.instance.collection('users').doc(userId).get();
            if (userDoc.exists) {
                user = { userId: userDoc.id, ...userDoc.data() };
            }
        } else {
            user = database.instance.users.get(userId) || null;
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const passwordMatch = await comparePassword(currentPassword, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        const hashedPassword = await hashPassword(newPassword);

        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).update({ password: hashedPassword });
        } else {
            user.password = hashedPassword;
            database.instance.users.set(userId, user);
        }

        res.json({ success: true, message: 'Password changed successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Upload profile picture
app.post('/api/users/profile-picture', authenticateToken, upload.single('profileImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const userId = req.user.userId;
        const imageUrl = `/uploads/profile/${req.file.filename}`;

        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).update({ profileImage: imageUrl });
        } else {
            const user = database.instance.users.get(userId);
            if (user) {
                user.profileImage = imageUrl;
                database.instance.users.set(userId, user);
            }
        }

        res.json({ success: true, imageUrl, message: 'Profile picture updated' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete account
app.delete('/api/users/account', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).delete();
        } else {
            database.instance.users.delete(userId);
        }

        res.json({ success: true, message: 'Account deleted successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// API ROUTES - GAMES
// ================================================

// Get all games
app.get('/api/games', async (req, res) => {
    try {
        let games = [];
        
        if (database.type === 'firestore') {
            const gamesSnapshot = await database.instance.collection('games').get();
            games = gamesSnapshot.docs.map(doc => ({ gameId: doc.id, ...doc.data() }));
        } else {
            games = Array.from(database.instance.games.values());
        }

        res.json({ success: true, games });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get featured games
app.get('/api/games/featured', async (req, res) => {
    try {
        let games = [];
        
        if (database.type === 'firestore') {
            const gamesSnapshot = await database.instance.collection('games')
                .where('featured', '==', true)
                .limit(6)
                .get();
            games = gamesSnapshot.docs.map(doc => ({ gameId: doc.id, ...doc.data() }));
        } else {
            games = Array.from(database.instance.games.values())
                .filter(g => g.featured)
                .slice(0, 6);
        }

        res.json({ success: true, games });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get trending games
app.get('/api/games/trending', async (req, res) => {
    try {
        let games = [];
        
        if (database.type === 'firestore') {
            const gamesSnapshot = await database.instance.collection('games')
                .where('trending', '==', true)
                .limit(6)
                .get();
            games = gamesSnapshot.docs.map(doc => ({ gameId: doc.id, ...doc.data() }));
        } else {
            games = Array.from(database.instance.games.values())
                .filter(g => g.trending)
                .slice(0, 6);
        }

        res.json({ success: true, games });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get VIP games
app.get('/api/games/vip', async (req, res) => {
    try {
        let games = [];
        
        if (database.type === 'firestore') {
            const gamesSnapshot = await database.instance.collection('games')
                .where('type', '==', 'vip')
                .limit(6)
                .get();
            games = gamesSnapshot.docs.map(doc => ({ gameId: doc.id, ...doc.data() }));
        } else {
            games = Array.from(database.instance.games.values())
                .filter(g => g.type === 'vip')
                .slice(0, 6);
        }

        res.json({ success: true, games });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get free games
app.get('/api/games/free', async (req, res) => {
    try {
        let games = [];
        
        if (database.type === 'firestore') {
            const gamesSnapshot = await database.instance.collection('games')
                .where('type', '==', 'free')
                .limit(6)
                .get();
            games = gamesSnapshot.docs.map(doc => ({ gameId: doc.id, ...doc.data() }));
        } else {
            games = Array.from(database.instance.games.values())
                .filter(g => g.type === 'free')
                .slice(0, 6);
        }

        res.json({ success: true, games });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Search games
app.get('/api/games/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json({ success: true, games: [] });
        }

        let games = [];
        const searchTerm = q.toLowerCase();

        if (database.type === 'firestore') {
            const gamesSnapshot = await database.instance.collection('games').get();
            games = gamesSnapshot.docs
                .map(doc => ({ gameId: doc.id, ...doc.data() }))
                .filter(g => 
                    g.name?.toLowerCase().includes(searchTerm) ||
                    g.category?.toLowerCase().includes(searchTerm) ||
                    g.description?.toLowerCase().includes(searchTerm)
                );
        } else {
            games = Array.from(database.instance.games.values())
                .filter(g => 
                    g.name?.toLowerCase().includes(searchTerm) ||
                    g.category?.toLowerCase().includes(searchTerm) ||
                    g.description?.toLowerCase().includes(searchTerm)
                );
        }

        res.json({ success: true, games });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get single game
app.get('/api/games/:gameId', async (req, res) => {
    try {
        const { gameId } = req.params;
        let game = null;

        if (database.type === 'firestore') {
            const gameDoc = await database.instance.collection('games').doc(gameId).get();
            if (gameDoc.exists) {
                game = { gameId: gameDoc.id, ...gameDoc.data() };
            }
        } else {
            game = database.instance.games.get(gameId) || null;
        }

        if (!game) {
            return res.status(404).json({ success: false, message: 'Game not found' });
        }

        res.json({ success: true, game });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// ADMIN ROUTES - GAMES
// ================================================

// Add game (Admin only)
app.post('/api/admin/games', authenticateAdmin, upload.single('gameImage'), async (req, res) => {
    try {
        const { name, description, category, genre, version, size, type, downloadUrl, trailerUrl, featured, trending } = req.body;

        // Validate
        if (!name || !description || !category) {
            return res.status(400).json({ success: false, message: 'Name, description, and category are required' });
        }

        const gameId = 'game_' + uuidv4();
        const image = req.file ? `/uploads/games/${req.file.filename}` : 'https://via.placeholder.com/300x200/1a1a2e/7c3aed?text=' + encodeURIComponent(name);

        const newGame = {
            gameId,
            name,
            description,
            image,
            category,
            genre: genre || 'Other',
            version: version || '1.0.0',
            size: size || 'Unknown',
            type: type || 'free',
            downloadUrl: downloadUrl || '#',
            trailerUrl: trailerUrl || '',
            featured: featured === 'true' || featured === true,
            trending: trending === 'true' || trending === true,
            createdAt: new Date().toISOString()
        };

        if (database.type === 'firestore') {
            await database.instance.collection('games').doc(gameId).set(newGame);
        } else {
            database.instance.games.set(gameId, newGame);
        }

        res.status(201).json({ success: true, message: 'Game added successfully', game: newGame });

    } catch (error) {
        console.error('Add game error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update game (Admin only)
app.put('/api/admin/games/:gameId', authenticateAdmin, async (req, res) => {
    try {
        const { gameId } = req.params;
        const updates = req.body;

        if (database.type === 'firestore') {
            await database.instance.collection('games').doc(gameId).update(updates);
        } else {
            const game = database.instance.games.get(gameId);
            if (!game) {
                return res.status(404).json({ success: false, message: 'Game not found' });
            }
            Object.assign(game, updates);
            database.instance.games.set(gameId, game);
        }

        res.json({ success: true, message: 'Game updated successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete game (Admin only)
app.delete('/api/admin/games/:gameId', authenticateAdmin, async (req, res) => {
    try {
        const { gameId } = req.params;

        if (database.type === 'firestore') {
            await database.instance.collection('games').doc(gameId).delete();
        } else {
            if (!database.instance.games.has(gameId)) {
                return res.status(404).json({ success: false, message: 'Game not found' });
            }
            database.instance.games.delete(gameId);
        }

        res.json({ success: true, message: 'Game deleted successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// ADMIN ROUTES - USERS
// ================================================

// Get all users (Admin only)
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        let users = [];

        if (database.type === 'firestore') {
            const usersSnapshot = await database.instance.collection('users').get();
            users = usersSnapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() }));
        } else {
            users = Array.from(database.instance.users.values());
        }

        // Remove passwords
        users = users.map(({ password, ...user }) => user);

        res.json({ success: true, users });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Block/Unblock user (Admin only)
app.put('/api/admin/users/:userId/block', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;

        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).update({ isActive });
        } else {
            const user = database.instance.users.get(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            user.isActive = isActive;
            database.instance.users.set(userId, user);
        }

        res.json({ success: true, message: `User ${isActive ? 'unblocked' : 'blocked'} successfully` });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete user (Admin only)
app.delete('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        if (database.type === 'firestore') {
            await database.instance.collection('users').doc(userId).delete();
        } else {
            if (!database.instance.users.has(userId)) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            database.instance.users.delete(userId);
        }

        res.json({ success: true, message: 'User deleted successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// API ROUTES - CHAT
// ================================================

// Get all messages
app.get('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
        let messages = [];

        if (database.type === 'firestore') {
            const messagesSnapshot = await database.instance.collection('messages')
                .orderBy('createdAt', 'desc')
                .limit(100)
                .get();
            messages = messagesSnapshot.docs.map(doc => ({ messageId: doc.id, ...doc.data() }));
        } else {
            messages = Array.from(database.instance.messages.values())
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 100);
        }

        // Enrich messages with user data
        const enrichedMessages = await Promise.all(messages.map(async (msg) => {
            let sender = null;
            if (database.type === 'firestore') {
                const userDoc = await database.instance.collection('users').doc(msg.senderId).get();
                if (userDoc.exists) {
                    sender = { userId: userDoc.id, ...userDoc.data() };
                }
            } else {
                sender = database.instance.users.get(msg.senderId) || null;
            }
            
            return {
                ...msg,
                sender: sender ? {
                    userId: sender.userId,
                    fullName: sender.fullName,
                    username: sender.username,
                    profileImage: sender.profileImage,
                    onlineStatus: sender.onlineStatus
                } : null
            };
        }));

        res.json({ success: true, messages: enrichedMessages });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Send message
app.post('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        const senderId = req.user.userId;

        if (!message || message.trim() === '') {
            return res.status(400).json({ success: false, message: 'Message cannot be empty' });
        }

        // Sanitize message (prevent XSS)
        const sanitizedMessage = message.replace(/<[^>]*>/g, '').trim();

        const messageId = 'msg_' + uuidv4();
        const newMessage = {
            messageId,
            groupId: 'dvary_community',
            senderId,
            message: sanitizedMessage,
            createdAt: new Date().toISOString(),
            readBy: [senderId]
        };

        if (database.type === 'firestore') {
            await database.instance.collection('messages').doc(messageId).set(newMessage);
        } else {
            database.instance.messages.set(messageId, newMessage);
        }

        // Get sender info
        let sender = null;
        if (database.type === 'firestore') {
            const userDoc = await database.instance.collection('users').doc(senderId).get();
            if (userDoc.exists) {
                sender = { userId: userDoc.id, ...userDoc.data() };
            }
        } else {
            sender = database.instance.users.get(senderId) || null;
        }

        const messageWithSender = {
            ...newMessage,
            sender: sender ? {
                userId: sender.userId,
                fullName: sender.fullName,
                username: sender.username,
                profileImage: sender.profileImage,
                onlineStatus: sender.onlineStatus
            } : null
        };

        res.status(201).json({ success: true, message: 'Message sent', data: messageWithSender });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete message (Own messages only)
app.delete('/api/chat/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.userId;

        let message = null;
        if (database.type === 'firestore') {
            const msgDoc = await database.instance.collection('messages').doc(messageId).get();
            if (msgDoc.exists) {
                message = { messageId: msgDoc.id, ...msgDoc.data() };
            }
        } else {
            message = database.instance.messages.get(messageId) || null;
        }

        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        // Check if user owns the message
        if (message.senderId !== userId) {
            return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
        }

        if (database.type === 'firestore') {
            await database.instance.collection('messages').doc(messageId).delete();
        } else {
            database.instance.messages.delete(messageId);
        }

        res.json({ success: true, message: 'Message deleted' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// API ROUTES - CHAT STATS
// ================================================

// Get chat stats (members, online)
app.get('/api/chat/stats', authenticateToken, async (req, res) => {
    try {
        let totalMembers = 0;
        let onlineMembers = 0;

        if (database.type === 'firestore') {
            const usersSnapshot = await database.instance.collection('users').get();
            totalMembers = usersSnapshot.size;
            
            const onlineSnapshot = await database.instance.collection('users')
                .where('onlineStatus', '==', true)
                .get();
            onlineMembers = onlineSnapshot.size;
        } else {
            const users = Array.from(database.instance.users.values());
            totalMembers = users.length;
            onlineMembers = users.filter(u => u.onlineStatus === true).length;
        }

        res.json({ 
            success: true, 
            stats: { 
                totalMembers, 
                onlineMembers 
            } 
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// API ROUTES - NOTIFICATIONS
// ================================================

// Get notifications (Admin only for now)
app.get('/api/admin/notifications', authenticateAdmin, async (req, res) => {
    try {
        let notifications = [];

        if (database.type === 'firestore') {
            const notifSnapshot = await database.instance.collection('notifications')
                .orderBy('createdAt', 'desc')
                .get();
            notifications = notifSnapshot.docs.map(doc => ({ notificationId: doc.id, ...doc.data() }));
        } else {
            notifications = Array.from(database.instance.notifications.values())
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        res.json({ success: true, notifications });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create notification (Admin only)
app.post('/api/admin/notifications', authenticateAdmin, async (req, res) => {
    try {
        const { title, message } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message required' });
        }

        const notificationId = 'notif_' + uuidv4();
        const newNotification = {
            notificationId,
            title,
            message,
            createdAt: new Date().toISOString()
        };

        if (database.type === 'firestore') {
            await database.instance.collection('notifications').doc(notificationId).set(newNotification);
        } else {
            database.instance.notifications.set(notificationId, newNotification);
        }

        res.status(201).json({ success: true, message: 'Notification created', notification: newNotification });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete notification (Admin only)
app.delete('/api/admin/notifications/:notificationId', authenticateAdmin, async (req, res) => {
    try {
        const { notificationId } = req.params;

        if (database.type === 'firestore') {
            await database.instance.collection('notifications').doc(notificationId).delete();
        } else {
            if (!database.instance.notifications.has(notificationId)) {
                return res.status(404).json({ success: false, message: 'Notification not found' });
            }
            database.instance.notifications.delete(notificationId);
        }

        res.json({ success: true, message: 'Notification deleted' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// API ROUTES - REPORTS
// ================================================

// Report message/user
app.post('/api/reports', authenticateToken, async (req, res) => {
    try {
        const { messageId, reportedUserId, reason } = req.body;
        const reportedBy = req.user.userId;

        if (!reportedUserId || !reason) {
            return res.status(400).json({ success: false, message: 'User and reason required' });
        }

        const reportId = 'rpt_' + uuidv4();
        const newReport = {
            reportId,
            messageId: messageId || null,
            reportedUserId,
            reportedBy,
            reason,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        if (database.type === 'firestore') {
            await database.instance.collection('reports').doc(reportId).set(newReport);
        } else {
            database.instance.reports.set(reportId, newReport);
        }

        res.status(201).json({ success: true, message: 'Report submitted', report: newReport });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get all reports (Admin only)
app.get('/api/admin/reports', authenticateAdmin, async (req, res) => {
    try {
        let reports = [];

        if (database.type === 'firestore') {
            const reportsSnapshot = await database.instance.collection('reports')
                .orderBy('createdAt', 'desc')
                .get();
            reports = reportsSnapshot.docs.map(doc => ({ reportId: doc.id, ...doc.data() }));
        } else {
            reports = Array.from(database.instance.reports.values())
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        // Enrich reports with user data
        const enrichedReports = await Promise.all(reports.map(async (report) => {
            let reportedUser = null;
            let reporter = null;

            if (database.type === 'firestore') {
                const userDoc = await database.instance.collection('users').doc(report.reportedUserId).get();
                if (userDoc.exists) {
                    reportedUser = { userId: userDoc.id, ...userDoc.data() };
                }
                const reporterDoc = await database.instance.collection('users').doc(report.reportedBy).get();
                if (reporterDoc.exists) {
                    reporter = { userId: reporterDoc.id, ...reporterDoc.data() };
                }
            } else {
                reportedUser = database.instance.users.get(report.reportedUserId) || null;
                reporter = database.instance.users.get(report.reportedBy) || null;
            }

            return {
                ...report,
                reportedUser: reportedUser ? {
                    userId: reportedUser.userId,
                    fullName: reportedUser.fullName,
                    username: reportedUser.username,
                    profileImage: reportedUser.profileImage
                } : null,
                reporter: reporter ? {
                    userId: reporter.userId,
                    fullName: reporter.fullName,
                    username: reporter.username
                } : null
            };
        }));

        res.json({ success: true, reports: enrichedReports });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update report status (Admin only)
app.put('/api/admin/reports/:reportId', authenticateAdmin, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { status } = req.body;

        if (!status || !['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        if (database.type === 'firestore') {
            await database.instance.collection('reports').doc(reportId).update({ status });
        } else {
            const report = database.instance.reports.get(reportId);
            if (!report) {
                return res.status(404).json({ success: false, message: 'Report not found' });
            }
            report.status = status;
            database.instance.reports.set(reportId, report);
        }

        res.json({ success: true, message: 'Report updated' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================================================
// SERVE HTML FILES - FALLBACK ROUTES
// ================================================

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve all HTML files directly
app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, `${page}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Page not found');
    }
});

// ================================================
// START SERVER
// ================================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🎮 DVARY GAMES SERVER');
    console.log('========================================');
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${__dirname}`);
    console.log('========================================');
    console.log('📋 Available pages:');
    console.log(`   - http://localhost:${PORT}/`);
    console.log(`   - http://localhost:${PORT}/login.html`);
    console.log(`   - http://localhost:${PORT}/signup.html`);
    console.log(`   - http://localhost:${PORT}/chat.html`);
    console.log(`   - http://localhost:${PORT}/setting.html`);
    console.log(`   - http://localhost:${PORT}/dvary.html`);
    console.log('========================================');
    console.log('🔐 Admin Login:');
    console.log(`   Email: admin@dvarygames.com`);
    console.log(`   Password: Admin@12345`);
    console.log('========================================');
});
