// ============================================
// DVARY GAMES - APP.JS (Homepage Logic)
// ============================================

// ============================================
// IMPORT FIREBASE SDKs
// ============================================
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "firebase/auth";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    getDoc, 
    doc, 
    query, 
    where, 
    orderBy, 
    limit,
    serverTimestamp 
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ============================================
// FIREBASE CONFIGURATION
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyCmwASW4XXQ3O0AvsCM_r1WLlrUmGjYVxI",
    authDomain: "dvary-9a7d0.firebaseapp.com",
    projectId: "dvary-9a7d0",
    storageBucket: "dvary-9a7d0.firebasestorage.app",
    messagingSenderId: "107370806066",
    appId: "1:107370806066:web:4c2ce1e6f7b6c32909f52b",
    measurementId: "G-07361LFJEP"
};

// ============================================
// INITIALIZE FIREBASE
// ============================================
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

console.log('🔥 Firebase initialized in app.js!');

// ============================================
// DOM ELEMENTS
// ============================================
const navLinks = document.getElementById('navLinks');
const mobileMenu = document.getElementById('mobileMenu');
const menuToggle = document.getElementById('menuToggle');
const authLinks = document.getElementById('authLinks');
const userLinks = document.getElementById('userLinks');
const mobileAuthLinks = document.getElementById('mobileAuthLinks');
const mobileUserLinks = document.getElementById('mobileUserLinks');
const navUsername = document.getElementById('navUsername');
const navProfilePic = document.getElementById('navProfilePic');

const heroTitle = document.getElementById('heroTitle');
const heroDescription = document.getElementById('heroDescription');
const heroCategory = document.getElementById('heroCategory');
const heroViewBtn = document.getElementById('heroViewBtn');
const heroImage = document.getElementById('heroImage');

const featuredGames = document.getElementById('featuredGames');
const trendingGamesGrid = document.getElementById('trendingGamesGrid');
const vipGames = document.getElementById('vipGames');
const freeGames = document.getElementById('freeGames');

const categoryButtons = document.querySelectorAll('.category-btn');

const notificationBadge = document.getElementById('notificationBadge');
const mobileNotificationBadge = document.getElementById('mobileNotificationBadge');
const notificationToast = document.getElementById('notificationToast');
const toastTitle = document.getElementById('toastTitle');
const toastMessage = document.getElementById('toastMessage');
const toastClose = document.getElementById('toastClose');

const loadingOverlay = document.getElementById('loadingOverlay');

// ============================================
// STATE
// ============================================
let currentUser = null;
let allGames = [];
let currentCategory = 'all';
let isMenuOpen = false;

// ============================================
// LOADING FUNCTIONS
// ============================================
function showLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================
function updateUIForAuth(user) {
    if (user) {
        authLinks.style.display = 'none';
        userLinks.style.display = 'flex';
        mobileAuthLinks.style.display = 'none';
        mobileUserLinks.style.display = 'block';
        
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        navUsername.textContent = userData.displayName || user.displayName || user.email || 'User';
        navProfilePic.src = userData.photoURL || user.photoURL || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(navUsername.textContent)}&background=6C3CE1&color=fff`;
    } else {
        authLinks.style.display = 'flex';
        userLinks.style.display = 'none';
        mobileAuthLinks.style.display = 'block';
        mobileUserLinks.style.display = 'none';
    }
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================
async function loadNotifications() {
    if (!currentUser) return;
    try {
        const notificationsQuery = await getDocs(
            query(
                collection(db, 'notifications'),
                where('userId', '==', currentUser.uid),
                where('read', '==', false),
                orderBy('createdAt', 'desc')
            )
        );
        const unreadCount = notificationsQuery.size;
        notificationBadge.textContent = unreadCount;
        mobileNotificationBadge.textContent = unreadCount;
        
        if (unreadCount > 0) {
            notificationBadge.style.display = 'inline-flex';
            mobileNotificationBadge.style.display = 'inline-flex';
            const firstNotif = notificationsQuery.docs[0];
            if (firstNotif) {
                const data = firstNotif.data();
                showNotificationToast(data.title || 'New Notification', data.message || '');
            }
        } else {
            notificationBadge.style.display = 'none';
            mobileNotificationBadge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function showNotificationToast(title, message) {
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    notificationToast.style.display = 'block';
    setTimeout(() => {
        notificationToast.style.display = 'none';
    }, 5000);
}

toastClose.addEventListener('click', () => {
    notificationToast.style.display = 'none';
});

// ============================================
// GAME FUNCTIONS
// ============================================
async function loadGames() {
    try {
        showLoading();
        
        const gamesRef = collection(db, 'games');
        const gamesSnapshot = await getDocs(gamesRef);
        
        allGames = [];
        gamesSnapshot.forEach(doc => {
            allGames.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`✅ Loaded ${allGames.length} games`);
        
        displayFeaturedGames();
        displayTrendingGames();
        displayVIPGames();
        displayFreeGames();
        updateHeroSection();
        
        hideLoading();
    } catch (error) {
        console.error('Error loading games:', error);
        hideLoading();
        showNotificationToast('Error', 'Failed to load games. Please refresh the page.');
    }
}

function displayFeaturedGames() {
    const featured = allGames.filter(game => game.isFeatured === true);
    featuredGames.innerHTML = featured.length > 0 
        ? featured.map(game => createGameCard(game)).join('')
        : '<p class="no-games">No featured games available.</p>';
}

function displayTrendingGames() {
    const trending = allGames.filter(game => game.isTrending === true);
    trendingGamesGrid.innerHTML = trending.length > 0 
        ? trending.map(game => createGameCard(game)).join('')
        : '<p class="no-games">No trending games available.</p>';
}

function displayVIPGames() {
    const vip = allGames.filter(game => game.isVip === true);
    vipGames.innerHTML = vip.length > 0 
        ? vip.map(game => createGameCard(game)).join('')
        : `
            <div class="no-games vip-placeholder">
                <i class="fas fa-crown"></i>
                <p>No VIP games available yet.</p>
                <span>Coming soon!</span>
            </div>
        `;
}

function displayFreeGames() {
    const free = allGames.filter(game => game.isVip === false);
    freeGames.innerHTML = free.length > 0 
        ? free.map(game => createGameCard(game)).join('')
        : '<p class="no-games">No free games available.</p>';
}

function createGameCard(game) {
    const badge = game.isVip 
        ? '<span class="game-card-badge vip">VIP</span>'
        : '<span class="game-card-badge free">Free</span>';
    
    const featuredBadge = game.isFeatured 
        ? '<span class="game-card-badge featured" style="top: 40px;">Featured</span>'
        : '';
    
    const imageUrl = game.coverImage || 'https://placehold.co/400x225/1a1a2e/6C3CE1?text=DVARY+GAME';
    
    return `
        <div class="game-card" data-id="${game.id}">
            <div class="game-card-image">
                <img src="${imageUrl}" alt="${game.gameName}" loading="lazy" />
                ${badge}
                ${featuredBadge}
            </div>
            <div class="game-card-content">
                <h3>${game.gameName}</h3>
                <p class="game-category"><i class="fas fa-tag"></i> ${game.category || 'Uncategorized'}</p>
                <div class="game-card-meta">
                    <span><i class="fas fa-code-branch"></i> ${game.version || '1.0.0'}</span>
                    <span><i class="fas fa-hdd"></i> ${game.size || '0 MB'}</span>
                </div>
                <a href="#" class="btn-primary view-game-btn" data-id="${game.id}">
                    <i class="fas fa-play"></i> View Game
                </a>
            </div>
        </div>
    `;
}

function updateHeroSection() {
    const featured = allGames.filter(game => game.isFeatured === true);
    if (featured.length > 0) {
        const heroGame = featured[Math.floor(Math.random() * featured.length)];
        heroTitle.textContent = heroGame.gameName;
        heroDescription.textContent = heroGame.description || 'Experience this amazing game on DVARY GAMES!';
        heroCategory.textContent = heroGame.category || 'Featured';
        if (heroGame.coverImage) {
            heroImage.innerHTML = `<img src="${heroGame.coverImage}" alt="${heroGame.gameName}" />`;
        }
        heroViewBtn.dataset.gameId = heroGame.id;
    }
}

// ============================================
// CATEGORY FILTERING
// ============================================
function filterGamesByCategory(category) {
    currentCategory = category;
    
    categoryButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
    
    const filtered = category === 'all' 
        ? allGames 
        : allGames.filter(game => game.category?.toLowerCase() === category.toLowerCase());
    
    featuredGames.innerHTML = filtered
        .filter(game => game.isFeatured === true)
        .map(game => createGameCard(game))
        .join('') || '<p class="no-games">No featured games in this category.</p>';
    
    trendingGamesGrid.innerHTML = filtered
        .filter(game => game.isTrending === true)
        .map(game => createGameCard(game))
        .join('') || '<p class="no-games">No trending games in this category.</p>';
    
    vipGames.innerHTML = filtered
        .filter(game => game.isVip === true)
        .map(game => createGameCard(game))
        .join('') || `
            <div class="no-games vip-placeholder">
                <i class="fas fa-crown"></i>
                <p>No VIP games in this category.</p>
            </div>
        `;
    
    freeGames.innerHTML = filtered
        .filter(game => game.isVip === false)
        .map(game => createGameCard(game))
        .join('') || '<p class="no-games">No free games in this category.</p>';
}

// ============================================
// SEARCH FUNCTION
// ============================================
function searchGames(query) {
    if (!query || query.trim() === '') {
        filterGamesByCategory(currentCategory);
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    const results = allGames.filter(game => 
        game.gameName?.toLowerCase().includes(searchTerm) ||
        game.category?.toLowerCase().includes(searchTerm) ||
        game.genre?.toLowerCase().includes(searchTerm) ||
        game.description?.toLowerCase().includes(searchTerm)
    );
    
    featuredGames.innerHTML = results
        .filter(game => game.isFeatured === true)
        .map(game => createGameCard(game))
        .join('') || '<p class="no-games">No featured games found</p>';
    
    trendingGamesGrid.innerHTML = results
        .filter(game => game.isTrending === true)
        .map(game => createGameCard(game))
        .join('') || '<p class="no-games">No trending games found</p>';
    
    vipGames.innerHTML = results
        .filter(game => game.isVip === true)
        .map(game => createGameCard(game))
        .join('') || `
            <div class="no-games vip-placeholder">
                <i class="fas fa-search"></i>
                <p>No VIP games found</p>
            </div>
        `;
    
    freeGames.innerHTML = results
        .filter(game => game.isVip === false)
        .map(game => createGameCard(game))
        .join('') || '<p class="no-games">No free games found</p>';
}

// ============================================
// NAVIGATION FUNCTIONS
// ============================================
function toggleMenu() {
    isMenuOpen = !isMenuOpen;
    mobileMenu.classList.toggle('open');
    menuToggle.querySelector('i').classList.toggle('fa-bars');
    menuToggle.querySelector('i').classList.toggle('fa-times');
}

function closeMenu() {
    isMenuOpen = false;
    mobileMenu.classList.remove('open');
    menuToggle.querySelector('i').classList.add('fa-bars');
    menuToggle.querySelector('i').classList.remove('fa-times');
}

// ============================================
// LOGOUT FUNCTION
// ============================================
async function logoutUser() {
    try {
        await signOut(auth);
        localStorage.removeItem('user');
        currentUser = null;
        updateUIForAuth(null);
        showNotificationToast('Logged Out', 'You have been logged out successfully.');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        showNotificationToast('Error', 'Failed to logout. Please try again.');
    }
}

// ============================================
// VIEW GAME FUNCTION
// ============================================
function viewGame(gameId) {
    if (!gameId) {
        showNotificationToast('Error', 'Game not found.');
        return;
    }
    localStorage.setItem('viewGameId', gameId);
    showNotificationToast('Game', 'Game details coming soon!');
    const game = allGames.find(g => g.id === gameId);
    if (game) {
        console.log('Viewing game:', game.gameName);
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
menuToggle.addEventListener('click', toggleMenu);

document.addEventListener('click', (e) => {
    if (isMenuOpen && !e.target.closest('.header')) {
        closeMenu();
    }
});

mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
});

categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterGamesByCategory(btn.dataset.category);
        closeMenu();
        document.getElementById('games').scrollIntoView({ behavior: 'smooth' });
    });
});

document.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.view-game-btn');
    if (viewBtn) {
        e.preventDefault();
        viewGame(viewBtn.dataset.id);
    }
});

heroViewBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (heroViewBtn.dataset.gameId) {
        viewGame(heroViewBtn.dataset.gameId);
    }
});

document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    logoutUser();
});

document.getElementById('mobileLogoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    logoutUser();
});

// Search input (if exists)
const searchInput = document.querySelector('.search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchGames(e.target.value);
    });
}

// ============================================
// AUTH STATE OBSERVER
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        updateUIForAuth(user);
        
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                localStorage.setItem('user', JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    displayName: userData.fullName || user.displayName || user.email,
                    username: userData.username || '',
                    photoURL: userData.profilePicture || user.photoURL || ''
                }));
                updateUIForAuth(user);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
        
        await loadNotifications();
        if (allGames.length === 0) {
            await loadGames();
        }
    } else {
        currentUser = null;
        updateUIForAuth(null);
        if (allGames.length === 0) {
            await loadGames();
        }
    }
});

// ============================================
// CHECK FOR VIEW GAME FROM URL
// ============================================
const viewGameId = localStorage.getItem('viewGameId');
if (viewGameId) {
    localStorage.removeItem('viewGameId');
    setTimeout(() => {
        viewGame(viewGameId);
    }, 1000);
}

console.log('🚀 DVARY GAMES App initialized!');
