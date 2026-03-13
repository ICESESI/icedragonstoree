// catalog.js - Versi Penuh (Updated: Flash Sale, Stock Block, Redirect Fix)

const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let currentProfile = null;
let itemToPay = null; 
let allPaymentMethods = [];
let selectedPaymentMethod = null;

// --- ANTI SPAM VARIABLES ---
const MAX_PENDING_ORDERS = 2; 
const SPAM_COOLDOWN_MS = 5000;

// --- UTILS ---
const fmtRM = (val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 'RM 0.00' : `RM ${num.toFixed(2)}`;
};

function generateUniqueOrderID() {
    const now = new Date();
    const dateStr = now.toISOString().slice(2,10).replace(/-/g,''); 
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TRX-${dateStr}-${randomSuffix}`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let bgClass = 'bg-[#121212] border-gray-600';
    if (type === 'success') bgClass = 'bg-green-900/90 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]';
    if (type === 'error') bgClass = 'bg-red-900/90 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]';

    toast.className = `p-3 rounded-xl border flex items-center gap-3 animate-enter backdrop-blur-md text-white text-xs font-bold ${bgClass}`;
    toast.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// --- INIT & SESSION CHECK ---

window.onload = async () => {
    await checkSession();
    
    if (currentUser) {
        if (document.getElementById('header-balance')) {
            document.getElementById('header-balance').innerText = fmtRM(currentProfile.wallet_balance);
        }
        await Promise.all([loadCatalogItems(), loadPaymentMethods()]);
    }
};

async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    
    // Load Profil & Check Ban
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    currentProfile = profile;

    // --- BAN CHECK LOGIC ---
    if (currentProfile && currentProfile.is_banned) {
        document.getElementById('banned-modal').classList.remove('hidden');
        document.getElementById('banned-modal').classList.add('flex');
        await supabaseClient.auth.signOut();
        return;
    }
}

// --- SPAM PROTECTION CHECK ---
async function checkSpamProtection() {
    if(!currentUser) return true;
    
    // Check pending orders count
    const { count, error } = await supabaseClient
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .eq('status', 'pending');

    if (!error && count >= MAX_PENDING_ORDERS) {
        showToast(`Anda ada ${count} order belum selesai. Sila tunggu admin proses.`, "error");
        return false;
    }
    return true;
}

// --- CATALOG DISPLAY (UPDATED: FLASH SALE & STOCK) ---

async function loadCatalogItems() {
    const listContainer = document.getElementById('catalog-list');
    const emptyState = document.getElementById('empty-state');
    const stickyFooter = document.getElementById('sticky-footer'); 

    try {
        // 1. Ambil data Catalog user
        const { data, error } = await supabaseClient
            .from('catalogs')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 2. Jika ada item, kita perlu fetch data produk terkini (untuk cek stock & flash sale)
        let filteredData = [];
        const productMap = {}; // Map untuk simpan detail fresh

        if (data && data.length > 0) {
            // Dapatkan senarai nama game unik untuk query efisien
            const gameNames = [...new Set(data.map(item => item.game_name))];
            
            // Fetch dari products_v2
            const { data: productsData } = await supabaseClient
                .from('products_v2')
                .select('game_name, items')
                .in('game_name', gameNames);

            // Bina Map Lookup
            if (productsData) {
                productsData.forEach(game => {
                    if (game.items && Array.isArray(game.items)) {
                        game.items.forEach(pItem => {
                            // Key format: GameName_ItemID
                            productMap[`${game.game_name}_${pItem.id}`] = pItem;
                        });
                    }
                });
            }

            // FILTER: Buang item Flash Sale yang tamat tempoh
            const now = new Date();
            filteredData = data.filter(item => {
                const freshItem = productMap[`${item.game_name}_${item.product_id}`];
                
                if (freshItem && freshItem.is_promo && freshItem.promo_end) {
                    const expiry = new Date(freshItem.promo_end);
                    if (expiry < now) {
                        // Expired! Jangan masukkan dalam list (Auto hilang)
                        // Optional: Delete dari DB senyap-senyap
                        deleteCatalogItemSilently(item.id); 
                        return false;
                    }
                }
                return true;
            });
        }

        // Kira Total untuk Sticky Footer (berdasarkan filtered items)
        let grandTotal = 0;
        
        if (!filteredData || filteredData.length === 0) {
            listContainer.classList.add('hidden');
            emptyState.classList.remove('hidden');
            emptyState.classList.add('flex');
            if(stickyFooter) stickyFooter.classList.add('translate-y-full'); // Hide footer
            return;
        }

        // Show items
        emptyState.classList.add('hidden');
        listContainer.classList.remove('hidden');
        if(stickyFooter) stickyFooter.classList.remove('translate-y-full'); // Show footer

        // Render List
        listContainer.innerHTML = filteredData.map((item, index) => {
            grandTotal += item.total_price;
            
            // Cari data fresh untuk stock & harga asal
            const freshItem = productMap[`${item.game_name}_${item.product_id}`];
            
            // Logic Stock
            let isSoldOut = false;
            let stockDisplay = '';
            if (freshItem && freshItem.stock !== null) {
                if (freshItem.stock <= 0) isSoldOut = true;
                else if (freshItem.stock < 10) stockDisplay = `<span class="text-[9px] text-red-400 font-bold ml-2 animate-pulse">Tinggal ${freshItem.stock}!</span>`;
            }

            // Logic Harga Asal vs Promo
            let priceHtml = '';
            let originalPriceTotal = 0;
            
            // Kira harga asal total jika ada promo
            if (freshItem && freshItem.original_price && freshItem.original_price > freshItem.price) {
                originalPriceTotal = freshItem.original_price * item.quantity;
                priceHtml = `
                    <div class="flex flex-col items-end">
                        <span class="text-[10px] text-gray-500 line-through decoration-red-500">RM ${originalPriceTotal.toFixed(2)}</span>
                        <span class="text-base font-black text-yellow-400 font-mono tracking-tight">${fmtRM(item.total_price)}</span>
                    </div>
                `;
            } else {
                priceHtml = `<span class="text-base font-black text-yellow-400 font-mono tracking-tight">${fmtRM(item.total_price)}</span>`;
            }

            // Gambar
            const img = item.image_url || "https://placehold.co/100";
            
            // Format ID Display
            let idRaw = item.game_id_input || '-';
            let idDisplay = idRaw.replace(/\|/g, '<span class="text-gray-600 mx-1.5">/</span>');

            const delay = index * 100; 

            // Button Logic (Disabled if Sold Out)
            let btnAction = `onclick='openPaymentModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'`;
            let btnClass = "bg-white text-black hover:bg-yellow-400 hover:text-black transition-colors duration-300";
            let btnText = `<span>Bayar</span><i class="ph-bold ph-arrow-right"></i>`;

            if (isSoldOut) {
                btnAction = ""; // No action
                btnClass = "btn-disabled"; // CSS class for grayed out
                btnText = `<span>SOLD OUT</span><i class="ph-fill ph-prohibit"></i>`;
            }

            return `
            <div id="item-${item.id}" class="game-card rounded-2xl p-3 mb-3 relative group animate-enter" style="animation-delay: ${delay}ms">
                
                <div class="flex gap-3">
                    <div class="relative w-[88px] h-[88px] rounded-xl overflow-hidden bg-black flex-shrink-0 border border-white/5">
                        <img src="${img}" class="w-full h-full object-cover opacity-90 group-hover:scale-110 transition duration-500 ${isSoldOut ? 'grayscale' : ''}">
                        <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-1 pt-4 text-center">
                            <span class="text-[9px] font-bold text-white bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10">x${item.quantity}</span>
                        </div>
                    </div>

                    <div class="flex-grow flex flex-col justify-between min-w-0 py-0.5">
                        <div>
                            <div class="flex justify-between items-start">
                                <h3 class="font-bold text-gray-100 text-sm truncate pr-6">${item.item_name} ${stockDisplay}</h3>
                                <button onclick="deleteCatalogItem(${item.id})" class="text-gray-600 hover:text-red-500 transition p-1 -mt-1 -mr-1">
                                    <i class="ph-fill ph-trash text-lg"></i>
                                </button>
                            </div>
                            <p class="text-[10px] text-yellow-500/80 font-bold uppercase tracking-wide mb-2">${item.game_name}</p>
                        </div>

                        <div class="bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5 flex items-center justify-between group/id">
                            <div class="text-[10px] text-gray-300 font-mono truncate mr-2 select-all">
                                ${idDisplay}
                            </div>
                            <button onclick="navigator.clipboard.writeText('${idRaw}'); showToast('ID Disalin!', 'success')" class="text-gray-600 hover:text-white transition active:scale-90">
                                <i class="ph-bold ph-copy text-sm"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="mt-3 pt-3 border-t border-dashed border-white/10 flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-[9px] text-gray-500 uppercase font-bold">Harga</span>
                        ${priceHtml}
                    </div>
                    
                    <button ${btnAction} class="${btnClass} px-5 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 group-hover:shadow-yellow-400/20">
                        ${btnText}
                    </button>
                </div>

            </div>
            `;
        }).join('');

        // Update Footer Info
        if(document.getElementById('footer-total-value')) {
            document.getElementById('footer-total-value').innerText = fmtRM(grandTotal);
            document.getElementById('footer-count').innerText = `${filteredData.length} Item`;
        }

    } catch (err) {
        console.error(err);
        showToast("Gagal memuatkan katalog.", "error");
    }
}

// Helper to remove expired items silently
async function deleteCatalogItemSilently(id) {
    await supabaseClient.from('catalogs').delete().eq('id', id);
}

// --- PAYMENT METHODS ---

async function loadPaymentMethods() {
    const { data, error } = await supabaseClient
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true });
        
    if (!error && data) {
        allPaymentMethods = data;
    }
}

function renderPaymentGrid() {
    const container = document.getElementById('modal-payment-grid');
    if (allPaymentMethods.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500">Tiada kaedah pembayaran.</p>';
        return;
    }

    const iconMap = {
        'wallet': 'wallet', 'bank_qr': 'qr-code', 'tng_pin': 'ticket', 
        'digi_pin': 'cardholder', 'fpx': 'bank', 'celcom_pin': 'sim-card', 'maxis_pin': 'sim-card'
    };

    container.innerHTML = allPaymentMethods.map(m => {
        const isMaint = m.is_maintenance;
        const opacity = isMaint ? 'opacity-50 pointer-events-none grayscale' : '';
        const icon = iconMap[m.id] || 'credit-card';
        
        return `
        <div onclick="selectPaymentMethod('${m.id}')" id="pay-card-${m.id}" class="payment-method-card p-3 rounded-xl cursor-pointer relative overflow-hidden group ${opacity}">
            ${isMaint ? '<div class="absolute inset-0 bg-black/50 z-10 flex items-center justify-center text-[8px] font-bold text-red-500">MAINTENANCE</div>' : ''}
            <div class="absolute top-1 right-1 text-yellow-400 opacity-0 check-mark"><i class="ph-fill ph-check-circle"></i></div>
            <div class="flex items-center gap-2">
                <i class="ph ph-${icon} text-lg text-gray-300"></i>
                <div class="text-[10px] font-bold text-white leading-tight">${m.name}</div>
            </div>
            ${m.id === 'wallet' ? `<div class="text-[9px] text-yellow-500 mt-1 font-mono">Baki: ${fmtRM(currentProfile.wallet_balance)}</div>` : ''}
        </div>
        `;
    }).join('');
}

function selectPaymentMethod(id) {
    selectedPaymentMethod = allPaymentMethods.find(m => m.id === id);
    if (!selectedPaymentMethod) return;

    document.querySelectorAll('.payment-method-card').forEach(el => {
        el.classList.remove('payment-method-selected');
        el.querySelector('.check-mark').classList.remove('opacity-100');
        el.querySelector('.check-mark').classList.add('opacity-0');
    });
    
    const card = document.getElementById(`pay-card-${id}`);
    if(card) {
        card.classList.add('payment-method-selected');
        card.querySelector('.check-mark').classList.add('opacity-100');
        card.querySelector('.check-mark').classList.remove('opacity-0');
    }

    const inputArea = document.getElementById('payment-input-area');
    const pinMode = document.getElementById('input-mode-pin');
    const manualMode = document.getElementById('input-mode-manual');
    const btn = document.getElementById('btn-confirm-pay');

    inputArea.classList.remove('hidden');
    
    btn.disabled = false;
    btn.classList.remove('bg-gray-800', 'text-gray-500', 'cursor-not-allowed', 'border-white/5');
    btn.classList.add('bg-yellow-400', 'text-black', 'hover:bg-yellow-300', 'border-yellow-500');
    btn.innerHTML = `<i class="ph-fill ph-check-circle"></i> BAYAR SEKARANG`;

    if (id === 'wallet') {
        pinMode.classList.remove('hidden');
        manualMode.classList.add('hidden');
        setTimeout(() => document.getElementById('payment-pin').focus(), 100);
    } else {
        pinMode.classList.add('hidden');
        manualMode.classList.remove('hidden');
        
        const qrContainer = document.getElementById('manual-qr-container');
        const qrImg = document.getElementById('manual-qr-img');
        const bankDetails = document.getElementById('manual-bank-details');
        const instruction = document.getElementById('manual-instruction');

        if (selectedPaymentMethod.qr_image) {
            qrContainer.classList.remove('hidden');
            qrImg.src = selectedPaymentMethod.qr_image;
        } else {
            qrContainer.classList.add('hidden');
        }

        let detailText = '';
        if (selectedPaymentMethod.account_number) {
            detailText = `${selectedPaymentMethod.account_number}\n(${selectedPaymentMethod.account_holder || ''})`;
        } else if (selectedPaymentMethod.instructions) {
            detailText = selectedPaymentMethod.instructions;
        } else {
            detailText = "Tiada maklumat akaun.";
        }
        bankDetails.innerText = detailText;
        instruction.innerText = selectedPaymentMethod.instructions || "Sila transfer dan masukkan bukti.";
    }
}


// --- PAYMENT PROCESS ---

function openPaymentModal(item) {
    itemToPay = item;
    selectedPaymentMethod = null;
    
    // Reset UI
    document.getElementById('modal-item-name').innerText = `${item.game_name} - ${item.item_name}`;
    document.getElementById('modal-account-id').innerText = item.game_id_input.replace(/\|/g, ' ');
    document.getElementById('modal-total-price').innerText = fmtRM(item.total_price);
    
    document.getElementById('payment-input-area').classList.add('hidden');
    document.getElementById('payment-pin').value = '';
    document.getElementById('payment-ref-id').value = '';
    
    const btn = document.getElementById('btn-confirm-pay');
    btn.disabled = true;
    btn.className = "w-full bg-gray-800 text-gray-500 font-bold py-3.5 rounded-xl text-xs transition shadow-lg flex items-center justify-center gap-2 mt-4 cursor-not-allowed border border-white/5";
    btn.innerText = "SILA PILIH PEMBAYARAN";

    renderPaymentGrid();

    const modal = document.getElementById('payment-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('payment-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    // NOTE: itemToPay jangan dinullkan di sini supaya animasi/redirect masih boleh baca ID
}

async function processPayment() {
    if (!itemToPay || !selectedPaymentMethod) return;

    // --- ANTI-SPAM & BAN CHECK ---
    const isSafe = await checkSpamProtection();
    if (!isSafe) return;
    // -----------------------------

    const btn = document.getElementById('btn-confirm-pay');
    const originalBtnText = btn.innerHTML;
    
    // Validation
    let paymentDetails = '';
    
    if (selectedPaymentMethod.id === 'wallet') {
        const pin = document.getElementById('payment-pin').value;
        if (pin.length !== 6) return showToast("Masukkan 6-digit PIN Wallet.", "error");
    } else {
        const ref = document.getElementById('payment-ref-id').value;
        if (!ref) return showToast("Sila masukkan Resit / Rujukan.", "error");
        paymentDetails = ref;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg"></i> MEMPROSES...`;

    try {
        const orderId = generateUniqueOrderID();
        let fee = 0;
        
        if (selectedPaymentMethod.fee_type === 'percentage') {
            fee = itemToPay.total_price * (selectedPaymentMethod.fee_value / 100);
        } else if (selectedPaymentMethod.fee_type === 'flat') {
            fee = selectedPaymentMethod.fee_value;
        }
        
        const totalPaid = itemToPay.total_price + fee;

        // --- BRANCH A: WALLET PAYMENT ---
        if (selectedPaymentMethod.id === 'wallet') {
             // 1. Re-check Profile
            const { data: freshProfile } = await supabaseClient
                .from('profiles')
                .select('wallet_balance, security_pin, is_banned')
                .eq('id', currentUser.id)
                .single();

            if (freshProfile.is_banned) throw new Error("Akaun dibekukan.");
            const pinInput = document.getElementById('payment-pin').value;
            if (freshProfile.security_pin !== pinInput) throw new Error("PIN Transaksi Salah!");
            if (freshProfile.wallet_balance < totalPaid) throw new Error("Baki tidak mencukupi!");

            // 2. Deduct Balance
            const newBalance = freshProfile.wallet_balance - totalPaid;
            const { error: balErr } = await supabaseClient
                .from('profiles')
                .update({ wallet_balance: newBalance })
                .eq('id', currentUser.id);
            if (balErr) throw balErr;

            // 3. Log Wallet
            await supabaseClient.from('wallet_logs').insert({
                user_id: currentUser.id,
                amount: -totalPaid,
                type: 'purchase',
                description: `Order ${orderId}`
            });
            
            document.getElementById('header-balance').innerText = fmtRM(newBalance);
        }

        // --- COMMON: INSERT TRANSACTION ---
        const { error: txError } = await supabaseClient.from('transactions').insert({
            order_id: orderId,
            user_id: currentUser.id,
            item_name: `${itemToPay.game_name} - ${itemToPay.item_name}`,
            amount: itemToPay.total_price,
            fee_amount: fee,
            total_paid: totalPaid,
            quantity: itemToPay.quantity,
            game_id_input: itemToPay.game_id_input,
            status: 'pending',
            payment_method: selectedPaymentMethod.id,
            payment_details: paymentDetails || 'Wallet Deducted'
        });

        if (txError) throw txError;

        // --- DELETE FROM CATALOG ---
        await supabaseClient.from('catalogs').delete().eq('id', itemToPay.id);

        showToast("Pesanan Berjaya Dihantar!", "success");
        
        // Simpan ID item sementara untuk animasi 
        const targetElementId = `item-${itemToPay.id}`;
        
        // Tutup modal
        closeModal();
        
        // Animation Removal from List (Visual Only)
        const el = document.getElementById(targetElementId);
        if(el) {
            el.style.transform = 'translateX(100%)';
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
                loadCatalogItems(); // Refresh full list
            }, 300);
        }

        // --- REDIRECT FIX ---
        // Kita guna setTimeout untuk memastikan UI sempat update sebelum redirect
        // Penting: Gunakan orderId yang baru digenerate
        setTimeout(() => {
            window.location.href = `receipt.html?order_id=${orderId}`;
        }, 1500);

    } catch (err) {
        console.error(err);
        showToast(err.message || "Ralat sistem.", "error");
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

async function deleteCatalogItem(id) {
    if(!confirm("Buang item ini dari katalog?")) return;
    try {
        const { error } = await supabaseClient.from('catalogs').delete().eq('id', id);
        if (error) throw error;
        
        const el = document.getElementById(`item-${id}`);
        el.style.transform = 'translateX(100%)';
        el.style.opacity = '0';
        
        setTimeout(() => {
            el.remove();
            loadCatalogItems(); 
            showToast("Item dibuang.", "success");
        }, 300);
        
    } catch (err) { showToast("Gagal membuang item.", "error"); }
}