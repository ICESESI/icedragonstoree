const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let allProducts = [];
let dbMaintenanceStatus = {};

// TOAST NOTIFICATION FUNCTION
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `p-4 rounded-xl shadow-lg border flex items-center gap-3 animate-up ${
        type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 
        type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 
        'bg-[#18181b] border-gray-700 text-white'
    }`;
    
    let icon = 'info';
    if(type === 'success') icon = 'check-circle';
    if(type === 'error') icon = 'warning-circle';

    toast.innerHTML = `<i class="ph ph-${icon} text-xl"></i> <span class="text-xs font-bold">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

window.onload = async () => {
    await checkAdminAccess();
};

async function checkAdminAccess() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html'; 
        return;
    }

    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
    
    if (!profile || profile.role !== 'admin') {
        document.getElementById('unauthorized-msg').classList.remove('hidden');
        return;
    }

    // If Admin, show content and load data
    document.getElementById('admin-content').classList.remove('hidden');
    
    // Auto Cleanup Background Process
    autoSystemCleanup();

    // Load Data
    await loadProducts();
    await loadMaintenanceStatus();
    loadAdminData();
    renderAdminMaintenance();
    loadAnalytics();
    loadAdminPinHistory();
    loadVouchers(); 
}

// --- AUTO CLEANUP SYSTEM ---
async function autoSystemCleanup() {
    console.log("Running Auto Cleanup System...");
    const dateThreshold = new Date();
    dateThreshold.setMonth(dateThreshold.getMonth() - 1);
    const isoDate = dateThreshold.toISOString();

    try {
        const { error: txError } = await supabaseClient.from('transactions').delete().eq('status', 'success').lt('created_at', isoDate);
        if (txError) console.error("Error cleaning transactions:", txError);
        
        const { error: pinError } = await supabaseClient.from('wallet_pins').delete().eq('is_used', true).lt('created_at', isoDate);
        if (pinError) console.error("Error cleaning pins:", pinError);
    } catch (err) {
        console.error("Cleanup failed:", err);
    }
}

async function loadProducts() {
    const { data } = await supabaseClient.from('products').select('*');
    if (data) allProducts = data;
}

async function loadMaintenanceStatus() {
    const { data } = await supabaseClient.from('game_status').select('*');
    if (data) {
        data.forEach(item => {
            dbMaintenanceStatus[item.game_name] = { is_offline: item.is_offline, message: item.message || "Sedang Diselenggara" };
        });
    }
}

// --- MAIN ADMIN DATA LOADING (UPDATED FOR PAYMENT METHODS & QUANTITY) ---
async function loadAdminData() {
    const { data } = await supabaseClient.from('transactions').select('*').eq('status', 'pending').order('created_at', {ascending: false});
    const list = document.getElementById('admin-tx-list');
    const badge = document.getElementById('pending-count');
    
    if(!data || data.length === 0) {
        list.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500 text-sm"><i class="ph ph-check-circle text-4xl mb-2 opacity-30"></i>Semua Clear!</div>';
        badge.innerText = '0'; badge.className = "text-[10px] bg-gray-700 text-white px-2 rounded-full";
        return;
    }

    badge.innerText = data.length; badge.className = "text-[10px] bg-red-500 text-white px-2 rounded-full animate-pulse";

    list.innerHTML = data.map(t => {
        // Tentukan Badge & Warna ikut Payment Method
        let methodBadge = '';
        let detailsDisplay = '';
        let method = t.payment_method || 'wallet';
        
        // Handle Quantity (Default to 1 if null)
        const qty = t.quantity || 1;

        if (method === 'wallet') {
            methodBadge = `<span class="bg-green-900/50 text-green-400 border border-green-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">WALLET</span>`;
        } else if (method === 'digi_pin') {
            methodBadge = `<span class="bg-yellow-900/50 text-yellow-400 border border-yellow-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">DIGI PIN</span>`;
        } else if (method === 'tng_pin') {
            methodBadge = `<span class="bg-blue-900/50 text-blue-400 border border-blue-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">TnG PIN</span>`;
        } else if (method === 'bank_qr') {
            methodBadge = `<span class="bg-pink-900/50 text-pink-400 border border-pink-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">QR / TRF</span>`;
        }

        // Paparan Butiran (PIN / Receipt Ref)
        if (method !== 'wallet' && t.payment_details) {
            detailsDisplay = `
            <div class="mt-2 bg-black/40 p-2 rounded border border-white/5 flex justify-between items-center group">
                <div>
                    <div class="text-[9px] text-gray-500 uppercase font-bold">Bukti / PIN:</div>
                    <div class="text-xs font-mono font-bold text-white select-all break-all">${t.payment_details}</div>
                </div>
                <button onclick="navigator.clipboard.writeText('${t.payment_details}'); showToast('Disalin!', 'success')" class="text-gray-500 hover:text-white transition px-2"><i class="ph ph-copy"></i></button>
            </div>`;
        }

        // Logic butang Reject/Refund
        // Note: kita hantar method ke function reject untuk tahu perlu refund wallet atau tak
        return `
        <div class="bg-[#1e1f24] p-4 rounded-xl border border-gray-700 hover:border-yellow-400 transition shadow-sm">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    ${methodBadge}
                    <span class="text-[10px] text-gray-500">#${t.id}</span>
                </div>
                <div class="text-xs text-gray-400">${new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
            
            <div class="mb-3">
                <div class="font-bold text-white text-sm flex items-center">
                    ${t.item_name}
                    <span class="bg-white/10 text-yellow-400 px-2 py-0.5 rounded text-[10px] ml-2 border border-yellow-400/20 shadow-sm font-mono">x${qty}</span>
                </div>
                <div class="flex items-center gap-2 mt-1">
                    <div class="text-xs text-yellow-400 font-mono bg-yellow-400/10 px-2 py-0.5 rounded select-all border border-yellow-400/20">${t.game_id_input}</div>
                    <div class="text-sm font-bold text-white">RM ${t.amount.toFixed(2)}</div>
                </div>
                ${detailsDisplay}
            </div>

            <div class="grid grid-cols-2 gap-2">
                <button onclick="approveTx(${t.id})" class="bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-green-900/20">LULUS (DONE)</button>
                <button onclick="rejectOrder(${t.id}, ${t.amount}, '${t.user_id}', '${method}')" class="bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 py-2 rounded-lg text-xs font-bold transition">REJECT / REFUND</button>
            </div>
        </div>
    `}).join('');
}

// --- ACTION FUNCTIONS ---

async function approveTx(id) { 
    if(!confirm("Sahkan order ini selesai? Pastikan item telah dihantar.")) return;
    
    const { error } = await supabaseClient.from('transactions').update({ status: 'success' }).eq('id', id); 
    
    if (error) {
        showToast("Error update status", "error");
    } else {
        showToast("Order Diluluskan!", "success");
        loadAdminData(); 
        // Update sales chart live (optional, requires reload usually)
    }
}

// Updated Reject Function: Handles both Wallet Refund and Manual Rejection
async function rejectOrder(txId, amount, userId, method) {
    const reason = prompt("Sebab Reject/Refund? (cth: ID Salah / PIN Invalid)");
    if(!reason) return;

    try {
        let notifMsg = "";

        // SCENARIO 1: WALLET PAYMENT -> PERLU REFUND DUIT
        if (method === 'wallet') {
            const { data: profile } = await supabaseClient.from('profiles').select('wallet_balance').eq('id', userId).single();
            if(profile) {
                const newBalance = profile.wallet_balance + amount;
                await supabaseClient.from('profiles').update({ wallet_balance: newBalance }).eq('id', userId);
                notifMsg = `Order dibatalkan: ${reason}. RM${amount.toFixed(2)} dikembalikan ke wallet.`;
            }
        } 
        // SCENARIO 2: MANUAL PAYMENT -> TAK PERLU REFUND (Sebab belum tolak wallet atau bukti palsu)
        else {
            notifMsg = `Order dibatalkan: ${reason}. Sila semak semula bukti pembayaran anda.`;
        }

        // Update Transaction Status
        await supabaseClient.from('transactions').update({ status: 'canceled', admin_note: reason }).eq('id', txId);
        
        // Notify User
        await supabaseClient.from('notifications').insert({
            user_id: userId, title: 'Order Dibatalkan', message: notifMsg, type: 'refund' // Reuse 'refund' type logic/icon
        });

        showToast("Order Ditolak/Refund Berjaya", "success");
        loadAdminData();

    } catch (err) {
        console.error(err);
        showToast("Ralat memproses refund/reject.", "error");
    }
}

// --- OTHER ADMIN FEATURES (UNCHANGED) ---

async function loadAnalytics() {
    const { data } = await supabaseClient.from('transactions').select('created_at, amount').eq('status', 'success');
    if (!data) return;
    const salesByDate = {};
    data.forEach(t => {
        const date = new Date(t.created_at).toLocaleDateString();
        salesByDate[date] = (salesByDate[date] || 0) + t.amount;
    });
    const ctx = document.getElementById('salesChart');
    if (ctx) {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: Object.keys(salesByDate),
                datasets: [{ 
                    label: 'Jualan (RM)', 
                    data: Object.values(salesByDate), 
                    borderColor: '#22c55e', 
                    backgroundColor: 'rgba(34, 197, 94, 0.1)', 
                    borderWidth: 3, 
                    pointBackgroundColor: '#22c55e',
                    fill: true, 
                    tension: 0.4 
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { labels: { color: 'white' } } }, 
                scales: { 
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }, 
                    x: { grid: { display: false }, ticks: { color: '#9ca3af' } } 
                } 
            }
        });
    }
}

async function addProduct() {
    const gameName = document.getElementById('add-game-name').value;
    const itemName = document.getElementById('add-item-name').value;
    const price = parseFloat(document.getElementById('add-price').value);
    const originalPrice = document.getElementById('add-original-price').value ? parseFloat(document.getElementById('add-original-price').value) : null;
    const imgUrl = document.getElementById('add-img-url').value || "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670";

    if(!gameName || !itemName || !price) return showToast("Isi semua maklumat!", "error");

    const { error } = await supabaseClient.from('products').insert({
        game_name: gameName, item_name: itemName, price: price, original_price: originalPrice, image_url: imgUrl
    });

    if (error) showToast("Error: " + error.message, "error");
    else {
        showToast("Produk ditambah!", "success");
        loadProducts(); 
        document.getElementById('add-game-name').value = '';
        document.getElementById('add-item-name').value = '';
        document.getElementById('add-price').value = '';
    }
}

async function loadAdminPinHistory() {
    const { data } = await supabaseClient.from('wallet_pins').select('*').order('created_at', { ascending: false });
    const list = document.getElementById('admin-pin-list');
    
    if (!data || data.length === 0) { list.innerHTML = '<p class="text-gray-500 text-xs">Tiada rekod.</p>'; return; }
    
    list.innerHTML = data.map(p => {
        const color = p.is_used ? 'text-gray-500' : 'text-green-400';
        const text = p.is_used ? 'DITEBUS' : 'AKTIF';
        return `
        <div class="flex justify-between items-center bg-[#1e1f24] p-2 rounded mb-1 text-xs border border-gray-800">
            <div>
                <span class="font-mono font-bold text-white select-all">${p.pin_code}</span>
                <span class="text-gray-500 ml-2">RM${p.amount}</span>
            </div>
            <span class="${color} font-bold">${text}</span>
        </div>
    `}).join('');
}

async function rewardWeeklyWinner() {
    if(!confirm("Beri RM10 kepada pemenang?")) return;
    const { data } = await supabaseClient.rpc('get_weekly_leaderboard');
    if(data && data.length > 0) {
        const winner = data[0];
        const { data: userProfile } = await supabaseClient.from('profiles').select('*').eq('email', winner.email).single();
        if(userProfile) {
            await supabaseClient.from('profiles').update({ wallet_balance: userProfile.wallet_balance + 10 }).eq('id', userProfile.id);
            await supabaseClient.from('notifications').insert({ user_id: userProfile.id, title: 'Tahniah Juara!', message: 'Anda menang RM10 Reward Mingguan!', type: 'reward' });
            showToast(`Reward dihantar kepada ${winner.email}`, "success");
        }
    } else { showToast("Tiada pemenang.", "error"); }
}

function renderAdminMaintenance() {
    const uniqueGames = [...new Set(allProducts.map(item => item.game_name))];
    const div = document.getElementById('admin-game-status');
    div.innerHTML = uniqueGames.map(game => {
        const status = dbMaintenanceStatus[game] || { is_offline: false, message: '' };
        return `
            <div class="bg-black p-3 rounded-xl border ${status.is_offline ? 'border-red-500' : 'border-green-500'} flex items-center justify-between">
                <div class="text-xs font-bold text-white">${game}</div>
                <div class="flex gap-2">
                    <input type="text" id="maint-msg-${game}" value="${status.message}" class="w-20 text-[10px] bg-[#18181b] p-1 rounded text-white border border-gray-700">
                    <button onclick="toggleMaintenanceDB('${game}', ${!status.is_offline})" class="px-3 py-1 text-[10px] font-bold rounded ${status.is_offline ? 'bg-red-500' : 'bg-green-500'} text-black min-w-[50px]">
                        ${status.is_offline ? 'OFF' : 'ON'}
                    </button>
                </div>
            </div>`;
    }).join('');
}

async function toggleMaintenanceDB(gameName, newStatus) {
    const msg = document.getElementById(`maint-msg-${gameName}`).value || "Maintenance";
    const { error } = await supabaseClient.from('game_status').upsert({ game_name: gameName, is_offline: newStatus, message: msg }, { onConflict: 'game_name' });
    if (!error) {
        dbMaintenanceStatus[gameName] = { is_offline: newStatus, message: msg };
        renderAdminMaintenance(); 
        showToast(`Status ${gameName} dikemaskini`, "success");
    }
}

async function generatePin() {
    const amt = parseFloat(document.getElementById('gen-amount').value);
    if (!amt || amt <= 0) return showToast("Masukkan jumlah valid", "error");

    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { error } = await supabaseClient.from('wallet_pins').insert({ pin_code: code, amount: amt, is_used: false });

    if (error) showToast("Gagal generate PIN", "error");
    else {
        showToast(`PIN: ${code} (RM${amt})`, "success");
        document.getElementById('gen-amount').value = '';
        loadAdminPinHistory();
    }
}

async function createVoucher() {
    const code = document.getElementById('v-code').value.toUpperCase().trim();
    const description = document.getElementById('v-desc').value;
    const type = document.getElementById('v-type').value;
    const value = parseFloat(document.getElementById('v-value').value);
    const minSpend = parseFloat(document.getElementById('v-min').value) || 0;
    const maxSpend = parseFloat(document.getElementById('v-max').value) || 999999;
    const limit = parseInt(document.getElementById('v-limit').value) || 100;
    const service = document.getElementById('v-service').value.trim() || 'all';
    const endDateVal = document.getElementById('v-date').value;

    if (!code || !value || !endDateVal) return showToast("Sila isi Kod, Nilai & Tarikh Luput!", "error");

    const { error } = await supabaseClient.from('vouchers').insert({
        code: code, description: description, discount_type: type, discount_value: value,
        min_spend: minSpend, max_spend: maxSpend, usage_limit: limit, valid_for_service: service,
        end_date: new Date(endDateVal).toISOString()
    });

    if (error) showToast(error.message, "error");
    else {
        showToast("Baucar berjaya dicipta!", "success");
        document.getElementById('v-code').value = ''; document.getElementById('v-desc').value = '';
        document.getElementById('v-value').value = ''; loadVouchers();
    }
}

async function loadVouchers() {
    const { data } = await supabaseClient.from('vouchers').select('*').order('created_at', { ascending: false });
    const list = document.getElementById('admin-voucher-list');
    
    if (!data || data.length === 0) { list.innerHTML = '<p class="text-gray-500 text-xs text-center mt-4">Tiada baucar aktif.</p>'; return; }

    list.innerHTML = data.map(v => {
        const usedPercent = Math.round((v.usage_count / v.usage_limit) * 100);
        const isExpired = new Date() > new Date(v.end_date);
        return `
        <div class="bg-[#1e1f24] p-3 rounded-xl border border-gray-700 relative group overflow-hidden">
            <div class="flex justify-between items-start">
                <div>
                    <div class="font-black text-sm text-white font-mono tracking-wider">${v.code}</div>
                    <div class="text-[10px] text-gray-400 mt-0.5">${v.description || 'Tiada deskripsi'}</div>
                </div>
                <button onclick="deleteVoucher(${v.id})" class="text-gray-600 hover:text-red-500 p-1"><i class="ph ph-trash"></i></button>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2 text-[9px] uppercase font-bold text-gray-500">
                <div>DISKAUN: <span class="text-white">${v.discount_type === 'percentage' ? v.discount_value + '%' : 'RM'+v.discount_value}</span></div>
                <div>GAME: <span class="text-white">${v.valid_for_service}</span></div>
            </div>
            <div class="mt-2 flex items-center gap-2">
                <div class="flex-grow h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-cyan-400" style="width: ${usedPercent}%"></div>
                </div>
                <div class="text-[9px] font-bold text-gray-400 whitespace-nowrap">${v.usage_count} / ${v.usage_limit}</div>
            </div>
            ${isExpired ? '<div class="absolute top-0 right-0 bg-red-600 text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg">EXPIRED</div>' : ''}
        </div>`;
    }).join('');
}

async function deleteVoucher(id) {
    if(!confirm("Padam baucar ini?")) return;
    const { error } = await supabaseClient.from('vouchers').delete().eq('id', id);
    if(error) showToast("Gagal padam", "error");
    else { showToast("Baucar dipadam", "success"); loadVouchers(); }
}

function toggleNotifInput() {
    const target = document.getElementById('notif-target').value;
    const emailInput = document.getElementById('notif-email');
    if (target === 'specific') emailInput.classList.remove('hidden');
    else emailInput.classList.add('hidden');
}

async function sendNotification() {
    const target = document.getElementById('notif-target').value;
    const email = document.getElementById('notif-email').value;
    const type = document.getElementById('notif-type').value;
    const title = document.getElementById('notif-title').value;
    const message = document.getElementById('notif-msg').value;
    const link = document.getElementById('notif-link').value.trim(); 

    if(!title || !message) return showToast("Sila isi Tajuk dan Mesej!", "error");

    const btn = document.querySelector('button[onclick="sendNotification()"]');
    btn.innerHTML = 'Sending...'; btn.disabled = true;

    try {
        let notificationsToInsert = [];
        let payload = { title, message, type };
        if(link) payload.action_url = link; 

        if (target === 'specific') {
            if(!email) throw new Error("Sila masukkan email pengguna.");
            const { data: user } = await supabaseClient.from('profiles').select('id').eq('email', email).single();
            if(!user) throw new Error("Email tidak dijumpai.");
            payload.user_id = user.id;
            notificationsToInsert.push(payload);
        } else {
            const { data: users } = await supabaseClient.from('profiles').select('id');
            if(users) {
                notificationsToInsert = users.map(u => ({ user_id: u.id, ...payload }));
            }
        }

        if(notificationsToInsert.length > 0) {
            const { error } = await supabaseClient.from('notifications').insert(notificationsToInsert);
            if(error) throw error;
            showToast(`Berjaya hantar kepada ${notificationsToInsert.length} pengguna.`, "success");
            document.getElementById('notif-title').value = '';
            document.getElementById('notif-msg').value = '';
            document.getElementById('notif-email').value = '';
            document.getElementById('notif-link').value = '';
        } else {
            showToast("Tiada pengguna untuk dihantar.", "error");
        }

    } catch (err) {
        showToast(err.message, "error");
    } finally {
        btn.innerHTML = '<i class="ph ph-paper-plane-right"></i> HANTAR NOTIFIKASI'; btn.disabled = false;
    }
}