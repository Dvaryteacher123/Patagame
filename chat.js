// ============================================
// DVARY GAMES - Chat Application Logic
// ============================================

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { 
    getFirestore, 
    collection, 
    query, 
    orderBy, 
    limit, 
    onSnapshot, 
    addDoc, 
    deleteDoc, 
    doc, 
    getDoc, 
    getDocs, 
    updateDoc,
    where,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

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
const storage = getStorage(app);

// ============================================
// DOM ELEMENTS
// ============================================
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const backBtn = document.getElementById('backBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiModal = document.getElementById('emojiModal');
const closeEmoji = document.getElementById('closeEmoji');
const emojiGrid = document.getElementById('emojiGrid');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const typingIndicator = document.getElementById('typingIndicator');
const typingText = document.getElementById('typingText');
const groupInfoBtn = document.getElementById('groupInfoBtn');
const groupInfoModal = document.getElementById('groupInfoModal');
const closeGroupInfo = document.getElementById('closeGroupInfo');
const membersList = document.getElementById('membersList');
const membersSearch = document.getElementById('membersSearch');
const reportModal = document.getElementById('reportModal');
const closeReport = document.getElementById('closeReport');
const submitReport = document.getElementById('submitReport');
const reportTargetName = document.getElementById('reportTargetName');
const reportReason = document.getElementById('reportReason');
const reportDetails = document.getElementById('reportDetails');
const attachmentModal = document.getElementById('attachmentModal');
const closeAttachment = document.getElementById('closeAttachment');
const attachmentPreview = document.getElementById('attachmentPreview');

// ============================================
// STATE
// ============================================
let currentUser = null;
let currentUserData = null;
let allUsers = {};
let messages = [];
let typingTimeout = null;
let isTyping = false;
let reportTargetId = null;
let reportTargetUserId = null;

// ============================================
// AUTHENTICATION
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        console.log('✅ User logged in:', user.email);
        
        // Get user data from Firestore
        await loadUserData(user.uid);
        
        // Load messages
        loadMessages();
        
        // Load chat stats
        loadChatStats();
        
        // Load members
        loadMembers();
        
        // Update online status
        await updateOnlineStatus(true);
        
    } else {
        console.log('❌ User not logged in');
        window.location.href = 'login.html';
    }
});

// ============================================
// LOAD USER DATA
// ============================================
async function loadUserData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            currentUserData = { uid, ...userDoc.data() };
            console.log('✅ User data loaded:', currentUserData.username);
        } else {
            console.error('User document not found');
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// ============================================
// UPDATE ONLINE STATUS
// ============================================
async function updateOnlineStatus(status) {
    if (!currentUser) return;
    
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            onlineStatus: status,
            lastSeen: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error updating online status:', error);
    }
}

// ============================================
// LOAD MESSAGES (REAL-TIME)
// ============================================
function loadMessages() {
    const q = query(
        collection(db, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(100)
    );

    onSnapshot(q, (snapshot) => {
        messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by time ascending (oldest first)
        messages.sort((a, b) => {
            const timeA = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const timeB = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return timeA - timeB;
        });
        
        renderMessages();
    }, (error) => {
        console.error('Error loading messages:', error);
        messagesContainer.innerHTML = `
            <div class="error-state">
                <p>⚠️ Failed to load messages</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    });
}

// ============================================
// RENDER MESSAGES
// ============================================
async function renderMessages() {
    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <h3>No messages yet</h3>
                <p>Start the conversation!</p>
            </div>
        `;
        return;
    }

    let html = '';
    
    for (const msg of messages) {
        const isOwn = msg.senderId === currentUser?.uid;
        const senderData = await getUserData(msg.senderId);
        
        const avatarHtml = senderData ? `
            <div class="message-avatar">
                <img src="${senderData.profileImage || 'https://ui-avatars.com/api/?name=User&background=7c3aed&color=fff&size=128'}" alt="${senderData.username}" />
            </div>
        ` : `
            <div class="message-avatar">
                <div class="avatar-placeholder">?</div>
            </div>
        `;

        const username = senderData?.username || 'Unknown User';
        const time = formatTime(msg.createdAt);
        const messageText = escapeHtml(msg.message || '');

        html += `
            <div class="message-item ${isOwn ? 'own' : 'other'}">
                ${avatarHtml}
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-username">${isOwn ? 'You' : username}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-text">${messageText}</div>
                    ${!isOwn ? `
                        <div class="message-actions">
                            <button class="report-btn" data-userid="${msg.senderId}" data-username="${username}" title="Report">
                                <i class="fas fa-flag"></i>
                            </button>
                            <button class="block-btn" data-userid="${msg.senderId}" title="Block">
                                <i class="fas fa-ban"></i>
                            </button>
                        </div>
                    ` : `
                        <div class="message-actions">
                            <button class="delete-btn" data-messageid="${msg.id}" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    messagesContainer.innerHTML = html;
    
    // Scroll to bottom
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Add event listeners for actions
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const messageId = btn.dataset.messageid;
            deleteMessage(messageId);
        });
    });

    document.querySelectorAll('.report-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = btn.dataset.userid;
            const username = btn.dataset.username;
            openReportModal(userId, username);
        });
    });

    document.querySelectorAll('.block-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = btn.dataset.userid;
            blockUser(userId);
        });
    });
}

// ============================================
// GET USER DATA CACHE
// ============================================
const userCache = {};

async function getUserData(uid) {
    if (userCache[uid]) {
        return userCache[uid];
    }
    
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            userCache[uid] = data;
            return data;
        }
        return null;
    } catch (error) {
        console.error('Error getting user data:', error);
        return null;
    }
}

// ============================================
// SEND MESSAGE
// ============================================
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !fileInput.files.length) return;
    
    if (!currentUser) {
        alert('Please login to send messages');
        return;
    }

    try {
        const messageData = {
            senderId: currentUser.uid,
            message: text || '📎 Attachment',
            createdAt: new Date().toISOString(),
            readBy: [currentUser.uid]
        };

        await addDoc(collection(db, 'messages'), messageData);
        
        messageInput.value = '';
        messageInput.style.height = 'auto';
        fileInput.value = '';
        
        // Clear typing indicator
        clearTyping();
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
    }
}

// ============================================
// DELETE MESSAGE
// ============================================
async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
        await deleteDoc(doc(db, 'messages', messageId));
        console.log('Message deleted successfully');
    } catch (error) {
        console.error('Error deleting message:', error);
        alert('Failed to delete message');
    }
}

// ============================================
// BLOCK USER
// ============================================
async function blockUser(userId) {
    if (!confirm('Are you sure you want to block this user?')) return;
    
    try {
        // Save block to Firestore
        await addDoc(collection(db, 'blocks'), {
            blockerId: currentUser.uid,
            blockedId: userId,
            createdAt: new Date().toISOString()
        });
        
        alert('User blocked successfully');
    } catch (error) {
        console.error('Error blocking user:', error);
        alert('Failed to block user');
    }
}

// ============================================
// REPORT MODAL
// ============================================
function openReportModal(userId, username) {
    reportTargetId = userId;
    reportTargetUserId = userId;
    reportTargetName.textContent = username;
    reportModal.style.display = 'flex';
    reportReason.value = 'spam';
    reportDetails.value = '';
}

closeReport.addEventListener('click', () => {
    reportModal.style.display = 'none';
});

reportModal.addEventListener('click', (e) => {
    if (e.target === reportModal) {
        reportModal.style.display = 'none';
    }
});

submitReport.addEventListener('click', async () => {
    const reason = reportReason.value;
    const details = reportDetails.value.trim();
    
    if (!reason) {
        alert('Please select a reason');
        return;
    }
    
    try {
        await addDoc(collection(db, 'reports'), {
            reportedUserId: reportTargetUserId,
            reportedBy: currentUser.uid,
            reason: reason,
            details: details,
            status: 'pending',
            createdAt: new Date().toISOString()
        });
        
        alert('Report submitted successfully');
        reportModal.style.display = 'none';
    } catch (error) {
        console.error('Error submitting report:', error);
        alert('Failed to submit report');
    }
});

// ============================================
// GROUP INFO
// ============================================
groupInfoBtn.addEventListener('click', () => {
    groupInfoModal.style.display = 'flex';
    loadMembers();
});

closeGroupInfo.addEventListener('click', () => {
    groupInfoModal.style.display = 'none';
});

groupInfoModal.addEventListener('click', (e) => {
    if (e.target === groupInfoModal) {
        groupInfoModal.style.display = 'none';
    }
});

// ============================================
// LOAD CHAT STATS
// ============================================
function loadChatStats() {
    // Listen to users collection for real-time stats
    onSnapshot(collection(db, 'users'), (snapshot) => {
        let total = 0;
        let online = 0;
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            total++;
            if (data.onlineStatus === true) {
                online++;
            }
        });
        
        document.getElementById('memberCount').textContent = total;
        document.getElementById('onlineCount').textContent = online;
        document.getElementById('infoMemberCount').textContent = total;
        document.getElementById('infoOnlineCount').textContent = online;
    }, (error) => {
        console.error('Error loading chat stats:', error);
    });
}

// ============================================
// LOAD MEMBERS
// ============================================
function loadMembers() {
    onSnapshot(collection(db, 'users'), (snapshot) => {
        const members = [];
        snapshot.forEach((doc) => {
            members.push({ uid: doc.id, ...doc.data() });
        });
        
        renderMembers(members);
    }, (error) => {
        console.error('Error loading members:', error);
        membersList.innerHTML = '<div class="error-state">Failed to load members</div>';
    });
}

function renderMembers(members) {
    const searchTerm = membersSearch.value.toLowerCase().trim();
    
    const filtered = members.filter(m => 
        m.username?.toLowerCase().includes(searchTerm) ||
        m.fullName?.toLowerCase().includes(searchTerm)
    );
    
    if (filtered.length === 0) {
        membersList.innerHTML = '<div class="empty-state">No members found</div>';
        return;
    }
    
    let html = '';
    filtered.forEach(m => {
        const isOnline = m.onlineStatus === true;
        const statusText = isOnline ? 'Online' : 'Offline';
        const statusClass = isOnline ? 'online' : 'offline';
        
        html += `
            <div class="member-item">
                <div class="member-avatar">
                    <img src="${m.profileImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(m.username) + '&background=7c3aed&color=fff&size=128'}" alt="${m.username}" />
                </div>
                <span class="member-name">${m.username}</span>
                <span class="member-status ${statusClass}">
                    <i class="fas fa-circle"></i>
                    ${statusText}
                </span>
            </div>
        `;
    });
    
    membersList.innerHTML = html;
}

// Search members
membersSearch.addEventListener('input', () => {
    loadMembers();
});

// ============================================
// TYPING INDICATOR
// ============================================
messageInput.addEventListener('input', () => {
    if (messageInput.value.trim() && !isTyping) {
        isTyping = true;
        // Show typing indicator in UI (we'll use a simple approach)
        typingIndicator.style.display = 'flex';
        typingText.textContent = 'You are typing...';
        
        // Broadcast typing status (simplified for now)
        // In production, use presence system
    } else if (!messageInput.value.trim() && isTyping) {
        clearTyping();
    }
    
    // Auto-resize textarea
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px';
});

function clearTyping() {
    isTyping = false;
    typingIndicator.style.display = 'none';
    typingText.textContent = '';
}

// ============================================
// EMOJI PICKER
// ============================================
const emojis = [
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊',
    '😍', '🥰', '😘', '😗', '😙', '😚', '🙂', '🤗',
    '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏',
    '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '😴',
    '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔',
    '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖', '😞',
    '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩',
    '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
    '🎮', '🕹️', '🎯', '🎲', '🏆', '🎮', '⭐', '🌟',
    '💎', '👑', '🔥', '💯', '✅', '❌', '❤️', '🧡',
    '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
    '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '👊'
];

function renderEmojis() {
    emojiGrid.innerHTML = emojis.map(emoji => 
        `<button type="button" data-emoji="${emoji}">${emoji}</button>`
    ).join('');
    
    emojiGrid.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            messageInput.value += emoji;
            messageInput.focus();
            emojiModal.style.display = 'none';
            messageInput.dispatchEvent(new Event('input'));
        });
    });
}

renderEmojis();

emojiBtn.addEventListener('click', () => {
    emojiModal.style.display = emojiModal.style.display === 'none' ? 'block' : 'none';
});

closeEmoji.addEventListener('click', () => {
    emojiModal.style.display = 'none';
});

// Close emoji picker on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.emoji-modal') && !e.target.closest('.emoji-btn')) {
        emojiModal.style.display = 'none';
    }
});

// ============================================
// ATTACHMENT HANDLING
// ============================================
attachBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length === 0) return;
    
    const file = files[0];
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File is too large. Maximum size is 10MB.');
        fileInput.value = '';
        return;
    }
    
    // Show attachment preview
    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target.result;
        attachmentPreview.innerHTML = `
            <div class="attachment-content-inner">
                ${file.type.startsWith('image/') ? `<img src="${result}" alt="${file.name}" />` : 
                  file.type.startsWith('video/') ? `<video controls src="${result}"></video>` :
                  `<div class="attachment-placeholder">
                    <i class="fas fa-file"></i>
                    <p>${file.name}</p>
                    <small>${(file.size / 1024).toFixed(0)} KB</small>
                  </div>`}
            </div>
        `;
        attachmentModal.style.display = 'flex';
    };
    reader.readAsDataURL(file);
});

closeAttachment.addEventListener('click', () => {
    attachmentModal.style.display = 'none';
    fileInput.value = '';
});

attachmentModal.addEventListener('click', (e) => {
    if (e.target === attachmentModal) {
        attachmentModal.style.display = 'none';
        fileInput.value = '';
    }
});

// ============================================
// SEND BUTTON
// ============================================
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ============================================
// BACK BUTTON
// ============================================
backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// ============================================
// HELPER FUNCTIONS
// ============================================
function formatTime(timestamp) {
    if (!timestamp) return 'Just now';
    
    let date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else {
        date = new Date(timestamp);
    }
    
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd';
    
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// CLEANUP ON UNLOAD
// ============================================
window.addEventListener('beforeunload', () => {
    if (currentUser) {
        updateOnlineStatus(false);
    }
});

// ============================================
// INIT
// ============================================
console.log('✅ Chat app initialized successfully');
