const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// VARIABLES
let currentUser = null;
let currentProfile = null;
let allTransactions = [];
let currentFilter = 'all';
let currentOpenTxId = null;
let toastTimer = null;
let orderSubscription = null;

// CONFIGURATION (Sila tukar nombor ini ke nombor Admin anda)
const ADMIN_WHATSAPP = '601135268529'; 

// PAGINATION VARIABLES
let currentPage = 0;
const ITEMS_PER_PAGE = 10;

// VIP & WALLET VARIABLES
let currentTier = { name: 'BRONZE', discount: 0 };
let currentMonthSpend = 0;
let nextTierThreshold = 100;

window.onload = async () => {
    // Setup Search Listener
    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") searchOrder();
        });
    }
    
    // Check Session & Load Data
    await checkAuth();
};

// --- MASUKKAN FUNGSI INI DI DALAM order.js ---

// 1. UPDATE checkAuth (Cari fungsi checkAuth yang lama dan GANTIKAN dengan ini)
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    const userView = document.getElementById('user-view');
    const guestView = document.getElementById('guest-view');
    const authSection = document.getElementById('auth-section'); 

    if (!session) {
        currentUser = null;
        currentProfile = null;

        if(userView) userView.classList.add('hidden');
        if(guestView) guestView.classList.remove('hidden');
        
        if (authSection) {
            authSection.innerHTML = `
                <button onclick="window.location.href='login.html'" class="bg-white/10 hover:bg-white/20 border border-white/5 text-white px-5 py-2 rounded-full text-sm font-semibold transition backdrop-blur-md animate-up">
                    Log Masuk
                </button>
            `;
        }
    } else {
        // --- 2FA Check ---
        const { data: mfaData, error: mfaError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!mfaError && mfaData) {
            if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
                window.location.href = 'login.html'; 
                return; 
            }
        }

        currentUser = session.user;
        
        // Fetch Profile
        const { data: profileData } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
        currentProfile = profileData;

        if (currentProfile && currentProfile.is_banned) {
            showToastMessage("Akaun anda telah di-ban.", "error");
            await supabaseClient.auth.signOut();
            setTimeout(() => location.reload(), 2000);
            return;
        }

        // Calculate VIP if logic exists
        if (typeof calculateVipTier === "function") {
            await calculateVipTier();
        }

        if(userView) userView.classList.remove('hidden');
        if(guestView) guestView.classList.add('hidden');

        // Render Navbar Pill (Simple View)
        if(authSection) {
            authSection.innerHTML = `
                <div onclick="openModal('profile-modal')" class="flex items-center gap-3 cursor-pointer bg-white/5 hover:bg-white/10 py-1.5 px-2 pl-4 rounded-full border border-white/5 transition group backdrop-blur-sm animate-up">
                    <div class="text-right leading-none hidden sm:block">
                        <div class="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Baki</div>
                        <div class="text-xs font-bold text-yellow-400 group-hover:text-white transition">RM ${formatBalance(currentProfile.wallet_balance)}</div>
                    </div>
                    ${currentProfile.avatar_url ?
                    `<img src="${currentProfile.avatar_url}" class="w-9 h-9 rounded-full border-2 border-yellow-400/50 object-cover shadow-sm">` :
                    `<div class="w-9 h-9 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-black font-bold text-sm shadow-lg">${currentUser.email.charAt(0).toUpperCase()}</div>`
                }
                </div>
            `;
        }
        
        // PANGGIL FUNGSI UPDATE UI LENGKAP DI SINI
        await updateProfileUI(); 

        await loadOrders();
        subscribeToOrders(); 
    }
}

// 2. TAMBAH FUNGSI updateProfileUI (Letak di bahagian bawah fail atau selepas checkAuth)
async function updateProfileUI() {
    if(!currentProfile) return;
    
    // 1. Update Nama & Email di Modal
    const emailDisplay = document.getElementById('profile-email');
    if(emailDisplay) {
         const displayParams = currentProfile.username || currentUser.user_metadata?.username || currentUser.email.split('@')[0];
         emailDisplay.innerText = displayParams;
    }

    // 2. Update Gambar Profile
    const profileImg = document.getElementById('profile-img');
    if(profileImg) {
        if (currentProfile.avatar_url) {
            profileImg.src = currentProfile.avatar_url;
        } else {
            const displayName = currentProfile.username || currentUser.email.split('@')[0];
            profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=facc15&color=000&bold=true&size=128`;
        }
    }
    
    // 3. Update Balance di Sidebar Modal (Dengan formatting K/M/B)
    const formattedBalance = formatBalance(currentProfile.wallet_balance);
    const sidebarBalance = document.getElementById('sidebar-balance');
    if(sidebarBalance) sidebarBalance.innerText = formattedBalance;
    
    // 4. Update XP Display
    const xpDisplay = document.getElementById('profile-xp-display');
    if(xpDisplay) {
        xpDisplay.innerText = currentProfile.xp_balance || 0; 
    }

    // 5. Update Voucher Display
    const voucherDisplay = document.getElementById('profile-voucher-display');
    if(voucherDisplay) {
        const count = await getVoucherCount();
        voucherDisplay.innerText = count;
    }
    
    // 6. Update Badges (Guna logic dari vip.js jika ada)
    if(typeof renderBadges === 'function') renderBadges();
    if(typeof renderVipProgress === 'function') renderVipProgress();
}

// 3. TAMBAH FUNGSI getVoucherCount
async function getVoucherCount() {
    if (!currentUser) return 0;
    
    const now = new Date().toISOString();
    
    // Kira baucer yang: Aktif, Belum Expired, dan (Public ATAU Assign ke User)
    const { count, error } = await supabaseClient
        .from('vouchers')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .gt('end_date', now)
        .or(`assign_to_user.eq.${currentUser.id},is_public.eq.true`);

    return error ? 0 : count;
}

// 4. TAMBAH FUNGSI HELPER FORMAT BALANCE (Supaya K, M, B keluar cantik)
function formatBalance(rawBalance) {
    if (!rawBalance) return '0.00';
    if (rawBalance >= 1e15) return (rawBalance / 1e15).toFixed(2) + 'Q';
    if (rawBalance >= 1e12) return (rawBalance / 1e12).toFixed(2) + 'T';
    if (rawBalance >= 1e9) return (rawBalance / 1e9).toFixed(2) + 'B';
    if (rawBalance >= 1e6) return (rawBalance / 1e6).toFixed(2) + 'M';
    if (rawBalance >= 1e3) return (rawBalance / 1e3).toFixed(2) + 'K';
    return rawBalance.toFixed(2);
}

async function subscribeToOrders() {
    if (!currentUser) return;

    if (orderSubscription) supabaseClient.removeChannel(orderSubscription);

    orderSubscription = supabaseClient
        .channel('public:transactions')
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'transactions', 
                filter: `user_id=eq.${currentUser.id}` 
            }, 
            (payload) => {
                const index = allTransactions.findIndex(t => t.id === payload.new.id);
                if (index !== -1) {
                    allTransactions[index] = payload.new;
                    renderOrders(); 
                    if (currentOpenTxId === payload.new.id) {
                        openReceipt(null, payload.new);
                    }
                    showToastMessage(`Status Order #${payload.new.id} dikemaskini: ${payload.new.status.toUpperCase()}`, 'info');
                }
            }
        )
        .subscribe();
}

// --- USER ACTIONS ---

async function handleLogin() {
    const email = document.getElementById('email').value; 
    const password = document.getElementById('password').value;
    const btn = document.querySelector('#login-modal button');
    
    if(!email || !password) return showToastMessage("Sila isi semua ruang.", "error");

    btn.innerText = "Memproses..."; btn.disabled = true;
    
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        const { error: signUpError } = await supabaseClient.auth.signUp({ email, password });
        if(signUpError) {
            showToastMessage("Ralat: " + error.message, "error");
            btn.innerText = "MASUK / DAFTAR"; btn.disabled = false;
            return;
        }
    }
    location.reload();
}

async function handleLogout() { 
    await supabaseClient.auth.signOut(); 
    location.reload(); 
}

// --- ORDER SEARCH & LOAD LOGIC ---

async function searchOrder() {
    const inputEl = document.getElementById('search-input');
    const input = inputEl.value.trim();
    inputEl.blur(); 

    if (!input) return showToastMessage("Sila masukkan Order ID", 'error');

    const btn = document.getElementById('btn-search');
    const originalContent = btn.innerHTML;
    
    // Set loading state
    btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';
    btn.disabled = true;

    try {
        // UPDATE: Kita hanya cari berdasarkan 'order_id' sahaja (UUID).
        // Carian guna ID nombor (1, 2, 3) telah DIBUANG untuk elak orang teka ID.
        
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('order_id') // Kita cuma perlu tahu ID wujud ke tak
            .eq('order_id', input)
            .maybeSingle();

        if (data) {
            // Jumpa! Redirect ke receipt.html
            window.location.href = `receipt.html?order_id=${data.order_id}`;
        } else {
            // Tak jumpa
            showToastMessage("Pesanan tidak dijumpai. Pastikan Order ID tepat.", 'error');
        }

    } catch (err) {
        console.error(err);
        showToastMessage("Ralat sistem.", 'error');
    } finally {
        // Reset button balik
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

async function loadOrders(isLoadMore = false) {
    if(!currentUser) return;

    const container = document.getElementById('orders-container');
    const skeleton = document.getElementById('skeleton-loader');
    const loadMoreContainer = document.getElementById('load-more-container');
    
    if(!isLoadMore) {
        currentPage = 0;
        allTransactions = [];
        container.innerHTML = '';
        if(skeleton) skeleton.style.display = 'block';
        if(loadMoreContainer) loadMoreContainer.classList.add('hidden');
    }

    const from = currentPage * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .range(from, to);

    if(skeleton) skeleton.style.display = 'none';

    if (error) {
        if(!isLoadMore) container.innerHTML = `<p class="text-red-400 text-sm text-center">Gagal memuatkan data. Sila refresh.</p>`;
        else showToastMessage("Gagal muat data tambahan.", "error");
        return;
    }

    if (data.length > 0) {
        allTransactions = [...allTransactions, ...data];
        renderOrders(); 
        
        if (loadMoreContainer) {
            if (data.length === ITEMS_PER_PAGE) loadMoreContainer.classList.remove('hidden');
            else loadMoreContainer.classList.add('hidden');
        }
        currentPage++;
    } else {
        if(!isLoadMore) {
            container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 opacity-60 fade-in">
                <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <i class="ph-duotone ph-receipt text-3xl text-gray-500"></i>
                </div>
                <p class="text-gray-400 text-xs font-medium">Tiada rekod pesanan.</p>
            </div>`;
        }
        if(loadMoreContainer) loadMoreContainer.classList.add('hidden');
    }
}

function loadMoreOrders() {
    const btn = document.querySelector('#load-more-container button');
    btn.innerText = "Memuatkan...";
    loadOrders(true).then(() => {
        btn.innerText = "MUAT LAGI...";
    });
}

function filterOrders(status) {
    currentFilter = status;
    
    document.querySelectorAll('[id^="tab-"]').forEach(btn => {
        btn.classList.remove('tab-active');
        btn.classList.add('tab-inactive');
        
        const icon = btn.querySelector('i');
        if(icon) {
            if(btn.id.includes('success')) icon.className = 'ph-fill ph-check-circle text-green-400';
            else if(btn.id.includes('pending')) icon.className = 'ph-fill ph-clock text-yellow-400';
            else if(btn.id.includes('canceled')) icon.className = 'ph-fill ph-x-circle text-red-400';
        }
    });
    
    const activeBtn = document.getElementById(`tab-${status}`);
    activeBtn.classList.remove('tab-inactive');
    activeBtn.classList.add('tab-active');
    
    const activeIcon = activeBtn.querySelector('i');
    if(activeIcon) activeIcon.className = activeIcon.className.replace(/text-\w+-\d+/, 'text-black');

    renderOrders();
}

function renderOrders() {
    const container = document.getElementById('orders-container');
    
    let filteredData = allTransactions;
    if (currentFilter !== 'all') {
        if (currentFilter === 'pending') {
            filteredData = allTransactions.filter(t => t.status === 'pending' || t.status === 'processing');
        } else {
            filteredData = allTransactions.filter(t => t.status === currentFilter);
        }
    }

    let htmlContent = '';

    if (filteredData.length === 0) {
        if(allTransactions.length === 0) {
             // Handled in loadOrders (empty state)
        } else {
             htmlContent = `<p class="text-gray-500 text-xs text-center py-8">Tiada pesanan dalam kategori ini.</p>`;
        }
    } else {
        htmlContent = filteredData.map((t, index) => {
            let statusConfig = { color: 'gray', icon: 'question', text: 'Unknown', bg: 'bg-gray-500/10', border: 'border-gray-500/20' };
            
            if (t.status === 'success') {
                statusConfig = { color: 'text-green-400', icon: 'check-circle', text: 'Berjaya', bg: 'bg-green-500/10', border: 'border-green-500/20' };
            } else if (t.status === 'pending') {
                statusConfig = { color: 'text-yellow-400', icon: 'clock', text: 'Menunggu proses', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' };
            } else if (t.status === 'processing') {
                statusConfig = { color: 'text-blue-400', icon: 'gear-fine', text: 'Proses', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
            } else {
                statusConfig = { color: 'text-red-400', icon: 'x-circle', text: 'Batal', bg: 'bg-red-500/10', border: 'border-red-500/20' };
            }
    
            const date = new Date(t.created_at).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' });
            const displayId = t.order_id || `#${t.id}`;
            const isNew = (new Date() - new Date(t.created_at)) < 3600000;
            const newBadge = isNew ? `<span class="absolute top-2 right-2 flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span></span>` : '';

            // --- PERUBAHAN DI SINI: Redirect ke receipt.html ---
            return `
                <div onclick="window.location.href='receipt.html?order_id=${t.order_id || t.id}'" 
                     style="animation-delay: ${index * 50}ms"
                     class="glass-card p-4 rounded-2xl flex items-center gap-4 cursor-pointer group relative overflow-hidden fade-in mb-2 border border-white/5 hover:border-yellow-400/30 transition-all">
                    ${newBadge}
                    <div class="w-10 h-10 rounded-full ${statusConfig.bg} ${statusConfig.border} flex-shrink-0 flex items-center justify-center text-xl border">
                        <i class="ph-fill ph-${statusConfig.icon} ${statusConfig.color} ${t.status==='processing'?'animate-spin-slow':''}"></i>
                    </div>
                    
                    <div class="flex-grow min-w-0">
                        <div class="flex justify-between items-start">
                            <h4 class="font-bold text-gray-200 text-xs group-hover:text-yellow-400 transition truncate pr-2">${t.item_name}</h4>
                            <span class="font-bold text-white text-xs whitespace-nowrap">RM ${t.amount.toFixed(2)}</span>
                        </div>
                        
                        <div class="flex items-center justify-between mt-1">
                            <div class="flex items-center gap-2 text-[10px] text-gray-500">
                                <span class="font-mono bg-white/5 px-1.5 rounded text-gray-400">${displayId}</span>
                                <span>${date}</span>
                            </div>
                            <span class="text-[9px] font-bold uppercase ${statusConfig.color}">${statusConfig.text}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    if(container.innerHTML.includes('ph-receipt') && filteredData.length > 0) {
        container.innerHTML = htmlContent;
    } else if (filteredData.length > 0) {
         container.innerHTML = htmlContent;
    }
}
// --- UTILITY FUNCTIONS ---

function openModal(id) { 
    const el = document.getElementById(id); 
    if(el) { el.classList.remove('hidden'); el.classList.add('flex'); } 
}

function closeModal(id) { 
    const modal = document.getElementById(id);
    if(!modal) return;

    if(id === 'receipt-modal') {
        const modalContent = modal.querySelector('#receipt-card');
        modal.classList.add('opacity-0');
        if(modalContent) { modalContent.classList.remove('scale-100'); modalContent.classList.add('scale-95'); }
        setTimeout(() => {
            modal.classList.add('hidden'); 
            modal.classList.remove('flex'); 
            currentOpenTxId = null;
        }, 300);
    } else {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex');
    }
}

window.onclick = function(event) {
    const modal = document.getElementById('receipt-modal');
    if (event.target == modal) closeModal('receipt-modal');
}

function showToastMessage(msg, type) {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const txt = document.getElementById('toast-msg');

    if (toastTimer) clearTimeout(toastTimer);

    txt.innerText = msg;

    let baseClass = 'fixed top-10 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 z-[200] opacity-0 pointer-events-none transition duration-300 border';

    if (type === 'error') {
        icon.className = 'ph-fill ph-warning-circle text-red-400';
        toast.className = `${baseClass} bg-red-900/90 text-white border-red-500/30 -translate-y-10`;
    } 
    else if (type === 'info') {
        icon.className = 'ph-fill ph-info text-blue-400';
        toast.className = `${baseClass} bg-blue-900/90 text-white border-blue-500/30 -translate-y-10`;
    } 
    else {
        icon.className = 'ph-fill ph-check-circle text-green-400';
        toast.className = `${baseClass} bg-gray-900 text-white border-white/10 -translate-y-10`;
    }

    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', '-translate-y-10');
        toast.classList.add('opacity-100', 'translate-y-0');
    });

    toastTimer = setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-10');
        toast.classList.remove('opacity-100', 'translate-y-0');
    }, 3000);
}