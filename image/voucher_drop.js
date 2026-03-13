// voucher_drop.js - Version 2.0 (Enhanced UI & Logic)

const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let isClaiming = false;
let timers = []; // Array untuk simpan interval timer

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await loadDrops();
});

// --- 1. Session ---
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authSection = document.getElementById('auth-section');

    if (session) {
        currentUser = session.user;
        const { data: profile } = await supabaseClient.from('profiles').select('username, avatar_url').eq('id', currentUser.id).single();
        
        const displayName = profile?.username || currentUser.email.split('@')[0];
        const avatar = profile?.avatar_url || `https://ui-avatars.com/api/?name=${displayName}&background=facc15&color=000&bold=true`;

        document.getElementById('profile-email').innerText = displayName;
        document.getElementById('profile-img').src = avatar;

        authSection.innerHTML = `
            <div onclick="openModal('profile-modal')" class="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 py-1 pl-2 pr-1 rounded-full border border-white/5 transition animate-up">
                <div class="text-right mr-1">
                    <div class="text-[9px] text-gray-400 uppercase font-bold">Hello,</div>
                    <div class="text-[11px] font-bold text-white leading-none max-w-[80px] truncate">${displayName}</div>
                </div>
                <img src="${avatar}" class="w-8 h-8 rounded-full border border-yellow-400/50 object-cover">
            </div>
        `;
    } else {
        authSection.innerHTML = `
            <button onclick="window.location.href='login.html'" class="bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 rounded-full text-xs font-bold transition shadow-lg shadow-yellow-400/20">
                Log Masuk
            </button>
        `;
    }
}

// --- 2. Load Data ---
async function loadDrops() {
    const container = document.getElementById('drops-container');
    container.innerHTML = `<div class="drop-card rounded-2xl p-6 h-40 animate-pulse flex flex-col justify-center items-center gap-3"><div class="loader"></div><div class="text-gray-500 text-xs">Menyemak event...</div></div>`;

    // Clear old timers
    timers.forEach(t => clearInterval(t));
    timers = [];

    try {
        const now = new Date().toISOString();

        // Query: Active Drops (Include upcoming for preview)
        const { data: drops, error } = await supabaseClient
            .from('voucher_drops')
            .select('*')
            .eq('is_active', true)
            .or(`active_end.is.null,active_end.gt.${now}`)
            .order('active_start', { ascending: true }); // Tunjuk yang paling awal mula dulu

        if (error) throw error;

        // Check user claims
        let userClaims = [];
        if (currentUser) {
            const { data: claims } = await supabaseClient
                .from('voucher_drop_claims')
                .select('drop_id')
                .eq('user_id', currentUser.id);
            if (claims) userClaims = claims.map(c => c.drop_id);
        }

        renderDrops(drops, userClaims);

    } catch (err) {
        console.error(err);
        container.innerHTML = `
            <div class="text-center py-8 bg-red-900/10 rounded-2xl border border-red-500/20">
                <i class="ph ph-warning-circle text-2xl text-red-500 mb-2"></i>
                <p class="text-xs text-red-400">Gagal memuatkan data.</p>
                <button onclick="loadDrops()" class="mt-2 text-xs underline text-white">Cuba lagi</button>
            </div>`;
    }
}

// --- 3. Render UI (Logic Baru) ---
function renderDrops(drops, userClaims) {
    const container = document.getElementById('drops-container');
    
    if (!drops || drops.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16 opacity-50 flex flex-col items-center">
                <div class="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <i class="ph-fill ph-ticket text-3xl text-gray-500"></i>
                </div>
                <h3 class="text-base font-bold text-gray-400">belum ada baucer tersedia. :(</h3>
                <p class="text-xs text-gray-600 mt-1">Sila kembali lagi nanti!</p>
            </div>`;
        return;
    }

    container.innerHTML = drops.map(drop => {
        // Calculations
        const claimedCount = drop.current_claimed || 0;
        const totalQty = drop.total_qty;
        const percentClaimed = Math.min(100, Math.round((claimedCount / totalQty) * 100));
        const isSoldOut = claimedCount >= totalQty;
        const hasUserClaimed = userClaims.includes(drop.id);
        const now = new Date();
        const startTime = new Date(drop.active_start);
        const isUpcoming = startTime > now;

        // Display Formatting
        const discountText = drop.discount_type === 'percentage' 
            ? `${drop.discount_value}%` 
            : `RM${drop.discount_value}`;
            
        // Logic Max Spend Display
        const maxSpendText = (drop.max_spend && drop.max_spend < 99999) 
            ? `RM ${drop.max_spend}` 
            : 'Tanpa Had';

        // Badge Logic
        let statusBadge = '';
        if (isUpcoming) statusBadge = `<span class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"><i class="ph-fill ph-clock"></i> Akan Datang</span>`;
        else if (isSoldOut) statusBadge = `<span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Habis Stok</span>`;
        else if (percentClaimed > 80) statusBadge = `<span class="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase animate-pulse flex items-center gap-1"><i class="ph-fill ph-fire"></i> Laju!</span>`;
        else statusBadge = `<span class="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Sedang Aktif</span>`;

        // Button Logic
        let btnHtml = '';
        if (hasUserClaimed) {
            btnHtml = `<button disabled class="w-full bg-green-900/20 border border-green-500/30 text-green-400 font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-not-allowed"><i class="ph-fill ph-check-circle"></i> ANDA DAH TEBUS</button>`;
        } else if (isUpcoming) {
            // Countdown Placeholder
            btnHtml = `<button disabled id="btn-timer-${drop.id}" class="w-full bg-gray-800 border border-gray-700 text-gray-400 font-bold py-3.5 rounded-xl text-xs font-mono cursor-not-allowed">BERMULA SEBENTAR LAGI</button>`;
            startCountdown(drop.id, startTime);
        } else if (isSoldOut) {
            btnHtml = `<button disabled class="w-full bg-red-900/10 border border-red-500/20 text-red-500 font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-not-allowed opacity-70">KEHABISAN STOK</button>`;
        } else {
            btnHtml = `
            <button onclick="claimDrop('${drop.id}')" id="btn-claim-${drop.id}" class="group relative w-full overflow-hidden rounded-xl bg-yellow-400 py-3.5 transition-all active:scale-95 shadow-lg shadow-yellow-400/10">
                <div class="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]"></div>
                <span class="relative flex items-center justify-center gap-2 text-xs font-black text-black uppercase tracking-wide">
                    TEBUS SEKARANG <i class="ph-bold ph-hand-grabbing"></i>
                </span>
            </button>`;
        }

        return `
        <div class="drop-card rounded-2xl p-5 ${isSoldOut ? 'opacity-80 grayscale-[0.5]' : 'shine-effect'} animate-up">
            
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-4">
                    <div class="relative w-14 h-14 shrink-0">
                         <div class="absolute inset-0 bg-yellow-400/20 rounded-xl rotate-6"></div>
                         <div class="absolute inset-0 bg-[#27272a] border border-white/10 rounded-xl flex flex-col items-center justify-center z-10">
                            <span class="text-[9px] text-gray-500 uppercase font-bold">DISKAUN</span>
                            <span class="text-lg font-black text-white leading-none">${discountText}</span>
                         </div>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <h3 class="font-bold text-white text-base">${drop.title}</h3>
                            ${statusBadge}
                        </div>
                        <p class="text-[11px] text-gray-400 leading-tight line-clamp-2 max-w-[250px]">${drop.description || 'Diskaun khas.'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[9px] text-gray-500 uppercase font-bold mb-0.5">SAH UNTUK</div>
                    <span class="bg-white/10 border border-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase">${drop.valid_for_service}</span>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-2 bg-black/40 border border-white/5 rounded-xl p-3 mb-4">
                <div class="flex flex-col border-r border-white/5 pr-2">
                    <span class="text-[9px] text-gray-500 font-bold uppercase mb-0.5">Min. Belanja</span>
                    <span class="text-white font-mono font-bold text-xs">RM ${drop.min_spend}</span>
                </div>
                <div class="flex flex-col border-r border-white/5 px-2">
                    <span class="text-[9px] text-gray-500 font-bold uppercase mb-0.5">Max Cap</span>
                    <span class="text-yellow-400 font-mono font-bold text-xs">${maxSpendText}</span>
                </div>
                <div class="flex flex-col text-right pl-2">
                     <span class="text-[9px] text-gray-500 font-bold uppercase mb-0.5">Stok Drop</span>
                     <span class="text-white font-mono font-bold text-xs">${claimedCount} / ${totalQty}</span>
                </div>
            </div>

            <div class="mb-5">
                <div class="flex justify-between text-[9px] text-gray-500 font-bold mb-1 uppercase">
                    <span>Progress Penebusan</span>
                    <span>${percentClaimed}%</span>
                </div>
                <div class="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full ${percentClaimed > 80 ? 'bg-orange-500' : 'bg-yellow-400'} rounded-full transition-all duration-700" style="width: ${percentClaimed}%"></div>
                </div>
            </div>

            ${btnHtml}
            
            <p class="text-[9px] text-gray-600 text-center mt-3 font-medium">
                ${isUpcoming ? '*Tunggu masa mula untuk menebus.' : '*Baucar akan luput 24 jam selepas ditebus.'}
            </p>
        </div>
        `;
    }).join('');
}

// --- 4. Countdown Timer Logic ---
function startCountdown(elementId, targetDate) {
    const updateTimer = () => {
        const btn = document.getElementById(`btn-timer-${elementId}`);
        if (!btn) return;

        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            // Masa dah sampai! Reload page untuk enable button
            btn.innerHTML = "MEMUATKAN...";
            setTimeout(() => loadDrops(), 1000);
            return;
        }

        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        btn.innerHTML = `<i class="ph-bold ph-timer"></i> MULA DALAM: ${hours}j ${minutes}m ${seconds}s`;
    };

    updateTimer(); // Run immediately
    const interval = setInterval(updateTimer, 1000);
    timers.push(interval);
}

// --- 5. Claim Logic (Secure) ---
async function claimDrop(dropId) {
    if (!currentUser) {
        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('login-modal').classList.add('flex');
        return;
    }

    if (isClaiming) return;

    const btn = document.getElementById(`btn-claim-${dropId}`);
    const originalContent = btn.innerHTML;
    
    // UI Loading
    btn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg"></i> Memproses...`;
    btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-not-allowed');
    isClaiming = true;

    try {
        const { data, error } = await supabaseClient.rpc('claim_voucher_drop', {
            p_drop_id: dropId,
            p_user_id: currentUser.id
        });

        if (error) throw error;

        if (data.success) {
            showToast(`🎉 Berjaya! Kod Baucar: ${data.code}`, 'success');
            
            // Success Button State
            btn.className = "w-full bg-green-600 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2";
            btn.innerHTML = `<i class="ph-fill ph-check"></i> BERJAYA DITEBUS`;
            
            // Reload to update visual stock
            setTimeout(() => loadDrops(), 2000);

        } else {
            showToast(data.message, 'error');
            
            // Reset button if error is recoverable
            if (data.message.includes('habis') || data.message.includes('had')) {
                loadDrops(); // Refresh data to show sold out state
            } else {
                btn.innerHTML = originalContent;
                btn.disabled = false;
                btn.classList.remove('opacity-70', 'cursor-not-allowed');
            }
        }

    } catch (err) {
        console.error("Claim Error:", err);
        showToast("Ralat sambungan. Sila cuba lagi.", 'error');
        btn.innerHTML = originalContent;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    } finally {
        isClaiming = false;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let bgClass = type === 'success' ? 'bg-green-900/95 border-green-500' : 
                  (type === 'error' ? 'bg-red-900/95 border-red-500' : 'bg-[#18181b] border-gray-600');
    
    let icon = type === 'success' ? 'ph-check-circle-fill text-green-400' : 
               (type === 'error' ? 'ph-warning-circle-fill text-red-400' : 'ph-info text-blue-400');

    toast.className = `p-4 rounded-xl border flex items-center gap-3 animate-up backdrop-blur-md shadow-lg text-white ${bgClass}`;
    toast.innerHTML = `
        <i class="ph ${icon} text-xl shrink-0"></i>
        <span class="text-xs font-bold leading-tight tracking-wide">${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}