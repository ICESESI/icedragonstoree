// --- SUPABASE CONFIG ---
const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// --- GLOBAL STATE ---
let currentUser = null;
let currentProfile = null;
let allRewards = [];
let dailyUsageMap = {};
let pendingRedeemItem = null;
let currentInvTab = 'active';
let scratchTimeout = null; 
let isMaintenanceMode = false; 

// State untuk Legendary Box
let currentLegendaryItem = null;
let isLegendaryPlaying = false;

// State untuk Envelope Shuffle
let envelopeItemData = null;
let isEnvelopeShuffling = false;

// State untuk Stopwatch Challenge
let stopwatchInterval = null;
let stopwatchData = null;
let isStopwatchRunning = false;

// --- UTILITY ---
async function refreshLimitsAndUI() {
    await loadDailyLimits(); 
    
    const activeBtn = document.querySelector('.tab-btn.active');
    const type = activeBtn ? activeBtn.getAttribute('onclick').match(/'([^']+)'/)[1] : 'all';
    
    if (type === 'all') {
        renderRewards(allRewards);
    } else {
        renderRewards(allRewards.filter(r => r.type === type));
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    // Design Toast Upgrade
    toast.className = `p-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-slide-left pointer-events-auto backdrop-blur-xl transition-all transform hover:scale-105 cursor-pointer mb-2 ${
        type === 'success' ? 'bg-green-900/80 border-green-500/50 text-white shadow-green-900/50' : 
        type === 'error' ? 'bg-red-900/80 border-red-500/50 text-white shadow-red-900/50' : 
        'bg-gray-900/80 border-gray-600/50 text-white shadow-black/50'
    }`;
    
    let icon = type === 'success' ? 'check-circle' : type === 'error' ? 'warning-circle' : 'info';
    let iconColor = type === 'success' ? 'text-green-400' : type === 'error' ? 'text-red-400' : 'text-blue-400';

    toast.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <i class="ph-fill ph-${icon} text-lg ${iconColor}"></i>
        </div>
        <div>
            <div class="text-[10px] font-bold opacity-60 uppercase tracking-wider">${type === 'success' ? 'BERJAYA' : type === 'error' ? 'RALAT' : 'INFO'}</div>
            <div class="text-xs font-bold">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function closeModal(id) { 
    document.getElementById(id).classList.add('hidden'); 
    document.getElementById(id).classList.remove('flex'); 
    
    // Stop stopwatch if closed mid-game (cleanup)
    if(id === 'modal-stopwatch' && stopwatchInterval) {
        clearInterval(stopwatchInterval);
        isStopwatchRunning = false;
    }
}

function openModal(id) { 
    document.getElementById(id).classList.remove('hidden'); 
    document.getElementById(id).classList.add('flex'); 
}

function copyToClipboard(text) { 
    navigator.clipboard.writeText(text).then(() => showToast("Kod disalin!", "success")); 
}

// Fungsi Helper: Format Baki
function formatBalance(rawBalance) {
    if (!rawBalance) return '0.00';
    if (rawBalance >= 1e15) return (rawBalance / 1e15).toFixed(2) + 'Q';
    if (rawBalance >= 1e12) return (rawBalance / 1e12).toFixed(2) + 'T';
    if (rawBalance >= 1e9) return (rawBalance / 1e9).toFixed(2) + 'B';
    if (rawBalance >= 1e6) return (rawBalance / 1e6).toFixed(2) + 'M';
    if (rawBalance >= 1e3) return (rawBalance / 1e3).toFixed(2) + 'K';
    return rawBalance.toFixed(2);
}

// --- MAINTENANCE LOGIC ---
function checkMaintenance() {
    if (isMaintenanceMode) {
        const overlay = document.getElementById('maintenance-overlay');
        if(overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
            document.body.style.overflow = 'hidden';
        }
    }
}

// --- PIN INPUT FORMATTER (XP-XXXX-XXXX) ---
function setupPinInputFormatter() {
    const pinInput = document.getElementById('xp-pin-input');
    if(pinInput) {
        pinInput.addEventListener('input', (e) => {
            let raw = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            let formatted = raw;

            if (raw.length > 2) {
                formatted = raw.substring(0, 2) + '-' + raw.substring(2);
            }
            if (raw.length > 6) {
                formatted = formatted.substring(0, 7) + '-' + formatted.substring(7);
            }
            e.target.value = formatted.substring(0, 12);
        });

        pinInput.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            const cleanText = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            pinInput.value = cleanText;
            pinInput.dispatchEvent(new Event('input'));
        });
    }
}

// --- REDEEM XP PIN ---
function openRedeemModal() {
    openModal('modal-redeem-xp');
    const input = document.getElementById('xp-pin-input');
    if(input) input.value = ''; 
}

async function redeemXpPin() {
    if (!currentUser) {
        showToast("Sila login dahulu.", "error");
        return;
    }
    
    const inputEl = document.getElementById('xp-pin-input');
    const pinCode = inputEl.value.trim().toUpperCase();
    const btnText = document.getElementById('btn-redeem-xp-text');
    const btn = document.getElementById('btn-redeem-xp');

    if (!pinCode || pinCode.length < 10) {
        showToast("Format kod tidak lengkap.", "error");
        return;
    }

    const originalText = btnText.innerText;
    btnText.innerHTML = '<i class="ph ph-spinner animate-spin"></i> MEMPROSES...';
    btn.disabled = true;

    try {
        const { data, error } = await supabaseClient
            .rpc('redeem_xp_pin', { 
                p_pin_code: pinCode, 
                p_user_id: currentUser.id 
            });

        if (error) throw error;

        if (data && data.success) {
            showToast(data.message, "success");
            inputEl.value = '';
            closeModal('modal-redeem-xp');
            
            if (currentProfile) currentProfile.xp_balance = data.new_xp;
            document.getElementById('user-xp-balance').innerText = data.new_xp;
            
            loadHistoryList(); 
        } else {
            showToast(data ? data.message : "Gagal menebus kod.", "error");
        }
    } catch (err) {
        console.error("RPC Error:", err);
        showToast("Ralat sistem: " + err.message, "error");
    } finally {
        btnText.innerText = originalText;
        btn.disabled = false;
    }
}

// --- VICTORY MODAL ---
function showVictoryModal(prizeText, prizeType) {
    if (prizeType === 'zonk') {
        showToast(prizeText || "Cuba lagi lain kali!", "info");
        return; 
    }

    // --- LOGIK GETARAN 3 SAAT ---
    if ("vibrate" in navigator) {
        let isBigWin = false;
        if (['money', 'voucher', 'gadget', 'phone'].includes(prizeType)) {
            isBigWin = true;
        } 
        else if (prizeType.toLowerCase().includes('xp')) {
            const xpValue = prizeText.match(/(\d+)/);
            if (xpValue && parseInt(xpValue[0]) >= 1000) {
                isBigWin = true;
            }
        }
        if (isBigWin) {
            navigator.vibrate(3000); 
        }
    }

    const modal = document.getElementById('modal-victory');
    const iconContainer = document.getElementById('victory-icon-container');
    const prizeNameEl = document.getElementById('victory-prize-name');

    iconContainer.classList.remove('animate-bounce');
    prizeNameEl.innerText = prizeText;

    let iconHtml = '';
    
    prizeNameEl.className = "text-2xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 uppercase tracking-wider drop-shadow-lg mb-2";

    // Upgrade icon quality
    if (prizeType === 'money' || prizeType === 'voucher') {
        iconHtml = `<div class="relative"><div class="absolute inset-0 bg-green-500 blur-3xl opacity-20 animate-pulse"></div><img src="https://cdn-icons-png.flaticon.com/512/2488/2488749.png" class="relative z-10 w-32 h-32 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] animate-bounce"></div>`;
    } else if (prizeType === 'xp' || prizeType === 'XP' || prizeType === 'xp_fixed') {
        iconHtml = `<div class="relative"><div class="absolute inset-0 bg-purple-500 blur-3xl opacity-20 animate-pulse"></div><img src="https://cdn-icons-png.flaticon.com/512/9762/9762137.png" class="relative z-10 w-32 h-32 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] animate-bounce"></div>`;
    } else {
        iconHtml = `<div class="relative"><div class="absolute inset-0 bg-yellow-500 blur-3xl opacity-20 animate-pulse"></div><i class="ph-fill ph-trophy text-8xl text-yellow-400 drop-shadow-2xl animate-bounce relative z-10"></i></div>`;
    }

    iconContainer.innerHTML = iconHtml;
    openModal('modal-victory');
}

function closeVictoryModal() { closeModal('modal-victory'); }

// --- INIT & LOADING ---
window.onload = async () => { 
    checkMaintenance();
    setupPinInputFormatter(); 
    if(!isMaintenanceMode) {
        await checkSession(); 
    }
};

async function checkSession() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error && error.message.includes('fetch')) {
            isMaintenanceMode = true;
            checkMaintenance();
            return;
        }
        if (!session) { window.location.href = 'login.html'; return; }
        currentUser = session.user;
        await Promise.all([loadProfile(), loadRewards(), loadDailyLimits()]);
        renderRewards(allRewards);
    } catch (e) {
        console.error("Critical Load Error", e);
    }
}

async function loadProfile() {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        currentProfile = data;
        
        const xpSkeleton = document.getElementById('xp-skeleton');
        if(xpSkeleton) xpSkeleton.classList.add('hidden');
        
        const xpValueContainer = document.getElementById('xp-value-container');
        if(xpValueContainer) xpValueContainer.classList.remove('hidden');
        
        const xpBalanceEl = document.getElementById('user-xp-balance');
        if(xpBalanceEl) xpBalanceEl.innerText = data.xp_balance || 0;

        // Update Navbar UI
        const authSection = document.getElementById('auth-section');
        if(authSection) {
            authSection.innerHTML = `
                <div onclick="window.location.href='index.html'" class="flex items-center gap-3 cursor-pointer bg-white/5 hover:bg-white/10 py-1.5 px-2 pl-4 rounded-full border border-white/5 transition group backdrop-blur-sm animate-up">
                    <div class="text-right leading-none hidden sm:block">
                        <div class="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Baki</div>
                        <div class="text-xs font-bold text-yellow-400 group-hover:text-white transition">RM ${formatBalance(currentProfile.wallet_balance || 0)}</div>
                    </div>
                    ${currentProfile.avatar_url ?
                    `<img src="${currentProfile.avatar_url}" class="w-9 h-9 rounded-full border-2 border-yellow-400/50 object-cover shadow-sm">` :
                    `<div class="w-9 h-9 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-black font-bold text-sm shadow-lg">${currentUser.email.charAt(0).toUpperCase()}</div>`
                }
                </div>
            `;
        }
    }
}

async function loadRewards() {
    const { data, error } = await supabaseClient.from('xp_shop_items').select('*').eq('is_active', true).order('cost_xp', { ascending: true });
    if (error) { console.error(error); return; }
    allRewards = data;
}

async function loadDailyLimits() {
    const { data, error } = await supabaseClient.rpc('get_daily_usage_stats', { user_uuid: currentUser.id });
    if (!error && data) dailyUsageMap = data;
}

// --- RENDER REWARDS (DESIGN UPGRADE) ---
function renderRewards(rewards) {
    const grid = document.getElementById('reward-grid');
    if (rewards.length === 0) {
        grid.innerHTML = `
            <div class="col-span-2 flex flex-col items-center justify-center py-16 text-gray-500">
                <i class="ph-duotone ph-ghost text-4xl mb-2 opacity-50"></i>
                <span class="text-xs font-medium">Tiada hadiah untuk kategori ini.</span>
            </div>`;
        return;
    }

    grid.innerHTML = rewards.map(item => {
        let action = `confirmRedeem(${item.id})`;
        
        if (item.type === 'scratch') action = `setupScratchModal(${item.id})`;
        else if (item.type === 'legendary_box') action = `setupLegendaryModal(${item.id})`;
        else if (item.type === 'envelope_game') action = `setupEnvelopeModal(${item.id})`; 
        else if (item.type === 'stopwatch') action = `setupStopwatchModal(${item.id})`;

        if (item.type === 'mystery_box' || item.type === 'angpao' || item.type === 'game_raya') {
            return ''; 
        }

        // Color & Theme Config
        let theme = 'blue'; 
        let gradient = 'from-blue-500/20 to-blue-900/5';
        let icon = 'ph-wallet';
        let borderColor = 'group-hover:border-blue-500/50';
        
        if (item.type === 'voucher') { 
            theme = 'yellow'; 
            gradient = 'from-yellow-500/20 to-yellow-900/5';
            icon = 'ph-ticket-dashed'; 
            borderColor = 'group-hover:border-yellow-500/50';
        }
        else if (item.type === 'scratch') { 
            theme = 'purple'; 
            gradient = 'from-purple-500/20 to-purple-900/5';
            icon = 'ph-ticket'; 
            borderColor = 'group-hover:border-purple-500/50';
        }
        else if (item.type === 'legendary_box') { 
            theme = 'indigo'; 
            gradient = 'from-indigo-500/20 to-indigo-900/5';
            icon = 'ph-cube'; 
            borderColor = 'group-hover:border-indigo-500/50';
        }
        else if (item.type === 'envelope_game') { 
            theme = 'amber'; 
            gradient = 'from-amber-500/20 to-amber-900/5';
            icon = 'ph-envelope-open'; 
            borderColor = 'group-hover:border-amber-500/50';
        }
        else if (item.type === 'reload_pin') { 
            theme = 'green'; 
            gradient = 'from-green-500/20 to-green-900/5';
            icon = 'ph-lightning'; 
            borderColor = 'group-hover:border-green-500/50';
        }
        else if (item.type === 'stopwatch') { 
            theme = 'rose'; 
            gradient = 'from-rose-500/20 to-rose-900/5';
            icon = 'ph-timer'; 
            borderColor = 'group-hover:border-rose-500/50';
        }

        // Visual Setup
        const visual = item.image_url 
            ? `<div class="relative w-14 h-14 mx-auto mb-3">
                 <div class="absolute inset-0 bg-${theme}-500 blur-2xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                 <img src="${item.image_url}" class="relative z-10 w-full h-full object-contain drop-shadow-xl group-hover:scale-110 transition duration-300">
               </div>` 
            : `<div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/5 bg-gradient-to-br ${gradient} shadow-inner group-hover:scale-110 transition duration-300">
                 <i class="ph-fill ${icon} text-3xl text-${theme}-400 drop-shadow-lg"></i>
               </div>`;

        let limitBadge = '';
        let isLimitReached = false;
        
        if (dailyUsageMap[item.id]) {
            const usage = dailyUsageMap[item.id].usage;
            const limit = dailyUsageMap[item.id].limit;
            if (limit < 9999) {
                const isFull = usage >= limit;
                isLimitReached = isFull;
                const badgeColor = isFull ? 'bg-red-500/90 text-white shadow-red-500/20' : 'bg-gray-800/80 text-white border border-white/10';
                limitBadge = `
                <div class="absolute top-2 right-2 ${badgeColor} backdrop-blur-md text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg z-20 flex items-center gap-1">
                    ${isFull ? '<i class="ph-fill ph-lock-key"></i>' : '<i class="ph-fill ph-fire-simple text-orange-500"></i>'} 
                    ${usage}/${limit}
                </div>`;
            }
        }

        let ribbonHTML = '';
        if (!isLimitReached && item.stock < 10) {
            ribbonHTML = `<div class="ribbon-container"><div class="ribbon">HOT</div></div>`;
        }

        const containerClass = isLimitReached 
            ? 'grayscale opacity-60 cursor-not-allowed border-gray-800' 
            : `cursor-pointer border-white/5 ${borderColor} hover:shadow-[0_0_30px_rgba(0,0,0,0.5)] hover:-translate-y-1`;

        const clickEvent = isLimitReached ? `showToast('Had harian telah dicapai!', 'error')` : action;

        const infoButton = `
        <button onclick="openRatesModal(event, ${item.id})" class="absolute top-2 left-2 z-30 w-7 h-7 rounded-full bg-black/40 hover:bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10 transition active:scale-90 group-info">
            <i class="ph-bold ph-info text-gray-400 group-hover:text-white text-sm"></i>
        </button>`;

        return `
        <div class="relative group bg-[#18181b] rounded-3xl p-4 overflow-hidden transition-all duration-300 border ${containerClass}" onclick="${clickEvent}">
            ${limitBadge}
            ${ribbonHTML} 
            ${infoButton}
            
            <div class="absolute inset-0 bg-gradient-to-b ${gradient} opacity-0 group-hover:opacity-100 transition duration-500"></div>
            
            <div class="relative z-10 text-center mt-3">
                ${visual}
                <h3 class="text-sm font-black text-white leading-tight mb-1 truncate px-1 tracking-tight group-hover:text-${theme}-400 transition">${item.name}</h3>
                <p class="text-[10px] text-gray-500 truncate px-2 mb-4 font-medium">${item.description || 'Item Eksklusif'}</p>
            </div>

            <div class="relative z-10 mt-auto">
                <div class="bg-black/40 backdrop-blur-sm rounded-xl p-2 flex justify-between items-center border border-white/5 group-hover:border-${theme}-500/30 transition">
                    <span class="text-[9px] text-gray-400 font-bold flex items-center gap-1">
                        <i class="ph-fill ph-package text-gray-500"></i> ${item.stock}
                    </span>
                    <span class="text-xs font-black text-${theme}-400 font-mono flex items-center gap-1">
                        ${item.cost_xp} <span class="text-[8px] text-gray-500">XP</span>
                    </span>
                </div>
            </div>
        </div>`;
    }).join('');
}

// --- RATES MODAL (DESIGN UPGRADE) ---
function openRatesModal(event, itemId) {
    event.stopPropagation();

    const item = allRewards.find(r => r.id === itemId);
    if (!item) return;

    const content = document.getElementById('rates-content');

    let html = `
        <div class="flex flex-col items-center justify-center mb-6">
            <div class="w-24 h-24 rounded-3xl bg-gradient-to-br from-gray-800 to-black flex items-center justify-center text-5xl border border-white/10 shadow-2xl mb-4 relative overflow-hidden group">
                 <div class="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition"></div>
                ${
                    item.image_url
                        ? `<img src="${item.image_url}" class="w-20 h-20 object-contain drop-shadow-lg z-10">`
                        : `<i class="ph-fill ph-gift text-gray-600 z-10"></i>`
                }
            </div>

            <div class="text-center">
                <h2 class="text-2xl font-black text-white leading-none uppercase tracking-wide mb-1">
                    ${item.name}
                </h2>
                <p class="text-xs text-gray-400 font-medium max-w-[200px] mx-auto leading-relaxed">
                    ${item.description || 'Tiada penerangan.'}
                </p>
            </div>
            
            <div class="mt-4 flex gap-2">
                 <div class="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-400 px-3 py-1 rounded-full text-xs font-bold border border-yellow-500/20">
                    <i class="ph-bold ph-coin"></i> ${item.cost_xp} XP
                </div>
                 <div class="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-xs font-bold border border-blue-500/20">
                    <i class="ph-bold ph-package"></i> Stok: ${item.stock}
                </div>
            </div>
        </div>
    `;

    // Syarat mengikut jenis
    let termsTitle = "Terma & Syarat";
    let termsIcon = "ph-info";
    let termsColor = "purple";
    let termsContent = "";

    if (item.type === 'scratch' || item.type === 'legendary_box' || item.type === 'envelope_game' || item.type === 'stopwatch') {
        termsTitle = "Info Permainan";
        termsContent = `
            <p>• XP akan ditolak serta-merta semasa bermain.</p>
            <p>• Ganjaran adalah rawak (Luck-based).</p>
            <p>• Tiada jaminan kemenangan setiap pusingan.</p>
            <p>• Keputusan sistem adalah muktamad.</p>
        `;
    } 
    else if (item.type === 'reload_pin') {
        termsTitle = "Cara Penebusan";
        termsIcon = "ph-list-numbers";
        termsColor = "green";
        termsContent = `
            <p><span class="text-green-400 font-bold">1.</span> Salin kod PIN dari inventori.</p>
            <p><span class="text-green-400 font-bold">2.</span> Pergi ke Profile > Topup.</p>
            <p><span class="text-green-400 font-bold">3.</span> Masukkan PIN tersebut.</p>
            <p><span class="text-green-400 font-bold">4.</span> Kredit akan ditambah automatik.</p>
        `;
    }
    else {
        termsTitle = "Maklumat Pembelian";
        termsIcon = "ph-check-circle";
        termsColor = "blue";
        termsContent = `
            <p>• Item akan masuk ke inventori serta-merta.</p>
            <p>• Pembelian tidak boleh dibatalkan.</p>
            <p>• Pastikan baki XP mencukupi.</p>
        `;
    }

    html += `
        <div class="border-t border-white/10 pt-5">
            <h4 class="text-xs font-bold text-gray-300 mb-3 flex items-center gap-2 uppercase tracking-widest">
                <i class="ph-fill ${termsIcon} text-${termsColor}-400"></i>
                ${termsTitle}
            </h4>
            <div class="bg-[#09090b] rounded-xl p-4 border border-white/5 text-[11px] text-gray-400 leading-7 font-medium shadow-inner">
                ${termsContent}
            </div>
        </div>
    `;

    content.innerHTML = html;
    openModal('modal-rates');
}

function filterRewards(type, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active', 'bg-white', 'text-black', 'border-white', 'shadow-white/20');
        b.classList.add('bg-[#27272a]', 'text-gray-400', 'border-gray-600');
    });
    btn.classList.add('active', 'bg-white', 'text-black', 'border-white', 'shadow-lg', 'shadow-white/20');
    if (type === 'all') renderRewards(allRewards);
    else renderRewards(allRewards.filter(r => r.type === type));
}

// --- INVENTORY LOGIC (DESIGN UPGRADE) ---
function openInventoryModal() { openModal('modal-inventory'); loadInventory('active'); }

function switchInvTab(tabName) {
    currentInvTab = tabName;
    document.getElementById('tab-inv-active').classList.toggle('active', tabName === 'active');
    document.getElementById('tab-inv-history').classList.toggle('active', tabName === 'history');
    loadInventory(tabName);
}

async function loadInventory(statusType) {
    const container = document.getElementById('inv-list-container');
    container.innerHTML = '<div class="flex flex-col items-center justify-center py-20"><i class="ph ph-spinner animate-spin text-3xl text-yellow-400 mb-3"></i><span class="text-xs text-gray-500">Memuatkan beg...</span></div>';
    
    const { data: allData, error } = await supabaseClient.from('vouchers').select('*').eq('assign_to_user', currentUser.id).order('created_at', { ascending: false });

    if (error) { container.innerHTML = '<div class="text-center text-red-500 text-xs py-4">Gagal memuatkan data.</div>'; return; }

    let filteredData = [];
    const now = new Date();
    if (statusType === 'active') filteredData = allData.filter(item => item.is_active === true && item.usage_limit > 0 && new Date(item.end_date) > now);
    else filteredData = allData.filter(item => item.is_active === false || item.usage_limit <= 0 || new Date(item.end_date) <= now);

    if (filteredData.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-gray-600">
                <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-3">
                    <i class="ph-duotone ph-backpack text-3xl opacity-50"></i>
                </div>
                <span class="text-xs font-medium">Beg anda kosong.</span>
            </div>`;
        return;
    }

    const groupedItems = {};
    filteredData.forEach(item => {
        const key = item.description || item.code;
        if (!groupedItems[key]) groupedItems[key] = { count: 0, itemData: item, codes: [] };
        groupedItems[key].count++; groupedItems[key].codes.push(item);
    });

    container.innerHTML = Object.values(groupedItems).map(group => {
        const item = group.itemData;
        const codesJson = encodeURIComponent(JSON.stringify(group.codes));
        
        // Digital Ticket Design
        return `
        <div onclick="openInventoryDetail('${item.description}', '${codesJson}')" class="group relative bg-[#18181b] border border-white/10 rounded-xl overflow-hidden mb-3 cursor-pointer hover:border-yellow-500/30 transition-all duration-300">
            <div class="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#09090b] rounded-full border-r border-white/10"></div>
            <div class="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#09090b] rounded-full border-l border-white/10"></div>
            
            <div class="flex items-stretch">
                <div class="w-16 bg-white/5 flex flex-col items-center justify-center border-r border-dashed border-white/10 p-2">
                    <div class="text-xs text-gray-500 font-bold uppercase mb-1">QTY</div>
                    <div class="text-xl font-black text-white">x${group.count}</div>
                </div>
                
                <div class="flex-1 p-3 pl-4 flex flex-col justify-center">
                    <h4 class="text-sm font-bold text-white leading-tight mb-1 group-hover:text-yellow-400 transition">${item.description}</h4>
                    <div class="flex items-center gap-2 text-[10px] text-gray-500">
                        <i class="ph-fill ph-calendar-blank"></i>
                        <span>Tamat: ${new Date(item.end_date).toLocaleDateString()}</span>
                    </div>
                </div>

                <div class="pr-4 flex items-center justify-center text-gray-600 group-hover:text-white transition">
                    <i class="ph-bold ph-caret-right"></i>
                </div>
            </div>
        </div>`;
    }).join('');
}

function openInventoryDetail(name, codesJson) {
    const codes = JSON.parse(decodeURIComponent(codesJson));
    document.getElementById('inv-detail-name').innerText = name;
    document.getElementById('inv-codes-list').innerHTML = codes.map((c, i) => `
        <div class="group bg-black/40 p-3 rounded-xl border border-white/10 flex justify-between items-center mb-2 hover:border-yellow-500/30 transition">
            <div class="flex items-center gap-3">
                 <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-500 font-mono text-[10px] border border-white/5">
                    #${i+1}
                 </div>
                 <div>
                    <div class="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Kod Aktif</div>
                    <div class="text-sm font-mono font-bold text-yellow-400 tracking-wide">${c.code}</div>
                 </div>
            </div>
            <button onclick="copyToClipboard('${c.code}')" class="bg-yellow-500 hover:bg-yellow-400 text-black p-2 rounded-lg transition shadow-lg shadow-yellow-500/20 active:scale-90">
                <i class="ph-bold ph-copy"></i>
            </button>
        </div>`).join('');
    openModal('modal-inv-details');
}

// --- HISTORY LOGIC (DESIGN UPGRADE) ---
function openHistoryModal() { openModal('modal-history'); loadHistoryList(); }

async function loadHistoryList() {
    const container = document.getElementById('history-list-container');
    container.innerHTML = '<div class="flex justify-center py-10"><i class="ph ph-spinner animate-spin text-2xl text-purple-400"></i></div>';
    
    const { data } = await supabaseClient.from('xp_transactions').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(30);
    if (!data || data.length === 0) { container.innerHTML = '<div class="text-center text-gray-500 text-xs py-10">Tiada sejarah transaksi.</div>'; return; }

    container.innerHTML = data.map(tx => {
        const isGain = tx.amount > 0;
        const color = isGain ? 'green' : 'red';
        const icon = isGain ? 'ph-arrow-down-left' : 'ph-arrow-up-right';
        
        return `
        <div class="bg-[#18181b] p-3 rounded-xl border border-white/5 flex justify-between items-center mb-2 hover:bg-white/5 transition group">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center bg-${color}-500/10 text-${color}-400 border border-${color}-500/20 shadow-inner group-hover:scale-105 transition">
                    <i class="ph-bold ${icon} text-lg"></i>
                </div>
                <div>
                    <h4 class="text-xs font-bold text-gray-200 capitalize group-hover:text-white transition">${tx.description}</h4>
                    <p class="text-[10px] text-gray-500 font-mono">${new Date(tx.created_at).toLocaleString()}</p>
                </div>
            </div>
            <div class="text-right">
                <span class="font-mono font-black text-sm ${isGain ? 'text-green-400' : 'text-red-400'} block">
                    ${isGain ? '+' : ''}${tx.amount}
                </span>
                <span class="text-[8px] font-bold text-gray-600 uppercase tracking-widest">XP</span>
            </div>
        </div>`;
    }).join('');
}

// --- REDEMPTION (STANDARD ITEMS) ---
function confirmRedeem(id) {
    const item = allRewards.find(r => r.id === id);
    if (!item || item.stock <= 0) return showToast("Stok habis.", "error");
    pendingRedeemItem = item;
    document.getElementById('confirm-item-name').innerText = item.name;
    document.getElementById('confirm-item-price').innerText = `${item.cost_xp} XP`;
    document.getElementById('btn-proceed-redeem').onclick = () => executeRedemptionRPC(item);
    openModal('modal-confirm');
}

async function executeRedemptionRPC(item) {
    const btn = document.getElementById('btn-proceed-redeem');
    btn.innerText = "Memproses..."; btn.disabled = true;
    try {
        const { data, error } = await supabaseClient.rpc('redeem_xp_item', { item_id: item.id, user_uuid: currentUser.id });
        if (error) throw error;
        if (!data.success) showToast(data.message, "error");
        else {
            showToast(data.message, "success");
            
            currentProfile.xp_balance = data.new_xp;
            document.getElementById('user-xp-balance').innerText = data.new_xp;
            
            if(data.type === 'voucher') setTimeout(() => openInventoryModal(), 1000);
            
            await loadRewards(); 
            await loadDailyLimits(); 
            
            refreshLimitsAndUI();
        }
    } catch (e) { showToast("Ralat: " + e.message, "error"); }
    finally { btn.innerText = "YA, TEBUS"; btn.disabled = false; closeModal('modal-confirm'); }
}

// --- SCRATCH CARD LOGIC ---
let currentScratchData = null; 
function setupScratchModal(id) {
    const item = allRewards.find(r => r.id === id);
    if(!item) return;
    const btn = document.getElementById('btn-play-scratch');
    const btnAuto = document.getElementById('btn-auto-scratch');
    btn.innerHTML = `<i class="ph-bold ph-coin"></i> BAYAR ${item.cost_xp} XP & MAIN`;
    btn.disabled = false; btn.classList.remove('hidden');
    btnAuto.classList.add('hidden');
    document.getElementById('prize-text').innerText = "???";
    document.getElementById('scratch-result-icon').className = "ph-fill ph-gift text-4xl text-yellow-400 animate-pulse";
    btn.onclick = () => initScratchGame(item);
    openModal('modal-scratch'); resetCanvas(); 
    document.querySelector('.scratch-canvas').style.pointerEvents = 'none';
}

async function initScratchGame(item) {
    if (currentProfile.xp_balance < item.cost_xp) return showToast("XP tak cukup!", "error");
    
    const btn = document.getElementById('btn-play-scratch');
    btn.disabled = true; 
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Processing...`;
    
    try {
        const { data, error } = await supabaseClient.rpc('play_scratch_card', { item_id: item.id, user_uuid: currentUser.id });
        if (error) throw error;
        if (!data.success) throw new Error(data.message);
        
        currentScratchData = data; 
        currentProfile.xp_balance = data.new_xp; 
        document.getElementById('user-xp-balance').innerText = data.new_xp; 
        
        refreshLimitsAndUI();

        document.getElementById('prize-text').innerText = data.prize_name;
        btn.classList.add('hidden'); 
        document.getElementById('btn-auto-scratch').classList.remove('hidden');
        document.getElementById('scratch-canvas').style.pointerEvents = 'auto';
        
        if (scratchTimeout) clearTimeout(scratchTimeout);
        scratchTimeout = setTimeout(() => finishScratchGame(), 4000); 
        
    } catch (e) { 
        showToast(e.message, "error"); 
        btn.disabled = false; 
    }
}

function triggerAutoScratch() {
    if (!currentScratchData) return;
    document.getElementById('scratch-canvas').style.transition = 'opacity 0.5s';
    document.getElementById('scratch-canvas').style.opacity = '0'; 
    if (scratchTimeout) clearTimeout(scratchTimeout);
    setTimeout(() => finishScratchGame(), 300); 
}

function finishScratchGame() {
    document.getElementById('btn-auto-scratch').classList.add('hidden'); 
    showVictoryModal(currentScratchData.prize_name, currentScratchData.prize_type);
}

function resetCanvas() {
    const canvas = document.getElementById('scratch-canvas'); 
    const ctx = canvas.getContext('2d');
    canvas.style.opacity = '1'; ctx.globalCompositeOperation = 'source-over'; 
    
    // Canvas Design Upgrade
    const gradient = ctx.createLinearGradient(0, 0, 250, 150);
    gradient.addColorStop(0, '#374151');
    gradient.addColorStop(1, '#1f2937');
    ctx.fillStyle = gradient; 
    ctx.fillRect(0, 0, 250, 150); 
    
    // Text Pattern
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.font = 'bold 80px Arial';
    ctx.fillText("?", 100, 100);

    ctx.fillStyle = '#e5e7eb'; ctx.font = 'bold 20px sans-serif'; 
    ctx.textAlign = 'center';
    ctx.fillText("GORES SINI", 125, 80);
    
    ctx.fillStyle = '#9ca3af'; ctx.font = '10px sans-serif';
    ctx.fillText("Semoga Bertuah", 125, 100);

    let isDrawing = false; 
    const scratch = (e) => { 
        if (!isDrawing) return; e.preventDefault(); 
        const rect = canvas.getBoundingClientRect(); 
        let x = e.touches ? e.touches[0].clientX : e.clientX; 
        let y = e.touches ? e.touches[0].clientY : e.clientY; 
        ctx.globalCompositeOperation = 'destination-out'; 
        ctx.beginPath(); ctx.arc(x - rect.left, y - rect.top, 25, 0, Math.PI * 2); ctx.fill(); 
    };
    canvas.onmousedown = canvas.ontouchstart = () => isDrawing = true; 
    canvas.onmouseup = canvas.ontouchend = () => isDrawing = false; 
    canvas.onmousemove = canvas.ontouchmove = scratch;
}

// --- LEGENDARY BOX LOGIC (DESIGN UPGRADE) ---
function setupLegendaryModal(id) {
    const item = allRewards.find(r => r.id === id);
    if (!item) return;

    currentLegendaryItem = item;
    isLegendaryPlaying = false;
    
    const grid = document.getElementById('lb-grid-container');
    const statusText = document.getElementById('legendary-status-text');
    statusText.innerText = "SILA PILIH SATU KOTAK";
    statusText.className = "text-center mb-6 text-sm font-bold text-yellow-400 animate-pulse tracking-widest";
    
    let html = '';
    for(let i=0; i<6; i++) {
        html += `
        <div id="lbox-${i}" onclick="playLegendaryBox(${i})" 
             class="aspect-square bg-[#27272a] rounded-2xl border border-white/10 flex items-center justify-center cursor-pointer hover:border-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all duration-300 relative overflow-hidden group active:scale-95">
            
            <div class="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-blue-600/20 opacity-0 group-hover:opacity-100 transition"></div>
            <div class="absolute -top-10 -right-10 w-20 h-20 bg-white/5 rounded-full blur-xl group-hover:bg-purple-500/20 transition"></div>

            <div class="lbox-content transition-transform duration-500 flex flex-col items-center z-10">
                <i class="ph-fill ph-cube text-4xl text-gray-600 group-hover:text-purple-400 transition drop-shadow-lg"></i>
                <div class="text-[9px] text-gray-600 font-bold uppercase mt-2 group-hover:text-white transition">BOX ${i+1}</div>
            </div>
        </div>`;
    }
    grid.innerHTML = html;
    
    openModal('modal-legendary');
}

async function playLegendaryBox(selectedIndex) {
    if(isLegendaryPlaying || !currentLegendaryItem) return;
    
    if (currentProfile.xp_balance < currentLegendaryItem.cost_xp) {
        showToast("XP tak cukup!", "error");
        return;
    }

    isLegendaryPlaying = true;
    const statusText = document.getElementById('legendary-status-text');
    statusText.innerText = "MEMBUKA KOTAK...";
    statusText.className = "text-center mb-6 text-sm font-bold text-white tracking-widest";

    for(let i=0; i<6; i++) {
        const box = document.getElementById(`lbox-${i}`);
        box.style.pointerEvents = 'none'; 
        if(i !== selectedIndex) box.style.opacity = '0.5';
        else box.classList.add('animate-bounce');
    }

    try {
        const { data, error } = await supabaseClient.rpc('play_legendary_box', { 
            item_id: currentLegendaryItem.id, 
            user_uuid: currentUser.id 
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.message);

        currentProfile.xp_balance = data.new_xp; 
        document.getElementById('user-xp-balance').innerText = data.new_xp; 
        
        loadDailyLimits(); 

        const selectedBox = document.getElementById(`lbox-${selectedIndex}`);
        selectedBox.classList.remove('animate-bounce');
        selectedBox.classList.add('border-yellow-400', 'bg-yellow-400/10', 'shadow-[0_0_30px_rgba(250,204,21,0.3)]');
        selectedBox.style.opacity = '1';
        
        renderBoxContent(selectedBox, data.prize_type, data.prize_name, true);

        setTimeout(() => {
            let dummyIndex = 0;
            for(let i=0; i<6; i++) {
                if(i === selectedIndex) continue; 
                
                const box = document.getElementById(`lbox-${i}`);
                const dummy = data.dummy_prizes[dummyIndex];
                
                box.style.opacity = '0.3'; 
                box.classList.add('grayscale'); 
                renderBoxContent(box, dummy.type, dummy.desc, false);
                
                dummyIndex++;
            }
            statusText.innerText = "TAHNIAH!";
            statusText.classList.add('text-yellow-400');
        }, 800);

        setTimeout(() => {
            showVictoryModal(data.prize_name, data.prize_type);
            isLegendaryPlaying = false;
            refreshLimitsAndUI();
        }, 2500);

    } catch (e) {
        showToast(e.message, "error");
        isLegendaryPlaying = false;
        closeModal('modal-legendary');
    }
}

function renderBoxContent(boxElement, type, name, isWinner) {
    let iconClass = 'ph-cube';
    let colorClass = 'text-gray-400';
    let glow = '';

    if (type === 'money') { iconClass = 'ph-money'; colorClass = isWinner ? 'text-green-400' : 'text-green-700'; }
    else if (type === 'xp' || type === 'xp_fixed') { iconClass = 'ph-lightning'; colorClass = isWinner ? 'text-yellow-400' : 'text-yellow-700'; }
    else if (type === 'voucher') { iconClass = 'ph-ticket'; colorClass = isWinner ? 'text-blue-400' : 'text-blue-700'; }
    else { iconClass = 'ph-smiley-sad'; colorClass = 'text-gray-600'; } 

    const contentDiv = boxElement.querySelector('.lbox-content');
    
    contentDiv.innerHTML = `
        <div class="flex flex-col items-center animate-fade-in-up">
            <i class="ph-fill ${iconClass} ${isWinner ? 'text-4xl drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'text-2xl'} ${colorClass} mb-2 transition-all"></i>
            <span class="${isWinner ? 'text-[9px] font-black text-white uppercase bg-black/50 px-2 py-0.5 rounded' : 'text-[8px] text-gray-500'} text-center leading-tight px-1">${name}</span>
        </div>
    `;
}

// --- ENVELOPE SHUFFLE LOGIC (FINAL FIXED) ---
const ENV_POSITIONS = [
    { x: -85, y: -60 }, { x: 0, y: -60 }, { x: 85, y: -60 },  
    { x: -85, y: 60 },  { x: 0, y: 60 },  { x: 85, y: 60 }    
];

function setupEnvelopeModal(id) {
    const item = allRewards.find(r => r.id === id);
    if (!item) return;
    
    envelopeItemData = item;
    isEnvelopeShuffling = false;

    const container = document.getElementById('envelope-container');
    container.innerHTML = ''; 
    
    document.getElementById('btn-start-shuffle').classList.remove('hidden');
    document.getElementById('envelope-status').innerHTML = ''; 
    document.getElementById('envelope-status').classList.remove('hidden');

    let rewardsHtml = '';
    if (item.config && item.config.rewards) {
        rewardsHtml = `
            <div id="prize-preview" class="mb-10 animate-fade-in-up">
                <div class="text-[9px] text-gray-500 mb-2 uppercase tracking-widest font-bold">Kemungkinan Hadiah:</div>
                <div class="flex flex-wrap justify-center gap-2">
                    ${item.config.rewards.map(r => {
                        let icon = 'ph-gift'; let color = 'gray';
                        if(r.type === 'money') { icon = 'ph-money'; color = 'green'; }
                        else if(r.type === 'xp') { icon = 'ph-lightning'; color = 'purple'; }
                        else if(r.type === 'voucher') { icon = 'ph-ticket'; color = 'blue'; }
                        return `<div class="bg-white/5 border border-white/10 px-2 py-1.5 rounded-lg text-[9px] flex items-center gap-1.5 text-gray-300 font-bold"><i class="ph-fill ${icon} text-${color}-400"></i> ${r.desc}</div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    const existingPreview = document.getElementById('prize-preview');
    if(existingPreview) existingPreview.remove();
    container.insertAdjacentHTML('beforebegin', rewardsHtml);

    ENV_POSITIONS.forEach((pos, i) => {
        container.innerHTML += `
            <div id="env-${i}" class="absolute w-16 h-24 bg-gradient-to-br from-yellow-300 to-yellow-600 rounded-lg border-2 border-yellow-200 shadow-xl flex items-center justify-center cursor-pointer transform transition-all duration-500 z-10 group" style="left: 50%; top: 50%; margin-left: -32px; margin-top: -48px;">
                <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diamond-upholstery.png')] opacity-40 mix-blend-overlay"></div>
                <div class="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition"></div>
                <i class="ph-fill ph-envelope-simple text-3xl text-yellow-900/60 drop-shadow-sm"></i>
                <div class="absolute bottom-3 w-8 h-0.5 bg-yellow-900/30"></div>
            </div>`;
    });

    openModal('modal-envelope');
    
    setTimeout(() => {
        ENV_POSITIONS.forEach((pos, i) => {
            const el = document.getElementById(`env-${i}`);
            if(el) el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        });
    }, 100);
}

async function startEnvelopeGame() {
    if(isEnvelopeShuffling) return;
    isEnvelopeShuffling = true;
    
    document.getElementById('btn-start-shuffle').classList.add('hidden');
    const preview = document.getElementById('prize-preview');
    if(preview) preview.style.opacity = '0';

    const status = document.getElementById('envelope-status');
    status.innerHTML = '<span class="text-yellow-400 font-bold animate-pulse tracking-widest text-sm">SHUFFLING...</span>';

    const envelopes = [];
    for(let i=0; i<6; i++) envelopes.push(document.getElementById(`env-${i}`));

    envelopes.forEach(el => {
        el.style.transform = `translate(0px, 0px) scale(0.8)`;
        el.style.zIndex = 10;
    });
    
    await new Promise(r => setTimeout(r, 600));

    let shuffles = 0;
    const interval = setInterval(() => {
        envelopes.forEach(el => {
            const rX = (Math.random() - 0.5) * 30;
            const rY = (Math.random() - 0.5) * 30;
            const rRot = (Math.random() - 0.5) * 40;
            el.style.zIndex = Math.floor(Math.random() * 20);
            el.style.transform = `translate(${rX}px, ${rY}px) scale(0.8) rotate(${rRot}deg)`;
        });
        shuffles++;
        if(shuffles > 15) {
            clearInterval(interval);
            finishShuffleAndReady();
        }
    }, 100);
}

function finishShuffleAndReady() {
    const shuffledPositions = [...ENV_POSITIONS].sort(() => Math.random() - 0.5);

    for(let i=0; i<6; i++) {
        const el = document.getElementById(`env-${i}`);
        const pos = shuffledPositions[i];
        
        el.style.transition = "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
        el.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(1) rotate(0deg)`;
        el.style.zIndex = 1;
        el.style.cursor = "pointer";
        el.onclick = () => pickEnvelope(i); 
        el.onmouseenter = () => { if(!isEnvelopeShuffling) el.style.transform = `translate(${pos.x}px, ${pos.y - 10}px) scale(1.1)`; };
        el.onmouseleave = () => { if(!isEnvelopeShuffling) el.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(1)`; };
    }
    
    isEnvelopeShuffling = false;
    const status = document.getElementById('envelope-status');
    status.innerHTML = '<span class="text-white font-bold animate-bounce block mt-2 text-sm tracking-wide">SILA PILIH SATU SAMPUL</span>';
}

async function pickEnvelope(selectedIndex) {
    if(isEnvelopeShuffling) return; 
    isEnvelopeShuffling = true; 

    for(let i=0; i<6; i++) {
        const el = document.getElementById(`env-${i}`);
        el.onclick = null; el.onmouseenter = null; el.onmouseleave = null;
        if(i !== selectedIndex) el.style.opacity = '0.3'; 
    }

    const status = document.getElementById('envelope-status');
    status.innerHTML = '<span class="text-yellow-400 font-bold tracking-widest text-sm">MEMBUKA...</span>';

    try {
        const { data, error } = await supabaseClient.rpc('play_envelope_shuffle', {
            item_id: envelopeItemData.id,
            user_uuid: currentUser.id
        });

        if (error) throw error;
        if (!data.success) { showToast(data.message, "error"); closeModal('modal-envelope'); return; }

        const selectedEl = document.getElementById(`env-${selectedIndex}`);
        
        selectedEl.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        selectedEl.style.transform = 'translate(0px, 0px) scale(1.8)';
        selectedEl.style.zIndex = 100;
        selectedEl.style.opacity = '1';

        setTimeout(() => {
            let icon = 'ph-gift';
            let color = 'text-gray-800';
            let bgClass = 'bg-white';
            let glowColor = 'gold';
            
            if(data.prize.type === 'money') { icon = 'ph-money'; color = 'text-green-600'; glowColor = '#22c55e'; }
            else if(data.prize.type === 'xp') { icon = 'ph-lightning'; color = 'text-purple-600'; glowColor = '#a855f7'; }
            else if(data.prize.type === 'voucher') { icon = 'ph-ticket'; color = 'text-blue-600'; glowColor = '#3b82f6'; }
            else if(data.prize.type === 'zonk') { icon = 'ph-smiley-sad'; color = 'text-gray-500'; bgClass = 'bg-gray-200'; glowColor = 'gray'; }

            selectedEl.innerHTML = `
                <div class="absolute inset-0 ${bgClass} rounded-lg flex flex-col items-center justify-center border-2 border-${glowColor === 'gold' ? 'yellow-400' : glowColor} shadow-[0_0_30px_${glowColor}] animate-fade-in overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-b from-white to-transparent opacity-50"></div>
                    <i class="ph-fill ${icon} ${color} text-3xl mb-1 animate-bounce relative z-10"></i>
                    <span class="text-[6px] font-black text-black text-center px-1 leading-tight uppercase relative z-10">${data.prize.desc}</span>
                </div>
            `;
            
            status.innerHTML = `<span class="text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 font-black text-xl uppercase italic">${data.prize.type === 'zonk' ? 'OOPS...' : 'TAHNIAH!'}</span>`;
            
            loadProfile(); 
            loadHistoryList();

            if(data.dummies) {
                revealDummies(selectedIndex, data.dummies);
            }
            
            setTimeout(() => {
                if(data.prize.type !== 'zonk') {
                    showVictoryModal(data.prize.desc, data.prize.type);
                } else {
                    showToast("Cuba lagi esok!", "info");
                }
                refreshLimitsAndUI();
            }, 2500);

        }, 600);

    } catch (e) {
        showToast("Ralat: " + e.message, "error");
        closeModal('modal-envelope');
    }
}

function revealDummies(selectedIndex, dummies) {
    let dummyIdx = 0;
    for(let i=0; i<6; i++) {
        if(i === selectedIndex) continue; 
        if(!dummies[dummyIdx]) break;

        const el = document.getElementById(`env-${i}`);
        const d = dummies[dummyIdx];
        
        setTimeout(() => {
            el.style.transform += ' scale(0.9)'; 
            el.style.opacity = '0.5';
            el.classList.add('grayscale');
            el.innerHTML = `
                <div class="absolute inset-0 bg-[#27272a] rounded-lg flex flex-col items-center justify-center border border-white/20 animate-fade-in">
                    <span class="text-[5px] font-bold text-gray-400 text-center px-1 leading-tight uppercase">${d.desc}</span>
                </div>`;
        }, 800 + (dummyIdx * 150));
        dummyIdx++;
    }
}

// --- STOPWATCH CHALLENGE LOGIC (FIXED) ---
function setupStopwatchModal(id) {
    const item = allRewards.find(r => r.id === id);
    if(!item) return;

    // Reset UI
    const timerDisplay = document.getElementById('sw-timer-display');
    const btn = document.getElementById('btn-stopwatch-action');
    const status = document.getElementById('sw-status-text');
    const winTarget = document.getElementById('sw-target-display');
    
    timerDisplay.innerText = "0.00";
    timerDisplay.classList.remove('text-green-500', 'text-red-500', 'animate-bounce');
    timerDisplay.classList.add('text-white');
    
    winTarget.innerText = "SASARAN: 8.00s - 8.05s";
    status.innerText = "Klik 'MULA' untuk start jam!";
    
    // Reset Button State
    btn.innerHTML = `<i class="ph-bold ph-play"></i> BAYAR ${item.cost_xp} XP & MULA`;
    btn.className = "w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-500/20 transition text-sm uppercase tracking-wide flex items-center justify-center gap-2";
    
    // Simpan item ID untuk guna masa start
    btn.onclick = () => startStopwatch(item);
    
    isStopwatchRunning = false;
    stopwatchData = null;

    openModal('modal-stopwatch');
}

function startStopwatch(item) {
    // Check XP Client Side dulu
    if (currentProfile.xp_balance < item.cost_xp) {
        showToast("XP tak cukup!", "error");
        return;
    }

    const btn = document.getElementById('btn-stopwatch-action');
    const status = document.getElementById('sw-status-text');
    
    // Ubah UI jadi Mode Game
    isStopwatchRunning = true;
    
    // Tukar butang jadi STOP
    btn.innerHTML = `<i class="ph-fill ph-hand-palm"></i> STOP SEKARANG!`;
    btn.className = "w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.5)] transition text-xl uppercase tracking-widest flex items-center justify-center gap-2 animate-pulse";
    
    // Hantar item ke fungsi stop
    btn.onclick = () => handleStopwatchStop(item);

    status.innerText = "HENTIKAN TEPAT PADA 8.00!";
    
    // Mula Jam Bergerak Laju
    const startTime = Date.now();
    const timerDisplay = document.getElementById('sw-timer-display');
    
    stopwatchInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        timerDisplay.innerText = elapsed.toFixed(2);
    }, 10); // Update laju
}

async function handleStopwatchStop(item) {
    if (!isStopwatchRunning) return;
    
    // 1. Hentikan Jam serta-merta (Visual User)
    clearInterval(stopwatchInterval);
    isStopwatchRunning = false;
    
    const timerDisplay = document.getElementById('sw-timer-display');
    const btn = document.getElementById('btn-stopwatch-action');
    const status = document.getElementById('sw-status-text');

    // Ambil masa akhir yang user nampak
    const finalTime = parseFloat(timerDisplay.innerText);
    
    // UI: Tunjuk sedang proses
    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> MENYEMAK...`;
    btn.className = "w-full bg-gray-700 text-white font-bold py-4 rounded-xl cursor-wait";

    try {
        // 2. Hantar masa ke Server (Server akan tolak XP dan check masa)
        const { data, error } = await supabaseClient.rpc('play_stopwatch_game', { 
            item_id: item.id, 
            user_uuid: currentUser.id,
            p_client_time: finalTime // Hantar masa user stop tadi
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.message);

        // Update XP Balance
        currentProfile.xp_balance = data.new_xp;
        document.getElementById('user-xp-balance').innerText = data.new_xp;
        refreshLimitsAndUI();

        // 3. Tunjuk Result dari Server
        // Server akan guna finalTime yang kita hantar, jadi tak akan ada 'snap'
        
        const isWin = data.is_winner;
        const prizeDesc = data.prize.desc;

        if (isWin) {
            timerDisplay.classList.remove('text-white');
            timerDisplay.classList.add('text-green-500', 'drop-shadow-[0_0_15px_rgba(34,197,94,0.8)]', 'animate-bounce');
            status.innerHTML = `<span class="text-green-400 font-black text-xl">JACKPOT! TEPAT!</span>`;
            
            btn.innerHTML = "TAHNIAH!";
            btn.className = "w-full bg-green-600 text-white font-bold py-4 rounded-xl opacity-50 cursor-not-allowed";
            
            setTimeout(() => {
                showVictoryModal(prizeDesc, data.prize.type);
                closeModal('modal-stopwatch');
            }, 1500);
        } else {
            timerDisplay.classList.remove('text-white');
            timerDisplay.classList.add('text-red-500');
            
            // Logic mesej
            if (finalTime < 8.00) {
                status.innerHTML = `<span class="text-gray-400 text-sm">Terlalu awal... Cuba lagi!</span>`;
            } else if (finalTime > 8.05) {
                status.innerHTML = `<span class="text-gray-400 text-sm">Terlajak sikit... Cuba lagi!</span>`;
            } else {
                // User kena tepat, tapi nasib tak baik (RNG Zonk)
                status.innerHTML = `<span class="text-gray-400 text-sm">Masa tepat, tapi tiada tuah...</span>`;
            }

            // Tunjuk saguhati jika ada (selain zonk)
            if(data.prize.type !== 'zonk') {
                 showToast("Saguhati: " + prizeDesc, "success");
            } else {
                 showToast("Gagal. XP telah ditolak.", "error");
            }
            
            btn.disabled = false;
            btn.innerHTML = "MAIN LAGI";
            btn.className = "w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 rounded-xl mt-2";
            btn.onclick = () => setupStopwatchModal(item.id);
        }

    } catch (e) {
        showToast("Ralat: " + e.message, "error");
        btn.disabled = false;
        btn.innerHTML = "CUBA LAGI";
        btn.onclick = () => setupStopwatchModal(item.id);
    }
}