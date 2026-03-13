const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// --- SETTINGS ---
let currentUser = null;
let currentProfile = null;
let leaderboardView = 'current'; 
let toastTimer = null;
// FIX: Tambah flag ini untuk elak spam request
let isLoadingLeaderboard = false;

// SENARAI KATA KESAT (BLACKLIST)
const badWords = [
    'babi', 'bodoh', 'sial', 'pantat', 'puki', 'lancau', 'butoh', 
    'fuck', 'shit', 'asshole', 'bitch', 'kimak', 'haramjadah', 'anjir', 
    'anjenk', 'keparat', 'celaka', 'gampang', 'jubur', 'kote'
];

window.onload = async () => {
    await checkSession();
    await loadLeaderboard();
    startCountdown();
};

// --- LOGIC BARU: 3 RANK SAHAJA ---
function determineRank(spendAmount) {
    // Anda boleh ubah nilai threshold (RM) di sini
    if (spendAmount >= 1000) {
        return { 
            name: 'GOLD', 
            color: 'text-yellow-400', 
            badgeClass: 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20',
            ringClass: 'border-yellow-400 ring-2 ring-yellow-400/20'
        };
    } else if (spendAmount >= 500) {
        return { 
            name: 'SILVER', 
            color: 'text-gray-300', 
            badgeClass: 'bg-gray-400/10 text-gray-300 border border-gray-400/20',
            ringClass: 'border-gray-400 ring-2 ring-gray-400/20'
        };
    } else {
        return { 
            name: 'BRONZE', 
            color: 'text-orange-600', 
            badgeClass: 'bg-orange-600/10 text-orange-600 border border-orange-600/20',
            ringClass: 'border-orange-600 ring-2 ring-orange-600/20'
        };
    }
}

// --- AUTHENTICATION & PROFILE LOGIC ---

async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authSection = document.getElementById('auth-section');

    if (!session) {
        currentUser = null;
        currentProfile = null;
        if (authSection) {
            authSection.innerHTML = `
                <button onclick="window.location.href='login.html'" class="bg-white/10 hover:bg-white/20 border border-white/5 text-white px-5 py-2 rounded-full text-sm font-semibold transition backdrop-blur-md animate-up">
                    Log Masuk
                </button>
            `;
        }
    } else {
        // --- 2FA ENFORCEMENT ---
        const { data: mfaData, error: mfaError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!mfaError && mfaData) {
            if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
                window.location.href = 'login.html';
                return;
            }
        }

        currentUser = session.user;
        const { data: profileData, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error || !profileData) {
            console.error("Profile not found", error);
            currentUser = null;
            return;
        }

        currentProfile = profileData;

        if (currentProfile.is_banned) {
            showToastMessage("Akaun anda telah di-ban.", "error");
            await supabaseClient.auth.signOut();
            setTimeout(() => location.reload(), 2000);
            return;
        }

        // Update Navbar Button (tanpa baki)
        if (authSection) {
            const avatarHtml = currentProfile.avatar_url
                ? `<img src="${escapeHtml(currentProfile.avatar_url)}" class="w-8 h-8 rounded-full border-2 border-yellow-400/50 object-cover shadow-sm shrink-0 group-hover:scale-105 transition">`
                : `<div class="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-black font-bold text-xs shadow-lg border-2 border-white/10 shrink-0">${currentUser.email.charAt(0).toUpperCase()}</div>`;

            authSection.innerHTML = `
                <div onclick="openModal('profile-modal')" class="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 py-1 pl-2 pr-1 rounded-full border border-white/5 transition group backdrop-blur-sm animate-up hover:border-yellow-400/30">
                    ${avatarHtml}
                </div>
            `;
        }

        // Update profile UI lain (XP & voucher)
        await updateProfileUI();
    }
}

// --- UTILITIES ---

function formatCurrency(amount) {
    return new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(amount);
}

function escapeHtml(text) {
    if (!text) return text;
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#039;");
}

function censorProfanity(text) {
    if (!text) return "User";
    let cleanedText = text;
    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleanedText = cleanedText.replace(regex, '*'.repeat(word.length));
    });
    return escapeHtml(cleanedText); 
}

function startCountdown() {
    const timerEl = document.getElementById('countdown-timer');
    if(!timerEl) return;
    const updateTimer = () => {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const diff = nextMonth - now;
        if (diff <= 0) { timerEl.innerText = "KIRAAN TAMAT"; return; }
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        timerEl.innerText = `${d}H ${h}J ${m}M`;
    };
    updateTimer();
    setInterval(updateTimer, 60000); 
}

async function toggleLeaderboardView(view) {
    // FIX: Jika sedang loading, jangan benarkan tukar view lagi untuk elak glitch
    if (isLoadingLeaderboard) return;
    if (leaderboardView === view) return;
    
    leaderboardView = view;
    const btnCurrent = document.getElementById('btn-view-current');
    const btnPrev = document.getElementById('btn-view-prev');
    if (view === 'current') {
        btnCurrent.classList.remove('bg-white/10', 'text-gray-300'); btnCurrent.classList.add('bg-yellow-400', 'text-black');
        btnPrev.classList.add('bg-white/10', 'text-gray-300'); btnPrev.classList.remove('bg-yellow-400', 'text-black');
    } else {
        btnPrev.classList.remove('bg-white/10', 'text-gray-300'); btnPrev.classList.add('bg-yellow-400', 'text-black');
        btnCurrent.classList.add('bg-white/10', 'text-gray-300'); btnCurrent.classList.remove('bg-yellow-400', 'text-black');
    }
    await loadLeaderboard();
}

// --- REPUTATION SYSTEM (HEART EXPLOSION) ---
function triggerLike(targetUserId, element, event) {
    if(event) event.stopPropagation();

    if (currentUser && targetUserId === currentUser.id) {
        showToastMessage("Anda tidak boleh Like diri sendiri!", "error");
        return;
    }

    const storageKey = `liked_${targetUserId}_${new Date().getMonth()}_${new Date().getFullYear()}`;
    if (localStorage.getItem(storageKey)) {
        showToastMessage("Anda sudah memberi Respect bulan ini!", "error");
        return;
    }

    let x, y;
    if (event) {
        x = event.clientX;
        y = event.clientY;
    } else {
        const rect = element.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
    }

    const particleCount = 15;
    for (let i = 0; i < particleCount; i++) {
        createHeartParticle(x, y);
    }

    localStorage.setItem(storageKey, 'true');
    showToastMessage("Respect dihantar! +1 Reputation", "success");
}

function createHeartParticle(x, y) {
    const heart = document.createElement('i');
    heart.className = "ph-fill ph-heart fixed pointer-events-none z-[9999]";
    
    const colors = ['text-red-500', 'text-pink-500', 'text-rose-500', 'text-red-400'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    heart.classList.add(randomColor);

    const size = Math.floor(Math.random() * 20) + 15; 
    heart.style.fontSize = `${size}px`;
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    
    document.body.appendChild(heart);

    const angle = Math.random() * Math.PI * 2; 
    const velocity = Math.random() * 80 + 40; 
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity - 60; 
    const rotation = Math.random() * 360;

    const animation = heart.animate([
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 1, offset: 0.2 },
        { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${rotation}deg) scale(0.5)`, opacity: 0 }
    ], {
        duration: 800 + Math.random() * 400,
        easing: 'cubic-bezier(0.165, 0.84, 0.44, 1)'
    });

    animation.onfinish = () => heart.remove();
}

// --- LEADERBOARD LOGIC ---

async function loadLeaderboard() {
    // FIX: Check flag. Kalau tengah loading, abaikan request baru (Prevent Spam)
    if (isLoadingLeaderboard) {
        console.log("Leaderboard is already loading. Spam prevented.");
        return;
    }

    const skeleton = document.getElementById('skeleton-loader');
    const empty = document.getElementById('empty-state');
    const podiumCont = document.getElementById('podium-container');
    const listCont = document.getElementById('list-container');
    const listHead = document.getElementById('list-header');
    const stickyRankBar = document.getElementById('sticky-rank-bar');

    // FIX: Set flag ke TRUE
    isLoadingLeaderboard = true;

    try {
        if(skeleton) skeleton.classList.remove('hidden');
        if(empty) empty.classList.add('hidden');
        if(podiumCont) podiumCont.classList.add('hidden');
        if(listCont) listCont.classList.add('hidden');
        if(listHead) listHead.classList.add('hidden');
        if(stickyRankBar) stickyRankBar.classList.add('hidden', 'translate-y-full');

        const offset = leaderboardView === 'prev' ? 1 : 0;
        
        // --- INTEGRASI CACHE ---
        const cacheKey = `leaderboard_v3_simple_${leaderboardView}`;
        
        let data = null;
        let error = null;
        
        if (typeof getFromCache === 'function') {
            data = getFromCache(cacheKey);
            if (data) data = data.filter(user => user.is_banned !== true);
        }

        if (!data) {
            console.log(`Fetching leaderboard (${leaderboardView}) from Server...`);
            const response = await supabaseClient.rpc('get_monthly_leaderboard', { month_offset: offset });
            data = response.data;
            error = response.error;

            if (data) data = data.filter(user => user.is_banned !== true);

            if (data && !error && typeof saveToCache === 'function') {
                saveToCache(cacheKey, data);
            }
        } else {
            console.log(`Loaded leaderboard (${leaderboardView}) from Cache!`);
        }
        
        if(skeleton) skeleton.classList.add('hidden');

        if (error || !data || data.length === 0) {
            if(empty) empty.classList.remove('hidden');
            if(error) console.error("Leaderboard Error:", error);
            // Return di sini, finally akan berjalan automatically
            return;
        }

        const topData = data.slice(0, 10);
        const top3 = topData.slice(0, 3);
        const rest = topData.slice(3);

        // --- RENDER PODIUM (TOP 3) ---
        if (top3.length > 0) {
            const p1 = top3[0];
            const p2 = top3[1] || null;
            const p3 = top3[2] || null;

            const createPodiumCard = (user, rank) => {
                if (!user) return `<div class="rank-card"></div>`;
                
                let rawName = user.username || "User";
                const cleanName = censorProfanity(rawName);
                const displayName = cleanName.length > 10 ? cleanName.substring(0, 10) + '..' : cleanName;
                const spent = formatCurrency(user.total_spent).replace('.00', ''); 
                const isMe = currentUser && user.id === currentUser.id;

                // GUNA FUNCTION 3 TIER BARU
                const tierObj = determineRank(user.total_spent);
                const avatarRing = tierObj.ringClass || '';
                const tierName = tierObj.name;

                let avatarImg;
                if (user.avatar_url && user.avatar_url.trim() !== "") {
                    avatarImg = `<img src="${escapeHtml(user.avatar_url)}" class="avatar-img ${avatarRing}">`;
                } else {
                    avatarImg = `<div class="w-full h-full rounded-full bg-[#27272a] flex items-center justify-center text-white font-bold text-lg ${avatarRing}">${cleanName.charAt(0).toUpperCase()}</div>`;
                }

                const crownHtml = rank === 1 ? `<div class="crown-icon"><i class="ph-fill ph-crown"></i></div>` : '';
                const youTag = isMe ? `<div class="absolute -top-2 z-30 bg-blue-600 text-[8px] px-1.5 rounded-sm font-bold text-white shadow-lg">YOU</div>` : '';

                const badgeHtml = `<div class="text-[9px] ${tierObj.color} font-black mt-1 tracking-widest uppercase truncate max-w-full px-1">${tierName}</div>`;

                return `
                    <div class="rank-card rank-${rank} animate-up cursor-pointer active:scale-95 transition-transform" onclick="triggerLike('${user.id}', this, event)">
                        <div class="avatar-wrapper">
                            ${crownHtml}
                            ${youTag}
                            ${avatarImg}
                            <div class="rank-badge">${rank}</div>
                        </div>
                        <div class="rank-info">
                            <div class="rank-name">${displayName}</div>
                            ${badgeHtml}
                            <div class="rank-val">${spent}</div>
                        </div>
                    </div>
                `;
            };

            podiumCont.className = "podium-grid animate-up"; 
            let html = '';
            html += createPodiumCard(p2, 2); 
            html += createPodiumCard(p1, 1); 
            html += createPodiumCard(p3, 3); 
            podiumCont.innerHTML = html;
            podiumCont.classList.remove('hidden');
        }

        // --- RENDER LIST (RANK 4 - 10) ---
        if (rest.length > 0) {
            if(listHead) listHead.classList.remove('hidden');
            if(listCont) {
                listCont.classList.remove('hidden');
                listCont.classList.add('flex');

                listCont.innerHTML = rest.map((user, index) => {
                    const rank = index + 4;
                    let rawName = user.username || user.email.split('@')[0];
                    const cleanName = censorProfanity(rawName);
                    const displayName = cleanName.length > 15 ? cleanName.substring(0, 15) + '..' : cleanName;
                    const spent = formatCurrency(user.total_spent);
                    const isMe = currentUser && user.id === currentUser.id;

                    // GUNA FUNCTION 3 TIER BARU
                    const tierObj = determineRank(user.total_spent);
                    const tierHtml = `<span class="badge ${tierObj.badgeClass} text-[8px] px-1.5 py-0.5 rounded ml-2 font-bold uppercase scale-90 origin-left">${tierObj.name}</span>`;

                    let avatarHtml;
                    if(user.avatar_url && user.avatar_url.trim() !== "") {
                        avatarHtml = `<img src="${escapeHtml(user.avatar_url)}" class="w-full h-full object-cover">`;
                    } else {
                        avatarHtml = `${escapeHtml(rawName.charAt(0).toUpperCase())}`;
                    }

                    const containerClass = isMe 
                        ? 'bg-yellow-400/10 border-l-4 border-l-yellow-400' 
                        : `glass-panel border-l-2 hover:border-l-yellow-400 hover:bg-white/5 border-white/5`;

                    return `
                        <div class="${containerClass} cursor-pointer rounded-xl p-3 flex items-center justify-between slide-up transition active:scale-95" 
                            style="animation-delay: ${(index*50)+600}ms"
                            onclick="triggerLike('${user.id}', this, event)">
                            <div class="flex items-center gap-3 pointer-events-none">
                                <div class="text-gray-600 font-black text-lg italic w-8 text-center">#${rank}</div>
                                <div class="flex items-center gap-3">
                                    <div class="w-9 h-9 rounded-lg bg-gray-800 border border-white/5 flex items-center justify-center text-xs font-bold text-gray-400 uppercase overflow-hidden relative">
                                        ${avatarHtml}
                                    </div>
                                    <div class="flex flex-col">
                                        <div class="flex items-center flex-wrap">
                                            <span class="text-xs font-bold ${isMe ? 'text-yellow-400' : 'text-gray-300'} capitalize mr-1">${displayName} ${isMe ? '(Anda)' : ''}</span>
                                            ${tierHtml}
                                        </div>
                                        <span class="text-[9px] text-gray-500 font-medium">Rank #${rank}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="bg-black/40 border border-white/5 px-2 py-1 rounded text-xs font-mono font-bold text-white pointer-events-none">
                                ${spent}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } else {
            if(listHead) listHead.classList.add('hidden');
        }

        // Sticky Rank Logic
        if (currentUser && stickyRankBar) {
            const allVisibleUsers = [...top3, ...rest];
            const isVisible = allVisibleUsers.find(u => u.id === currentUser.id);

            if (!isVisible) {
                const myData = data.find(u => u.id === currentUser.id);
                const myIndex = data.findIndex(u => u.id === currentUser.id);
                
                if (myData) {
                    document.getElementById('sticky-rank-pos').innerText = `#${myIndex + 1}`;
                    document.getElementById('sticky-rank-name').innerText = censorProfanity(myData.username || currentUser.email.split('@')[0]);
                    document.getElementById('sticky-rank-amount').innerText = formatCurrency(myData.total_spent);
                    
                    stickyRankBar.classList.remove('hidden');
                    setTimeout(() => stickyRankBar.classList.remove('translate-y-full'), 500);
                } else {
                    stickyRankBar.classList.add('hidden');
                }
            } else {
                stickyRankBar.classList.add('translate-y-full');
                setTimeout(() => stickyRankBar.classList.add('hidden'), 300);
            }
        }
    } catch (err) {
        console.error("Unexpected error loading leaderboard:", err);
    } finally {
        // FIX: Reset flag ke FALSE supaya boleh load lagi di masa depan
        isLoadingLeaderboard = false;
    }
}

async function handleLogout() { await supabaseClient.auth.signOut(); location.reload(); }

function openModal(id) { const el = document.getElementById(id); if(el) { el.classList.remove('hidden'); el.classList.add('flex'); } }
function closeModal(id) { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); } }

function showToastMessage(msg, type) {
    let container = document.getElementById('toast-container');
    if(!container) {
         container = document.createElement('div');
         container.id = 'toast-container';
         container.className = 'fixed top-20 right-5 z-[120] space-y-2 pointer-events-none w-full max-w-xs flex flex-col items-end';
         document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bgClass = type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-[#18181b] border-gray-700 text-white';
    const iconClass = type === 'error' ? 'ph-warning-circle' : 'ph-check-circle';
    toast.className = `p-4 rounded-xl shadow-lg border flex items-center gap-3 animate-slide-left ${bgClass} w-auto`;
    toast.innerHTML = `<i class="ph ${iconClass} text-xl flex-shrink-0"></i> <span class="text-xs font-bold leading-tight">${escapeHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// --- HELPER: KIRA BAUCER ---
async function getVoucherCount() {
    if (!currentUser) return 0;
    
    const now = new Date().toISOString();
    
    const { count, error } = await supabaseClient
        .from('vouchers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .gt('end_date', now)
        .or(`assign_to_user.eq.${currentUser.id},is_public.eq.true`);

    return error ? 0 : count;
}

// --- UPDATE UI PROFILE MODAL ---
async function updateProfileUI() {
    if (!currentProfile) return;

    // 1. Update Nama 
    const rawName = currentProfile.username || currentUser.user_metadata?.username || currentUser.email.split('@')[0];
    const cleanName = typeof censorProfanity === 'function' ? censorProfanity(rawName) : rawName;
    
    if (document.getElementById('profile-email')) {
        document.getElementById('profile-email').innerText = cleanName;
    }

    // 2. Update Gambar
    const profileImg = document.getElementById('profile-img');
    if (profileImg) {
        if (currentProfile.avatar_url) {
            profileImg.src = escapeHtml(currentProfile.avatar_url);
        } else {
            profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.email)}&background=random`;
        }
    }

    // 3. Format Baki & Update Sidebar
    let rawBalance = currentProfile.wallet_balance;
    let formattedBalance = '';

    if (rawBalance >= 1e15) formattedBalance = (rawBalance / 1e15).toFixed(2) + 'Q';
    else if (rawBalance >= 1e12) formattedBalance = (rawBalance / 1e12).toFixed(2) + 'T';
    else if (rawBalance >= 1e9) formattedBalance = (rawBalance / 1e9).toFixed(2) + 'B';
    else if (rawBalance >= 1e6) formattedBalance = (rawBalance / 1e6).toFixed(2) + 'M';
    else if (rawBalance >= 1e3) formattedBalance = (rawBalance / 1e3).toFixed(2) + 'K';
    else formattedBalance = rawBalance.toFixed(2);

    if (document.getElementById('sidebar-balance')) {
        document.getElementById('sidebar-balance').innerText = formattedBalance;
    }

    // 4. Update XP 
    const xpDisplay = document.getElementById('profile-xp-display');
    if (xpDisplay) {
        xpDisplay.innerText = currentProfile.xp_balance || 0;
    }

    // 5. Update Voucher
    const voucherDisplay = document.getElementById('profile-voucher-display');
    if (voucherDisplay) {
        const count = await getVoucherCount();
        voucherDisplay.innerText = count;
    }

    // 6. Badges (Jika ada function luar)
    if (typeof renderBadges === "function") renderBadges();
}