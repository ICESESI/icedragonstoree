const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let allProducts = [];
let allTransactions = []; // VARIABLE BARU UNTUK CARIAN
let dbMaintenanceStatus = {};
let editingProductId = null; 

// --- UTILITIES ---
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

// --- INIT ---
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

    document.getElementById('admin-content').classList.remove('hidden');
    autoSystemCleanup();
    await loadProducts();
    await loadMaintenanceStatus();
    loadAdminData(); // Load transactions
    renderAdminMaintenance();
    loadPaymentSettings();
    loadAnalytics();
    loadAdminPinHistory();
    loadVouchers(); 
    loadAdminBanners(); // LOAD BANNER
}

async function autoSystemCleanup() {
    const dateThreshold = new Date();
    dateThreshold.setMonth(dateThreshold.getMonth() - 1);
    try {
        await supabaseClient.from('transactions').delete()
            .neq('status', 'pending')
            .neq('status', 'processing')
            .lt('created_at', dateThreshold.toISOString());
    } catch (err) {
        console.error("Cleanup error", err);
    }
}

// --- TRANSACTION MANAGEMENT (UPDATED) ---
async function loadAdminData() {
    const { data } = await supabaseClient
        .from('transactions')
        .select('*')
        .in('status', ['pending', 'processing']) 
        .order('created_at', {ascending: true}); 

    allTransactions = data || []; // Simpan data untuk filtering
    renderTransactions(allTransactions);
    updateTransactionCount(allTransactions.length);
}

function updateTransactionCount(count) {
    const badge = document.getElementById('pending-count');
    badge.innerText = count; 
    if(count === 0) {
        badge.className = "text-[10px] bg-gray-700 text-white px-2 rounded-full";
    } else {
        badge.className = "text-[10px] bg-red-500 text-white px-2 rounded-full animate-pulse";
    }
}

// --- FUNGSI BARU: RENDER LIST ---
function renderTransactions(transactions) {
    const list = document.getElementById('admin-tx-list');
    
    if(!transactions || transactions.length === 0) {
        list.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500 text-sm"><i class="ph ph-check-circle text-4xl mb-2 opacity-30"></i>Semua Clear!</div>';
        return;
    }

    list.innerHTML = transactions.map(t => {
        const method = t.payment_method || 'wallet';
        const qty = t.quantity || 1;
        const itemPrice = t.amount; 
        const fee = t.fee_amount || 0;
        const totalPaid = t.total_paid || (itemPrice + fee);
        
        // --- LOGIK ID BARU: Guna order_id jika ada, jika tidak guna #ID lama ---
        const displayId = t.order_id || `#${t.id}`;
        
        let methodBadge = '';
        if (method === 'wallet') methodBadge = `<span class="bg-green-900/50 text-green-400 border border-green-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">WALLET</span>`;
        else if (method.includes('qr') || method === 'bank') methodBadge = `<span class="bg-pink-900/50 text-pink-400 border border-pink-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">QR/BANK</span>`;
        else methodBadge = `<span class="bg-blue-900/50 text-blue-400 border border-blue-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">${method}</span>`;

        let promoBadge = t.is_promo ? `<span class="bg-gradient-to-r from-red-600 to-orange-500 text-white border border-red-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase ml-1"><i class="ph-fill ph-fire"></i></span>` : '';

        // Status Specific UI
        let statusDisplay = '';
        let actionButtons = '';

        // Pass displayId (TRX-...) ke fungsi reject supaya mesej nampak cantik
        if (t.status === 'pending') {
            statusDisplay = `<span class="text-yellow-400 text-[10px] font-bold uppercase border border-yellow-500/30 px-2 rounded">MENUNGGU</span>`;
            
            actionButtons = `
                <button onclick="setStatusProcessing(${t.id})" class="col-span-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">
                    <i class="ph-bold ph-gear"></i> MULA PROSES (LOCK)
                </button>
                <button onclick="rejectOrder(${t.id}, '${displayId}', ${totalPaid}, '${t.user_id}', '${method}', true)" class="bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 py-2 rounded-lg text-xs font-bold transition">REFUND</button>
                <button onclick="rejectOrder(${t.id}, '${displayId}', ${totalPaid}, '${t.user_id}', '${method}', false)" class="bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 py-2 rounded-lg text-xs font-bold transition">SCAM</button>
            `;
        } else if (t.status === 'processing') {
            statusDisplay = `<span class="text-blue-400 text-[10px] font-bold uppercase border border-blue-500/30 px-2 rounded animate-pulse flex items-center gap-1"><i class="ph-bold ph-gear animate-spin"></i> DIPROSES</span>`;
            
            actionButtons = `
                <button onclick="approveTx(${t.id})" class="col-span-2 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-green-900/20 flex items-center justify-center gap-2">
                    <i class="ph-bold ph-check"></i> SIAP / HANTAR
                </button>
                <button onclick="rejectOrder(${t.id}, '${displayId}', ${totalPaid}, '${t.user_id}', '${method}', true)" class="col-span-2 bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 py-2 rounded-lg text-xs font-bold transition opacity-70 hover:opacity-100">BATAL & REFUND (EMERGENCY)</button>
            `;
        }

        let detailsDisplay = '';
        if (method !== 'wallet' && t.payment_details) {
            detailsDisplay = `
            <div class="mt-2 bg-black/40 p-2 rounded border border-white/5 flex justify-between items-center group">
                <div><div class="text-[9px] text-gray-500 uppercase font-bold">Bukti / PIN:</div><div class="text-xs font-mono font-bold text-white select-all break-all">${t.payment_details}</div></div>
                <button onclick="navigator.clipboard.writeText('${t.payment_details}'); showToast('Disalin!', 'success')" class="text-gray-500 hover:text-white transition px-2"><i class="ph ph-copy"></i></button>
            </div>`;
        }

        const borderClass = t.status === 'processing' ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'border-gray-700 hover:border-yellow-400';

        return `
        <div class="bg-[#1e1f24] p-4 rounded-xl border ${borderClass} transition shadow-sm mb-3 relative overflow-hidden">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    ${methodBadge} ${statusDisplay} ${promoBadge}
                </div>
                <div class="text-[10px] text-gray-500 cursor-pointer hover:text-white" onclick="navigator.clipboard.writeText('${displayId}'); showToast('ID Disalin!', 'success')">${displayId}</div>
            </div>
            
            <div class="mb-3">
                <div class="font-bold text-white text-sm flex items-center">
                    ${t.item_name}
                    <span class="bg-white/10 text-yellow-400 px-2 py-0.5 rounded text-[10px] ml-2 border border-yellow-400/20 shadow-sm font-mono">x${qty}</span>
                </div>
                <div class="flex flex-col mt-1">
                    <div class="text-xs text-yellow-400 font-mono bg-yellow-400/10 px-2 py-0.5 rounded select-all border border-yellow-400/20 w-fit mb-1">${t.game_id_input}</div>
                    <div class="text-xs font-bold text-gray-400">Total Paid: RM${totalPaid.toFixed(2)}</div>
                </div>
                ${detailsDisplay}
            </div>

            <div class="grid grid-cols-2 gap-2">
                ${actionButtons}
            </div>
        </div>
    `}).join('');
}

// --- FUNGSI CARIAN (FILTERING) ---
function filterTransactions() {
    const term = document.getElementById('tx-search').value.toLowerCase();
    
    if(!term) {
        renderTransactions(allTransactions);
        return;
    }

    const filtered = allTransactions.filter(t => {
        const orderIdStr = t.order_id ? t.order_id.toLowerCase() : '';
        const legacyIdStr = String(t.id);
        const gameIdStr = t.game_id_input ? t.game_id_input.toLowerCase() : '';
        const itemNameStr = t.item_name ? t.item_name.toLowerCase() : '';

        return orderIdStr.includes(term) || 
               legacyIdStr.includes(term) || 
               gameIdStr.includes(term) ||
               itemNameStr.includes(term);
    });

    renderTransactions(filtered);
}

// 1. SET STATUS TO PROCESSING (User cannot cancel anymore)
async function setStatusProcessing(id) {
    const { error } = await supabaseClient
        .from('transactions')
        .update({ status: 'processing' })
        .eq('id', id);
    
    if (error) {
        showToast("Gagal update status: " + error.message, "error");
    } else {
        showToast("Status: Processing. User locked.", "success");
        loadAdminData(); 
    }
}

// 2. APPROVE (DONE)
async function approveTx(id) { 
    if(!confirm("Sahkan order ini selesai? Pastikan item telah dihantar.")) return;
    
    const { error } = await supabaseClient
        .from('transactions')
        .update({ status: 'success' })
        .eq('id', id); 
    
    if (error) {
        showToast("Error update status", "error");
    } else { 
        showToast("Order Diluluskan & Selesai!", "success"); 
        loadAdminData(); 
    }
}

// 3. REJECT / REFUND LOGIC
async function rejectOrder(txId, displayId, totalRefundAmount, userId, method, shouldRefund) {
    const actionType = shouldRefund ? "REFUND" : "BATAL/SCAM (NO REFUND)";
    const reason = prompt(`Sebab ${actionType} untuk Order ${displayId}? (Wajib isi)`);
    if(!reason) return;

    try {
        let notifMsg = "";
        
        if (shouldRefund && method === 'wallet') {
            const { data: profile } = await supabaseClient.from('profiles').select('wallet_balance').eq('id', userId).single();
            if(profile) {
                const newBalance = profile.wallet_balance + totalRefundAmount;
                await supabaseClient.from('profiles').update({ wallet_balance: newBalance }).eq('id', userId);
                notifMsg = `Order ${displayId} dibatalkan: ${reason}. RM${totalRefundAmount.toFixed(2)} dikembalikan ke wallet.`;
            }
        } 
        else {
            notifMsg = `Order ${displayId} dibatalkan: ${reason}.`;
            if(shouldRefund && method !== 'wallet') {
                notifMsg += " (Sila hubungi admin untuk urusan refund manual).";
            }
        }

        await supabaseClient.from('transactions').update({ status: 'canceled', admin_note: reason }).eq('id', txId);
        
        await supabaseClient.from('notifications').insert({ 
            user_id: userId, 
            title: shouldRefund ? 'Order Dibatalkan (Refund)' : 'Order Dibatalkan (Amaran)', 
            message: notifMsg, 
            type: shouldRefund ? 'info' : 'security' 
        });

        showToast(`Order ${actionType} Berjaya`, "success");
        loadAdminData();
    } catch (err) {
        console.error(err);
        showToast("Ralat memproses refund/reject.", "error");
    }
}

// --- PRODUCT MANAGEMENT ---
async function loadProducts() {
    const { data } = await supabaseClient.from('products').select('*').order('game_name', {ascending: true});
    if (data) {
        allProducts = data;
        renderProductManager(); 
        renderCategorySuggestions(); 
        populateBulkGameOptions(); 
    }
}

function renderProductManager() {
    const list = document.getElementById('admin-product-list');
    list.innerHTML = allProducts.map(p => {
        const displayImage = p.item_image || p.image_url;
        
        // --- LOGIK STOCK LABEL ---
        let stockLabel = '<span class="text-[8px] bg-green-500/20 text-green-400 px-1 rounded border border-green-500/30">UNLIMITED</span>';
        if(p.stock !== null) {
            const color = p.stock < 10 ? 'text-red-400 bg-red-500/20 border-red-500/30' : 'text-blue-400 bg-blue-500/20 border-blue-500/30';
            const text = p.stock <= 0 ? 'HABIS' : `${p.stock} UNIT`;
            stockLabel = `<span class="text-[8px] ${color} px-1 rounded border">${text}</span>`;
        }

        return `
        <div onclick="editProduct(${p.id})" class="product-item cursor-pointer flex items-center justify-between bg-[#1e1f24] p-2 rounded-lg border border-gray-800 transition group mb-1" id="prod-item-${p.id}">
            <div class="flex items-center gap-2">
                <img src="${displayImage}" class="w-8 h-8 rounded bg-black object-cover">
                <div>
                    <div class="text-[10px] font-bold text-white leading-none">${p.game_name}</div>
                    <div class="text-[9px] text-gray-400">${p.item_name}</div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-[10px] font-mono font-bold text-purple-400">RM${p.price.toFixed(2)}</div>
                <div class="flex justify-end gap-1 mt-0.5">
                    ${stockLabel}
                    ${p.is_promo ? '<span class="text-[8px] bg-red-500 text-white px-1 rounded">PROMO</span>' : ''}
                </div>
            </div>
        </div>
    `}).join('');
}

function renderCategorySuggestions() {
    const container = document.getElementById('category-suggestions');
    if(!container) return;
    const categories = [...new Set(allProducts.map(p => p.category || 'Diamond'))].filter(c => c);
    
    if(categories.length === 0) {
        container.innerHTML = '<span class="text-[9px] text-gray-500">Tiada kategori. Taip baru.</span>';
        return;
    }

    container.innerHTML = categories.map(cat => `
        <button onclick="document.getElementById('add-category').value = '${cat}'" 
            class="text-[9px] bg-gray-700 hover:bg-purple-600 px-2 py-0.5 rounded text-gray-300 hover:text-white transition border border-gray-600">
            ${cat}
        </button>
    `).join('');
}

function filterProductList() {
    const term = document.getElementById('product-search').value.toLowerCase();
    const items = document.querySelectorAll('.product-item');
    items.forEach(item => {
        const text = item.innerText.toLowerCase();
        item.style.display = text.includes(term) ? 'flex' : 'none';
    });
}

function toggleInputConfig() {
    const type = document.getElementById('add-input-type').value;
    const divInput2 = document.getElementById('div-input-2');
    
    if (type === 'double') {
        divInput2.classList.remove('hidden');
    } else {
        divInput2.classList.add('hidden');
    }
}

// --- BATCH CONFIG FUNCTIONS ---
function toggleBulkConfig() {
    const panel = document.getElementById('bulk-config-panel');
    panel.classList.toggle('hidden');
}

function populateBulkGameOptions() {
    const select = document.getElementById('bulk-game-select');
    const games = [...new Set(allProducts.map(p => p.game_name))].sort();
    
    select.innerHTML = '<option value="">-- Pilih Game --</option>' + 
        games.map(g => `<option value="${g}">${g}</option>`).join('');
}

function toggleBulkInputFields() {
    const type = document.getElementById('bulk-input-type').value;
    const group2 = document.getElementById('bulk-input2-group');
    if(type === 'double') group2.classList.remove('hidden');
    else group2.classList.add('hidden');
}

async function applyBulkConfig() {
    const gameName = document.getElementById('bulk-game-select').value;
    const type = document.getElementById('bulk-input-type').value;
    const label1 = document.getElementById('bulk-label1').value || 'User ID';
    const place1 = document.getElementById('bulk-place1').value;
    
    if(!gameName) return showToast("Sila pilih Game!", "error");
    if(!confirm(`Adakah anda pasti mahu ubah setting input untuk SEMUA produk ${gameName}?`)) return;

    let config = {
        type: type,
        label1: label1,
        placeholder1: place1
    };

    if(type === 'double') {
        config.label2 = document.getElementById('bulk-label2').value || 'Zone ID';
        config.placeholder2 = document.getElementById('bulk-place2').value;
    }

    const { error } = await supabaseClient
        .from('products')
        .update({ input_config: config })
        .eq('game_name', gameName);

    if(error) {
        showToast("Gagal update batch: " + error.message, "error");
    } else {
        showToast(`Berjaya update input untuk semua produk ${gameName}!`, "success");
        loadProducts(); 
        toggleBulkConfig(); 
    }
}

function editProduct(id) {
    const product = allProducts.find(p => p.id === id);
    if(!product) return;

    editingProductId = id;
    document.querySelectorAll('.product-item').forEach(el => el.classList.remove('active-edit'));
    document.getElementById(`prod-item-${id}`).classList.add('active-edit');

    document.getElementById('add-game-name').value = product.game_name;
    document.getElementById('add-item-name').value = product.item_name;
    document.getElementById('add-price').value = product.price;
    document.getElementById('add-original-price').value = product.original_price || '';
    document.getElementById('add-stock').value = product.stock === null ? '' : product.stock; // STOCK FIELD
    document.getElementById('add-img-url').value = product.image_url; 
    document.getElementById('add-item-image').value = product.item_image || ''; 
    document.getElementById('add-category').value = product.category || 'Diamond'; 
    
    if(product.input_config) {
        const conf = product.input_config;
        document.getElementById('add-input-type').value = conf.type || 'single';
        document.getElementById('config-label1').value = conf.label1 || 'User ID';
        document.getElementById('config-place1').value = conf.placeholder1 || '';
        document.getElementById('config-label2').value = conf.label2 || 'Zone ID';
        document.getElementById('config-place2').value = conf.placeholder2 || '';
    } else {
        document.getElementById('add-input-type').value = 'single';
        document.getElementById('config-label1').value = 'Player ID';
        document.getElementById('config-place1').value = 'Contoh: 123456';
    }
    toggleInputConfig();

    document.getElementById('add-is-promo').checked = product.is_promo;
    togglePromoInput();
    
    if(product.is_promo && product.promo_end) {
        const d = new Date(product.promo_end);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        document.getElementById('add-promo-end').value = d.toISOString().slice(0, 16);
    } else {
        document.getElementById('add-promo-end').value = '';
    }

    document.getElementById('btn-submit-product').innerText = "KEMASKINI PRODUK";
    document.getElementById('btn-submit-product').classList.remove('bg-purple-600', 'hover:bg-purple-500');
    document.getElementById('btn-submit-product').classList.add('bg-blue-600', 'hover:bg-blue-500', 'col-span-1');
    
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('btn-delete-product').classList.remove('hidden');
    document.getElementById('edit-indicator').classList.remove('hidden');
    document.getElementById('btn-reset-form').classList.remove('hidden');
}

function resetProductForm() {
    editingProductId = null;
    
    document.getElementById('add-game-name').value = '';
    document.getElementById('add-item-name').value = '';
    document.getElementById('add-price').value = '';
    document.getElementById('add-original-price').value = '';
    document.getElementById('add-stock').value = ''; // RESET STOCK
    document.getElementById('add-img-url').value = '';
    document.getElementById('add-item-image').value = ''; 
    document.getElementById('add-category').value = ''; 
    document.getElementById('add-is-promo').checked = false;
    document.getElementById('add-promo-end').value = '';
    
    document.getElementById('add-input-type').value = 'single';
    document.getElementById('config-label1').value = 'User ID';
    document.getElementById('config-place1').value = '';
    document.getElementById('config-label2').value = 'Zone ID';
    document.getElementById('config-place2').value = '';
    toggleInputConfig();
    
    togglePromoInput();

    document.querySelectorAll('.product-item').forEach(el => el.classList.remove('active-edit'));
    document.getElementById('btn-submit-product').innerText = "TAMBAH PRODUK";
    document.getElementById('btn-submit-product').classList.add('bg-purple-600', 'hover:bg-purple-500', 'col-span-2');
    document.getElementById('btn-submit-product').classList.remove('bg-blue-600', 'hover:bg-blue-500', 'col-span-1');
    
    document.getElementById('btn-cancel-edit').classList.add('hidden');
    document.getElementById('btn-delete-product').classList.add('hidden');
    document.getElementById('edit-indicator').classList.add('hidden');
    document.getElementById('btn-reset-form').classList.add('hidden');
}

function togglePromoInput() {
    const isPromo = document.getElementById('add-is-promo').checked;
    const dateContainer = document.getElementById('promo-date-container');
    if(isPromo) {
        dateContainer.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        dateContainer.classList.add('opacity-50', 'pointer-events-none');
        document.getElementById('add-promo-end').value = '';
    }
}

async function handleProductSubmit() {
    const gameName = document.getElementById('add-game-name').value;
    const itemName = document.getElementById('add-item-name').value;
    const category = document.getElementById('add-category').value.trim(); 
    const price = parseFloat(document.getElementById('add-price').value);
    const originalPrice = document.getElementById('add-original-price').value ? parseFloat(document.getElementById('add-original-price').value) : null;
    const stockInput = document.getElementById('add-stock').value;
    const stock = stockInput === '' ? null : parseInt(stockInput); // STOCK LOGIC
    const imgUrl = document.getElementById('add-img-url').value || "[https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670](https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670)";
    const itemImage = document.getElementById('add-item-image').value || null; 
    
    const isPromo = document.getElementById('add-is-promo').checked;
    const promoEnd = document.getElementById('add-promo-end').value;

    const inputType = document.getElementById('add-input-type').value;
    const label1 = document.getElementById('config-label1').value || 'User ID';
    const place1 = document.getElementById('config-place1').value || '';
    
    let inputConfig = {
        type: inputType,
        label1: label1,
        placeholder1: place1
    };

    if(inputType === 'double') {
        inputConfig.label2 = document.getElementById('config-label2').value || 'Zone ID';
        inputConfig.placeholder2 = document.getElementById('config-place2').value || '';
    }

    if(!gameName || !itemName || !price) return showToast("Isi semua maklumat!", "error");
    if(!category) return showToast("Sila masukkan Kategori!", "error");
    if(isPromo && !promoEnd) return showToast("Sila tetapkan masa tamat promo!", "error");

    const payload = {
        game_name: gameName, 
        item_name: itemName, 
        category: category, 
        price: price, 
        original_price: originalPrice, 
        stock: stock, // SEND STOCK
        image_url: imgUrl, 
        item_image: itemImage, 
        is_promo: isPromo,
        promo_end: isPromo ? new Date(promoEnd).toISOString() : null,
        input_config: inputConfig
    };

    let error;

    if (editingProductId) {
        const res = await supabaseClient.from('products').update(payload).eq('id', editingProductId);
        error = res.error;
    } else {
        const res = await supabaseClient.from('products').insert(payload);
        error = res.error;
    }

    if (error) {
        showToast("Error: " + error.message, "error");
    } else {
        showToast(editingProductId ? "Produk dikemaskini!" : "Produk ditambah!", "success");
        await loadProducts(); 
        resetProductForm(); 
    }
}

async function deleteProduct() {
    if(!editingProductId) return;
    if(!confirm("Adakah anda pasti mahu memadam produk ini?")) return;

    const { error } = await supabaseClient.from('products').delete().eq('id', editingProductId);
    
    if (error) {
        showToast("Gagal memadam: " + error.message, "error");
    } else {
        showToast("Produk dipadam.", "success");
        await loadProducts();
        resetProductForm();
    }
}

// --- PAYMENT SETTINGS ---
async function loadPaymentSettings() {
    const { data } = await supabaseClient.from('payment_methods').select('*').order('sort_order');
    if(!data) return;
    
    const list = document.getElementById('admin-payment-list');
    list.innerHTML = data.map(m => {
        const isMaint = m.is_maintenance;
        const maintColor = isMaint ? 'bg-red-500' : 'bg-green-500';
        const maintText = isMaint ? 'MAINTENANCE' : 'ACTIVE';
        
        return `
        <div class="pay-row bg-[#1e1f24] p-3 rounded-lg border border-gray-700 mb-2">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="text-xs font-bold text-white uppercase">${m.name}</div>
                    <div class="text-[9px] text-gray-500">${m.subtitle || '-'}</div>
                </div>
                <button onclick="togglePaymentMaintenance('${m.id}', ${!isMaint})" class="${maintColor} text-black text-[9px] font-bold px-2 py-0.5 rounded shadow-lg transition hover:opacity-80">${maintText}</button>
            </div>
            
            <div class="grid grid-cols-2 gap-2 mt-2 bg-black/40 p-2 rounded border border-white/5">
                <div>
                    <label class="text-[9px] text-gray-500 block mb-1">Fee Type</label>
                    <select id="fee-type-${m.id}" onchange="updatePaymentFee('${m.id}')" class="w-full bg-[#18181b] text-white text-[10px] p-1 rounded border border-gray-700 focus:border-blue-500 outline-none">
                        <option value="none" ${m.fee_type === 'none' ? 'selected' : ''}>Tiada (RM0)</option>
                        <option value="percentage" ${m.fee_type === 'percentage' ? 'selected' : ''}>Peratus (%)</option>
                        <option value="flat" ${m.fee_type === 'flat' ? 'selected' : ''}>Tetap (RM)</option>
                    </select>
                </div>
                <div>
                    <label class="text-[9px] text-gray-500 block mb-1">Fee Value</label>
                    <input type="number" id="fee-val-${m.id}" value="${m.fee_value}" onchange="updatePaymentFee('${m.id}')" class="w-full bg-[#18181b] text-white text-[10px] p-1 rounded border border-gray-700 focus:border-blue-500 outline-none">
                </div>
            </div>
        </div>
        `;
    }).join('');
}

async function togglePaymentMaintenance(id, newStatus) {
    const { error } = await supabaseClient.from('payment_methods').update({ is_maintenance: newStatus }).eq('id', id);
    if(error) showToast("Ralat update status", "error");
    else { loadPaymentSettings(); showToast("Status dikemaskini", "success"); }
}

async function updatePaymentFee(id) {
    const type = document.getElementById(`fee-type-${id}`).value;
    const val = parseFloat(document.getElementById(`fee-val-${id}`).value) || 0;
    const { error } = await supabaseClient.from('payment_methods').update({ fee_type: type, fee_value: val }).eq('id', id);
    if(error) showToast("Gagal simpan fee", "error");
    else showToast("Fee dikemaskini!", "success");
}

// --- GAME STATUS ---
async function loadMaintenanceStatus() {
    const { data } = await supabaseClient.from('game_status').select('*');
    if (data) {
        data.forEach(item => {
            dbMaintenanceStatus[item.game_name] = { is_offline: item.is_offline, message: item.message || "Sedang Diselenggara" };
        });
    }
}

function renderAdminMaintenance() {
    const uniqueGames = [...new Set(allProducts.map(item => item.game_name))];
    const div = document.getElementById('admin-game-status');
    div.innerHTML = uniqueGames.map(game => {
        const status = dbMaintenanceStatus[game] || { is_offline: false, message: '' };
        return `<div class="bg-black p-3 rounded-xl border ${status.is_offline ? 'border-red-500' : 'border-green-500'} flex items-center justify-between"><div class="text-xs font-bold text-white">${game}</div><div class="flex gap-2"><input type="text" id="maint-msg-${game}" value="${status.message}" class="w-20 text-[10px] bg-[#18181b] p-1 rounded text-white border border-gray-700"><button onclick="toggleMaintenanceDB('${game}', ${!status.is_offline})" class="px-3 py-1 text-[10px] font-bold rounded ${status.is_offline ? 'bg-red-500' : 'bg-green-500'} text-black min-w-[50px]">${status.is_offline ? 'OFF' : 'ON'}</button></div></div>`;
    }).join('');
}

async function toggleMaintenanceDB(gameName, newStatus) {
    const msg = document.getElementById(`maint-msg-${gameName}`).value || "Maintenance";
    const { error } = await supabaseClient.from('game_status').upsert({ game_name: gameName, is_offline: newStatus, message: msg }, { onConflict: 'game_name' });
    if (!error) { dbMaintenanceStatus[gameName] = { is_offline: newStatus, message: msg }; renderAdminMaintenance(); showToast(`Status ${gameName} dikemaskini`, "success"); }
}

// --- ANALYTICS ---
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
                    label: 'Jualan (RM)', data: Object.values(salesByDate), 
                    borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', 
                    borderWidth: 3, pointBackgroundColor: '#22c55e', fill: true, tension: 0.4 
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'white' } } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } }
        });
    }
}

// --- PINS ---
async function loadAdminPinHistory() {
    const { data } = await supabaseClient.from('wallet_pins').select('*').order('created_at', { ascending: false });
    const list = document.getElementById('admin-pin-list');
    if (!data || data.length === 0) { list.innerHTML = '<p class="text-gray-500 text-xs">Tiada rekod.</p>'; return; }
    list.innerHTML = data.map(p => {
        const color = p.is_used ? 'text-gray-500' : 'text-green-400';
        const text = p.is_used ? 'DITEBUS' : 'AKTIF';
        return `<div class="flex justify-between items-center bg-[#1e1f24] p-2 rounded mb-1 text-xs border border-gray-800"><div><span class="font-mono font-bold text-white select-all">${p.pin_code}</span><span class="text-gray-500 ml-2">RM${p.amount}</span></div><span class="${color} font-bold">${text}</span></div>`
    }).join('');
}

async function generatePin() {
    const amt = parseFloat(document.getElementById('gen-amount').value);
    if (!amt || amt <= 0) return showToast("Masukkan jumlah valid", "error");
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const { error } = await supabaseClient.from('wallet_pins').insert({ pin_code: code, amount: amt, is_used: false });
    if (error) showToast("Gagal generate PIN", "error");
    else { showToast(`PIN: ${code} (RM${amt})`, "success"); document.getElementById('gen-amount').value = ''; loadAdminPinHistory(); }
}

// --- VOUCHERS MANAGEMENT ---
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
    
    const isHidden = document.getElementById('v-hidden').checked;
    const emailTarget = document.getElementById('v-email-target').value.trim();

    if (!code || !value || !endDateVal) return showToast("Sila isi Kod, Nilai & Tarikh Luput!", "error");
    
    const btn = document.querySelector('button[onclick="createVoucher()"]');
    btn.innerHTML = 'Memproses...'; btn.disabled = true;

    try {
        let assignedUserId = null;

        if(emailTarget) {
            const { data: user } = await supabaseClient.from('profiles').select('id').eq('email', emailTarget).single();
            if(!user) throw new Error("Email user tidak dijumpai dalam sistem!");
            assignedUserId = user.id;
        }

        const payload = { 
            code: code, 
            description: description, 
            discount_type: type, 
            discount_value: value, 
            min_spend: minSpend, 
            max_spend: maxSpend, 
            usage_limit: limit, 
            valid_for_service: service, 
            end_date: new Date(endDateVal).toISOString(),
            is_public: !isHidden, 
            assign_to_user: assignedUserId
        };

        const { error } = await supabaseClient.from('vouchers').insert(payload);
        
        if (error) throw error;
        
        showToast(assignedUserId ? "Baucar Private Dicipta!" : "Baucar berjaya dicipta!", "success");
        
        if (assignedUserId) {
             await supabaseClient.from('notifications').insert({ 
                user_id: assignedUserId, 
                title: 'Baucar Eksklusif!', 
                message: `Anda menerima baucar khas kod: ${code}. Sah sehingga ${new Date(endDateVal).toLocaleDateString()}.`, 
                type: 'reward' 
            });
        }

        document.getElementById('v-code').value = '';
        document.getElementById('v-email-target').value = '';
        loadVouchers();

    } catch (err) {
        showToast(err.message, "error");
    } finally {
        btn.innerHTML = 'CIPTA BAUCAR'; btn.disabled = false;
    }
}

async function loadVouchers() {
    const { data } = await supabaseClient
        .from('vouchers')
        .select(`*, profiles:assign_to_user(email)`) 
        .order('created_at', { ascending: false });

    const list = document.getElementById('admin-voucher-list');
    
    if (!data || data.length === 0) { 
        list.innerHTML = '<p class="text-gray-500 text-xs text-center mt-4">Tiada baucar aktif.</p>'; 
        return; 
    }
    
    list.innerHTML = data.map(v => {
        let tags = '';
        if (v.assign_to_user) {
            const userEmail = v.profiles ? v.profiles.email : 'ID User';
            tags += `<span class="bg-pink-900 text-pink-300 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border border-pink-700">PRIVATE: ${userEmail}</span> `;
        }
        if (!v.is_public) {
            tags += `<span class="bg-gray-700 text-gray-300 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border border-gray-600"><i class="ph ph-eye-slash"></i> HIDDEN</span> `;
        }

        return `
        <div class="bg-[#1e1f24] p-3 rounded-xl border border-gray-700 relative group overflow-hidden">
            <div class="flex justify-between items-start">
                <div>
                    <div class="flex items-center gap-2">
                        <div class="font-black text-sm text-white font-mono tracking-wider">${v.code}</div>
                        ${tags}
                    </div>
                    <div class="text-[10px] text-gray-400 mt-0.5">${v.description || 'Tiada deskripsi'}</div>
                </div>
                <button onclick="deleteVoucher(${v.id})" class="text-gray-600 hover:text-red-500 p-1"><i class="ph ph-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

async function deleteVoucher(id) {
    if(!confirm("Padam baucar ini?")) return;
    const { error } = await supabaseClient.from('vouchers').delete().eq('id', id);
    if(error) showToast("Gagal padam", "error"); else { showToast("Baucar dipadam", "success"); loadVouchers(); }
}

// --- NOTIFS ---
function toggleNotifInput() {
    const target = document.getElementById('notif-target').value;
    const emailInput = document.getElementById('notif-email');
    if (target === 'specific') emailInput.classList.remove('hidden'); else emailInput.classList.add('hidden');
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
            if(users) { notificationsToInsert = users.map(u => ({ user_id: u.id, ...payload })); }
        }

        if(notificationsToInsert.length > 0) {
            const { error } = await supabaseClient.from('notifications').insert(notificationsToInsert);
            if(error) throw error;
            showToast(`Berjaya hantar kepada ${notificationsToInsert.length} pengguna.`, "success");
            document.getElementById('notif-title').value = '';
            document.getElementById('notif-msg').value = '';
        } else { showToast("Tiada pengguna untuk dihantar.", "error"); }
    } catch (err) { showToast(err.message, "error"); } 
    finally { btn.innerHTML = '<i class="ph ph-paper-plane-right"></i> HANTAR NOTIFIKASI'; btn.disabled = false; }
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

// --- BANNER MANAGEMENT (BARU) ---
async function loadAdminBanners() {
    const { data } = await supabaseClient.from('banners').select('*').order('sort_order', { ascending: true });
    renderBanners(data || []);
}

function renderBanners(banners) {
    const list = document.getElementById('admin-banner-list');
    if(!list) return;

    if(!banners || banners.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 text-xs py-4">Tiada banner. Sila tambah.</p>';
        return;
    }

    list.innerHTML = banners.map(b => `
        <div class="bg-[#1e1f24] p-3 rounded-xl border border-gray-700 flex justify-between items-center group">
            <div class="flex items-center gap-3 overflow-hidden">
                <img src="${b.image_url}" class="w-12 h-8 object-cover rounded bg-gray-800">
                <div>
                    <div class="text-[11px] font-bold text-white truncate w-32">${b.title}</div>
                    <div class="text-[9px] text-gray-500 truncate w-32">${b.subtitle || '-'}</div>
                </div>
            </div>
            <div class="flex items-center gap-2">
                 <button onclick="toggleBannerStatus(${b.id}, ${!b.is_active})" class="text-[9px] font-bold px-2 py-0.5 rounded ${b.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} border border-white/5">
                    ${b.is_active ? 'ON' : 'OFF'}
                </button>
                <div class="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-300 font-mono">#${b.sort_order}</div>
                <button onclick="deleteBanner(${b.id})" class="text-gray-600 hover:text-red-500 p-1"><i class="ph ph-trash"></i></button>
            </div>
        </div>
    `).join('');
}

async function addBanner() {
    const img = document.getElementById('banner-img').value;
    const title = document.getElementById('banner-title').value;
    const sub = document.getElementById('banner-sub').value;
    const link = document.getElementById('banner-link').value;
    const order = parseInt(document.getElementById('banner-order').value) || 0;

    if(!img || !title) return showToast("Sila isi URL Gambar & Tajuk", "error");

    const { error } = await supabaseClient.from('banners').insert({
        image_url: img,
        title: title,
        subtitle: sub,
        link_url: link,
        sort_order: order,
        is_active: true
    });

    if(error) showToast("Gagal tambah banner", "error");
    else {
        showToast("Banner ditambah!", "success");
        // Reset form
        document.getElementById('banner-img').value = '';
        document.getElementById('banner-title').value = '';
        document.getElementById('banner-sub').value = '';
        document.getElementById('banner-link').value = '';
        loadAdminBanners();
    }
}

async function deleteBanner(id) {
    if(!confirm("Padam banner ini?")) return;
    const { error } = await supabaseClient.from('banners').delete().eq('id', id);
    if(error) showToast("Error", "error"); else { showToast("Banner dipadam", "success"); loadAdminBanners(); }
}

async function toggleBannerStatus(id, newState) {
    const { error } = await supabaseClient.from('banners').update({ is_active: newState }).eq('id', id);
    if(!error) loadAdminBanners();
}