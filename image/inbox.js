// inbox.js - Pengurusan Notifikasi Lengkap

// --- CONFIGURATION ---
// Gunakan config yang sama dengan script.js anda
const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// --- STATE ---
let currentUser = null;
let allNotifications = [];
let currentFilter = 'all'; // 'all' or 'unread'
let deleteTargetId = null; // ID untuk dipadam (null = delete all)

// --- UTILS ---
function el(tag, className = '', children = [], props = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.entries(props).forEach(([key, value]) => {
        if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.toLowerCase().substring(2), value);
        } else {
            element.setAttribute(key, value);
        }
    });
    children.forEach(child => {
        if (typeof child === 'string' || typeof child === 'number') element.textContent = child;
        else if (child instanceof Node) element.appendChild(child);
    });
    return element;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    let bgClass = 'bg-[#18181b] border-gray-700 text-white';
    let iconClass = 'ph-info';
    
    if (type === 'success') {
        bgClass = 'bg-green-900/90 border-green-500/30 text-green-400';
        iconClass = 'ph-check-circle-fill';
    } else if (type === 'error') {
        bgClass = 'bg-red-900/90 border-red-500/30 text-red-400';
        iconClass = 'ph-warning-circle-fill';
    }

    const toast = el('div', `flex items-center gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md animate-slide-left ${bgClass}`, [
        el('i', `ph ${iconClass} text-xl shrink-0`),
        el('span', 'text-xs font-bold', [message])
    ]);
    
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    if(currentUser) {
        await loadInbox();
    }
});

// --- AUTH ---
async function checkSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) {
        window.location.href = 'login.html'; // Redirect jika tak login
        return;
    }
    currentUser = session.user;
}

// --- CORE FUNCTIONS ---

async function loadInbox() {
    const listContainer = document.getElementById('inbox-list');
    const loadingEl = document.getElementById('loading-state');
    const emptyEl = document.getElementById('empty-state');
    
    // UI Loading
    listContainer.innerHTML = '';
    emptyEl.classList.add('hidden');
    loadingEl.classList.remove('hidden');
    loadingEl.classList.add('flex');

    try {
        const { data, error } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(50); // Limit untuk performance

        loadingEl.classList.add('hidden');
        loadingEl.classList.remove('flex');

        if (error) throw error;

        allNotifications = data || [];
        updateStats();
        renderList();

    } catch (e) {
        console.error("Inbox Error:", e);
        loadingEl.classList.add('hidden');
        showToast("Gagal memuatkan notifikasi.", "error");
    }
}

function filterInbox(filterType) {
    currentFilter = filterType;
    
    // UI Tabs Update
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-yellow-400', 'text-black', 'border-yellow-400', 'font-bold');
        btn.classList.add('text-gray-400');
    });

    const activeBtn = document.getElementById(`tab-${filterType}`);
    activeBtn.classList.add('active', 'bg-yellow-400', 'text-black', 'border-yellow-400', 'font-bold');
    activeBtn.classList.remove('text-gray-400');

    renderList();
}

function updateStats() {
    const unreadCount = allNotifications.filter(n => !n.is_read).length;
    const badge = document.getElementById('unread-badge');
    
    if (unreadCount > 0) {
        badge.classList.remove('hidden');
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    } else {
        badge.classList.add('hidden');
    }
}

function renderList() {
    const listContainer = document.getElementById('inbox-list');
    const emptyEl = document.getElementById('empty-state');
    const displayCountEl = document.getElementById('display-count');

    listContainer.innerHTML = '';

    // Filter Logic
    let filteredData = allNotifications;
    if (currentFilter === 'unread') {
        filteredData = allNotifications.filter(n => !n.is_read);
    }

    displayCountEl.textContent = filteredData.length;

    if (filteredData.length === 0) {
        emptyEl.classList.remove('hidden');
        emptyEl.classList.add('flex');
        return;
    }
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');

    const fragment = document.createDocumentFragment();

    filteredData.forEach((n, index) => {
        const isRead = n.is_read;
        
        // Theme Config berdasarkan Type
        let theme = { icon: 'info', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
        if(n.type === 'reward') theme = { icon: 'gift', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' };
        if(n.type === 'security') theme = { icon: 'shield-warning', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' };
        if(n.type === 'success') theme = { icon: 'check-circle', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' };
        if(n.type === 'promotion') theme = { icon: 'megaphone', color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' };

        // Card Styles
        const baseClass = "relative p-4 rounded-2xl border transition-all duration-300 group item-enter";
        const readClass = "bg-[#121214] border-white/5 opacity-80 hover:opacity-100";
        const unreadClass = "bg-[#18181b] border-l-4 border-l-yellow-400 shadow-lg shadow-yellow-900/5 border-t-white/5 border-r-white/5 border-b-white/5";
        
        const card = el('div', `${baseClass} ${isRead ? readClass : unreadClass}`, [
            el('div', 'flex gap-4', [
                // Icon Box
                el('div', `w-12 h-12 rounded-2xl ${theme.bg} ${theme.border} border flex items-center justify-center shrink-0`, [
                    el('i', `ph-fill ph-${theme.icon} text-xl ${theme.color}`)
                ]),
                // Content
                el('div', 'flex-grow min-w-0', [
                    // Header
                    el('div', 'flex justify-between items-start mb-1', [
                        el('h4', `text-sm font-bold ${isRead ? 'text-gray-300' : 'text-white'} truncate pr-2`, [n.title]),
                        el('span', 'text-[10px] text-gray-500 font-mono whitespace-nowrap', [formatTime(n.created_at)])
                    ]),
                    // Message
                    el('p', 'text-xs text-gray-400 leading-relaxed break-words mb-3', [n.message]),
                    // Action Footer
                    el('div', 'flex items-center justify-between mt-2', [
                        // Action Button (Jika ada URL)
                        n.action_url ? el('button', 'text-[10px] bg-white/5 hover:bg-white/10 text-white px-3 py-1.5 rounded-lg border border-white/10 transition flex items-center gap-1 hover:border-yellow-400/50 hover:text-yellow-400', [
                            'LIHAT', el('i', 'ph-bold ph-arrow-right')
                        ], { onclick: () => handleAction(n.action_url, n.id) }) : el('div'),
                        
                        // Controls (Delete / Mark Read)
                        el('div', 'flex gap-3', [
                            !isRead ? el('button', 'text-gray-500 hover:text-green-400 transition', [
                                el('i', 'ph-bold ph-check text-lg')
                            ], { title: 'Tanda baca', onclick: () => markOneRead(n.id) }) : null,
                            
                            el('button', 'text-gray-500 hover:text-red-400 transition', [
                                el('i', 'ph-bold ph-trash text-lg')
                            ], { title: 'Padam', onclick: () => askDeleteOne(n.id) })
                        ])
                    ])
                ])
            ])
        ]);

        // Stagger Animation
        card.style.animationDelay = `${index * 50}ms`;
        fragment.appendChild(card);
    });

    listContainer.appendChild(fragment);
}

// --- ACTIONS ---

async function markOneRead(id) {
    // Optimistic Update (Update UI dulu supaya laju)
    const index = allNotifications.findIndex(n => n.id === id);
    if(index !== -1) allNotifications[index].is_read = true;
    renderList();
    updateStats();

    // Backend Update
    await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
}

async function markAllAsRead() {
    if(allNotifications.every(n => n.is_read)) {
        showToast("Semua sudah dibaca.", "info");
        return;
    }

    // Optimistic Update
    allNotifications.forEach(n => n.is_read = true);
    renderList();
    updateStats();
    showToast("Semua ditanda sebagai dibaca.", "success");

    await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
}

function handleAction(url, id) {
    markOneRead(id); // Tanda baca automatik
    if (url.startsWith('http')) {
        window.location.href = url;
    } else {
        window.location.href = url;
    }
}

// --- DELETE LOGIC ---

function askDeleteOne(id) {
    deleteTargetId = id;
    openDeleteModal('Padam Notifikasi?', 'Mesej ini akan dipadam kekal.');
}

function askDeleteAll() {
    if(allNotifications.length === 0) return;
    deleteTargetId = 'ALL';
    openDeleteModal('Padam Semua?', 'Semua notifikasi dalam peti masuk akan dihapuskan.');
}

function openDeleteModal(title, msg) {
    document.getElementById('delete-title').textContent = title;
    document.getElementById('delete-msg').textContent = msg;
    const modal = document.getElementById('delete-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Setup confirm button
    const btn = document.getElementById('confirm-delete-btn');
    btn.onclick = executeDelete;
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.add('hidden');
    document.getElementById('delete-modal').classList.remove('flex');
    deleteTargetId = null;
}

async function executeDelete() {
    closeDeleteModal();
    const isAll = deleteTargetId === 'ALL';

    // Optimistic UI Update
    if (isAll) {
        allNotifications = [];
    } else {
        allNotifications = allNotifications.filter(n => n.id !== deleteTargetId);
    }
    renderList();
    updateStats();
    showToast(isAll ? "Semua notifikasi dipadam." : "Notifikasi dipadam.", "success");

    // Backend Request
    let query = supabaseClient.from('notifications').delete();
    
    if (isAll) {
        query = query.eq('user_id', currentUser.id);
    } else {
        query = query.eq('id', deleteTargetId);
    }

    const { error } = await query;
    if (error) {
        showToast("Ralat memadam data.", "error");
        loadInbox(); // Revert jika fail
    }
}

// --- HELPERS ---

function formatTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) return date.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short' });
    if (days >= 1) return `${days} hari lepas`;
    if (hours >= 1) return `${hours} jam lepas`;
    if (minutes >= 1) return `${minutes} minit lepas`;
    return 'Baru saja';
}