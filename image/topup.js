// topup.js - Version 5.8 (Added Stock Deduction Logic + XP Display + Catalog)

const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// --- STATE VARIABLES ---
let allProducts = [];
let filteredProducts = []; 
let promoProducts = []; 
let allPaymentMethods = []; 
let currentUser = null;
let currentProfile = null;
let selectedProduct = null;
let parentGameData = null; 
// --- TAMBAH INI (Untuk elak kelip gambar) ---
const loadedImageCache = new Set(); 
// -----------------------------------------
// ... variable sedia ada ...
let cachedVoucherList = []; // <-- TAMBAH INI UNTUK SIMPAN DATA BAUCAR
// --- ANNOUNCEMENT VARIABLES ---
let currentAnnouncement = null;

let toastTimer = null; // Variable global untuk simpan timer
let voucherCheckDebounceTimer = null;
// Variables integrasi VIP
let currentTier = { name: 'BRONZE', discount: 0 };
let currentMonthSpend = 0; 
let nextTierThreshold = 100;

let currentVoucher = null;
let isTransactionProcessing = false;
let currentServerRegion = 'MALAY'; 
let currentCategory = 'ALL'; 
let currentLimit = 6; 
let selectedPaymentMethod = null; 
let selectedPaymentMethodDetails = null; 
let selectedQuantity = 1; 
let promoInterval = null; 
let pendingHistoryValues = null; // Untuk simpan data sementara tunggu user confirm
// --- CONFIG VARIABLES ---
let activeInputConfig = []; 
let currentGameNameGlobal = ""; 

// --- ANTI SPAM VARIABLES ---
let isAntiSpamActive = false;
const SPAM_COOLDOWN_MS = 10000; 
const MAX_PENDING_ORDERS = 1223; // Limit order pending serentak
// --- BEST SELLER VARIABLE ---
let bestSellerIds = new Set(); 

// --- VOUCHER SECURITY VARIABLES ---
let voucherAttempts = 0;      // Kira berapa kali salah
let voucherBlockTime = 0;     // Simpan masa bila boleh try semula
const MAX_VOUCHER_TRY = 5;    // Max percubaan sebelum kena block
const VOUCHER_BLOCK_MS = 5 * 60 * 1000; // 5 Minit dalam milisaat
// --- DOM UTILS ---
function createEl(tag, className = '', text = '', attributes = {}) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    
    Object.entries(attributes).forEach(([key, value]) => {
        if (key.startsWith('on') && typeof value === 'function') {
            // Handle event listeners (cth: onClick)
            el.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (key === 'dataset') {
            // Handle dataset
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                el.dataset[dataKey] = dataValue;
            });
        } else {
            // Handle standard attributes
            el.setAttribute(key, value);
        }
    });
    return el;
}
// --- HELPER UTILITIES ---

const fmtRM = (val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 'RM 0.00' : `RM ${num.toFixed(2)}`;
};

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function pasteText(inputId) {
    try {
        const text = await navigator.clipboard.readText();
        const inputEl = document.getElementById(inputId);
        if(inputEl) {
            inputEl.value = text;
            inputEl.dispatchEvent(new Event('input'));
            showToast("Teks berjaya ditampal!", "success");
        }
    } catch (err) {
        console.error('Failed to read clipboard', err);
        showToast("Gagal menampal teks. Sila masukkan manual.", "error");
    }
}

// --- LAZY LOAD SYSTEM (MEMORY OPTIMIZED) ---

let lazyObserverInstance = null; // Variable global untuk simpan instance

function initLazyImages() {
    if (lazyObserverInstance) {
        lazyObserverInstance.disconnect();
    }

    lazyObserverInstance = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.getAttribute('data-src');
                
                if (src) {
                    img.src = src;
                    img.onload = () => {
                        img.classList.remove('opacity-0');
                        img.classList.add('opacity-100');
                        // SIMPAN DALAM CACHE BILA DAH LOAD
                        loadedImageCache.add(src); 
                    };
                    img.removeAttribute('data-src');
                }
                observer.unobserve(img);
            }
        });
    }, { 
        rootMargin: '200px 0px', 
        threshold: 0.01 
    });

    const images = document.querySelectorAll('img.lazy-load-target');
    images.forEach(img => lazyObserverInstance.observe(img));
}
// --- UI HANDLERS ---

function toggleBottomBar(shouldShow) {
    const bar = document.getElementById('floating-payment-bar');
    if (bar) {
        if (shouldShow && !selectedProduct) {
            return;
        }

        if (shouldShow) {
            bar.classList.remove('translate-y-full', 'opacity-0', 'invisible');
        } else {
            bar.classList.add('translate-y-full', 'opacity-0', 'invisible');
        }
    }
}

function setupInputFocusHandlers(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;

    el.addEventListener('focus', () => {
        toggleBottomBar(false); 
    });

    el.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement || document.activeElement.tagName !== 'INPUT') {
                if (selectedProduct) {
                    toggleBottomBar(true);
                }
            }
        }, 150); 
    });
}

function generateUniqueOrderID() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    let uniqueSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `TRX-${year}${month}${day}-${uniqueSuffix}`;
}

// --- ANTI-SPAM TOAST SYSTEM (UPDATED - NO SHADOW) ---

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return; 
    
    const existingToast = container.querySelector('div');
    
    if (existingToast && existingToast.textContent.includes(message)) {
        if (toastTimer) clearTimeout(toastTimer);
        
        existingToast.style.transition = 'transform 0.1s';
        existingToast.style.transform = 'scale(1.05)'; 
        
        setTimeout(() => {
            if(existingToast) existingToast.style.transform = 'scale(1)'; 
        }, 100);

        toastTimer = setTimeout(() => { 
            dismissToast(existingToast);
        }, 3500);
        
        return;
    }

    container.textContent = ''; 
    if (toastTimer) clearTimeout(toastTimer);

    const toast = document.createElement('div');
    let bgClass = 'bg-[#18181b] border-gray-600 text-white';
    let iconName = 'info';
    
    if (type === 'success') {
        bgClass = 'bg-green-900/90 border-green-500 text-white';
        iconName = 'check-circle-fill';
    } else if (type === 'error') {
        bgClass = 'bg-red-900/90 border-red-500 text-white';
        iconName = 'warning-circle-fill';
    }

    // ❌ shadow dibuang terus
    toast.className = `
        p-4 rounded-xl border
        flex items-center gap-3
        animate-slide-left
        transition-all duration-300
        backdrop-blur-md
        ${bgClass}
    `;

    const iconEl = document.createElement('i');
    iconEl.className = `ph ph-${iconName} text-2xl shrink-0`;

    const textEl = document.createElement('span');
    textEl.className = 'text-xs font-bold leading-tight tracking-wide';
    textEl.textContent = message; 

    toast.appendChild(iconEl);
    toast.appendChild(textEl);
    container.appendChild(toast);
    
    toastTimer = setTimeout(() => { 
        dismissToast(toast);
    }, 3000);
}
// Helper function untuk hilangkan toast dengan smooth
function dismissToast(toastElement) {
    if (!toastElement) return;
    toastElement.style.transform = 'translateX(100%)'; // Slide ke kanan
    toastElement.style.opacity = '0'; 
    setTimeout(() => {
        if(toastElement && toastElement.parentElement) toastElement.remove();
    }, 300); 
}

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function highlightInputError(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('input-error');
        el.focus();
        setTimeout(() => el.classList.remove('input-error'), 500);
    }
}

// --- OPTIMIZED INIT LOAD (Gantikan window.onload) ---

document.addEventListener('DOMContentLoaded', async () => {
    // 1. UI Setup - Setup visual serta-merta supaya user tak nampak glitch
    const bar = document.getElementById('floating-payment-bar');
    if (bar) {
        bar.classList.add('transition-all', 'duration-300', 'ease-in-out');
        toggleBottomBar(false); 
    }

    const btnPay = document.getElementById('btn-main-pay');
    if(btnPay) {
        btnPay.disabled = true;
        btnPay.classList.add('opacity-50', 'cursor-not-allowed', 'grayscale');
    }

    // 2. Dapatkan & Validasi Game Name dari URL
    const urlParams = new URLSearchParams(window.location.search);
    const gameName = urlParams.get('game');
    
    // Jika tiada game dipilih, tendang balik ke home
    if (!gameName) { window.location.href = 'index.html'; return; }

    currentGameNameGlobal = gameName;

    // 3. Setup Input WhatsApp (Guna helper function di bawah)
    setupWhatsappLogic();

    // 4. Parallel Data Loading (Pantas)
    // Kita panggil Session, Produk, dan Payment Method serentak
    try {
        await Promise.all([ 
            checkSession(), 
            loadGameProducts(gameName),
            loadPaymentMethods() 
        ]);

    } catch (err) {
        console.error("Init Error:", err);
        // showToast("Ralat memuatkan data. Sila refresh.", "error"); // Optional
    }
});

// --- HELPER FUNCTION: WHATSAPP LOGIC ---
function setupWhatsappLogic() {
    const savedWhatsapp = localStorage.getItem('saved_whatsapp_number');
    const whatsappInput = document.getElementById('whatsapp-input');
    
    if (whatsappInput) {
        if (savedWhatsapp) whatsappInput.value = savedWhatsapp;
        
        whatsappInput.setAttribute('type', 'tel');
        whatsappInput.setAttribute('minlength', '10');
        whatsappInput.setAttribute('maxlength', '14');

        const debouncedSaveWa = debounce((val) => {
            localStorage.setItem('saved_whatsapp_number', val);
        }, 500);

        whatsappInput.addEventListener('input', (e) => {
            // Hanya benarkan nombor
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            debouncedSaveWa(e.target.value);
        });

        setupInputFocusHandlers('whatsapp-input');
    }
}

// --- DATA LOADING & PARSING ---

async function determineBestSellers(gameName) {
    try {
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('item_name')
            .eq('status', 'success') 
            .ilike('item_name', `${gameName}%`) 
            .order('created_at', { ascending: false })
            .limit(100);

        if (error || !data || data.length === 0) return;

        const counts = {};
        data.forEach(row => {
            const cleanName = row.item_name.replace(`${gameName} - `, '').trim();
            counts[cleanName] = (counts[cleanName] || 0) + 1;
        });

        const sortedNames = Object.keys(counts)
            .sort((a, b) => counts[b] - counts[a])
            .slice(0, 3); 

        bestSellerIds.clear();
        if(allProducts.length > 0) {
            allProducts.forEach(p => {
                if (sortedNames.includes(p.item_name)) {
                    bestSellerIds.add(p.id);
                }
            });
        }
    } catch (e) {
        console.error("Error calculating best sellers:", e);
    }
}

// --- KEMASKINI A: LOAD PRODUCTS & INPUTS ---

async function loadGameProducts(gameName) {
    try {
        const { data, error } = await supabaseClient
            .from('products_v2')
            .select(`
                id,
                game_name,
                items,
                image_url,
                banner_url,
                input_config,
                is_active,
                is_maintenance,
                maintenance_message
            `)
            .eq('game_name', gameName)
            .single();

        /* ===============================
           ❌ DATA TAK SAH
        =============================== */
        if (error || !data) {
            console.error("Game Not Found:", error);
            showToast("Game tidak dijumpai.", "error");
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        /* ===============================
           🔥 SIMPAN GLOBAL (PENTING)
        =============================== */
        parentGameData = data;

        /* ===============================
           ❌ GAME TIDAK AKTIF
        =============================== */
        if (data.is_active !== true) {
            document.body.innerHTML = `
                <div class="fixed inset-0 flex flex-col items-center justify-center bg-black text-white text-center px-6">
                    <i class="ph-fill ph-lock text-5xl text-red-500 mb-4"></i>
                    <h1 class="text-lg font-black mb-2">Produk Tidak Aktif</h1>
                    <p class="text-xs text-gray-400 mb-4">
                        Produk ini telah dinyahaktifkan oleh admin.
                    </p>
                    <button onclick="window.location.href='index.html'"
                        class="bg-yellow-400 text-black px-6 py-2 rounded-full text-sm font-bold">
                        Kembali
                    </button>
                </div>
            `;
            return;
        }

        /* ===============================
           🚧 GAME MAINTENANCE
        =============================== */
        if (data.is_maintenance === true) {
            document.body.innerHTML = `
                <div class="fixed inset-0 flex flex-col items-center justify-center bg-black text-white text-center px-6">
                    <i class="ph-fill ph-wrench text-5xl text-yellow-400 mb-4 animate-pulse"></i>
                    <h1 class="text-lg font-black mb-2">Sedang Diselenggara</h1>
                    <p class="text-xs text-gray-400 mb-4">
                        ${data.maintenance_message || 'Sila cuba semula sebentar lagi.'}
                    </p>
                    <button onclick="window.location.href='index.html'"
                        class="bg-yellow-400 text-black px-6 py-2 rounded-full text-sm font-bold">
                        Kembali
                    </button>
                </div>
            `;
            return;
        }

        /* ===============================
           ⚙️ INPUT CONFIG (UPDATE 1)
        =============================== */
        if (gameName === 'Buy XP' || gameName === 'Topup XP') {
            activeInputConfig = [{
                label: "Akaun Penerima",
                type: "readonly",
                width: "col-span-2",
                value: "Akaun Ini (Auto)"
            }];
        } 
        else if (Array.isArray(data.input_config) && data.input_config.length > 0) {
            activeInputConfig = data.input_config;
        } 
        else {
            activeInputConfig = [{
                label: "User ID",
                type: "text",
                width: "col-span-2"
            }];
        }

        /* ===============================
           📦 MAP ITEMS
        =============================== */
        if (Array.isArray(data.items)) {
            allProducts = data.items.map(item => ({
                id: item.id,
                game_name: data.game_name,
                item_name: item.name,
                price: parseFloat(item.price),
                original_price: item.original_price ? parseFloat(item.original_price) : null,
                stock: item.stock,
                category: item.category || 'Mobile',
                item_image: item.image || data.image_url,
                server_region: item.server_region || 'MALAY',
                is_promo: item.is_promo || false,
                promo_end: item.promo_end,
                game_id_parent: data.id
            }));
        } else {
            allProducts = [];
        }

        /* ===============================
           ✅ NORMAL FLOW (ONLY IF ACTIVE)
        =============================== */
        await determineBestSellers(gameName);
        renderGameDetails(data);
        extractCategories();
        switchServer('MALAY');
        checkAndShowAnnouncement(data.game_name);

    } catch (e) {
        console.error(e);
        showToast("Ralat sistem memuatkan produk.", "error");
    }
}

function renderGameDetails(gameData) {
    // 1. Set Nama Game
    document.getElementById('detail-game-name').innerText = gameData.game_name;
    
    const imgUrl = gameData.image_url || "https://placehold.co/600x400";
    
    // =========================================
    // A. LOGIC BANNER UTAMA
    // =========================================
    const bannerImg = document.getElementById('detail-game-img');
    const bannerSkeleton = document.getElementById('hero-skeleton');
    
    // Reset state jika perlu (untuk refresh)
    if(bannerSkeleton) bannerSkeleton.classList.remove('hidden');
    bannerImg.classList.add('opacity-0');

    bannerImg.src = gameData.banner_url || imgUrl;
    
    // Check Cache: Jika browser load laju sangat, onload HTML tak sempat trigger
    if (bannerImg.complete) {
        if(bannerSkeleton) bannerSkeleton.classList.add('hidden');
        bannerImg.classList.remove('opacity-0');
    }

    // =========================================
    // B. LOGIC ICON HEADER
    // =========================================
    const iconImg = document.getElementById('detail-game-icon');
    const iconSkeleton = document.getElementById('icon-skeleton');
    
    // Reset state
    if(iconSkeleton) iconSkeleton.classList.remove('hidden');

    iconImg.src = imgUrl; 
    
    // Check Cache Icon
    if (iconImg.complete) {
        if(iconSkeleton) iconSkeleton.classList.add('hidden');
    }

    // =========================================
    // C. LOGIC FLOATING BAR (BAWAH) - BARU
    // =========================================
    const barImg = document.getElementById('bar-game-img');
    const barSkeleton = document.getElementById('bar-skeleton');

    if(barImg) {
        // Reset state
        if(barSkeleton) barSkeleton.classList.remove('hidden');
        
        barImg.src = imgUrl;
        
        // Check Cache Floating Bar
        if (barImg.complete) {
             if(barSkeleton) barSkeleton.classList.add('hidden');
        }
    }

    // =========================================
    // D. RENDER LAIN-LAIN
    // =========================================
    renderDynamicInputs(gameData.game_name);
    renderGameDescription(gameData.game_name);
}

function renderDynamicInputs(gameName) {
    const container = document.getElementById('game-inputs-container');
    if (!container) return;

    // Bersihkan container tanpa innerHTML
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const isDualInput = activeInputConfig.length === 2;
    // Gunakan DocumentFragment untuk prestasi (hanya 1 kali reflow)
    const fragment = document.createDocumentFragment();

    // Wrapper Grid
    const gridDiv = createEl('div', 'grid grid-cols-2 gap-3');

    activeInputConfig.forEach((field, index) => {
        const inputId = `dynamic-input-${index}`;
        const isReadonly = field.type === 'readonly';
        const inputType = isReadonly ? 'text' : (field.type || 'text');
        
        // Tentukan lebar column
        let widthClass = 'col-span-2';
        if (isDualInput) widthClass = 'col-span-1';
        else if (field.width) widthClass = field.width === 'col-span-3' ? 'col-span-2' : field.width;

        // Container Input Group
        const groupDiv = createEl('div', `${widthClass} relative input-group bg-[#18181b] border border-gray-700 rounded-xl transition-colors hover:border-gray-500 focus-within:!border-yellow-400`);
        
        // Label
        const labelDiv = createEl('div', 'absolute top-2 left-4 text-[10px] text-gray-500 font-bold uppercase tracking-wider', field.label);
        groupDiv.appendChild(labelDiv);

        // Input Element
        const inputAttrs = {
            type: inputType,
            id: inputId,
            placeholder: field.placeholder || '',
            value: (isReadonly && field.value) ? field.value : ''
        };
        
        if (field.minLength) inputAttrs.minlength = field.minLength;
        if (field.maxLength) inputAttrs.maxlength = field.maxLength;
        if (isReadonly) {
            inputAttrs.readonly = true;
            inputAttrs.disabled = true;
        }

        const bgClass = isReadonly ? 'bg-white/5 text-gray-400 cursor-not-allowed border-dashed' : 'bg-transparent';
        const inputEl = createEl('input', `w-full ${bgClass} px-4 pr-10 pt-7 pb-3 text-sm text-white outline-none font-mono placeholder-gray-700 rounded-xl`, '', inputAttrs);
        
        groupDiv.appendChild(inputEl);

        // Paste Button (Hanya untuk input pertama & bukan readonly)
        if (index === 0 && !isReadonly) {
            const pasteBtn = createEl('button', 'absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-yellow-400 transition-colors cursor-pointer', '', {
                type: 'button', // Elak submit form
                onclick: () => pasteText(inputId)
            });
            pasteBtn.innerHTML = '<i class="ph ph-clipboard-text text-xl"></i>'; // Icon masih okay guna innerHTML sebab statik
            groupDiv.appendChild(pasteBtn);
        }

        gridDiv.appendChild(groupDiv);
    });

    fragment.appendChild(gridDiv);

    // Render History UI (Logic asal dikekalkan)
    if (gameName !== 'Buy XP' && gameName !== 'Topup XP') {
        const historyContainer = document.createElement('div');
        // Nota: getIdHistoryUI masih pulangkan string HTML. 
        // Untuk fasa ini, kita boleh inject history UI secara berasingan atau refactor getIdHistoryUI nanti.
        historyContainer.innerHTML = getIdHistoryUI(); 
        fragment.appendChild(historyContainer);
    }

    container.appendChild(fragment);

    // Update Info Text
    const infoTextEl = document.querySelector('#section-user-info .game-input-info');
    if (infoTextEl) {
        infoTextEl.textContent = ''; // Clear text lama
        infoTextEl.append(
            document.createTextNode('Sila pastikan '),
            createEl('strong', '', activeInputConfig.map(f => f.label).join(" & ")),
            document.createTextNode(' adalah betul. Kesilapan pengisian tidak boleh dikembalikan.')
        );
    }

    // Setup Listeners (Kekal sama)
    setupDynamicInputListeners(gameName);
}

// Function berasingan untuk setup listener supaya kod lebih kemas
function setupDynamicInputListeners(gameName) {
    activeInputConfig.forEach((field, index) => {
        if(field.type === 'readonly') return;

        const inputId = `dynamic-input-${index}`;
        const inputEl = document.getElementById(inputId);
        const storageKey = `saved_input_${gameName}_${index}`;
        
        setupInputFocusHandlers(inputId);

        const savedVal = localStorage.getItem(storageKey);
        if (savedVal && inputEl) inputEl.value = savedVal;

        const debouncedSave = debounce((val) => {
             localStorage.setItem(storageKey, val);
        }, 500);

        if(inputEl) {
            inputEl.addEventListener('input', (e) => {
                debouncedSave(e.target.value);
            });
        }
    });
}

async function loadPaymentMethods() {
    try {
        // --- OPTIMIZATION: SELECT SPECIFIC COLUMNS ONLY ---
        const { data, error } = await supabaseClient
            .from('payment_methods')
            .select('id, name, subtitle, fee_type, fee_value, is_maintenance, logo_url, sort_order, instructions, account_number, account_holder, qr_image, is_active') 
            .eq('is_active', true) 
            .order('sort_order', { ascending: true });
            
        if (error) return;

        allPaymentMethods = data;
        renderPaymentMethods();

        // --- KOD AUTO-SELECT DIBUANG DARI SINI ---
        
    } catch (e) {
        console.error(e);
    }
}

// --- CARI FUNCTION INI & GANTI (renderPaymentMethods) ---

function renderPaymentMethods() {
    const mainGrid = document.getElementById('payment-grid-main');
    const moreGrid = document.getElementById('payment-grid-more');
    const btnShowAll = document.getElementById('btn-show-all-payments');

    if(!allPaymentMethods || allPaymentMethods.length === 0) return;

    // --- 1. Clone Array ---
    let methodsToDisplay = [...allPaymentMethods];

    // --- 2. LOGIC SORTING: UTAMAKAN WHATSAPP JIKA GUEST ---
    if (!currentUser) {
        const waIndex = methodsToDisplay.findIndex(m => m.id === 'whatsapp_manual');
        if (waIndex > -1) {
            const [waMethod] = methodsToDisplay.splice(waIndex, 1);
            methodsToDisplay.unshift(waMethod);
        }
    }

    // --- 3. Filter Khas Page "Buy XP" ---
    if (currentGameNameGlobal === 'Buy XP' || currentGameNameGlobal === 'Topup XP') {
        methodsToDisplay = methodsToDisplay.filter(m => m.id === 'wallet');
    }

    const iconMap = {
        'wallet': { icon: 'wallet', color: 'text-yellow-400' },
        'bank_qr': { icon: 'qr-code', color: 'text-pink-500' },
        'tng_pin': { icon: 'ticket', color: 'text-blue-500' },
        'digi_pin': { icon: 'cardholder', color: 'text-yellow-300' },
        'fpx': { icon: 'bank', color: 'text-green-400' },
        'celcom_pin': { icon: 'sim-card', color: 'text-blue-600' },
        'maxis_pin': { icon: 'sim-card', color: 'text-green-600' }
    };

    const renderCard = (method) => {
        let feeText = '';
        if (method.fee_type === 'percentage' && method.fee_value > 0) feeText = `(Caj ${method.fee_value}%)`;
        else if (method.fee_type === 'flat' && method.fee_value > 0) feeText = `(Caj RM${method.fee_value.toFixed(2)})`;

        const maintenanceClass = method.is_maintenance ? 'payment-disabled' : '';
        const maintenanceOverlay = method.is_maintenance ? `<div class="absolute inset-0 bg-black/80 flex items-center justify-center z-20 backdrop-blur-[1px] rounded-xl"><span class="bg-red-600 text-white text-[9px] font-bold px-2 py-1 rounded border border-red-400">Pembayaran tidak tersedia</span></div>` : '';

        // --- LAZY LOAD UNTUK LOGO ---
        let iconHtml = method.logo_url 
            ? `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E" data-src="${method.logo_url}" class="lazy-load-target w-8 h-8 object-contain mb-2 rounded bg-white/5 p-0.5 opacity-0 transition-opacity duration-300">` 
            : `<i class="ph ph-${(iconMap[method.id] || {}).icon || 'credit-card'} text-2xl mb-2 ${(iconMap[method.id] || {}).color || 'text-white'}"></i>`;

        return `
            <div id="pay-method-${method.id}" class="payment-method-card bg-[#18181b] p-4 rounded-xl cursor-pointer group ${maintenanceClass}" onclick="selectPaymentMethod('${method.id}')">
                ${maintenanceOverlay}
                
                <div class="check-mark-icon">
                    <i class="ph-bold ph-check"></i>
                </div>

                ${iconHtml}
                <div class="text-xs font-bold text-white">${method.name}</div>
                <div class="text-[10px] text-gray-400 mt-1">${method.subtitle || ''} <span class="text-red-400 font-mono">${feeText}</span></div>
                ${method.id === 'wallet' ? `<div class="text-[10px] text-yellow-500 font-mono mt-0.5">RM <span id="current-balance-display">${currentProfile ? (currentProfile.wallet_balance >= 1e3 ? (currentProfile.wallet_balance/1000).toFixed(1)+'K' : currentProfile.wallet_balance.toFixed(2)) : '0.00'}</span></div>` : ''}
            </div>
        `;
    };

    const topMethods = methodsToDisplay.slice(0, 2);
    const otherMethods = methodsToDisplay.slice(2);

    mainGrid.innerHTML = topMethods.map(renderCard).join('');
    moreGrid.innerHTML = otherMethods.map(renderCard).join('');

    if (otherMethods.length === 0) {
        btnShowAll.classList.add('hidden');
    } else {
        btnShowAll.classList.remove('hidden');
    }

    setTimeout(() => initLazyImages(), 100);
}

function toggleAllPayments() {
    const moreGrid = document.getElementById('payment-grid-more');
    const btn = document.getElementById('btn-show-all-payments');
    
    const isHidden = moreGrid.classList.contains('hidden');

    if (isHidden) {
        moreGrid.classList.remove('hidden');
        btn.innerHTML = `Sembunyikan Pembayaran <i class="ph ph-caret-up"></i>`;
    } else {
        moreGrid.classList.add('hidden');
        btn.innerHTML = `Lihat Semua Kaedah Pembayaran <i class="ph ph-caret-down"></i>`;
    }
}

function extractCategories() {
    const categories = ['ALL'];
    allProducts.forEach(p => {
        const cat = p.category || 'Lain-lain';
        if (!categories.includes(cat)) categories.push(cat);
    });
    
    const container = document.getElementById('category-filters');
    if (!container) return;

    container.textContent = ''; // Clear

    categories.forEach(cat => {
        const btnId = `btn-cat-${cat.replace(/\s+/g, '-')}`;
        const isActive = cat === 'ALL';
        
        const btn = createEl('button', `cat-pill px-4 py-1.5 rounded-full text-[10px] font-bold border transition ${isActive ? 'cat-active' : 'cat-inactive'}`, cat, {
            id: btnId,
            onclick: () => selectCategory(cat) // Direct function binding
        });
        
        container.appendChild(btn);
    });
}

function selectCategory(category) {
    currentCategory = category;
    document.querySelectorAll('.cat-pill').forEach(btn => {
        btn.classList.remove('cat-active');
        btn.classList.add('cat-inactive');
    });
    const activeBtn = document.getElementById(`btn-cat-${category.replace(/\s+/g, '-')}`);
    if(activeBtn) {
        activeBtn.classList.remove('cat-inactive');
        activeBtn.classList.add('cat-active');
    }
    currentLimit = 6; 
    applyFilters();
}

function switchServer(region) {
    currentServerRegion = region;
    const btnMalay = document.getElementById('btn-server-malay');
    const btnIndo = document.getElementById('btn-server-indo');
    
    btnMalay.classList.remove('bg-yellow-400', 'text-black', 'shadow-lg');
    btnMalay.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
    btnIndo.classList.remove('bg-yellow-400', 'text-black', 'shadow-lg');
    btnIndo.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
    
    if(region === 'MALAY') {
        btnMalay.classList.add('bg-yellow-400', 'text-black', 'shadow-lg');
        btnMalay.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
    } else {
        btnIndo.classList.add('bg-yellow-400', 'text-black', 'shadow-lg');
        btnIndo.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-white/5');
    }
    applyFilters();
}

function applyFilters() {
    // 1. Ambil masa sekarang (Timestamp Number) SEKALI SAHAJA
    const nowTime = Date.now(); 

    let activePromoItems = [];
    let regularItems = [];

    // 2. Single Pass Loop
    for (let i = 0; i < allProducts.length; i++) {
        const p = allProducts[i];

        // A. Filter Region (Skip jika tak sama)
        if (p.server_region && p.server_region !== currentServerRegion) {
            continue; 
        }

        // B. Filter Kategori (Skip jika tak sama)
        if (currentCategory !== 'ALL' && (p.category || 'Lain-lain') !== currentCategory) {
            continue;
        }

        // C. LOGIK BARU: Asingkan Promo vs Biasa & HIDE Expired
        if (p.is_promo && p.promo_end) {
            // Convert string tarikh ke timestamp
            const promoEndTimestamp = new Date(p.promo_end).getTime();

            // CHECK: Adakah promo dah tamat?
            if (promoEndTimestamp <= nowTime) {
                // JIKA TAMAT: 'continue' bermaksud skip item ini terus. 
                // Ia takkan masuk activePromoItems, dan takkan masuk regularItems.
                continue; 
            }

            // JIKA MASIH VALID: Masukkan ke list promo
            activePromoItems.push(p);

        } else {
            // JIKA BUKAN ITEM PROMO: Masukkan ke list biasa
            regularItems.push(p);
        }
    }

    // 3. Sort Harga (Murah ke Mahal)
    activePromoItems.sort((a, b) => a.price - b.price);
    regularItems.sort((a, b) => a.price - b.price);

    // 4. Gabungkan: Promo duduk ATAS, Biasa duduk BAWAH
    filteredProducts = activePromoItems.concat(regularItems);
    
    // 5. Sembunyikan section promo lama
    const oldPromoSection = document.getElementById('promo-section');
    if(oldPromoSection) oldPromoSection.classList.add('hidden');

    // 6. Render Grid
    renderGrid(currentLimit); 
}

function renderPromoGrid() {
    const promoSection = document.getElementById('promo-section');
    const promoGrid = document.getElementById('promo-grid');
    
    if (promoProducts.length === 0) {
        promoSection.classList.add('hidden');
        if(promoInterval) clearInterval(promoInterval);
        return;
    }

    promoSection.classList.remove('hidden');
    const endTimes = promoProducts.map(p => new Date(p.promo_end).getTime());
    const earliestEnd = Math.min(...endTimes);
    startPromoTimer(earliestEnd);

    promoGrid.innerHTML = promoProducts.map(item => {
        const displayImage = item.item_image || "https://cdn-icons-png.flaticon.com/512/8146/8146767.png";
        
        let clickAction = `selectItem(this, '${item.id}')`;
        let stockDisplay = '';
        let opacityClass = '';
        let soldOutOverlay = '';
        let discountBadge = '';

        if (item.original_price && item.original_price > item.price) {
            const pct = Math.round(((item.original_price - item.price) / item.original_price) * 100);
            discountBadge = `<div class="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm z-20">-${pct}%</div>`;
        }

        if (item.stock !== null) {
            if (item.stock <= 0) {
                soldOutOverlay = `
                    <div class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30 backdrop-blur-[2px]">
                        <span class="text-red-500 font-black text-xl border-2 border-red-500 px-3 py-1 -rotate-12 rounded opacity-80">HABIS</span>
                        <span class="text-[9px] text-gray-400 mt-2 font-mono">Sold Out</span>
                    </div>`;
                opacityClass = 'opacity-60 pointer-events-none grayscale';
                clickAction = ''; 
                stockDisplay = `<div class="w-full bg-white/5 rounded-full h-1.5 mt-2"><div class="bg-red-900 h-1.5 rounded-full" style="width: 100%"></div></div>`;
            } else {
                const stockPercent = item.stock < 10 ? 15 : (item.stock < 50 ? 40 : 85);
                const colorBar = item.stock < 10 ? 'bg-red-500' : 'bg-yellow-400';
                
                stockDisplay = `
                    <div class="w-full mt-2">
                        <div class="flex justify-between items-center mb-0.5">
                            <span class="text-[8px] text-gray-400 flex items-center gap-1"><i class="ph-fill ph-fire text-orange-500"></i> Segera!</span>
                            <span class="text-[8px] text-white font-bold">${item.stock} Left</span>
                        </div>
                        <div class="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                            <div class="${colorBar} h-1.5 rounded-full shadow-[0_0_10px_currentColor]" style="width: ${stockPercent}%"></div>
                        </div>
                    </div>`;
            }
        }

        return `
        <div onclick="${clickAction}" class="relative group cursor-pointer overflow-hidden rounded-xl bg-[#18181b] border border-yellow-400/20 hover:border-yellow-400 transition-all duration-300 shadow-lg hover:shadow-yellow-400/10 ${opacityClass}">
            ${soldOutOverlay}
            ${discountBadge}
            
            <div class="absolute top-0 left-0 bg-gradient-to-r from-orange-500 to-yellow-500 text-black text-[9px] font-black px-2 py-0.5 rounded-br-lg z-20 flex items-center gap-1">
                <i class="ph-fill ph-lightning"></i> FLASH
            </div>

            <div class="check-icon hidden absolute inset-0 border-2 border-yellow-400 rounded-xl z-20 pointer-events-none bg-yellow-400/5">
                <div class="absolute top-2 right-2 bg-yellow-400 text-black p-0.5 rounded-full shadow-lg">
                    <i class="ph-fill ph-check text-xs"></i>
                </div>
            </div>

            <div class="p-3 flex flex-col items-center text-center h-full justify-between relative z-10">
                <div class="absolute inset-0 bg-gradient-to-b from-yellow-400/5 to-transparent opacity-0 group-hover:opacity-100 transition duration-500"></div>

                <div class="mt-4 mb-2 relative">
                    <div class="absolute inset-0 bg-yellow-400/20 blur-xl rounded-full scale-0 group-hover:scale-125 transition duration-500"></div>
                    
                    <img 
                        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E" 
                        data-src="${displayImage}" 
                        class="lazy-load-target w-10 h-10 object-contain relative z-10 drop-shadow-md group-hover:scale-110 transition-all duration-300 opacity-0"
                    >
                    </div>

                <div class="w-full">
                    <div class="font-bold text-white text-[11px] leading-tight mb-1 truncate">${item.item_name}</div>
                    
                    <div class="flex flex-col items-center justify-center">
                        <div class="text-[9px] text-gray-500 line-through decoration-red-500">RM ${item.original_price ? item.original_price.toFixed(2) : (item.price * 1.3).toFixed(2)}</div>
                        <div class="text-base font-black text-yellow-400 leading-none">RM ${item.price.toFixed(2)}</div>
                    </div>

                    ${stockDisplay}
                </div>
            </div>
        </div>
    `}).join('');

    // Panggil Lazy Load Observer selepas HTML dimasukkan
    setTimeout(() => initLazyImages(), 100);
}

function startPromoTimer(endTimeMs) {
    if(promoInterval) clearInterval(promoInterval);
    const timerDisplay = document.getElementById('promo-timer');
    const updateTimer = () => {
        const now = new Date().getTime();
        const distance = endTimeMs - now;
        if (distance < 0) {
            clearInterval(promoInterval);
            timerDisplay.innerText = "EXPIRED";
            switchServer(currentServerRegion); 
            return;
        }
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        timerDisplay.innerText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };
    updateTimer(); 
    promoInterval = setInterval(updateTimer, 1000);
}

// --- FUNCTION 1: renderGrid (Dikemaskini untuk Append Mode) ---
function renderGrid(limit, isAppend = false, startIndex = 0) {
    const grid = (typeof UI !== 'undefined' && UI.itemsGrid) ? UI.itemsGrid : document.getElementById('items-grid');
    if (!grid) return;

    // PERUBAHAN UTAMA: Hanya kosongkan grid jika BUKAN mode append (Load kali pertama/Filter)
    if (!isAppend) {
        grid.textContent = '';
    }

    // Kira item mana yang perlu dipaparkan
    // Jika append, kita ambil dari startIndex hingga limit baru
    // Jika reset, kita ambil dari 0 hingga limit
    const itemsToShow = filteredProducts.slice(startIndex, limit);
    
    // Handle Button Load More (Kekal sama - update text sahaja)
    const btnMore = document.getElementById('btn-more-items');
    if(btnMore) {
        if(filteredProducts.length > limit) {
            btnMore.classList.remove('hidden');
            btnMore.innerHTML = `Load More (${filteredProducts.length - limit} lagi) <i class="ph ph-caret-down"></i>`; 
        } else {
            btnMore.classList.add('hidden');
        }
    }

    // Papar mesej kosong HANYA jika bukan mode append (Grid memang kosong)
    if (!isAppend && itemsToShow.length === 0) {
        grid.appendChild(createEl('div', 'col-span-3 text-center text-xs text-gray-500 py-10', 'Tiada item dalam kategori ini.'));
        return;
    }

    const nowTime = Date.now(); 
    const fragment = document.createDocumentFragment();

    itemsToShow.forEach(item => {
        const isPromoActive = item.is_promo && item.promo_end && new Date(item.promo_end).getTime() > nowTime;
        const isBestSeller = bestSellerIds.has(item.id);
        const displayImage = item.item_image || "https://cdn-icons-png.flaticon.com/512/8146/8146767.png";
        
        // Cek Cache (Function global dari kod asal anda)
        const isCached = loadedImageCache.has(displayImage);

        // Tentukan style asas
        let borderClass = 'border-white/5';
        let opacityStyle = '';
        let stockContent = null; 

        // --- Container Utama ---
        const card = createEl('div', 'bg-[#18181b] rounded-xl p-3 cursor-pointer group hover:border-yellow-400 hover:bg-[#202023] transition flex flex-col justify-between relative overflow-hidden min-h-[6rem] border shadow-sm');
        
        // --- Badge Logic ---
        if (isPromoActive) {
            borderClass = 'border-yellow-400/30';
            const badge = createEl('div', 'absolute top-0 left-0 bg-gradient-to-r from-orange-500 to-yellow-500 text-black text-[9px] font-black px-2 py-0.5 rounded-br-lg z-20 shadow-sm flex items-center gap-1');
            badge.innerHTML = '<i class="ph-fill ph-lightning"></i> FLASH';
            card.appendChild(badge);
        } else if (isBestSeller) {
            borderClass = 'border-red-500/30';
            const badge = createEl('div', 'absolute top-0 left-0 bg-gradient-to-r from-red-600 to-pink-600 text-white text-[9px] font-black px-2 py-0.5 rounded-br-lg z-20 shadow-sm flex items-center gap-1');
            badge.innerHTML = '<i class="ph-fill ph-fire text-yellow-300"></i> BEST SELLER';
            card.appendChild(badge);
        }
        card.className += ` ${borderClass}`; 

        // --- Stock Logic ---
        if (item.stock !== null) {
            if (item.stock <= 0) {
                // Out of Stock UI
                opacityStyle = 'opacity-50 grayscale pointer-events-none';
                card.onclick = null; 
                
                const overlay = createEl('div', 'absolute inset-0 flex items-center justify-center z-30 bg-black/50 backdrop-blur-[1px]');
                overlay.innerHTML = '<span class="text-red-500 font-black text-xs border border-red-500 px-2 py-1 -rotate-12 rounded">HABIS</span>';
                card.appendChild(overlay);

                stockContent = createEl('div', 'w-full mt-3 pt-2 border-t border-dashed border-white/10');
                stockContent.innerHTML = '<div class="w-full bg-[#27272a] rounded-full h-1.5"><div class="bg-red-900/50 h-full rounded-full w-full"></div></div>';

            } else if (isPromoActive) {
                // Promo Stock Bar
                const s = item.stock;
                const stockPercent = s < 5 ? 15 : (s < 20 ? 40 : (s < 50 ? 60 : 85));
                const isLow = s < 10;
                const barGradient = isLow ? 'bg-gradient-to-r from-red-600 to-red-500' : 'bg-gradient-to-r from-yellow-500 to-yellow-400';
                const textColor = isLow ? 'text-red-400' : 'text-gray-400';

                stockContent = createEl('div', 'w-full mt-3 pt-2 border-t border-dashed border-white/10');
                stockContent.innerHTML = `
                    <div class="flex justify-between items-end mb-1">
                        <span class="text-[9px] text-gray-500 font-medium flex items-center gap-1"><i class="ph-fill ph-fire text-orange-500"></i> Hot</span>
                        <span class="text-[9px] ${textColor} font-bold font-mono tracking-wide">${s} stock</span>
                    </div>
                    <div class="w-full bg-[#27272a] rounded-full h-1.5 overflow-hidden">
                        <div class="${barGradient} h-full rounded-full transition-all duration-500" style="width: ${stockPercent}%"></div>
                    </div>`;
            } else {
                // Spacer
                stockContent = createEl('div', 'w-full mt-3 pt-2 border-t border-transparent opacity-0 pointer-events-none select-none');
                stockContent.innerHTML = '<div class="flex justify-between items-end mb-1"><span class="text-[9px]">Spacer</span></div><div class="w-full h-1.5"></div>';
            }
        } else {
            // Spacer if no stock info
            stockContent = createEl('div', 'w-full mt-3 pt-2 border-t border-transparent opacity-0 pointer-events-none select-none');
            stockContent.innerHTML = '<div class="flex justify-between items-end mb-1"><span class="text-[9px]">Spacer</span></div><div class="w-full h-1.5"></div>';
        }
        
        if(opacityStyle) card.className += ` ${opacityStyle}`;
        if(!opacityStyle) {
            card.onclick = () => selectItem(card, item.id);
        }

        // --- Check Icon ---
        const checkIcon = createEl('div', 'check-icon hidden absolute top-0 right-0 bg-yellow-400 text-black p-1 rounded-bl-lg z-20 shadow-md');
        checkIcon.innerHTML = '<i class="ph-fill ph-check text-xs"></i>';
        card.appendChild(checkIcon);

        // --- Wrapper Content ---
        const contentWrapper = createEl('div', 'flex flex-col items-center text-center mt-4 z-10 h-full justify-between');
        
        // Image & Name Wrapper
        const topSection = createEl('div', 'flex flex-col items-center w-full');
        const imgContainer = createEl('div', 'relative mb-2');
        
        const imgEl = createEl('img', 'w-8 h-8 object-contain drop-shadow-md group-hover:scale-110 transition-all duration-300', '', {
            alt: item.item_name
        });
        
        if (isCached) {
            imgEl.src = displayImage;
            imgEl.classList.add('opacity-100');
        } else {
            // Placeholder SVG data URI
            imgEl.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E";
            imgEl.dataset.src = displayImage;
            imgEl.classList.add('lazy-load-target', 'opacity-0');
        }
        imgContainer.appendChild(imgEl);
        
        const nameEl = createEl('span', 'font-bold text-white text-[10px] leading-tight group-hover:text-white transition line-clamp-2 min-h-[2.5em] flex items-center justify-center', item.item_name);
        
        topSection.appendChild(imgContainer);
        topSection.appendChild(nameEl);

        // Price Section
        const bottomSection = createEl('div', 'w-full mt-1');
        
        // Price Logic
        const priceContainer = createEl('div', 'flex flex-col items-center leading-none');
        const formattedPrice = item.price.toFixed(2);

        if (item.original_price && item.original_price > item.price) {
            const discountPct = Math.round(((item.original_price - item.price) / item.original_price) * 100);
            
            const oriPriceRow = createEl('div', 'flex items-center gap-1 mb-0.5');
            oriPriceRow.innerHTML = `<span class="text-[9px] text-gray-500 line-through">RM${item.original_price.toFixed(2)}</span><span class="text-[9px] text-red-400 font-bold">-${discountPct}%</span>`;
            
            const finalPriceEl = createEl('div', 'text-sm font-black text-yellow-400', `RM ${formattedPrice}`);
            
            priceContainer.appendChild(oriPriceRow);
            priceContainer.appendChild(finalPriceEl);
        } else {
             const spacer = createEl('div', 'flex items-center gap-1 mb-0.5 opacity-0 select-none pointer-events-none');
             spacer.innerHTML = '<span class="text-[9px]">RM0.00</span><span class="text-[9px]">-0%</span>';
             
             const finalPriceEl = createEl('div', 'text-sm font-bold text-white group-hover:text-yellow-400 transition', `RM ${formattedPrice}`);
             
             priceContainer.appendChild(spacer);
             priceContainer.appendChild(finalPriceEl);
        }

        bottomSection.appendChild(priceContainer);
        if(stockContent) bottomSection.appendChild(stockContent);

        contentWrapper.appendChild(topSection);
        contentWrapper.appendChild(bottomSection);
        card.appendChild(contentWrapper);

        fragment.appendChild(card);
    });

    // PENTING: Append fragment ke grid sedia ada
    grid.appendChild(fragment);

    // Re-init Lazy Load
    if (window.requestAnimationFrame) {
        requestAnimationFrame(() => initLazyImages());
    } else {
        setTimeout(() => initLazyImages(), 50);
    }
}

// --- FUNCTION 2: loadMoreItems (Dikemaskini untuk panggil Append) ---
function loadMoreItems() {
    const oldLimit = currentLimit; // Simpan had lama sebagai titik mula
    currentLimit += 10;            // Tambah had baru
    
    // Panggil renderGrid dengan parameter:
    // limit: currentLimit (had baru)
    // isAppend: true (JANGAN padam grid)
    // startIndex: oldLimit (mula render dari item selepas had lama)
    renderGrid(currentLimit, true, oldLimit);
}

function selectItem(element, id) {
    // 1. Cari produk asal dari senarai
    const originalProduct = allProducts.find(p => p.id == id);
    
    // Safety check jika produk tak jumpa
    if (!originalProduct) return;

    // 2. Check Stock
    if (originalProduct.stock !== null && originalProduct.stock <= 0) {
        showToast("Maaf, stok item ini telah habis.", "error");
        return;
    }

    // 3. UI Selection Update (Visual kotak terpilih)
    document.querySelectorAll('#items-grid > div, #promo-grid > div').forEach(el => {
        el.classList.remove('item-selected');
        // Guna optional chaining (?.) untuk elak error jika check-icon tiada
        el.querySelector('.check-icon')?.classList.add('hidden');
    });
    
    const checkIcon = element.querySelector('.check-icon');
    if(checkIcon) checkIcon.classList.remove('hidden');
    element.classList.add('item-selected');

    // 4. CLONE produk & Reset State
    selectedProduct = { ...originalProduct };
    selectedQuantity = 1;
   

    // Pastikan butang bayar sentiasa enable (sebab tiada logik harga 0 lagi)
    const btnPay = document.getElementById('btn-main-pay');
    if(btnPay) {
        btnPay.disabled = false;
        btnPay.classList.remove('opacity-50', 'cursor-not-allowed', 'grayscale');
    }
   

    // --- (LANGKAH 5: LOGIK CUSTOM AMOUNT TELAH DIBUANG) ---

    // 6. Update Toolbar Bawah
    const qtyDisplay = document.getElementById('qty-input-display');
    if(qtyDisplay) qtyDisplay.innerText = "1";
    
    const barQty = document.getElementById('bar-qty-display');
    if(barQty) barQty.innerText = "Kuantiti: 1";
    
    const barName = document.getElementById('bar-item-name');
    if(barName) barName.innerText = selectedProduct.item_name;
    
    const barImg = document.getElementById('bar-game-img');
    if(barImg) {
        barImg.src = selectedProduct.item_image || selectedProduct.image_url || "https://cdn-icons-png.flaticon.com/512/8146/8146767.png";
    }

    // 7. Voucher Logic Check (Re-validate voucher jika user tukar item)
    if (currentVoucher) {
        const subtotal = selectedProduct.price * selectedQuantity;
        let error = null;
        
        if (subtotal < currentVoucher.min_spend) {
            error = `Item kurang daripada belanja minima (Perlu RM${currentVoucher.min_spend}).`;
        } else if (currentVoucher.max_spend && subtotal > currentVoucher.max_spend) {
            error = "Item melebihi had maksima voucher.";
        }
        
        if (error) { 
            removeVoucher(); 
            showToast(`Baucar dibuang: ${error}`, "info"); 
        }
    }

    updateTotalPrice();
    toggleBottomBar(true);

    // 8. Auto Scroll & Auto Select Payment
    // Nota: Syarat (!selectedProduct.isCustom) dibuang supaya ia jalan untuk semua item
    setTimeout(() => {
        if(typeof scrollToSection === 'function') scrollToSection('section-user-info');
    }, 200);

    // --- AUTO SELECT LAST PAYMENT METHOD ---
    const lastPayment = localStorage.getItem('user_last_payment');
    
    if (lastPayment) {
        // Check jika method wujud dalam sistem dan tidak maintenance
        const methodExists = allPaymentMethods.find(m => m.id === lastPayment);
        
        if (methodExists && !methodExists.is_maintenance) {
            // Timeout pendek supaya UI sempat render
            setTimeout(() => {
                selectPaymentMethod(lastPayment);
            }, 300); // 300ms supaya lepas scroll
        }
    }
}

// --- GANTI FUNCTION INI DALAM topup.js ---

async function updateQuantity(change, event) {
    // 1. Hentikan event bubbling jika perlu
    if(event) event.stopPropagation();
    
    // 2. Safety check
    if(!selectedProduct) return;
    
    const newQty = selectedQuantity + change;
    
    // --- VALIDATION ASAS ---
    
    // Minimum 1
    if(newQty < 1) return;
    
    // Semak stok (jika data stok wujud)
    if (selectedProduct.stock !== null && newQty > selectedProduct.stock) {
        showToast(`Maaf, stok hanya tinggal ${selectedProduct.stock} unit.`, "error");
        return;
    }

    // Maksimum limit transaksi
    if(newQty > 10) return showToast("Maksimum 10 unit setiap transaksi", "error");
    
    // --- UPDATE UI SERTA-MERTA (OPTIMISTIC UPDATE) ---
    // Kita update nombor dahulu supaya user rasa laju (tiada lag)
    selectedQuantity = newQty;
    
    const qtyDisplay = document.getElementById('qty-input-display');
    if(qtyDisplay) qtyDisplay.innerText = selectedQuantity;
    
    const barQty = document.getElementById('bar-qty-display');
    if(barQty) barQty.innerText = `Kuantiti: ${selectedQuantity}`;
    
    // Kira harga sementara (berdasarkan diskaun sedia ada dalam memori)
    updateTotalPrice();
    
    // --- LOGIK LEBIH PANTAS (DEBOUNCE) UNTUK CHECK BAUCAR ---
    if (currentVoucher && currentUser) {
        
        // A. Batalkan timer lama jika user tekan lagi dalam masa 500ms
        if (voucherCheckDebounceTimer) {
            clearTimeout(voucherCheckDebounceTimer);
        }

        // B. Mulakan timer baru (Tunggu 500ms berhenti tekan, baru check DB)
        voucherCheckDebounceTimer = setTimeout(async () => {
            
            // Console log untuk debug (boleh buang nanti)
            console.log("Menyemak status baucar di server..."); 

            const subtotal = selectedProduct.price * selectedQuantity;

            try {
                // Panggil function SQL: verify_voucher_status
                const { data, error } = await supabaseClient.rpc('verify_voucher_status', {
                    p_code: currentVoucher.code,
                    p_user_id: currentUser.id,
                    p_game_name: selectedProduct.game_name,
                    p_amount: subtotal
                });

                if (error) throw error;

                // C. Proses Data dari Server
                if (data && data.valid === false) {
                    // Kes 1: Baucar dah tak valid (cth: bawah min spend)
                    removeVoucher(); 
                    showToast(`Baucar dibuang: ${data.message}`, "error");
                } else {
                    // Kes 2: Masih valid, update nilai diskaun yang tepat dari server
                    // (Penting untuk diskaun yang ada had maksimum/capped)
                    currentVoucher.calculated_discount = data.calculated_discount;
                }
                
                // D. Update harga kali terakhir dengan data sah dari server
                updateTotalPrice();

            } catch (err) {
                console.error("Ralat semakan baucar:", err);
            }
        }, 500); // Masa penangguhan: 500 millisecond
    }
}

function selectPaymentMethod(methodId) {
    // =========================================================
    // 1. LOGIC WAJIB PILIH ITEM DAHULU
    // =========================================================
    if (!selectedProduct) {
        showToast("Sila pilih item dahulu sebelum memilih pembayaran!", "error");
        
        // Auto scroll naik ke bahagian produk
        if (typeof scrollToSection === 'function') {
            scrollToSection('section-select-item'); 
        } else {
             // Fallback jika function scrollToSection tiada
            const grid = document.getElementById('items-grid');
            if(grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        return; // STOP: Jangan benarkan code di bawah berjalan
    }
    // =========================================================

    const methodObj = allPaymentMethods.find(m => m.id === methodId);
    
    if(!methodObj) return;
    if(methodObj.is_maintenance) {
        showToast("Kaedah ini sedang diselenggara.", "error");
        return;
    }

    // --- UPDATE: SIMPAN KE STORAGE ---
    // Ini supaya bila refresh atau auto-select item, sistem ingat user suka bayar guna apa
    localStorage.setItem('user_last_payment', methodId);
    // ---------------------------------

    selectedPaymentMethod = methodId;
    selectedPaymentMethodDetails = methodObj; 
    
    // --- UPDATE VISUAL (CSS CHECKMARK) ---
    // Kita reset semua kad dahulu
    document.querySelectorAll('.payment-method-card').forEach(el => {
        el.classList.remove('payment-method-selected');
        // Nota: Kita tak perlu main opacity manual lagi sebab CSS baru akan handle
    });

    // Tambah class selected pada kad yang dipilih
    // CSS akan automatik munculkan icon checkmark bila class ini ada
    const el = document.getElementById(`pay-method-${methodId}`);
    if(el) {
        el.classList.add('payment-method-selected');
    }

    // --- LOGIC: BLOCK VOUCHER UNTUK WHATSAPP MANUAL ---
    // Jika user pilih WhatsApp Manual DAN ada voucher aktif, kita buang voucher tu.
    if (methodId === 'whatsapp_manual' && currentVoucher) {
        removeVoucher(); // Panggil function remove voucher yang sedia ada
        showToast("Baucar tidak boleh digunakan untuk pembayaran direct.", "error");
    }
    // -------------------------------------------------------

    // --- BAHAGIAN LOGIK LOGIN WARNING ---
    const warn = document.getElementById('login-warning');
    
    if (!currentUser) {
        // Jika User Belum Login:
        if (methodId === 'whatsapp_manual') {
            // Kalau pilih WhatsApp Manual -> Sembunyikan Warning (Boleh Guest)
            warn.classList.add('hidden');
        } else {
            // Kalau pilih Wallet/Lain-lain -> Tunjuk Warning (Wajib Login)
            warn.classList.remove('hidden');
        }
    } else {
        // Jika User Dah Login -> Sentiasa Sembunyikan Warning
        warn.classList.add('hidden');
    }
    // ---------------------------------------------------

    updateTotalPrice(); 
}

function togglePaymentDetails() {
    const content = document.getElementById('payment-details-content');
    const arrow = document.getElementById('bar-arrow-icon');
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        arrow.classList.remove('rotate-180-custom');
    } else {
        content.classList.add('expanded');
        arrow.classList.add('rotate-180-custom');
    }
}

function updateTotalPrice() {
    // --- ELEMENT REFERENCES ---
    const btnTotalDisplay = document.getElementById('btn-total-display');
    const detailItemPrice = document.getElementById('detail-item-price'); 
    const detailTotalPrice = document.getElementById('detail-total-price');
    
    const detailRowTier = document.getElementById('detail-row-tier');
    const detailTierVal = document.getElementById('detail-tier-val');
    const detailRowVoucher = document.getElementById('detail-row-voucher');
    const detailVoucherVal = document.getElementById('detail-voucher-val');
    
    const btnSavingsBadge = document.getElementById('btn-savings-badge');
    const btnSavingsVal = document.getElementById('btn-savings-val');
    const btnSpacer = document.getElementById('btn-spacer');
    const barTopPrice = document.getElementById('bar-top-price');
    const detailFeeLabel = document.getElementById('payment-fee-label');
    const detailPaymentFee = document.getElementById('detail-payment-fee');

    // Element Header Produk
    const barItemName = document.getElementById('bar-item-name');

    if (!selectedProduct) {
        btnTotalDisplay.innerText = 'RM 0.00';
        if(barItemName) barItemName.innerText = 'Pilih Item';
        return;
    }

    if (barItemName) {
        const itemName = selectedProduct.item_name;
        const numberMatch = itemName.match(/(\d+)/);

        if (numberMatch && selectedQuantity > 1) {
            const originalVal = parseInt(numberMatch[0]);
            if (!isNaN(originalVal)) {
                const newVal = originalVal * selectedQuantity;
                const newName = itemName.replace(numberMatch[0], newVal);
                barItemName.innerText = newName;
            } else {
                barItemName.innerText = `${selectedQuantity} x ${itemName}`;
            }
        } else {
            barItemName.innerText = itemName;
        }
    }
    
    // --- UPDATE: MATIKAN DISKAUN VIP SEPENUHNYA ---
    // Walaupun currentTier.discount dah 0 di vip.js, kita buang logic di sini juga.
    
    let subtotal = selectedProduct.price * selectedQuantity;
    
    // 1. Set Discount VIP ke 0
    let tierDiscountAmount = 0; 

    // 2. Logic Voucher kekal
    let voucherDiscountAmount = 0;
    let totalSavings = 0;

    if (currentVoucher) {
        if (currentVoucher.discount_type === 'percentage') {
            voucherDiscountAmount = subtotal * (currentVoucher.discount_value / 100);
        } else {
            voucherDiscountAmount = currentVoucher.discount_value;
        }
    }

    let finalPrice = subtotal - tierDiscountAmount - voucherDiscountAmount;
    if (finalPrice < 0) finalPrice = 0;

    let paymentFee = 0;
    if (selectedPaymentMethodDetails) {
        if (selectedPaymentMethodDetails.fee_type === 'percentage') {
            paymentFee = finalPrice * (selectedPaymentMethodDetails.fee_value / 100);
            detailFeeLabel.innerText = `(${selectedPaymentMethodDetails.fee_value}%)`;
        } else if (selectedPaymentMethodDetails.fee_type === 'flat') {
            paymentFee = selectedPaymentMethodDetails.fee_value;
            detailFeeLabel.innerText = '';
        } else {
            detailFeeLabel.innerText = '';
        }
    }

    let grandTotal = finalPrice + paymentFee;

    detailItemPrice.innerText = fmtRM(subtotal); 
    detailPaymentFee.innerText = paymentFee > 0 ? `+ ${fmtRM(paymentFee)}` : 'RM 0.00';
    
    const xpEarned = Math.floor(grandTotal);
    let priceHtml = fmtRM(grandTotal);

    if (selectedPaymentMethod === 'wallet' && xpEarned > 0) {
        const xpDisplay = `
            <div class="flex items-center justify-end gap-1 mt-1 animate-pulse">
                <i class="ph-fill ph-star text-purple-400 text-xs"></i>
                <span class="text-[10px] font-bold text-purple-400">+${xpEarned} XP</span>
            </div>
        `;
        priceHtml += xpDisplay;
    }

    detailTotalPrice.innerHTML = priceHtml;
    barTopPrice.innerHTML = priceHtml;

    btnTotalDisplay.innerText = fmtRM(grandTotal);

    // 3. PAKSA SOROK BARIS DISKAUN VIP
    if (detailRowTier) {
        detailRowTier.classList.add('hidden');
        detailRowTier.classList.remove('flex');
    }

    if (voucherDiscountAmount > 0) {
        detailRowVoucher.classList.remove('hidden');
        detailRowVoucher.classList.add('flex');
        detailVoucherVal.innerText = `- ${fmtRM(voucherDiscountAmount)}`;
        totalSavings += voucherDiscountAmount;
    } else {
        detailRowVoucher.classList.add('hidden');
        detailRowVoucher.classList.remove('flex');
    }

    if(selectedProduct.original_price && selectedProduct.original_price > selectedProduct.price) {
         totalSavings += ((selectedProduct.original_price - selectedProduct.price) * selectedQuantity);
    }

    if (totalSavings > 0) {
        btnSavingsBadge.classList.remove('hidden');
        btnSpacer.classList.add('hidden');
        btnSavingsVal.innerText = totalSavings.toFixed(2);
    } else {
        btnSavingsBadge.classList.add('hidden');
        btnSpacer.classList.remove('hidden');
    }
}

async function checkSession() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const authSection = document.getElementById('auth-section');

        if (session) {
            // --- MFA Check ---
            const { data: mfaData, error: mfaError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
            if (!mfaError && mfaData) {
                if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
                    window.location.href = 'login.html'; 
                    return; 
                }
            }

            currentUser = session.user;

            // --- [SECURITY UPDATE 1] DATA FETCHING ---
            // Kita HANYA ambil column yang perlu. JANGAN ambil 'security_pin' di sini.
            const { data: profileData, error } = await supabaseClient
                .from('profiles')
                .select('id, username, wallet_balance, avatar_url, phone, role, xp_balance, is_banned')
                .eq('id', currentUser.id)
                .single();
            
            if (error || !profileData) return; // Stop jika error
            currentProfile = profileData;

            // --- [SECURITY UPDATE 2] PIN CHECK ---
            // Semak status PIN guna RPC (Server-side check). 
            // Ini return true/false sahaja, bukan nombor PIN.
            const { data: hasPin } = await supabaseClient.rpc('check_has_pin');
            currentProfile.has_pin = hasPin; 
            // -------------------------------------

            // --- Ban Check ---
            if (currentProfile.is_banned) {
                const banModal = document.getElementById('banned-modal');
                if (banModal) {
                    banModal.classList.remove('hidden');
                    banModal.classList.add('flex');
                } else {
                    alert("Akaun anda telah digantung.");
                }
                await supabaseClient.auth.signOut();
                return; 
            }

            // VIP Check
            if (typeof calculateVipTier === "function") {
                await calculateVipTier();
            }
            
            // --- Auto-Fill WhatsApp ---
            const waInput = document.getElementById('whatsapp-input');
            if (waInput && !waInput.value) {
                const userPhone = (currentProfile.phone || currentUser.phone || '').replace(/\D/g, '');
                if (userPhone) {
                    waInput.value = userPhone;
                    localStorage.setItem('saved_whatsapp_number', userPhone);
                }
            }
            
            // --- UI Setup (Sanitized) ---
            const displayName = currentProfile.username || currentUser.user_metadata?.username || currentUser.email.split('@')[0];
            
            // Sanitasi URL Avatar (Elak XSS)
            let safeAvatarUrl = null;
            if (currentProfile.avatar_url) {
                const url = currentProfile.avatar_url.trim();
                // Hanya terima http/https dan escape quote
                if (url.startsWith('http://') || url.startsWith('https://')) {
                    safeAvatarUrl = url.replace(/"/g, '&quot;');
                }
            }
            
            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=facc15&color=000&bold=true`;
            const avatarToUse = safeAvatarUrl || defaultAvatar;

            // --- Logic Format Baki (K, M, B, T, Q) ---
            let rawBalance = currentProfile.wallet_balance;
            let formattedBalance = '';

            if (rawBalance >= 1e15) {
                formattedBalance = (rawBalance / 1e15).toFixed(2) + 'Q'; 
            } else if (rawBalance >= 1e12) {
                formattedBalance = (rawBalance / 1e12).toFixed(2) + 'T'; 
            } else if (rawBalance >= 1e9) {
                formattedBalance = (rawBalance / 1e9).toFixed(2) + 'B'; 
            } else if (rawBalance >= 1e6) {
                formattedBalance = (rawBalance / 1e6).toFixed(2) + 'M'; 
            } else if (rawBalance >= 1e3) {
                formattedBalance = (rawBalance / 1e3).toFixed(2) + 'K'; 
            } else {
                formattedBalance = rawBalance.toLocaleString('en-MY', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }

            // --- Render Navbar ---
            if(authSection) {
                authSection.innerHTML = `
                    <div onclick="openModal('profile-modal')" class="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 py-1 pl-2 pr-1 rounded-full border border-white/5 transition group backdrop-blur-sm animate-up max-w-[160px] sm:max-w-none">
                        
                        <div class="flex flex-col items-end justify-center leading-none overflow-hidden">
                            <span class="text-[8px] text-gray-400 uppercase font-bold tracking-wider mb-[1px]">Baki</span>
                            <span class="text-[10px] font-bold text-yellow-400 group-hover:text-white transition font-mono truncate w-full text-right">
                                RM ${formattedBalance}
                            </span>
                        </div>

                        <img src="${avatarToUse}" class="w-8 h-8 rounded-full border-2 border-yellow-400/50 object-cover shadow-sm shrink-0">
                    </div>
                `;
            }

            document.getElementById('login-warning').classList.add('hidden');
            await updateProfileUI(); 

        } else {
            // User Not Logged In
            if(authSection) {
                authSection.innerHTML = `
                    <button onclick="window.location.href='login.html'" class="bg-white/10 hover:bg-white/20 border border-white/5 text-white px-5 py-2 rounded-full text-sm font-semibold transition backdrop-blur-md animate-up">
                        Log Masuk
                    </button>
                `;
            }
            document.getElementById('login-warning').classList.remove('hidden');
        }
    } catch (err) {
        console.error("Check Session Error:", err);
    }
}

function activateSpamCooldown() {
    isAntiSpamActive = true;
    const btnMain = document.getElementById('btn-main-pay');
    
    if(btnMain) {
        btnMain.classList.add('btn-locked');
    }

    setTimeout(() => {
        isAntiSpamActive = false;
        if(btnMain) {
            btnMain.classList.remove('btn-locked');
        }
    }, SPAM_COOLDOWN_MS);
}
// Function check kalau user ada banyak order pending
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

function initiatePurchase() {

    /* ===============================
       🚫 ANTI-SPAM
    =============================== */
    if (isAntiSpamActive) {
        showToast("Sila tunggu sebentar sebelum transaksi seterusnya.", "error");
        return;
    }

    /* ===============================
       [DIBUANG] LOGIN CHECK AWAL
       Kita alihkan check ini ke bawah supaya
       Guest boleh isi form dulu.
    =============================== */

    /* ===============================
       🚧 PRODUCT GLOBAL STATUS CHECK
       (PALING PENTING)
    =============================== */
    if (!parentGameData) {
        showToast("Data produk tidak sah. Sila refresh.", "error");
        return;
    }

    if (parentGameData.is_active !== true) {
        showToast("Produk ini tidak aktif buat masa ini.", "error");
        return;
    }

    if (parentGameData.is_maintenance === true) {
        showToast(
            parentGameData.maintenance_message || 
            "Produk ini sedang diselenggara.",
            "error"
        );
        return;
    }

    /* ===============================
       📦 PRODUCT SELECTION
    =============================== */
    if (!selectedProduct) {
        scrollToSection('section-select-item');
        showToast("Sila pilih item dahulu!", "error");
        return;
    }

    /* ===============================
       🧾 DYNAMIC INPUT VALIDATION
    =============================== */
    for (let index = 0; index < activeInputConfig.length; index++) {
        const field = activeInputConfig[index];
        const inputEl = document.getElementById(`dynamic-input-${index}`);
        const val = inputEl?.value?.trim();

        if (!val) {
            scrollToSection('section-user-info');
            highlightInputError(`dynamic-input-${index}`);
            showToast(`Sila masukkan ${field.label}!`, "error");
            return;
        }

        if (field.minLength && val.length < field.minLength) {
            scrollToSection('section-user-info');
            highlightInputError(`dynamic-input-${index}`);
            showToast(
                `${field.label} terlalu pendek! Minima ${field.minLength} aksara.`,
                "error"
            );
            return;
        }

        if (field.maxLength && val.length > field.maxLength) {
            scrollToSection('section-user-info');
            highlightInputError(`dynamic-input-${index}`);
            showToast(
                `${field.label} terlalu panjang! Maksima ${field.maxLength} aksara.`,
                "error"
            );
            return;
        }
    }

    /* ===============================
       📱 WHATSAPP AUTO-DETECT
    =============================== */
    let whatsappInput = document
        .getElementById('whatsapp-input')
        .value.replace(/\D/g, '');

    // Autofill dari profile jika kosong (Hanya jalan kalau user login)
    if (!whatsappInput && currentUser) {
        const savedPhone = (
            currentProfile?.phone ||
            currentUser?.phone ||
            ''
        ).replace(/\D/g, '');

        if (savedPhone) {
            whatsappInput = savedPhone;
            document.getElementById('whatsapp-input').value = whatsappInput;
            showToast("Nombor WhatsApp diambil dari profil anda.", "success");
        }
    }

    // Validation WhatsApp
    if (!whatsappInput) {
        scrollToSection('section-user-info');
        highlightInputError('whatsapp-input');
        showToast("Sila masukkan No. WhatsApp!", "error");
        return;
    }

    if (whatsappInput.length < 10 || whatsappInput.length > 14) {
        scrollToSection('section-user-info');
        highlightInputError('whatsapp-input');
        showToast("Nombor WhatsApp tidak sah (10–14 digit).", "error");
        return;
    }

    /* ===============================
       💳 PAYMENT METHOD CHECK
    =============================== */
    if (!selectedPaymentMethod) {
        scrollToSection('section-payment-method');
        showToast("Sila pilih kaedah pembayaran!", "error");
        return;
    }

    /* ===============================
       🔐 LOGIN CHECK (LOGIK BARU)
       Hanya paksa login jika method BUKAN whatsapp_manual
    =============================== */
    if (!currentUser && selectedPaymentMethod !== 'whatsapp_manual') {
        showToast("Sila log masuk untuk menggunakan kaedah ini.", "error");
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }

    // Check Maintenance Payment
    if (selectedPaymentMethodDetails?.is_maintenance === true) {
        showToast(
            "Kaedah pembayaran ini sedang diselenggara.",
            "error"
        );
        return;
    }

    /* ===============================
       🎯 PROMO VALIDATION
    =============================== */
    if (selectedProduct.is_promo && selectedProduct.promo_end) {
        if (new Date() > new Date(selectedProduct.promo_end)) {
            showToast("Masa Promo Telah Tamat! Sila refresh.", "error");
            setTimeout(() => location.reload(), 1500);
            return;
        }
    }

    /* ===============================
       📦 STOCK CHECK
    =============================== */
    if (
        selectedProduct.stock !== null &&
        selectedProduct.stock < selectedQuantity
    ) {
        showToast(
            "Maaf, stok tidak mencukupi untuk kuantiti ini.",
            "error"
        );
        return;
    }

    /* ===============================
       🚀 OPEN CONFIRMATION
    =============================== */
    openConfirmationModal();
}
function openConfirmationModal() {
    // 1. Setup Game Info
    document.getElementById('conf-game-name').innerText = selectedProduct.game_name;
    const gameImgSrc = parentGameData.image_url || selectedProduct.item_image || "https://placehold.co/100";
    document.getElementById('conf-game-img').src = gameImgSrc;

    // 2. Setup Account Info
    const accContainer = document.getElementById('conf-account-details');
    let accHtml = '';
    
    activeInputConfig.forEach((field, index) => {
        const val = document.getElementById(`dynamic-input-${index}`).value;
        accHtml += `
            <div class="flex justify-between items-center text-xs mb-1">
                <span class="text-gray-500 dark:text-gray-400 w-1/3">${field.label}</span>
                <span class="text-gray-900 dark:text-white font-mono font-bold tracking-wide text-right truncate w-2/3">${val}</span>
            </div>
        `;
    });
    accContainer.innerHTML = accHtml;

    // Setup WhatsApp
    let wa = document.getElementById('whatsapp-input').value;
    document.getElementById('conf-whatsapp').innerText = wa;

    // --- LOGIC 2: PAPAR JENIS PEMBAYARAN DI MODAL ---
    const payMethodName = selectedPaymentMethodDetails ? selectedPaymentMethodDetails.name : '-';
    const payMethodEl = document.getElementById('conf-payment-method');
    if(payMethodEl) payMethodEl.innerText = payMethodName;
    // ------------------------------------------------

    // 3. Setup Item Info
    document.getElementById('conf-item-name').innerText = selectedProduct.item_name;
    document.getElementById('conf-item-qty').innerText = `Kuantiti: ${selectedQuantity}x`;
    document.getElementById('conf-item-img').src = selectedProduct.item_image || gameImgSrc;

    // 4. Calculate Prices
    let subtotal = selectedProduct.price * selectedQuantity;
    let voucherDisc = 0;
    
    // Double check: Jika method manual, voucherDisc kekal 0
    if (currentVoucher && selectedPaymentMethod !== 'whatsapp_manual') {
        if (currentVoucher.discount_type === 'percentage') {
            voucherDisc = subtotal * (currentVoucher.discount_value / 100);
        } else {
            voucherDisc = currentVoucher.discount_value;
        }
    }
    
    let afterDisc = subtotal - voucherDisc;
    if(afterDisc < 0) afterDisc = 0;

    let fee = 0;
    if (selectedPaymentMethodDetails) {
        if (selectedPaymentMethodDetails.fee_type === 'percentage') {
            fee = afterDisc * (selectedPaymentMethodDetails.fee_value / 100);
        } else if (selectedPaymentMethodDetails.fee_type === 'flat') {
            fee = selectedPaymentMethodDetails.fee_value;
        }
    }

    let total = afterDisc + fee;

    // 5. Update UI Price
    document.getElementById('conf-price-item').innerText = fmtRM(subtotal);
    document.getElementById('conf-price-fee').innerText = fee > 0 ? `+ ${fmtRM(fee)}` : 'RM 0.00';
    
    const discRow = document.getElementById('conf-row-discount');
    if (voucherDisc > 0) {
        discRow.classList.remove('hidden');
        discRow.classList.add('flex');
        document.getElementById('conf-price-discount').innerText = `- ${fmtRM(voucherDisc)}`;
    } else {
        discRow.classList.add('hidden');
        discRow.classList.remove('flex');
    }

    document.getElementById('conf-price-total').innerText = fmtRM(total);

    // 6. Buka Modal
    openModal('order-confirmation-modal');
}
// Dalam topup.js

function proceedToPayment() {
    // 1. Tutup modal confirmation
    closeModal('order-confirmation-modal');

    // ==========================================================
    // LOGIC WHATSAPP DIRECT
    // ==========================================================
    if (selectedPaymentMethod === 'whatsapp_manual') {
        
        // Kira Harga Asal
        let subtotal = selectedProduct.price * selectedQuantity;
        let finalPrice = subtotal; // Manual: Voucher = 0
        
        // Tambah caj payment jika ada
        if (selectedPaymentMethodDetails) {
            if (selectedPaymentMethodDetails.fee_type === 'percentage') {
                finalPrice += finalPrice * (selectedPaymentMethodDetails.fee_value / 100);
            } else if (selectedPaymentMethodDetails.fee_type === 'flat') {
                finalPrice += selectedPaymentMethodDetails.fee_value;
            }
        }

        // Panggil modal WhatsApp
        if (typeof openWhatsAppPaymentModal === 'function') {
            openWhatsAppPaymentModal(
                selectedProduct, 
                selectedQuantity, 
                activeInputConfig, 
                finalPrice,
                selectedPaymentMethodDetails 
            );
        } else {
            console.error("Function openWhatsAppPaymentModal tidak dijumpai.");
            alert("Ralat memuatkan modal WhatsApp.");
        }
        
        return; // STOP di sini untuk flow WhatsApp
    }
    // ==========================================================

    // --- FLOW ASAL (WALLET / AUTO PAYMENT) ---
    if (selectedPaymentMethod === 'wallet') {
        
        // [SECURITY FIX] Gunakan check boolean 'has_pin', bukan string raw PIN
        if (!currentProfile.has_pin) {
            showToast("Sila cipta PIN keselamatan dahulu.", "info");
            setTimeout(() => openModal('set-pin-modal'), 300); 
            return;
        }

        setTimeout(() => {
            openModal('transaction-pin-modal');
            const pinInput = document.getElementById('tx-pin-input');
            if(pinInput) {
                pinInput.value = '';
                pinInput.focus();
            }
        }, 300);

    } else {
        // Flow Manual Biasa (Upload Resit)
        setTimeout(() => openManualPaymentModal(), 300);
    }
}

async function submitNewPin() {
    const newPin = document.getElementById('new-pin-input').value;
    const confirmPin = document.getElementById('confirm-pin-input').value;
    
    // 1. Validation
    if (!newPin || newPin.length !== 6 || isNaN(newPin)) {
        return showToast("Sila masukkan 6 digit nombor.", "error");
    }
    
    if (newPin !== confirmPin) {
        return showToast("PIN tidak sepadan.", "error");
    }

    const btn = document.querySelector('#set-pin-modal button');
    const originalText = btn.innerHTML;
    btn.innerHTML = "Menyimpan...";
    btn.disabled = true;

    try {
        // [SECURITY FIX] 2. Update via RPC (Secure), bukan direct update table
        const { data: rpcResult, error: rpcError } = await supabaseClient
            .rpc('update_pin_secure', { 
                p_old_pin: null, // Null kerana ini adalah setup PIN baru/pertama kali
                p_new_pin: newPin 
            });

        if (rpcError) throw new Error("Ralat sistem: " + rpcError.message);
        if (!rpcResult.success) throw new Error(rpcResult.message);

        // 3. Update Local State
        // PENTING: Jangan simpan nombor PIN dalam variable global!
        currentProfile.has_pin = true; // Set flag sahaja

        // 4. Success UI
        showToast("PIN berjaya dicipta!", "success");
        closeModal('set-pin-modal');
        
        // Reset input fields
        document.getElementById('new-pin-input').value = '';
        document.getElementById('confirm-pin-input').value = '';

        // Terus buka modal bayaran supaya user tak perlu tekan bayar lagi
        setTimeout(() => {
            openModal('transaction-pin-modal');
            const pinInput = document.getElementById('tx-pin-input');
            if(pinInput) pinInput.focus();
        }, 500);

    } catch (err) {
        console.error(err);
        showToast(err.message || "Gagal menyimpan PIN.", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
function openManualPaymentModal() {
    openModal('manual-payment-modal');
    const method = selectedPaymentMethodDetails;

    const qrContent = document.getElementById('manual-content-qr');
    const pinContent = document.getElementById('manual-content-pin');
    
    document.getElementById('manual-pin-code').value = '';
    document.getElementById('manual-ref-id').value = '';

    if (method.account_number || method.qr_image) {
        qrContent.classList.remove('hidden');
        pinContent.classList.add('hidden');

        document.getElementById('manual-method-title').innerText = `Bayar melalui ${method.name}`;
        document.getElementById('manual-instruction-text').innerText = method.instructions || "Sila scan QR atau transfer ke akaun di bawah.";
        
        const qrContainer = document.getElementById('manual-qr-container');
        const qrImg = document.getElementById('manual-qr-image');
        
        if (method.qr_image) {
            qrContainer.classList.remove('hidden');
            qrImg.src = method.qr_image; 
        } else {
            qrContainer.classList.add('hidden');
        }

        const bankInfo = document.getElementById('manual-bank-info');
        if (method.account_number) {
            bankInfo.classList.remove('hidden');
            document.getElementById('manual-bank-name').innerText = method.account_holder || method.name;
            document.getElementById('manual-account-no').innerText = method.account_number;
        } else {
            bankInfo.classList.add('hidden');
        }

    } else {
        qrContent.classList.add('hidden');
        pinContent.classList.remove('hidden');
        
        const pinTitle = document.getElementById('pin-title-display');
        const pinInstr = document.getElementById('pin-instruction-text');
        
        pinTitle.innerText = `Masukkan ${method.name}`;
        pinInstr.innerText = method.instructions || "Masukkan kod PIN anda dengan teliti.";
    }
}

function getCombinedInputString() {
    let inputs = [];
    activeInputConfig.forEach((field, index) => {
        const val = document.getElementById(`dynamic-input-${index}`).value;
        inputs.push(`${field.label}: ${val}`);
    });
    return inputs.join(" | ");
}
// =========================================================================
// KOD PENUH YANG BERSIH DAN KEMAS (COPY YANG INI)
// =========================================================================

async function submitManualPayment() {
    if (isTransactionProcessing) return;

    const btn = document.getElementById('btn-submit-manual');
    if (btn && btn.disabled) return;

    // 1. LOCK UI SEGERA
    isTransactionProcessing = true;
    const originalText = btn ? btn.innerText : "HANTAR BUKTI";
    if (btn) {
        btn.innerText = "MENGHANTAR...";
        btn.disabled = true;
    }

    // Helper untuk reset UI jika gagal
    const resetUI = () => {
        isTransactionProcessing = false;
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    };

    try {
        // 2. Check Spam
        const isSafe = await checkSpamProtection();
        if (!isSafe) {
            resetUI();
            return;
        }

        let details = '';
        const isQrMode = !document.getElementById('manual-content-qr').classList.contains('hidden');

        if (isQrMode) {
            details = document.getElementById('manual-ref-id').value;
            if (!details) {
                showToast("Sila masukkan Resit ID / Rujukan", "error");
                resetUI();
                return;
            }
        } else {
            details = document.getElementById('manual-pin-code').value;
            if (!details) {
                showToast("Sila masukkan Kod PIN", "error");
                resetUI();
                return;
            }
        }

        // 3. Prepare Data
        let combinedId = getCombinedInputString();
        const isXpProduct = (selectedProduct.game_name === 'Buy XP' || selectedProduct.game_name === 'Topup XP' || selectedProduct.category === 'XP');
        if (isXpProduct && currentProfile) combinedId = 'Account: ' + currentProfile.email;

        let rawWs = document.getElementById('whatsapp-input').value.replace(/\D/g, '');
        if (rawWs.startsWith('0')) rawWs = rawWs.substring(1);

        // 4. Call RPC
        const { data, error } = await supabaseClient.rpc('process_unified_order', {
            p_user_id: currentUser.id,
            p_item_id: selectedProduct.id,
            p_quantity: selectedQuantity,
            p_payment_method: selectedPaymentMethod,
            p_payment_details: details,
            p_pin: null,
            p_game_id_input: combinedId,
            p_whatsapp: `+60${rawWs}`,
            p_voucher_code: currentVoucher ? currentVoucher.code : null
        });

        if (error) throw new Error(error.message);
        if (!data.success) throw new Error(data.message);

        // 5. Success
        if (currentVoucher) removeVoucher();
        saveTransactionIdHistory();
        activateSpamCooldown();
        showToast("Bukti dihantar! Redirecting...", "success");

        // *NOTA: Kita JANGAN resetUI() di sini supaya butang kekal disable semasa redirecting
        setTimeout(() => window.location.href = `receipt.html?order_id=${data.order_id}`, 1500);

    } catch (err) {
        // 6. Error Handling
        showToast(err.message, "error");
        resetUI(); // Buka balik butang sebab error

        if (err.message.includes('diselenggara') || err.message.includes('stok')) {
            setTimeout(() => location.reload(), 2000);
        }
    }
}


// --- STEP 3: Ganti function confirmPurchaseWithPin dengan ini ---

async function confirmPurchaseWithPin() {
    if (isTransactionProcessing) return;

    const btn = document.getElementById('btn-confirm-pin');
    if (btn && btn.disabled) return;

    // 1. LOCK UI SEGERA
    isTransactionProcessing = true;
    const originalText = btn ? btn.innerText : "SAHKAN BAYARAN";
    if (btn) {
        btn.innerText = "MEMPROSES...";
        btn.disabled = true;
    }

    // Helper untuk reset UI
    const resetUI = () => {
        isTransactionProcessing = false;
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    };

    try {
        // 2. Validation
        const isSafe = await checkSpamProtection();
        if (!isSafe) {
            resetUI();
            return;
        }

        const pin = document.getElementById('tx-pin-input').value;
        if (pin.length !== 6) {
            showToast("Sila masukkan 6-digit PIN.", "error");
            resetUI();
            return;
        }

        if (currentProfile.is_banned) throw new Error("Akaun dibekukan.");

        // 3. Prepare Data
        let combinedId = getCombinedInputString();
        const isXpProduct = (selectedProduct.game_name === 'Buy XP' || selectedProduct.game_name === 'Topup XP' || selectedProduct.category === 'XP');
        if (isXpProduct && currentProfile) combinedId = 'Account: ' + currentProfile.email;


        let rawWs = document.getElementById('whatsapp-input').value.replace(/\D/g, '');
        if (rawWs.startsWith('0')) rawWs = rawWs.substring(1);

        // 4. Call RPC (Wallet)
        const { data, error } = await supabaseClient.rpc('process_unified_order', {
            p_user_id: currentUser.id,
            p_item_id: selectedProduct.id,
            p_quantity: selectedQuantity,
            p_payment_method: 'wallet',
            p_payment_details: null,
            p_pin: pin,
            p_game_id_input: combinedId,
            p_whatsapp: `+60${rawWs}`,
            p_voucher_code: currentVoucher ? currentVoucher.code : null
        });

        if (error) throw new Error(error.message);
        if (!data.success) throw new Error(data.message);

        // 5. Success Handling
        const newBalance = data.new_balance;
        if (currentProfile) currentProfile.wallet_balance = newBalance;
        document.querySelectorAll('#current-balance-display').forEach(el => el.innerText = newBalance.toFixed(2));

        if (data.xp_added > 0) {
            if (currentProfile) currentProfile.xp_balance = (currentProfile.xp_balance || 0) + data.xp_added;
            const xpDisplay = document.getElementById('profile-xp-display');
            if (xpDisplay) xpDisplay.innerText = currentProfile.xp_balance;
            showToast(`Pembelian Berjaya! +${data.xp_added} XP`, "success");
        } else {
            showToast("Pembelian Berjaya!", "success");
            if (!isXpProduct) saveTransactionIdHistory();
        }

        if (currentVoucher) removeVoucher();
        activateSpamCooldown();

        // *NOTA: JANGAN resetUI() di sini. Biar button kekal disabled semasa redirect.
        setTimeout(() => window.location.href = `receipt.html?order_id=${data.order_id}`, 1500);

    } catch (err) {
        showToast(err.message, "error");
        resetUI(); // Buka balik butang sebab error
    }
}

// --- LOGIC VOUCHER SEARCH & RENDER ---

async function openVoucherModal() {
    // 1. LOGIN CHECK
    if (!currentUser) {
        showToast("Sila log masuk untuk melihat baucar.", "error");
        return;
    }

    // 2. CHECK ITEM DIPILIH
    if (!selectedProduct) {
        showToast("Sila pilih item dahulu.", "error");
        scrollToSection('section-select-item');
        return;
    }

    // --- [LOGIC BARU] WAJIB PILIH PAYMENT DAHULU ---
    if (!selectedPaymentMethod) {
        showToast("Sila pilih kaedah pembayaran dahulu!", "error");
        // Auto scroll ke bahagian payment
        if (typeof scrollToSection === 'function') {
            scrollToSection('section-payment-method');
        }
        return;
    }
    // -----------------------------------------------

    // 3. HALANG JIKA GUNA WHATSAPP
    if (selectedPaymentMethod === 'whatsapp_manual') {
        showToast("Baucar tidak disokong untuk pembayaran WhatsApp.", "error");
        return;
    }

    openModal('voucher-modal');
    
    // Reset Search Input
    const searchInput = document.getElementById('voucher-search-input');
    if(searchInput) searchInput.value = '';

    const container = document.getElementById('voucher-list-container');
    container.innerHTML = '<div class="loader mx-auto mt-4"></div>';

    // 1. Fetch Data
    const now = new Date().toISOString();
    
    // Ambil Public Vouchers
    const { data } = await supabaseClient
        .from('vouchers')
        .select('*')
        .eq('is_active', true)
        .eq('is_public', true)
        .gt('end_date', now)
        .order('created_at', { ascending: false });
    
    // Ambil Private Vouchers (Assign ke User)
    const { data: userVouchers } = await supabaseClient
        .from('vouchers')
        .select('*')
        .eq('is_active', true)
        .eq('assign_to_user', currentUser.id)
        .gt('end_date', now)
        .order('created_at', { ascending: false });

    // 2. Gabung & Buang Duplicate
    let combinedData = [];
    if(data) combinedData = [...data];
    if(userVouchers) combinedData = [...combinedData, ...userVouchers];
    
    combinedData = Array.from(new Set(combinedData.map(a => a.id)))
        .map(id => combinedData.find(a => a.id === id));

   // Filter asas (User ID Match & Check Stok)
    let visibleVouchers = combinedData.filter(v => {
        // 1. Check User Assign
        if (v.assign_to_user && v.assign_to_user !== currentUser.id) return false;
        
        // 2. Tapis baucar yang dah habis stok (limit - usage <= 0)
        // Supaya tak semak dalam list nanti
        if ((v.usage_limit - v.usage_count) <= 0) return false;

        return true;
    });

    // --- LOGIK BARU: JIKA TIADA BAUCAR LANGSUNG ---
    if(!visibleVouchers || visibleVouchers.length === 0) { 
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center py-10 px-4 animate-fade-in">
                <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5 shadow-inner">
                    <i class="ph-duotone ph-ticket text-3xl text-gray-500"></i>
                </div>
                <h3 class="text-sm font-bold text-white mb-1">Tiada Kod Baucar</h3>
                <p class="text-[10px] text-gray-400 mb-6 max-w-[240px] leading-relaxed">
                    Semua baucar telah ditebus atau anda belum memilikinya.
                </p>
                <button onclick="window.location.href='voucher_drop.html'" 
                    class="bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs px-8 py-3 rounded-xl transition-all active:scale-95 shadow-[0_0_20px_rgba(250,204,21,0.15)] flex items-center gap-2 group">
                    <i class="ph-bold ph-ticket text-lg group-hover:-rotate-12 transition-transform"></i>
                    Dapatkan Baucar Disini
                </button>
            </div>
        `;
        cachedVoucherList = [];
        return; 
    }

   if(!visibleVouchers || visibleVouchers.length === 0) { 
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center py-8 px-4 animate-fade-in">
                <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                    <i class="ph-duotone ph-ticket text-3xl text-gray-500"></i>
                </div>
                <h3 class="text-sm font-bold text-white mb-1">Tiada Kod Baucar</h3>
                <p class="text-[10px] text-gray-400 mb-5 max-w-[220px] leading-relaxed">
                    Anda tiada baucar aktif. Rebut peluang untuk dapatkan baucar percuma sekarang!
                </p>
                <button onclick="window.location.href='voucher_drop.html'" 
                    class="bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-yellow-400/20 flex items-center gap-2 group">
                    <i class="ph-bold ph-gift text-lg group-hover:-rotate-12 transition-transform"></i>
                    Dapatkan Baucar
                </button>
            </div>
        `;
        cachedVoucherList = [];
        return; 
    }

    // 3. Sorting Logic (Smart Sort)
    const currentSubtotal = selectedProduct.price * selectedQuantity;
    const currentGame = selectedProduct.game_name;

    visibleVouchers.sort((a, b) => {
        const score = (v) => {
            const validService = (v.valid_for_service || 'all').toLowerCase();
            const isGameMatch = validService === 'all' || validService === currentGame.toLowerCase();
            const isStockAvailable = (v.usage_limit - v.usage_count) > 0;
            const isPriceMet = currentSubtotal >= v.min_spend;
            
            if (isGameMatch && isStockAvailable && isPriceMet) return 10; 
            if (isGameMatch && isStockAvailable && !isPriceMet) return 5; 
            if (isGameMatch && !isStockAvailable) return 1; 
            return 0;
        };
        return score(b) - score(a);
    });

    // 4. SIMPAN KE CACHE & RENDER
    cachedVoucherList = visibleVouchers;
    renderVoucherList(cachedVoucherList);
}

// Function Baru: Filter Search
function filterVouchers(keyword) {
    if (!cachedVoucherList || cachedVoucherList.length === 0) return;

    const lowerKeyword = keyword.toLowerCase().trim();

    if (lowerKeyword === '') {
        // Jika kosong, tunjuk semua
        renderVoucherList(cachedVoucherList);
        return;
    }

    // Filter berdasarkan Code ATAU Description
    const filtered = cachedVoucherList.filter(v => {
        const codeMatch = v.code.toLowerCase().includes(lowerKeyword);
        const descMatch = v.description && v.description.toLowerCase().includes(lowerKeyword);
        return codeMatch || descMatch;
    });

    renderVoucherList(filtered);
}

// Function Baru: Render HTML (Diasingkan supaya boleh diguna semula oleh Search)
function renderVoucherList(rawVouchers) {
    const container = document.getElementById('voucher-list-container');
    
    // --- STEP 1: TAPIS BAUCAR (BUANG YANG HABIS STOK) ---
    const vouchers = rawVouchers.filter(v => (v.usage_limit - v.usage_count) > 0);

    // --- STEP 2: LOGIK PAPARAN KOSONG (EMPTY STATE) ---
    if (vouchers.length === 0) {
        const isSearchEmpty = (typeof cachedVoucherList !== 'undefined' && cachedVoucherList.length > 0);

        if (isSearchEmpty) {
            container.innerHTML = `
                <div class="text-center mt-8 opacity-50 animate-fade-in">
                    <i class="ph ph-magnifying-glass text-3xl mb-2"></i>
                    <p class="text-xs text-gray-500">Tiada baucar dijumpai.</p>
                </div>`;
        } else {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center py-8 px-4 animate-fade-in">
                    <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                        <i class="ph-duotone ph-ticket text-3xl text-gray-500"></i>
                    </div>
                    <h3 class="text-sm font-bold text-white mb-1">Tiada Kod Baucar</h3>
                    <p class="text-[10px] text-gray-400 mb-5 max-w-[220px] leading-relaxed">
                        Semua baucar telah ditebus atau anda tiada baucar aktif. Rebut peluang seterusnya!
                    </p>
                    <button onclick="window.location.href='voucher_drop.html'" 
                        class="bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs px-6 py-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-2 group">
                        <i class="ph-bold ph-sign-in text-lg group-hover:translate-x-0.5 transition-transform"></i>
                        Dapatkan Baucar
                    </button>
                </div>
            `;
        }
        return;
    }

    const currentSubtotal = selectedProduct.price * selectedQuantity;
    const currentGame = selectedProduct.game_name;

    container.innerHTML = vouchers.map(v => {
        const validService = v.valid_for_service || 'all';
        const isUniversal = validService.toLowerCase() === 'all';
        const isGameMatch = validService.toLowerCase() === currentGame.toLowerCase();
        
        const stockLeft = v.usage_limit - v.usage_count;
        const shortfall = v.min_spend - currentSubtotal;
        const isPriceMet = shortfall <= 0;
        const isMaxExceeded = v.max_spend && currentSubtotal > v.max_spend;
        
        let progressPercent = 0;
        if (currentSubtotal > 0 && v.min_spend > 0) {
            progressPercent = (currentSubtotal / v.min_spend) * 100;
        }
        if (progressPercent > 100) progressPercent = 100;
        if (isPriceMet) progressPercent = 100;

        let containerClass = "bg-[#1e1f24] border-white/5 hover:bg-white/5"; 
        let btnClass = "bg-white text-black hover:bg-yellow-400 cursor-pointer";
        let btnText = "GUNA";
        let clickAction = `applyVoucher('${v.code}')`;
        let opacityStyle = "";
        let privateTag = "";

        if (v.assign_to_user) {
            privateTag = `
                <span class="ml-2 text-[9px] bg-amber-900 text-amber-300 px-1.5 rounded border border-amber-700 font-bold">
                    exclusive
                </span>`;
            containerClass = "bg-amber-900/10 border-amber-700/30";
        }

        if (!isGameMatch && !isUniversal) {
            containerClass = "bg-[#121214] border-gray-800"; 
            btnClass = "bg-gray-800 text-gray-500 cursor-not-allowed";
            btnText = "GAME LAIN";
            clickAction = `showToast('Hanya untuk ${validService}', 'error')`;
            opacityStyle = "opacity-50 grayscale pointer-events-none"; 
        } else if (isMaxExceeded) {
            btnClass = "bg-gray-700 text-gray-400 cursor-not-allowed";
            btnText = "MAX LIMIT";
            clickAction = `showToast('Melebihi had maksima RM${v.max_spend}', 'error')`;
        } else if (!isPriceMet) {
            btnClass = "bg-orange-500/10 text-orange-500 border border-orange-500/50 hover:bg-orange-500/20";
            btnText = `KURANG RM${shortfall.toFixed(0)}`; 
            clickAction = `showToast('Sila tambah item bernilai RM${shortfall.toFixed(2)} lagi.', 'info')`;
        }

        const dateObj = new Date(v.end_date);
        const dateStr = dateObj.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' });
        const gameTagName = isUniversal ? 'SEMUA GAME' : validService;
        const gameTagColor = isUniversal 
            ? 'text-green-400 border-green-400/20 bg-green-400/10' 
            : 'text-blue-400 border-blue-400/20 bg-blue-400/10';
        let barColorClass = isPriceMet ? 'bg-green-500' : 'bg-orange-500';

        return `
        <div class="p-4 rounded-xl border flex flex-col gap-3 group transition relative overflow-hidden ${containerClass} ${opacityStyle}">
            <div class="flex justify-between items-start">
                <div class="flex-grow pr-2">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="font-black text-yellow-400 text-base font-mono tracking-wider highlight-text">${v.code}</span>
                        <span class="text-[9px] px-1.5 py-0.5 rounded border ${gameTagColor} font-bold uppercase">${gameTagName}</span>
                        ${privateTag}
                    </div>

                    <div class="text-[11px] text-gray-300 font-medium leading-tight mb-2 highlight-text">${v.description}</div>

                    <div class="w-full max-w-[200px] mb-1">
                        <div class="flex justify-between text-[8px] mb-0.5">
                            <span class="text-gray-500">Kelayakan Harga</span>
                            <span class="${isPriceMet ? 'text-green-400' : 'text-orange-400'} font-bold">${Math.round(progressPercent)}%</span>
                        </div>
                        <div class="w-full bg-black/40 rounded-full h-1 border border-white/5 overflow-hidden">
                            <div class="${barColorClass} h-full rounded-full transition-all duration-500" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>
                </div>

                <button onclick="${clickAction}" class="text-[10px] font-bold px-4 py-2 rounded-lg transition font-mono tracking-wide ${btnClass}">
                    ${btnText}
                </button>
            </div>

            <div class="grid grid-cols-2 gap-2 text-[10px] bg-black/20 p-2 rounded-lg border border-white/5">
                <div class="flex flex-col">
                    <span class="text-gray-500 uppercase font-bold text-[8px]">Syarat Topup</span>
                    <span class="text-gray-300 font-mono">Min: RM${v.min_spend}</span>
                    ${v.max_spend && v.max_spend < 99999 ? `<span class="text-gray-400 font-mono">Max: RM${v.max_spend}</span>` : ''}
                </div>
                <div class="flex flex-col text-right">
                    <span class="text-gray-500 uppercase font-bold text-[8px]">Status</span>
                    <span class="text-gray-300">
                        Stok: <span class="${stockLeft < 10 ? 'text-red-400' : 'text-green-400'} font-bold">${stockLeft}</span> unit
                    </span>
                    <span class="text-gray-500">Exp: ${dateStr}</span>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

async function applyVoucher(manualCode = null) {
    // 1. LOGIN CHECK
    if (!currentUser) {
        showToast("Sila log masuk untuk menggunakan kod baucar.", "error");
        return; 
    }

    // WAJIB PILIH PAYMENT DAHULU
    if (!selectedPaymentMethod) {
        showToast("Sila pilih kaedah pembayaran dahulu!", "error");
        if (typeof scrollToSection === 'function') {
            scrollToSection('section-payment-method');
        }
        return;
    }

    // 2. HALANG JIKA GUNA WHATSAPP
    if (selectedPaymentMethod === 'whatsapp_manual') {
        showToast("Baucar tidak disokong untuk pembayaran WhatsApp.", "error");
        const inputEl = document.getElementById('voucher-input');
        if(inputEl) inputEl.value = ''; 
        return;
    }

    const inputEl = document.getElementById('voucher-input');
    const code = manualCode || inputEl.value.toUpperCase().trim();
    const msg = document.getElementById('voucher-msg');
    
    // 3. ANTI-SPAM CHECK (BLOCK 5 MINIT)
    if (Date.now() < voucherBlockTime) {
        const remainingMinutes = Math.ceil((voucherBlockTime - Date.now()) / 60000);
        showToast(`Sila tunggu ${remainingMinutes} minit lagi.`, "error");
        inputEl.value = ''; 
        return;
    }

    // Validation Asas
    if (!code) return showToast("Sila masukkan kod baucar.", "error");
    if (!selectedProduct) return showToast("Sila pilih item dahulu.", "error");

    // Data untuk dihantar ke Server
    const currentGame = selectedProduct.game_name;
    const subtotal = selectedProduct.price * selectedQuantity;
    
    // UI Feedback
    const btnApply = document.querySelector('#voucher-section button');
    if(btnApply) {
        btnApply.innerText = "Check...";
        btnApply.disabled = true;
    }

    try {
        // ============================================================
        // [SECURE] PANGGIL RPC BARU (verify_voucher_status)
        // ============================================================
        const { data, error } = await supabaseClient.rpc('verify_voucher_status', {
            p_code: code,
            p_user_id: currentUser.id,
            p_game_name: currentGame,
            p_amount: subtotal
        });

        if (error) throw new Error("Ralat sistem. Sila cuba lagi.");

        // --- 4. HANDLE RESPONSE DARI DATABASE ---
        if (!data.valid) {
            voucherAttempts++; 
            
            // UX: Jangan buang teks jika error cuma sebab "tak cukup belanja"
            if (!data.message.toLowerCase().includes('minima') && !data.message.toLowerCase().includes('kurang')) {
                 inputEl.value = ''; 
            }

            if (voucherAttempts >= MAX_VOUCHER_TRY) {
                voucherBlockTime = Date.now() + VOUCHER_BLOCK_MS;
                voucherAttempts = 0; 
                showToast(`Terlalu banyak percubaan! Disekat 5 minit.`, "error");
            } else {
                const left = MAX_VOUCHER_TRY - voucherAttempts;
                showToast(`${data.message}`, "error"); // Tunjuk error direct dari SQL
            }
            return; 
        }

        // --- 5. KES BERJAYA (Success) ---
        voucherAttempts = 0; 

        // Simpan data baucar dengan struktur baru
        currentVoucher = {
            id: data.voucher_id,
            code: data.code,
            discount_type: data.discount_type,
            discount_value: data.discount_value,
            calculated_discount: data.calculated_discount, // Guna nilai tepat dari SQL
            min_spend: data.min_spend,
            max_spend: data.max_spend
        };

        // Kemaskini UI
        inputEl.value = data.code; 
        inputEl.disabled = true;
        
        const voucherActions = document.getElementById('voucher-actions');
        if(voucherActions) {
            voucherActions.classList.remove('hidden');
            voucherActions.classList.add('flex');
        }
        
        const voucherDisplay = document.getElementById('voucher-code-display');
        if(voucherDisplay) voucherDisplay.innerText = data.code;

        if(msg) msg.innerHTML = '<i class="ph ph-check-circle-fill"></i> Baucar diaktifkan!';
        
        closeModal('voucher-modal');
        updateTotalPrice();
        
        showToast(`Berjaya! Jimat RM${data.calculated_discount.toFixed(2)}`, "success");

    } catch (err) {
        console.error("Voucher Error:", err);
        showToast(err.message || "Ralat memproses baucar.", "error");
    } finally {
        if(btnApply) {
            btnApply.innerText = "GUNA";
            btnApply.disabled = false;
        }
    }
}

function removeVoucher() {
    currentVoucher = null;
    const input = document.getElementById('voucher-input');
    input.value = ''; input.disabled = false;
    document.getElementById('voucher-actions').classList.add('hidden');
    document.getElementById('voucher-actions').classList.remove('flex');
    updateTotalPrice();
}

function openModal(id) { const el = document.getElementById(id); if(el) { el.classList.remove('hidden'); el.classList.add('flex'); } }
function closeModal(id) { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.classList.remove('flex'); } }
async function handleLogin() {
    const email = document.getElementById('email').value; const password = document.getElementById('password').value;
    const btn = document.querySelector('#login-modal button'); btn.innerText = "...";
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) await supabaseClient.auth.signUp({ email, password });
    location.reload();
}
async function handleLogout() { await supabaseClient.auth.signOut(); window.location.href='index.html'; }

function openEditProfile() {
    window.location.href = 'account.html';
}
// --- NEW HELPER: KIRA BAUCER ---
async function getVoucherCount() {
    if (!currentUser) return 0;
    
    const now = new Date().toISOString();
    
    // Kira baucer yang: 
    // 1. Aktif
    // 2. Belum Expired
    // 3. (Public) ATAU (Assign ke User ini)
    
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
    if(!currentProfile) return;

    // 1. Update Nama & Email
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

    // --- UPDATE: LOGIC FORMAT BAKI KONSISTEN ---
    let rawBalance = currentProfile.wallet_balance;
    let formattedBalance = '';

    if (rawBalance >= 1e15) formattedBalance = (rawBalance / 1e15).toFixed(2) + 'Q';
    else if (rawBalance >= 1e12) formattedBalance = (rawBalance / 1e12).toFixed(2) + 'T';
    else if (rawBalance >= 1e9) formattedBalance = (rawBalance / 1e9).toFixed(2) + 'B';
    else if (rawBalance >= 1e6) formattedBalance = (rawBalance / 1e6).toFixed(2) + 'M';
    else if (rawBalance >= 1e3) formattedBalance = (rawBalance / 1e3).toFixed(2) + 'K';
    else formattedBalance = rawBalance.toFixed(2);
    // -------------------------------------------

    // 3. Update Baki Wallet (Sidebar, Modal & Payment Cards)
    const sidebarBalance = document.getElementById('sidebar-balance');
    if(sidebarBalance) sidebarBalance.innerText = formattedBalance;
    
    // Update semua display baki lain
    document.querySelectorAll('#current-balance-display').forEach(el => {
        el.innerText = formattedBalance;
    });

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

    // 6. UPDATE BADGES (Guna badges.js)
    // Pastikan fail badges.js telah dimasukkan dalam HTML
    if(typeof renderUserBadges === 'function') {
        await renderUserBadges('profile-badges', currentProfile);
    }

    // 7. UPDATE BORDER WARNA IKUT RANK (Sync dengan badges.js)
    const borderEl = document.getElementById('profile-rank-border');
    if (borderEl) {
        let totalSpent = 0;
        
        // Tarik data leaderboard terkini untuk dapatkan total spent
        const { data: leaderboard } = await supabaseClient.rpc('get_monthly_leaderboard', { month_offset: 0 });
        
        if (leaderboard) {
            const userStat = leaderboard.find(u => u.id === currentProfile.id);
            if (userStat) totalSpent = userStat.total_spent;
        }

        // Ambil threshold dari BADGE_SETTINGS (jika ada), kalau tak guna default
        const goldMin = (typeof BADGE_SETTINGS !== 'undefined') ? BADGE_SETTINGS.TIERS.GOLD.min_spend : 1000;
        const silverMin = (typeof BADGE_SETTINGS !== 'undefined') ? BADGE_SETTINGS.TIERS.SILVER.min_spend : 500;

        let gradientClass = '';

        if (totalSpent >= goldMin) {
            // GOLD
            gradientClass = 'bg-gradient-to-tr from-yellow-300 via-yellow-500 to-yellow-700 shadow-[0_0_25px_rgba(234,179,8,0.4)]';
        } else if (totalSpent >= silverMin) {
            // SILVER
            gradientClass = 'bg-gradient-to-tr from-gray-200 via-gray-400 to-gray-500 shadow-[0_0_20px_rgba(156,163,175,0.4)]';
        } else {
            // BRONZE (Default)
            gradientClass = 'bg-gradient-to-tr from-orange-400 via-orange-600 to-orange-800 shadow-[0_0_15px_rgba(194,65,12,0.3)]';
        }

        borderEl.className = `relative p-[5px] rounded-full transition-all duration-700 ${gradientClass}`;
    }
}
// --- STEP 1: Ganti function getVerifiedItem (Check Maintenance Live) ---

async function getVerifiedItem(gameName, itemId) {
    // Kita ambil data fresh dari database + status maintenance terkini
    const { data, error } = await supabaseClient
        .from('products_v2')
        .select('items, id, game_name, is_maintenance, maintenance_message') // Tambah field maintenance
        .eq('game_name', gameName)
        .single();

    if (error || !data) return null;

    // --- CHECK MAINTENANCE DI SINI ---
    if (data.is_maintenance) {
        return { 
            is_maintenance_active: true, 
            message: data.maintenance_message || "Game sedang diselenggara."
        };
    }

    // Cari item yang user pilih dalam database
    const secureItem = data.items.find(i => i.id == itemId);
    
    // Pass sekali game_id parent untuk tolak stok nanti
    if(secureItem) secureItem.parent_game_id = data.id; 
    
    return secureItem;
}
// ============================================================
// [UPGRADED] HISTORY ID SYSTEM (VERSION 7.0 - PIN & CARDS)
// ============================================================

let pressTimer;
let isLongPress = false;
let isActionTaken = false;
let editingHistoryDisplay = null; // ID yang sedang diedit

// 1. Simpan ID (Auto-save dengan sokongan PIN)
function saveTransactionIdHistory() {
    try {
        if (!activeInputConfig || activeInputConfig.length === 0) return;
        
        let currentValues = [];
        for (let i = 0; i < activeInputConfig.length; i++) {
            let val = document.getElementById(`dynamic-input-${i}`).value.trim();
            if (val) currentValues.push(val);
        }
        if (currentValues.length === 0) return; // Jangan simpan kalau kosong

        const displayStr = currentValues.join(" | ");
        const storageKey = `id_history_${currentGameNameGlobal}`;
        
        // Ambil data lama
        let history = JSON.parse(localStorage.getItem(storageKey) || '[]');
        
        // Cari jika ID dah wujud
        const existingIndex = history.findIndex(h => h.display === displayStr);
        
        let entry = {
            display: displayStr,
            values: currentValues,
            name: null, 
            is_pinned: false, // Default tak pin
            last_used: new Date().getTime() // Update masa
        };

        if (existingIndex !== -1) {
            // Kalau wujud, kekalkan nama & status pin lama
            entry.name = history[existingIndex].name;
            entry.is_pinned = history[existingIndex].is_pinned || false;
            // Buang yang lama supaya boleh letak kat depan
            history.splice(existingIndex, 1);
        }

        // Masukkan yang latest di depan
        history.unshift(entry);
        
        // LIMITATION LOGIC (Bijak: Jangan buang yang 'Pinned')
        if (history.length > 10) {
            // Asingkan pinned dan unpinned
            const pinnedItems = history.filter(h => h.is_pinned);
            const unpinnedItems = history.filter(h => !h.is_pinned);
            
            // Kalau unpinned terlalu banyak, potong yang lama
            // Kita benarkan total max 10, tapi priority pada pinned
            const slotsLeft = 10 - pinnedItems.length;
            
            if (slotsLeft > 0) {
                const keptUnpinned = unpinnedItems.slice(0, slotsLeft);
                history = [...pinnedItems, ...keptUnpinned];
            } else {
                // Kalau pinned dah lebih 10 (jarang berlaku), simpan semua pinned je
                history = pinnedItems;
            }
        }
        
        // Sort balik: Pinned atas, kemudian ikut masa latest
        history.sort((a, b) => {
            if (a.is_pinned === b.is_pinned) {
                return b.last_used - a.last_used; // Sort by time desc
            }
            return a.is_pinned ? -1 : 1; // Pinned first
        });

        localStorage.setItem(storageKey, JSON.stringify(history));
        
    } catch (e) { console.error("History Save Error:", e); }
}

// 2. Logic Tekan (UI Interaction)
function startPress(e, btnElement, displayValue, currentName) {
    // Fungsi ini dikekalkan untuk backward compatibility, 
    // tapi UI baru ada butang 'Gear' untuk edit.
    isLongPress = false;
    isActionTaken = false;
    
    pressTimer = setTimeout(() => {
        isLongPress = true;
        isActionTaken = true; 
        manageHistoryId(displayValue, currentName);
    }, 800);
}

function endPress(e, btnElement, values) {
    if(e.type === 'touchend') e.preventDefault(); 
    clearTimeout(pressTimer); 
    if (!isLongPress && !isActionTaken) {
        fillIdFromHistory(values);
        isActionTaken = true; 
    }
}

function cancelPress(btnElement) {
    clearTimeout(pressTimer);
}

// 3. Function Buka Modal Urus (Dengan butang Pin)
function manageHistoryId(displayValue, currentName) {
    editingHistoryDisplay = displayValue; // Set global var

    const storageKey = `id_history_${currentGameNameGlobal}`;
    const history = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const item = history.find(h => h.display === displayValue);
    
    const modal = document.getElementById('history-modal');
    const displayEl = document.getElementById('modal-history-display');
    const inputEl = document.getElementById('modal-history-input');
    const btnPin = document.getElementById('btn-history-pin');
    const pinIndicator = document.getElementById('modal-pin-indicator');

    if (modal && displayEl && inputEl) {
        displayEl.innerText = displayValue; 
        inputEl.value = (item && item.name) ? item.name : '';
        
        // Update UI Pin Button
        if (item && item.is_pinned) {
            btnPin.innerHTML = `<i class="ph-fill ph-push-pin"></i> <span>UNPIN</span>`;
            btnPin.classList.replace('text-blue-400', 'text-yellow-400');
            btnPin.classList.replace('border-blue-500/20', 'border-yellow-400/20');
            btnPin.classList.replace('bg-blue-500/10', 'bg-yellow-400/10');
            if(pinIndicator) pinIndicator.classList.remove('hidden');
        } else {
            btnPin.innerHTML = `<i class="ph-bold ph-push-pin"></i> <span>PIN</span>`;
            btnPin.classList.replace('text-yellow-400', 'text-blue-400');
            btnPin.classList.replace('border-yellow-400/20', 'border-blue-500/20');
            btnPin.classList.replace('bg-yellow-400/10', 'bg-blue-500/10');
            if(pinIndicator) pinIndicator.classList.add('hidden');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => inputEl.focus(), 100);
    }
}

// 4. Function Toggle Pin
function togglePinHistory() {
    if (!editingHistoryDisplay) return;
    
    const storageKey = `id_history_${currentGameNameGlobal}`;
    let history = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const index = history.findIndex(h => h.display === editingHistoryDisplay);
    
    if (index !== -1) {
        // Toggle status
        history[index].is_pinned = !history[index].is_pinned;
        
        // Sort balik segera
        history.sort((a, b) => {
            if (a.is_pinned === b.is_pinned) return b.last_used - a.last_used;
            return a.is_pinned ? -1 : 1;
        });
        
        localStorage.setItem(storageKey, JSON.stringify(history));
        
        // Refresh UI Modal (untuk update butang)
        manageHistoryId(editingHistoryDisplay, history.find(h => h.display === editingHistoryDisplay).name);
        
        // Refresh UI Background
        renderDynamicInputs(currentGameNameGlobal);
        showToast(history[index].is_pinned ? "Akaun di-Pin!" : "Pin dibuang.", "success");
    }
}

function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    editingHistoryDisplay = null;
}

function saveHistoryFromModal() {
    const inputEl = document.getElementById('modal-history-input');
    const newName = inputEl.value.trim();

    if (!editingHistoryDisplay) return;

    const storageKey = `id_history_${currentGameNameGlobal}`;
    let history = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const index = history.findIndex(h => h.display === editingHistoryDisplay);
    
    if (index !== -1) {
        history[index].name = newName || null; 
        localStorage.setItem(storageKey, JSON.stringify(history));
        showToast("Nama berjaya disimpan!", "success");
        closeHistoryModal();
        renderDynamicInputs(currentGameNameGlobal); 
    }
}

function deleteHistoryFromModal() {
    if (!editingHistoryDisplay) return;

    const storageKey = `id_history_${currentGameNameGlobal}`;
    let history = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const newHistory = history.filter(h => h.display !== editingHistoryDisplay);
    
    localStorage.setItem(storageKey, JSON.stringify(newHistory));
    showToast("Akaun telah dipadam.", "success");
    closeHistoryModal();
    renderDynamicInputs(currentGameNameGlobal); 
}

// 5. Logic Isi Data (Safe Fill)
function fillIdFromHistory(values) {
    if (!Array.isArray(values)) return;

    let isInputEmpty = true;
    for (let i = 0; i < activeInputConfig.length; i++) {
        const input = document.getElementById(`dynamic-input-${i}`);
        if (input && input.value && input.value.trim() !== "") {
            isInputEmpty = false;
            break; 
        }
    }

    if (isInputEmpty) {
        executeFillHistory(values);
    } else {
        pendingHistoryValues = values;
        openModal('confirm-overwrite-modal');
    }
}

function confirmHistoryOverwrite() {
    if (pendingHistoryValues) {
        executeFillHistory(pendingHistoryValues);
        pendingHistoryValues = null; 
    }
    closeModal('confirm-overwrite-modal');
}

function executeFillHistory(values) {
    values.forEach((val, index) => {
        const input = document.getElementById(`dynamic-input-${index}`);
        if (input) {
            input.value = val;
            input.dispatchEvent(new Event('input')); 
        }
    });
    const container = document.getElementById('game-inputs-container');
    if(container) {
        container.classList.remove('animate-pulse'); 
        void container.offsetWidth; 
        container.classList.add('animate-pulse');
        setTimeout(() => container.classList.remove('animate-pulse'), 500);
    }
    showToast("Maklumat dimasukkan!", "success");
}

// 6. UI RENDERER BARU (Horizontal Scroll Cards)
function getIdHistoryUI() {
    const storageKey = `id_history_${currentGameNameGlobal}`;
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch (e) { console.error(e); history = []; }

    if (history.length === 0) return '';

    // Helper masa relative (e.g., "2m ago")
    const timeAgo = (ts) => {
        if(!ts) return '';
        const sec = Math.floor((new Date().getTime() - ts) / 1000);
        if(sec < 60) return 'Baru saja';
        if(sec < 3600) return `${Math.floor(sec/60)} min lepas`;
        if(sec < 86400) return `${Math.floor(sec/3600)} jam lepas`;
        return `${Math.floor(sec/86400)} hari lepas`;
    };

    const cardsHtml = history.map((h) => {
        const safeValues = JSON.stringify(h.values).replace(/"/g, '&quot;');
        const safeDisplay = h.display.replace(/"/g, '&quot;');
        const safeName = h.name ? h.name.replace(/"/g, '&quot;') : 'null';
        const isPinned = h.is_pinned;
        
        // Visual Card
        let borderClass = isPinned ? 'border-yellow-400/40 bg-yellow-400/5' : 'border-white/10 bg-[#27272a]';
        let iconColor = isPinned ? 'text-yellow-400' : 'text-gray-500';
        let pinBadge = isPinned ? `<div class="absolute top-1 right-1 text-yellow-400 text-[10px]"><i class="ph-fill ph-push-pin"></i></div>` : '';

        return `
            <div class="relative shrink-0 w-[140px] group select-none">
                <button 
                    onclick="fillIdFromHistory(${safeValues})"
                    class="w-full text-left p-3 rounded-xl border ${borderClass} hover:border-white/30 transition-all active:scale-95 flex flex-col gap-2 h-full relative overflow-hidden shadow-sm"
                >
                    ${pinBadge}
                    
                    <div class="flex justify-between items-start">
                        <div class="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center">
                            <i class="ph-fill ph-user-circle text-xl ${iconColor}"></i>
                        </div>
                        <div onclick="event.stopPropagation(); manageHistoryId('${safeDisplay}', '${safeName}')" 
                             class="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition cursor-pointer z-20">
                            <i class="ph-bold ph-gear text-xs"></i>
                        </div>
                    </div>

                    <div class="flex flex-col overflow-hidden">
                        <span class="font-bold text-[11px] text-white truncate leading-tight">
                            ${h.name || 'Tanpa Nama'}
                        </span>
                        <span class="font-mono text-[9px] text-gray-400 truncate mt-0.5">
                            ${h.display}
                        </span>
                    </div>

                    <div class="mt-auto pt-2 border-t border-white/5 flex items-center gap-1">
                        <i class="ph ph-clock text-[9px] text-gray-500"></i>
                        <span class="text-[8px] text-gray-500">${timeAgo(h.last_used)}</span>
                    </div>
                </button>
            </div>
        `;
    }).join('');

    return `
        <div class="mt-4 animate-fade-in">
            <div class="flex items-center justify-between mb-2 px-1">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <i class="ph-fill ph-clock-counter-clockwise"></i> Akaun Disimpan
                </span>
                <span class="text-[9px] text-gray-600 italic">Klik untuk isi</span>
            </div>
            
            <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
                ${cardsHtml}
                <div class="w-2 shrink-0"></div> 
            </div>
        </div>
    `;
}
   

// --- SHARE FUNCTION ---
async function shareGame() {
    const shareData = {
        title: document.title,
        text: `Jom topup ${currentGameNameGlobal} di LD-SHOP! Harga murah & proses pantas.`,
        url: window.location.href
    };

    try {
        if (navigator.share) {
            // Guna native share (Android/iOS)
            await navigator.share(shareData);
        } else {
            // Fallback untuk PC (Copy Link)
            await navigator.clipboard.writeText(window.location.href);
            showToast("Link disalin ke clipboard!", "success");
        }
    } catch (err) {
        console.log("Share dibatalkan");
    }
}

// ===============================
// GAME DESCRIPTION SYSTEM (FAST + ANTI-LAG)
// ===============================

const DESC_COLLAPSED_HEIGHT = 50;
const DESC_ANIMATION_DURATION = 250; 
let isDescAnimating = false;

function renderGameDescription(gameName) {
    const container = document.getElementById('game-description-section');
    if (!container) return;

    container.innerHTML = `
        <div class="glass-panel p-5 rounded-2xl relative border border-white/5 bg-[#18181b] shadow-lg">
            <h3 class="font-bold text-white text-xs mb-3 flex items-center gap-2 select-none">
                <i class="ph-fill ph-info text-yellow-400 text-sm"></i>
                <span>Description ${gameName}</span>
            </h3>

            <div 
                id="desc-content"
                class="text-[10px] text-gray-400 leading-relaxed overflow-hidden relative transition-[max-height] duration-[250ms] ease-in-out"
                style="max-height:${DESC_COLLAPSED_HEIGHT}px; will-change:max-height;"
            >
                <p class="mb-2">
                    Panduan top up <strong class="text-white">${gameName}</strong> dengan proses pantas,
                    harga berpatutan dan sistem pembayaran yang selamat.
                </p>

                <ol class="list-decimal ml-4 space-y-1.5 text-gray-500 marker:text-yellow-500/50">
                    <li>Pilih item</li>
                    <li>Masukkan maklumat akaun</li>
                    <li>Masukkan jumlah kuantiti</li>
                    <li>Pilih pembayaran</li>
                    <li>Masukkan kod promo (jika ada)</li>
                    <li>Isi nombor WhatsApp</li>
                    <li>Tekan buy now & buat pembayaran</li>
                    <li>Selesai</li>
                </ol>

                </div>

            <button
                id="btn-desc-toggle"
                type="button"
                aria-expanded="false"
                class="w-full mt-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl py-2 text-[10px] font-bold text-yellow-400 transition-all active:scale-95 flex items-center justify-center gap-1.5 group"
            >
                <span>Baca Seterusnya</span>
                <i class="ph-bold ph-caret-down transition-transform group-hover:translate-y-0.5"></i>
            </button>
        </div>
    `;

    container.classList.remove('hidden');
    container.querySelector('#btn-desc-toggle')
        .addEventListener('click', toggleDescription);
}

// Function toggle kekal sama, cuma buang rujukan 'fade'
function toggleDescription() {
    if (isDescAnimating) return;

    const content = document.getElementById('desc-content');
    // const fade = document.getElementById('desc-fade'); // Tak perlu lagi
    const btn = document.getElementById('btn-desc-toggle');
    const btnText = btn.querySelector('span');
    const btnIcon = btn.querySelector('i');

    if (!content || !btn) return;

    isDescAnimating = true;
    btn.disabled = true;

    const isExpanded = content.style.maxHeight !== `${DESC_COLLAPSED_HEIGHT}px`;

    requestAnimationFrame(() => {
        if (isExpanded) {
            // CLOSE
            content.style.maxHeight = `${DESC_COLLAPSED_HEIGHT}px`;
            // fade.style.opacity = '1'; // Buang

            btnText.textContent = 'Baca Seterusnya';
            btnIcon.className = 'ph-bold ph-caret-down transition-transform group-hover:translate-y-0.5';
            btn.classList.remove('bg-yellow-400/10', 'text-yellow-300');
            btn.setAttribute('aria-expanded', 'false');
        } else {
            // OPEN
            content.style.maxHeight = 'none';
            const fullHeight = content.scrollHeight;
            content.style.maxHeight = `${fullHeight}px`;
            // fade.style.opacity = '0'; // Buang

            btnText.textContent = 'Sembunyikan';
            btnIcon.className = 'ph-bold ph-caret-up transition-transform group-hover:-translate-y-0.5';
            btn.classList.add('bg-yellow-400/10', 'text-yellow-300');
            btn.setAttribute('aria-expanded', 'true');
        }
    });

    setTimeout(() => {
        btn.disabled = false;
        isDescAnimating = false;
    }, DESC_ANIMATION_DURATION);
}
// --- ANNOUNCEMENT SYSTEM ---

async function checkAndShowAnnouncement(gameName) {
    try {
        // 1. Fetch Announcement yang Aktif untuk Game ini ATAU untuk 'ALL'
        const { data, error } = await supabaseClient
            .from('announcements')
            .select('*')
            .eq('is_active', true)
            .or(`game_name.ilike.${gameName},game_name.ilike.ALL`) 
            .order('created_at', { ascending: false }) // Ambil yang paling baru
            .limit(1);

        if (error || !data || data.length === 0) return;

        const announcement = data[0];
        currentAnnouncement = announcement;

        // 2. Cek Frequency (Sekali vs Berkali-kali)
        if (announcement.frequency === 'once') {
            const hasSeen = localStorage.getItem(`seen_announcement_${announcement.id}`);
            if (hasSeen) return; // Kalau dah tengok, jangan tunjuk lagi
        }

        // 3. Masukkan Data ke HTML
        document.getElementById('ann-title').innerText = announcement.title || "Pengumuman";
        document.getElementById('ann-image').src = announcement.image_url;
        document.getElementById('ann-message').innerText = announcement.message || "";
        
        const btnAction = document.getElementById('ann-btn-action');
        if (announcement.action_link) {
            btnAction.classList.remove('hidden');
            btnAction.innerText = announcement.action_text || "Lihat Promo";
        } else {
            btnAction.classList.add('hidden'); // Sembunyikan jika tiada link
        }

        // 4. Tunjuk Modal dengan delay sikit supaya smooth
        setTimeout(() => {
            const modal = document.getElementById('announcement-modal');
            if(modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        }, 1000); // Popup keluar selepas 1 saat page load

    } catch (e) {
        console.error("Announcement Error:", e);
    }
}

function closeAnnouncement() {
    const modal = document.getElementById('announcement-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // Jika setting 'once', simpan rekod user dah tengok
    if (currentAnnouncement && currentAnnouncement.frequency === 'once') {
        localStorage.setItem(`seen_announcement_${currentAnnouncement.id}`, 'true');
    }
}

function openAnnouncementLink() {
    if (!currentAnnouncement || !currentAnnouncement.action_link) return;
    
    // Simpan rekod seen sebelum redirect (jika once)
    if (currentAnnouncement.frequency === 'once') {
        localStorage.setItem(`seen_announcement_${currentAnnouncement.id}`, 'true');
    }
    
    window.open(currentAnnouncement.action_link, '_blank');
    closeAnnouncement();
}

