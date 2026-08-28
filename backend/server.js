// ============================================
// DVARY GAMES - BACKEND SERVER
// ============================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://*.onrender.com'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend/pages')));
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================
// FIREBASE ADMIN INITIALIZATION
// ============================================
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
            }),
            storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET
        });
        console.log('✅ Firebase Admin initialized');
    } catch (error) {
        console.log('⚠️ Firebase Admin init failed:', error.message);
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: process.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET
        });
    }
}

const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();

// ============================================
// FILE UPLOAD (Multer)
// ============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images allowed.'));
        }
    }
});

// ============================================
// AUTH MIDDLEWARE
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        if (userDoc.exists) {
            req.userData = userDoc.data();
        }
        next();
    } catch (error) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            next();
        } catch (jwtError) {
            return res.status(401).json({ success: false, message: 'Invalid token.' });
        }
    }
};

const isAdmin = async (req, res, next) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (!userDoc.exists || !userDoc.data().isAdmin) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
        }
        next();
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error verifying admin status.' });
    }
};

// ============================================
// SERVE HTML PAGES
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/index.html'));
});
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/login.html'));
});
app.get('/signup.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/signup.html'));
});
app.get('/chat.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/chat.html'));
});
app.get('/setting.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/setting.html'));
});
app.get('/dvary.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/dvary.html'));
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'DVARY GAMES API is running!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// ============================================
// AUTH ROUTES
// ============================================

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, username, email, phoneNumber, password, confirmPassword } = req.body;

        if (!fullName || !username || !email || !password || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }

        // Check username
        const usernameQuery = await db.collection('users').where('username', '==', username).get();
        if (!usernameQuery.empty) {
            return res.status(400).json({ success: false, message: 'Username already taken.' });
        }

        // Check email
        const emailQuery = await db.collection('users').where('email', '==', email).get();
        if (!emailQuery.empty) {
            return res.status(400).json({ success: false, message: 'Email already registered.' });
        }

        // Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            displayName: fullName
        });

        // Create user document in Firestore
        const userData = {
            uid: userRecord.uid,
            fullName: fullName,
            username: username,
            email: email,
            phoneNumber: phoneNumber || '',
            profilePicture: '',
            isAdmin: false,
            isBlocked: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: null,
            gamesPlayed: 0,
            favorites: [],
            settings: {
                darkMode: true,
                language: 'en',
                notifications: {
                    games: true,
                    chat: true,
                    updates: true
                }
            }
        };

        await db.collection('users').doc(userRecord.uid).set(userData);

        const token = jwt.sign(
            { uid: userRecord.uid, email: email, isAdmin: false },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully!',
            token: token,
            user: {
                uid: userRecord.uid,
                fullName: fullName,
                username: username,
                email: email,
                isAdmin: false
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: error.message || 'Registration failed.' });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const userQuery = await db.collection('users').where('email', '==', email).get();

        if (userQuery.empty) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();

        if (userData.isBlocked) {
            return res.status(403).json({ success: false, message: 'Your account has been blocked. Please contact support.' });
        }

        await db.collection('users').doc(userData.uid).update({
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        });

        const token = jwt.sign(
            { uid: userData.uid, email: email, isAdmin: userData.isAdmin || false },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            token: token,
            user: {
                uid: userData.uid,
                fullName: userData.fullName,
                username: userData.username,
                email: userData.email,
                profilePicture: userData.profilePicture || '',
                isAdmin: userData.isAdmin || false
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: error.message || 'Login failed.' });
    }
});

// GET CURRENT USER
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const userData = userDoc.data();
        res.status(200).json({
            success: true,
            user: {
                uid: req.user.uid,
                fullName: userData.fullName,
                username: userData.username,
                email: userData.email,
                phoneNumber: userData.phoneNumber || '',
                profilePicture: userData.profilePicture || '',
                isAdmin: userData.isAdmin || false,
                isBlocked: userData.isBlocked || false,
                settings: userData.settings || {},
                createdAt: userData.createdAt,
                lastLogin: userData.lastLogin
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// USER PROFILE
// ============================================
app.put('/api/users/profile', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    try {
        const { fullName, username, phoneNumber } = req.body;
        const uid = req.user.uid;

        const updateData = {};
        if (fullName) updateData.fullName = fullName;
        if (username) updateData.username = username;
        if (phoneNumber) updateData.phoneNumber = phoneNumber;

        if (req.file) {
            const filePath = req.file.path;
            const fileName = `profile-pictures/${uid}/${req.file.filename}`;
            await bucket.upload(filePath, {
                destination: fileName,
                metadata: { contentType: req.file.mimetype }
            });
            const file = bucket.file(fileName);
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-01-2030'
            });
            updateData.profilePicture = url;
            fs.unlinkSync(filePath);
        }

        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await db.collection('users').doc(uid).update(updateData);

        const updatedDoc = await db.collection('users').doc(uid).get();
        const userData = updatedDoc.data();

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully!',
            user: {
                uid: uid,
                fullName: userData.fullName,
                username: userData.username,
                email: userData.email,
                phoneNumber: userData.phoneNumber || '',
                profilePicture: userData.profilePicture || '',
                isAdmin: userData.isAdmin || false
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ success: false, message: error.message || 'Profile update failed.' });
    }
});

// ============================================
// GAME ROUTES
// ============================================
app.get('/api/games', async (req, res) => {
    try {
        const { limit = 50, category, type, search } = req.query;
        let gamesQuery = db.collection('games');

        if (category && category !== 'all') {
            gamesQuery = gamesQuery.where('category', '==', category);
        }
        if (type === 'featured') gamesQuery = gamesQuery.where('isFeatured', '==', true);
        if (type === 'trending') gamesQuery = gamesQuery.where('isTrending', '==', true);
        if (type === 'vip') gamesQuery = gamesQuery.where('isVip', '==', true);
        if (type === 'free') gamesQuery = gamesQuery.where('isVip', '==', false);

        if (search) {
            const snapshot = await gamesQuery.get();
            let games = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.gameName?.toLowerCase().includes(search.toLowerCase()) ||
                    data.category?.toLowerCase().includes(search.toLowerCase())) {
                    games.push({ id: doc.id, ...data });
                }
            });
            return res.status(200).json({ success: true, games: games.slice(0, parseInt(limit)) });
        }

        const snapshot = await gamesQuery.limit(parseInt(limit)).get();
        const games = [];
        snapshot.forEach(doc => {
            games.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json({ success: true, games: games });
    } catch (error) {
        console.error('Get games error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/games/:id', async (req, res) => {
    try {
        const gameDoc = await db.collection('games').doc(req.params.id).get();
        if (!gameDoc.exists) {
            return res.status(404).json({ success: false, message: 'Game not found.' });
        }
        res.status(200).json({ success: true, game: { id: gameDoc.id, ...gameDoc.data() } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN GAME ROUTES
// ============================================
app.post('/api/admin/games', authenticateToken, isAdmin, upload.single('coverImage'), async (req, res) => {
    try {
        const { gameName, description, category, genre, version, size, isVip, downloadUrl, trailerUrl, isFeatured, isTrending } = req.body;

        if (!gameName || !description || !category) {
            return res.status(400).json({ success: false, message: 'Game name, description, and category are required.' });
        }

        let coverImageUrl = '';
        if (req.file) {
            const filePath = req.file.path;
            const fileName = `games/${Date.now()}-${req.file.filename}`;
            await bucket.upload(filePath, {
                destination: fileName,
                metadata: { contentType: req.file.mimetype }
            });
            const file = bucket.file(fileName);
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-01-2030'
            });
            coverImageUrl = url;
            fs.unlinkSync(filePath);
        }

        const gameData = {
            gameName, description, category,
            genre: genre || '', version: version || '1.0.0',
            size: size || '0 MB', coverImage: coverImageUrl,
            downloadUrl: downloadUrl || '', trailerUrl: trailerUrl || '',
            isVip: isVip === 'true' || isVip === true,
            isFeatured: isFeatured === 'true' || isFeatured === true,
            isTrending: isTrending === 'true' || isTrending === true,
            views: 0, downloads: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('games').add(gameData);
        res.status(201).json({
            success: true,
            message: 'Game added successfully!',
            game: { id: docRef.id, ...gameData }
        });
    } catch (error) {
        console.error('Add game error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/admin/games/:id', authenticateToken, isAdmin, upload.single('coverImage'), async (req, res) => {
    try {
        const gameId = req.params.id;
        const { gameName, description, category, genre, version, size, isVip, downloadUrl, trailerUrl, isFeatured, isTrending } = req.body;

        const updateData = {};
        if (gameName) updateData.gameName = gameName;
        if (description) updateData.description = description;
        if (category) updateData.category = category;
        if (genre) updateData.genre = genre;
        if (version) updateData.version = version;
        if (size) updateData.size = size;
        if (isVip !== undefined) updateData.isVip = isVip === 'true' || isVip === true;
        if (isFeatured !== undefined) updateData.isFeatured = isFeatured === 'true' || isFeatured === true;
        if (isTrending !== undefined) updateData.isTrending = isTrending === 'true' || isTrending === true;
        if (downloadUrl) updateData.downloadUrl = downloadUrl;
        if (trailerUrl) updateData.trailerUrl = trailerUrl;

        if (req.file) {
            const filePath = req.file.path;
            const fileName = `games/${Date.now()}-${req.file.filename}`;
            await bucket.upload(filePath, {
                destination: fileName,
                metadata: { contentType: req.file.mimetype }
            });
            const file = bucket.file(fileName);
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-01-2030'
            });
            updateData.coverImage = url;
            fs.unlinkSync(filePath);
        }

        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await db.collection('games').doc(gameId).update(updateData);

        const updatedDoc = await db.collection('games').doc(gameId).get();
        res.status(200).json({
            success: true,
            message: 'Game updated successfully!',
            game: { id: updatedDoc.id, ...updatedDoc.data() }
        });
    } catch (error) {
        console.error('Update game error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/games/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const gameId = req.params.id;
        const gameDoc = await db.collection('games').doc(gameId).get();
        if (!gameDoc.exists) {
            return res.status(404).json({ success: false, message: 'Game not found.' });
        }
        await db.collection('games').doc(gameId).delete();
        res.status(200).json({ success: true, message: 'Game deleted successfully!' });
    } catch (error) {
        console.error('Delete game error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN USER ROUTES
// ============================================
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('users').get();
        const users = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            users.push({
                uid: doc.id,
                fullName: data.fullName,
                username: data.username,
                email: data.email,
                phoneNumber: data.phoneNumber || '',
                profilePicture: data.profilePicture || '',
                isAdmin: data.isAdmin || false,
                isBlocked: data.isBlocked || false,
                createdAt: data.createdAt,
                lastLogin: data.lastLogin
            });
        });
        res.status(200).json({ success: true, users: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/admin/users/:uid/block', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { uid } = req.params;
        const { isBlocked } = req.body;
        await db.collection('users').doc(uid).update({
            isBlocked: isBlocked === true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.status(200).json({
            success: true,
            message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully!`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// GROUP CHAT ROUTES
// ============================================
const GROUP_CHAT_ID = 'dvary_community';

// Get group messages
app.get('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
        const messagesRef = db.collection('groups', GROUP_CHAT_ID, 'messages');
        const q = messagesRef.orderBy('createdAt', 'asc').limit(100);
        const snapshot = await q.get();
        const messages = [];
        snapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json({ success: true, messages: messages });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send message
app.post('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        const uid = req.user.uid;

        if (!message || message.trim() === '') {
            return res.status(400).json({ success: false, message: 'Message is required.' });
        }

        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();

        const messagesRef = db.collection('groups', GROUP_CHAT_ID, 'messages');
        await messagesRef.add({
            message: message.trim(),
            senderId: uid,
            senderName: userData?.fullName || 'User',
            senderPhoto: userData?.profilePicture || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            deleted: false,
            readBy: [uid]
        });

        await db.collection('groups').doc(GROUP_CHAT_ID).update({
            totalMessages: admin.firestore.FieldValue.increment(1)
        });

        res.status(201).json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete message
app.delete('/api/chat/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const uid = req.user.uid;

        const messageRef = db.collection('groups', GROUP_CHAT_ID, 'messages').doc(messageId);
        const messageDoc = await messageRef.get();

        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found.' });
        }

        const messageData = messageDoc.data();
        if (messageData.senderId !== uid) {
            return res.status(403).json({ success: false, message: 'You can only delete your own messages.' });
        }

        await messageRef.update({
            deleted: true,
            message: '[This message was deleted]'
        });

        res.status(200).json({ success: true, message: 'Message deleted successfully!' });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get group info
app.get('/api/chat/group-info', authenticateToken, async (req, res) => {
    try {
        const groupRef = db.collection('groups').doc(GROUP_CHAT_ID);
        const groupDoc = await groupRef.get();

        if (!groupDoc.exists) {
            return res.status(404).json({ success: false, message: 'Group not found.' });
        }

        const usersSnapshot = await db.collection('users').get();
        const members = [];
        let onlineCount = 0;

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            if (!data.isBlocked) {
                members.push({
                    uid: doc.id,
                    fullName: data.fullName,
                    username: data.username,
                    profilePicture: data.profilePicture || '',
                    isOnline: data.isOnline || false
                });
                if (data.isOnline) onlineCount++;
            }
        });

        res.status(200).json({
            success: true,
            group: groupDoc.data(),
            members: members,
            totalMembers: members.length,
            onlineMembers: onlineCount
        });
    } catch (error) {
        console.error('Get group info error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// NOTIFICATION ROUTES
// ============================================
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const uid = req.user.uid;
        const notificationsQuery = await db.collection('notifications')
            .where('userId', '==', uid)
            .orderBy('createdAt', 'desc')
            .get();

        const notifications = [];
        notificationsQuery.forEach(doc => {
            notifications.push({ id: doc.id, ...doc.data() });
        });

        const batch = db.batch();
        notificationsQuery.forEach(doc => {
            batch.update(doc.ref, { read: true });
        });
        await batch.commit();

        res.status(200).json({ success: true, notifications: notifications, unreadCount: 0 });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/notifications', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { title, message, userId } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message are required.' });
        }

        const notificationData = {
            title, message,
            userId: userId || 'all',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (userId === 'all' || !userId) {
            const usersSnapshot = await db.collection('users').get();
            const batch = db.batch();
            usersSnapshot.forEach(doc => {
                const notifRef = db.collection('notifications').doc();
                batch.set(notifRef, { ...notificationData, userId: doc.id });
            });
            await batch.commit();
        } else {
            await db.collection('notifications').add(notificationData);
        }

        res.status(201).json({ success: true, message: 'Notification sent successfully!' });
    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN STATS
// ============================================
app.get('/api/admin/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const totalUsers = usersSnapshot.size;

        const blockedQuery = await db.collection('users').where('isBlocked', '==', true).get();
        const blockedUsers = blockedQuery.size;

        const gamesSnapshot = await db.collection('games').get();
        const totalGames = gamesSnapshot.size;

        const vipQuery = await db.collection('games').where('isVip', '==', true).get();
        const vipGames = vipQuery.size;
        const freeGames = totalGames - vipGames;

        const featuredQuery = await db.collection('games').where('isFeatured', '==', true).get();
        const featuredGames = featuredQuery.size;

        const trendingQuery = await db.collection('games').where('isTrending', '==', true).get();
        const trendingGames = trendingQuery.size;

        const chatsSnapshot = await db.collection('chats').get();
        const totalChats = chatsSnapshot.size;

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentUsersQuery = await db.collection('users')
            .where('createdAt', '>=', sevenDaysAgo)
            .get();
        const newUsers = recentUsersQuery.size;

        res.status(200).json({
            success: true,
            stats: {
                totalUsers, blockedUsers, totalGames, freeGames,
                vipGames, featuredGames, trendingGames,
                totalChats, newUsers,
                activeUsers: totalUsers - blockedUsers
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// CATCH-ALL
// ============================================
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/pages/index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error.'
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 DVARY GAMES Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log('✅ Server is ready!');
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

module.exports = app;
