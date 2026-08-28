// ============================================
// DVARY GAMES - Main Application Logic
// ============================================

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    query, 
    limit, 
    where, 
    doc, 
    getDoc, 
    addDoc, 
    deleteDoc,
    updateDoc,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCmwASW4XXQ3O0AvsCM_r1WLlrUmGjYVxI",
    authDomain: "dvary-9a7d0.firebaseapp.com",
    projectId: "dvary-9a7d0",
    storageBucket: "dvary-9a7d0.firebasestorage.app",
    messagingSenderId: "107370806066",
    appId: "1:107370806066:web:4c2ce1e6f7b6c32909f52b",
    measurementId: "G-07361LFJEP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let allGames = [];
let notifications = [];

// ============================================
// DOM ELEMENTS
// ============================================
const navMenu = document.getElementById('navMenu');
const menuToggle = document.getElementById('menuToggle');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const logoutBtn = document.getElementById('logoutBtn');
const profileLink = document.getElementById('profileLink');
const adminNav = document.getElementById('adminNav');
const notifBadge = document.getElementById('notifBadge');
const notificationBtn = document.getElementById('notificationBtn');
const notificationModal = document.getElementById('notificationModal');
const closeNotifModal = document.getElementById('closeNotifModal');
const notificationList = document.getElementById('notificationList');
const gameModal = document.getElementById('gameModal');
const closeGameModal = document.getElementById('closeGameModal');

// ============================================
// AUTHENTICATION STATE
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        console.log('✅ User logged in:', user.email);
        
        // Check if user is admin
        const isAdmin = await checkIfAdmin(user.uid);
        if (isAdmin) {
            adminNav.style.display = 'block';
        }
        
        // Load notifications
        loadNotifications();
        
        // Load games
        loadGames();
        
        // Update user profile link
        if (profileLink) {
            profileLink.href = `setting.html?uid=${user.uid}`;
        }
    } else {
        currentUser = null;
        console.log('❌ User logged out');
        
        // Redirect to login if not on login/signup pages
        const currentPage = window.location.pathname.split('/').pop();
        if (!['login.html', 'signup.html'].includes(currentPage)) {
            window.location.href = 'login.html';
        }
    }
});

// ============================================
// CHECK IF USER IS ADMIN
// ============================================
async function checkIfAdmin(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            return userData.role === 'admin';
        }
        return false;
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

// ============================================
// LOAD GAMES FROM FIRESTORE
// ============================================
async function loadGames() {
    try {
        // Load featured games
        await loadFeaturedGames();
        
        // Load VIP games
        await loadVIPGames();
        
        // Load Free games
        await loadFreeGames();
        
        // Load Trending games
        await loadTrendingGames();
        
        // Load all games for search
        await loadAllGames();
        
    } catch (error) {
        console.error('Error loading games:', error);
        showError('Failed to load games. Please refresh.');
    }
}

async function loadFeaturedGames() {
    const container = document.getElementById('featuredGames');
    container.innerHTML = '<div class="loading-spinner">Loading featured games...</div>';
    
    try {
        const q = query(collection(db, 'games'), where('featured', '==', true), limit(6));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎮</div>
                    <h3>No featured games yet</h3>
                    <p>Check back soon for featured games</p>
                </div>
            `;
            return;
        }
        
        const games = [];
        snapshot.forEach(doc => {
            games.push({ id: doc.id, ...doc.data() });
        });
        
        container.innerHTML = games.map(game => createGameCard(game)).join('');
        
        // Set hero game
        if (games.length > 0) {
            setHeroGame(games[0]);
        }
        
    } catch (error) {
        console.error('Error loading featured games:', error);
        container.innerHTML = `
            <div class="error-state">
                <p>⚠️ Failed to load featured games</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

async function loadVIPGames() {
    const container = document.getElementById('vipGames');
    container.innerHTML = '<div class="loading-spinner">Loading VIP games...</div>';
    
    try {
        const q = query(collection(db, 'games'), where('type', '==', 'vip'), limit(6));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👑</div>
                    <h3>No VIP games available</h3>
                    <p>VIP games coming soon</p>
                </div>
            `;
            return;
        }
        
        const games = [];
        snapshot.forEach(doc => {
            games.push({ id: doc.id, ...doc.data() });
        });
        
        container.innerHTML = games.map(game => createGameCard(game)).join('');
        
    } catch (error) {
        console.error('Error loading VIP games:', error);
        container.innerHTML = `
            <div class="error-state">
                <p>⚠️ Failed to load VIP games</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

async function loadFreeGames() {
    const container = document.getElementById('freeGames');
    container.innerHTML = '<div class="loading-spinner">Loading free games...</div>';
    
    try {
        const q = query(collection(db, 'games'), where('type', '==', 'free'), limit(6));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎁</div>
                    <h3>No free games available</h3>
                    <p>Free games coming soon</p>
                </div>
            `;
            return;
        }
        
        const games = [];
        snapshot.forEach(doc => {
            games.push({ id: doc.id, ...doc.data() });
        });
        
        container.innerHTML = games.map(game => createGameCard(game)).join('');
        
    } catch (error) {
        console.error('Error loading free games:', error);
        container.innerHTML = `
            <div class="error-state">
                <p>⚠️ Failed to load free games</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

async function loadTrendingGames() {
    const container = document.getElementById('trendingGames');
    container.innerHTML = '<div class="loading-spinner">Loading trending games...</div>';
    
    try {
        const q = query(collection(db, 'games'), where('trending', '==', true), limit(6));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📈</div>
                    <h3>No trending games yet</h3>
                    <p>Trending games coming soon</p>
                </div>
            `;
            return;
        }
        
        const games = [];
        snapshot.forEach(doc => {
            games.push({ id: doc.id, ...doc.data() });
        });
        
        container.innerHTML = games.map(game => createGameCard(game)).join('');
        
    } catch (error) {
        console.error('Error loading trending games:', error);
        container.innerHTML = `
            <div class="error-state">
                <p>⚠️ Failed to load trending games</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

async function loadAllGames() {
    try {
        const snapshot = await getDocs(collection(db, 'games'));
        allGames = [];
        snapshot.forEach(doc => {
            allGames.push({ id: doc.id, ...doc.data() });
        });
    } catch (error) {
        console.error('Error loading all games:', error);
    }
}

// ============================================
// CREATE GAME CARD HTML
// ============================================
function createGameCard(game) {
    const badge = game.type === 'vip' 
        ? '<span class="game-card-badge badge-vip">VIP</span>'
        : '<span class="game-card-badge badge-free">FREE</span>';
    
    const featuredBadge = game.featured 
        ? '<span class="game-card-badge badge-featured">★ Featured</span>'
        : '';
    
    const imageStyle = game.image 
        ? `background-image: url('${game.image}');`
        : `background: linear-gradient(135deg, #1a1a2e, #2d1b69);`;
    
    return `
        <div class="game-card" onclick="openGameDetail('${game.id}')">
            <div class="game-card-image" style="${imageStyle}">
                ${badge}
                ${featuredBadge}
            </div>
            <div class="game-card-content">
                <h4>${game.name || 'Unknown Game'}</h4>
                <div class="category">${game.category || 'Other'}</div>
                <div class="game-card-meta">
                    <span><i class="fas fa-code-branch"></i> ${game.version || '1.0'}</span>
                    <span><i class="fas fa-hdd"></i> ${game.size || 'Unknown'}</span>
                </div>
                <button class="btn-primary" onclick="event.stopPropagation(); openGameDetail('${game.id}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </div>
        </div>
    `;
}

// ============================================
// SET HERO GAME
// ============================================
function setHeroGame(game) {
    const heroImage = document.getElementById('heroGameImage');
    const heroName = document.getElementById('heroGameName');
    const heroCategory = document.getElementById('heroGameCategory');
    const heroBtn = document.getElementById('heroGameBtn');
    
    if (game.image) {
        heroImage.style.backgroundImage = `url('${game.image}')`;
    }
    
    heroName.textContent = game.name || 'Featured Game';
    heroCategory.textContent = game.category || 'Featured';
    heroBtn.href = `#game-${game.id}`;
    heroBtn.onclick = (e) => {
        e.preventDefault();
        openGameDetail(game.id);
    };
}

// ============================================
// OPEN GAME DETAIL MODAL
// ============================================
window.openGameDetail = async function(gameId) {
    const modal = document.getElementById('gameModal');
    const detailContainer = document.getElementById('gameDetail');
    
    detailContainer.innerHTML = '<div class="loading-spinner">Loading game details...</div>';
    modal.classList.add('active');
    
    try {
        const docRef = doc(db, 'games', gameId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            detailContainer.innerHTML = `
                <div class="error-state">
                    <p>⚠️ Game not found</p>
                </div>
            `;
            return;
        }
        
        const game = { id: docSnap.id, ...docSnap.data() };
        
        const imageStyle = game.image 
            ? `background-image: url('${game.image}');`
            : `background: linear-gradient(135deg, #1a1a2e, #2d1b69);`;
        
        detailContainer.innerHTML = `
            <div class="game-detail-image" style="${imageStyle}"></div>
            <div class="game-detail-info">
                <h2>${game.name || 'Unknown Game'}</h2>
                <p class="detail-category"><i class="fas fa-tag"></i> ${game.category || 'Other'}</p>
                <p class="detail-description">${game.description || 'No description available'}</p>
                <div class="detail-meta">
                    <span><i class="fas fa-${game.type === 'vip' ? 'crown' : 'gift'}"></i> ${game.type === 'vip' ? 'VIP' : 'Free'}</span>
                    <span><i class="fas fa-code-branch"></i> ${game.version || '1.0.0'}</span>
                    <span><i class="fas fa-hdd"></i> ${game.size || 'Unknown'}</span>
                    <span><i class="fas fa-tag"></i> ${game.genre || 'Other'}</span>
                </div>
                <div class="detail-actions">
                    <a href="${game.downloadUrl || '#'}" class="btn-primary" target="_blank">
                        <i class="fas fa-download"></i> Download
                    </a>
                    ${game.trailerUrl ? `<a href="${game.trailerUrl}" class="btn-secondary" target="_blank">
                        <i class="fas fa-play"></i> Watch Trailer
                    </a>` : ''}
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading game details:', error);
        detailContainer.innerHTML = `
            <div class="error-state">
                <p>⚠️ Failed to load game details</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }
};

// Close game modal
closeGameModal.addEventListener('click', () => {
    gameModal.classList.remove('active');
});

gameModal.addEventListener('click', (e) => {
    if (e.target === gameModal) {
        gameModal.classList.remove('active');
    }
});

// ============================================
// SEARCH GAMES
// ============================================
searchBtn.addEventListener('click', searchGames);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchGames();
    }
});

function searchGames() {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
        // Reset to show all games
        loadGames();
        return;
    }
    
    const filtered = allGames.filter(game => 
        game.name?.toLowerCase().includes(query) ||
        game.category?.toLowerCase().includes(query) ||
        game.description?.toLowerCase().includes(query)
    );
    
    // Update all sections with filtered results
    const sections = ['featuredGames', 'vipGames', 'freeGames', 'trendingGames'];
    sections.forEach(sectionId => {
        const container = document.getElementById(sectionId);
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3>No games found</h3>
                    <p>Try searching with different keywords</p>
                </div>
            `;
        } else {
            container.innerHTML = filtered.map(game => createGameCard(game)).join('');
        }
    });
}

// ============================================
// NAVIGATION - MOBILE MENU TOGGLE
// ============================================
menuToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
});

// Close menu when clicking a link (mobile)
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
    });
});

// ============================================
// LOGOUT
// ============================================
logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (confirm('Are you sure you want to logout?')) {
        try {
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout error:', error);
            alert('Failed to logout. Please try again.');
        }
    }
});

// ============================================
// NOTIFICATIONS
// ============================================
notificationBtn.addEventListener('click', () => {
    notificationModal.classList.add('active');
    loadNotifications();
});

closeNotifModal.addEventListener('click', () => {
    notificationModal.classList.remove('active');
});

notificationModal.addEventListener('click', (e) => {
    if (e.target === notificationModal) {
        notificationModal.classList.remove('active');
    }
});

async function loadNotifications() {
    const list = document.getElementById('notificationList');
    list.innerHTML = '<div class="loading-spinner">Loading notifications...</div>';
    
    try {
        const snapshot = await getDocs(
            query(collection(db, 'notifications'), orderBy('createdAt', 'desc'))
        );
        
        if (snapshot.empty) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔔</div>
                    <h3>No notifications</h3>
                    <p>You're all caught up!</p>
                </div>
            `;
            notifBadge.textContent = '0';
            return;
        }
        
        const notifs = [];
        snapshot.forEach(doc => {
            notifs.push({ id: doc.id, ...doc.data() });
        });
        
        list.innerHTML = notifs.map(notif => `
            <div class="notification-item">
                <h4>${notif.title || 'Notification'}</h4>
                <p>${notif.message || ''}</p>
                <div class="time">${formatTime(notif.createdAt)}</div>
            </div>
        `).join('');
        
        notifBadge.textContent = notifs.length;
        
    } catch (error) {
        console.error('Error loading notifications:', error);
        list.innerHTML = `
            <div class="error-state">
                <p>⚠️ Failed to load notifications</p>
            </div>
        `;
    }
}

function formatTime(timestamp) {
    if (!timestamp) return 'Just now';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    
    return date.toLocaleDateString();
}

// ============================================
// ERROR HANDLING
// ============================================
function showError(message) {
    console.error('Error:', message);
    // You can implement a toast notification system here
    // For now, we'll use console and show in specific containers
}

// ============================================
// INIT - Load data on page load
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // If user is already logged in (handled by onAuthStateChanged)
    console.log('📱 DVARY GAMES loaded');
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
        if (gameModal.classList.contains('active')) {
            gameModal.classList.remove('active');
        }
        if (notificationModal.classList.contains('active')) {
            notificationModal.classList.remove('active');
        }
    }
    
    // Ctrl+K or / to focus search
    if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !e.ctrlKey)) {
        e.preventDefault();
        if (searchInput) {
            searchInput.focus();
        }
    }
});

// ============================================
// SMOOTH SCROLL FOR NAVIGATION
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && href.startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
});

console.log('✅ DVARY GAMES app.js loaded successfully');
