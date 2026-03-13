// js/ramadhan.js
// Version 1.0 - Ramadhan Event Logic
// Logik ini akan "override" Flash Sale biasa kepada tema Ramadhan

document.addEventListener('DOMContentLoaded', () => {
    // Pastikan supabaseClient wujud (dari script.js)
    if (typeof supabaseClient === 'undefined') {
        console.error("RamadhanJS: supabaseClient tidak dijumpai. Pastikan script.js dimuatkan dahulu.");
        return;
    }

    // Tunggu sekejap untuk pastikan elemen HTML sedia ada
    setTimeout(() => {
        initRamadhanEvent();
    }, 500);
});

// --- 1. SETUP STYLE & UI ---

function initRamadhanEvent() {
    const section = document.getElementById('home-flash-sale-section');
    const container = document.getElementById('flash-sale-track');
    
    if (!section || !container) return;

    // A. Inject CSS Khas Ramadhan
    injectRamadhanStyles();

    // B. Ubah Header UI (Flash Sale -> Ramadhan Sale)
    transformHeaderUI(section);

    // C. Muat Semula Data dengan Design Ramadhan
    loadRamadhanItems(container, section);
}

function injectRamadhanStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* Latar Belakang & Tema */
        .ramadhan-glow {
            box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
        }
        
        /* Animasi Pelita Gantung */
        @keyframes swing {
            0% { transform: rotate(3deg); }
            100% { transform: rotate(-3deg); }
        }
        .lantern-swing {
            animation: swing 3s ease-in-out infinite alternate;
            transform-origin: top center;
        }

        /* Card Design Ramadhan */
        .ramadhan-card {
            background: linear-gradient(145deg, #064e3b 0%, #022c22 100%);
            border: 1px solid #d97706; /* Amber-600 */
            position: relative;
            overflow: hidden;
        }
        
        /* Corak Islamik (Overlay Halus) */
        .islamic-pattern {
            background-color: transparent;
            background-image: radial-gradient(#fbbf24 1px, transparent 1px);
            background-size: 10px 10px;
            opacity: 0.1;
        }

        /* Badge Khas */
        .badge-iftar {
            background: linear-gradient(to right, #f59e0b, #d97706);
            color: black;
            font-weight: 900;
            clip-path: polygon(0 0, 100% 0, 100% 100%, 10% 100%, 0% 50%);
        }
    `;
    document.head.appendChild(style);
}

function transformHeaderUI(section) {
    // Cari elemen tajuk dalam section tersebut
    const titleContainer = section.querySelector('h3');
    const timerContainer = section.querySelector('.w-12'); // Bar loading sebelah kanan

    if (titleContainer) {
        // Tukar Ikon & Teks
        titleContainer.innerHTML = `
            <i class="ph-fill ph-mosque text-emerald-400 lantern-swing"></i>
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-yellow-400">
                JUALAN RAMADHAN
            </span>
        `;
    }

    // Tambah hiasan pelita di penjuru section (hiasan visual)
    const decoration = document.createElement('div');
    decoration.className = 'absolute top-0 right-10 -mt-2 z-0 opacity-50 pointer-events-none hidden sm:block';
    decoration.innerHTML = `
        <i class="ph-fill ph-lantern text-yellow-500 text-4xl lantern-swing" style="animation-delay: 0.5s"></i>
    `;
    section.style.position = 'relative'; // Pastikan relative untuk decoration
    section.appendChild(decoration);
}

// --- 2. DATA LOADING & RENDERING ---

async function loadRamadhanItems(container, section) {
    // Gunakan Supabase client global
    const { data: games, error } = await supabaseClient
        .from('products_v2')
        .select('game_name, image_url, items')
        .eq('is_active', true);

    if (error || !games) return;

    // Filter Promo (Sama macam script asal, tapi kita guna data ni untuk design baru)
    let allPromos = [];
    const now = new Date();

    games.forEach(game => {
        if (game.items && Array.isArray(game.items)) {
            game.items.forEach(item => {
                // Logic: Ambil item promo ATAU item yang ada perkataan 'special'
                if ((item.is_promo && item.promo_end) || item.name.toLowerCase().includes('ramadhan')) {
                    const endDate = new Date(item.promo_end);
                    if (endDate > now) {
                        allPromos.push({
                            ...item,
                            game_name: game.game_name,
                            final_image: item.image || item.image_url || game.image_url
                        });
                    }
                }
            });
        }
    });

    if (allPromos.length === 0) return;

    // KOSONGKAN container asal (Overwrite Flash Sale biasa)
    container.innerHTML = '';
    
    // Create Fragment
    const fragment = document.createDocumentFragment();

    // Duplicate 4x untuk infinite scroll effect
    for (let i = 0; i < 4; i++) {
        allPromos.forEach(item => {
            const card = createRamadhanCard(item);
            fragment.appendChild(card);
        });
    }

    container.appendChild(fragment);

    // Pastikan styling container betul
    container.classList.remove('justify-center');
    container.style.display = 'flex';
    container.style.flexWrap = 'nowrap';
    
    // Kita guna balik logic scroll yang dah ada atau init baru jika perlu
    // Nota: Kerana kita guna container ID yang sama, initFlashSaleScroller dalam script.js 
    // mungkin masih berjalan. Itu ok, asalkan content di dalam dah bertukar.
}

// --- 3. COMPONENT: KAD RAMADHAN ---

function createRamadhanCard(item) {
    const price = parseFloat(item.price) || 0;
    const originalPrice = parseFloat(item.original_price) || 0;
    
    // Wrapper
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'inline-block w-40 sm:w-44 mx-2 flex-shrink-0 relative group cursor-pointer';
    
    cardWrapper.onclick = () => window.location.href = `topup.html?game=${encodeURIComponent(item.game_name)}`;

    // Inner Card (Design Hijau & Emas)
    const innerCard = document.createElement('div');
    innerCard.className = 'ramadhan-card rounded-xl p-3 shadow-lg transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-yellow-500/20';

    // Pattern Overlay
    const pattern = document.createElement('div');
    pattern.className = 'islamic-pattern absolute inset-0 z-0';
    innerCard.appendChild(pattern);

    // Content Relative (Supaya duduk atas pattern)
    const content = document.createElement('div');
    content.className = 'relative z-10';

    // Badge "Sahur/Berbuka" (Random)
    const badgeText = Math.random() > 0.5 ? 'SAHUR DEAL' : 'IFTAR SPECIAL';
    const badge = document.createElement('div');
    badge.className = 'absolute -top-1 -right-1 badge-iftar text-[8px] px-2 py-0.5 rounded-sm shadow-md z-20';
    badge.innerText = badgeText;
    content.appendChild(badge);

    // Gambar
    const imgContainer = document.createElement('div');
    imgContainer.className = 'w-full h-24 mb-2 flex items-center justify-center bg-black/20 rounded-lg border border-white/5 relative';
    
    // Ikon Bulan Sabit Kecil kat Gambar
    const moonIcon = document.createElement('div');
    moonIcon.className = 'absolute top-1 left-1 text-yellow-400 opacity-80';
    moonIcon.innerHTML = '<i class="ph-fill ph-moon-stars text-xs"></i>';
    imgContainer.appendChild(moonIcon);

    const img = document.createElement('img');
    img.src = item.final_image;
    img.className = 'w-16 h-16 object-contain drop-shadow-lg group-hover:scale-110 transition duration-500';
    img.onerror = function() { this.src = 'https://placehold.co/200x200/064e3b/fbbf24?text=Ramadhan'; };
    
    imgContainer.appendChild(img);
    content.appendChild(imgContainer);

    // Teks
    const title = document.createElement('div');
    title.className = 'text-[9px] text-emerald-300 font-bold uppercase tracking-wider mb-0.5 truncate';
    title.innerText = item.game_name;
    content.appendChild(title);

    const itemName = document.createElement('div');
    itemName.className = 'text-xs font-bold text-white leading-tight truncate mb-2';
    itemName.innerText = item.name;
    content.appendChild(itemName);

    // Harga Section
    const priceRow = document.createElement('div');
    priceRow.className = 'flex items-center justify-between bg-black/30 rounded-lg p-1.5 border border-white/5';
    
    const priceText = document.createElement('div');
    priceText.className = 'text-sm font-black text-yellow-400';
    priceText.innerText = `RM${price.toFixed(2)}`;
    
    // Ikon Ketupat (Guna Diamond icon sebagai ganti jika tiada custom SVG)
    const decorIcon = document.createElement('i');
    decorIcon.className = 'ph-fill ph-sparkle text-emerald-500 text-xs';

    priceRow.appendChild(priceText);
    priceRow.appendChild(decorIcon);
    content.appendChild(priceRow);

    innerCard.appendChild(content);
    cardWrapper.appendChild(innerCard);

    return cardWrapper;
}