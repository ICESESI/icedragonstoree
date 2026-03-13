// script.js - Version 5.7 (Updated: Flash Sale Stock Logic & Auto Hide)

// --- CONFIGURATION ---
const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// --- STATE VARIABLES ---
let currentUser = null;
let currentProfile = null;
let heroInterval = null;
let notificationToDelete = null; 
let allGamesData = []; 
let activeCategory = 'all';

// Flash Sale Variables
let isFlashSaleAutoScrolling = true; 
let flashSaleResumeTimer = null;

// Search State - Updated: Safe JSON Parsing
let searchHistory = [];
try {
    const storedHistory = localStorage.getItem('search_history');
    if (storedHistory) {
        searchHistory = JSON.parse(storedHistory);
        // Pastikan ia array betul, kalau bukan, reset jadi array kosong
        if (!Array.isArray(searchHistory)) searchHistory = [];
    }
} catch (e) {
    console.warn("Sejarah carian rosak, reset semula.", e);
    localStorage.removeItem('search_history');
    searchHistory = [];
}

const popularSearches = ['Mobile Legends', 'PUBG Mobile', 'Free Fire', 'Genshin Impact', 'Valorant'];

// --- UTILITY ---
// --- ERROR HANDLING & RETRY SYSTEM ---
function renderErrorState(containerId, retryCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = ''; // Kosongkan container (buang skeleton/loading lama)

    // Cipta wrapper error yang memenuhi ruang (col-span-full untuk grid)
    const wrapper = el('div', 'col-span-full flex flex-col items-center justify-center py-16 text-center animate-fade-in', [
        el('div', 'p-4 rounded-full bg-red-500/10 border border-red-500/20 mb-4 shadow-[0_0_15px_rgba(239,68,68,0.2)]', [
            el('i', 'ph-fill ph-wifi-slash text-3xl text-red-500')
        ]),
        el('h3', 'text-white font-bold text-xl mb-2', ['Gagal Memuatkan Data']),
        el('p', 'text-gray-400 text-sm mb-6 max-w-[250px] mx-auto leading-relaxed', ['Masalah sambungan internet atau pelayan tidak dapat dihubungi.']),
        el('button', 'group px-6 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black font-extrabold rounded-full transition-all active:scale-95 shadow-lg shadow-yellow-400/20 flex items-center gap-2', [
             el('i', 'ph-bold ph-arrow-counter-clockwise group-hover:-rotate-90 transition-transform duration-500'),
             'Cuba Lagi'
        ], {
            onclick: async function() {
                // UI Loading Effect pada butang
                const icon = this.querySelector('i');
                if(icon) icon.classList.add('animate-spin');
                this.classList.add('opacity-75', 'cursor-wait', 'pointer-events-none');
                
                // Panggil semula function asal (contoh: loadGames)
                await retryCallback();
            }
        })
    ]);
    
    container.appendChild(wrapper);
}
// --- DOM UTILITY HELPER ---
// Tambah ini di bahagian Utility jika belum ada
function formatBalance(amount) {
    if (!amount) return '0.00';
    if (amount >= 1e15) return (amount / 1e15).toFixed(2) + 'Q';
    if (amount >= 1e12) return (amount / 1e12).toFixed(2) + 'T';
    if (amount >= 1e9)  return (amount / 1e9).toFixed(2) + 'B';
    if (amount >= 1e6)  return (amount / 1e6).toFixed(2) + 'M';
    if (amount >= 1e3)  return (amount / 1e3).toFixed(2) + 'K';
    return amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function el(tag, className = '', children = [], props = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    
    // Set properties/attributes
    Object.entries(props).forEach(([key, value]) => {
        if (key.startsWith('on') && typeof value === 'function') {
            const eventName = key.toLowerCase().substring(2);
            element.addEventListener(eventName, value);
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else if (key === 'src' || key === 'href' || key === 'type' || key === 'value' || key === 'placeholder') {
            element[key] = value;
        } else {
            element.setAttribute(key, value);
        }
    });

    // Append children
    children.forEach(child => {
        if (typeof child === 'string' || typeof child === 'number') {
            element.textContent = child;
        } else if (child instanceof Node) {
            element.appendChild(child);
        } else if (child === null || child === undefined) {
            // Ignore null/undefined
        }
    });

    return element;
}
// --- LAZY LOADING SYSTEM (UTILITY) ---
// Observer ini mengesan bila gambar masuk dalam skrin
const lazyImageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.getAttribute('data-src');
            
            if (src) {
                // Tukar src sebenar dan buat animasi fade-in
                img.src = src;
                img.onload = () => {
                    img.classList.remove('opacity-0'); 
                    img.classList.add('opacity-100'); 
                };
                img.removeAttribute('data-src');
            }
            observer.unobserve(img); // Berhenti pantau lepas dah load
        }
    });
}, {
    rootMargin: '100px 0px', // Pre-load 100px sebelum user scroll sampai
    threshold: 0.01
});

// Function untuk start pantau gambar baru
function initLazyImages() {
    const images = document.querySelectorAll('img.lazy-load-target');
    images.forEach(img => lazyImageObserver.observe(img));
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// --- TAMBAH INI DI BAWAH 'fmtRM' ---

const formatCompactNumber = (number) => {
    if (!number) return '0';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits: 1
    }).format(number);
};
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return; 
    
    let bgClass = 'bg-[#18181b]/95 border-gray-700 text-white';
    let iconClass = 'ph-info';
    
    if (type === 'success') {
        bgClass = 'bg-green-900/80 border-green-500/30 text-green-400 shadow-[0_0_15px_rgba(74,222,128,0.1)]';
        iconClass = 'ph-check-circle-fill';
    } else if (type === 'error') {
        bgClass = 'bg-red-900/80 border-red-500/30 text-red-400 shadow-[0_0_15px_rgba(248,113,113,0.1)]';
        iconClass = 'ph-warning-circle-fill';
    }

    // Guna helper 'el'
    const toast = el('div', `p-4 rounded-xl shadow-xl border flex items-center gap-3 animate-slide-left backdrop-blur-md transform transition-all duration-300 ${bgClass}`, [
        el('i', `ph ${iconClass} text-xl shrink-0`),
        el('span', 'text-xs font-bold leading-tight', [message]) // message kini textContent, bukan innerHTML
    ]);
    
    container.appendChild(toast);
    
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        toast.style.transform = 'translateY(-10px) scale(0.95)';
        setTimeout(() => toast.remove(), 300); 
    }, 3500);
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    if(document.getElementById('games-grid')) renderSkeleton();
    
    setupScrollListener();
    setupSearchModal();
    
    await checkSession();

    if(document.getElementById('games-grid')) {
        try {
            await Promise.all([
                loadGames(), 
                loadBanners(),
                loadHomeFlashSale() 
            ]);
        } catch (e) { 
            console.error("Critical Data Load Error:", e);
        }
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    if(loadingOverlay) {
        loadingOverlay.style.transition = 'opacity 0.5s ease';
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.remove(), 500);
    }
});

// --- SCROLL & UI ---
function setupScrollListener() {
    const btn = document.getElementById('back-to-top');
    const nav = document.querySelector('.glass-nav');
    if(!btn) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            btn.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            btn.classList.add('flex', 'opacity-100', 'pointer-events-auto');
            if(nav) nav.classList.add('shadow-lg', 'bg-black/90', 'border-b', 'border-white/5');
        } else {
            btn.classList.remove('flex', 'opacity-100', 'pointer-events-auto');
            btn.classList.add('hidden', 'opacity-0', 'pointer-events-none');
            if(nav) nav.classList.remove('shadow-lg', 'bg-black/90', 'border-b', 'border-white/5');
        }
    });
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

// --- DATA LOADING ---

async function loadBanners() {
    const sliderContainer = document.getElementById('hero-slider-container');
    if (!sliderContainer) return;

    // 1. Dapatkan data dari Cache atau Database
    let banners = getFromCache('banners_data');
    if (!banners) {
        const { data, error } = await supabaseClient
            .from('banners')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
            
        if (!error && data) {
            banners = data;
            saveToCache('banners_data', banners);
        }
    }

    // 2. Bersihkan container dahulu
    sliderContainer.innerHTML = '';

    // 3. Handle jika TIADA banner (Default Fallback)
    if (!banners || banners.length === 0) {
        const defaultSlide = el('div', 'absolute inset-0 transition-opacity duration-1000 opacity-100', [
            el('img', 'w-full h-full object-cover opacity-60', [], { 
                src: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop' 
            }),
            el('div', 'absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/40 to-transparent'),
            el('div', 'absolute bottom-0 left-0 p-6 sm:p-10 w-full', [
                el('span', 'bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded mb-3 inline-block tracking-wider', ['MINGGU INI']),
                el('h2', 'text-3xl md:text-5xl font-extrabold text-white mb-2 tracking-tight', ['Game Ranking'])
            ])
        ]);
        sliderContainer.appendChild(defaultSlide);
        return;
    }

    // 4. Handle jika ADA banner (Guna DocumentFragment)
    const fragment = document.createDocumentFragment();

    banners.forEach((banner, index) => {
        const hasLink = banner.link_url && banner.link_url.trim() !== '';
        
        // Tentukan class untuk animasi slide & cursor
        let wrapperClass = `slide-item absolute inset-0 transition-opacity duration-1000 ${index === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`;
        if (hasLink) wrapperClass += ' cursor-pointer';

        // Cipta elemen slide menggunakan helper el()
        const slide = el('div', wrapperClass, [
            // Gambar Background
            el('img', 'w-full h-full object-cover opacity-60', [], { 
                src: banner.image_url,
                alt: banner.title 
            }),
            // Gradient Overlay
            el('div', 'absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/40 to-transparent'),
            // Teks Content
            el('div', 'absolute bottom-0 left-0 p-6 sm:p-10 w-full', [
                el('span', 'bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded mb-3 inline-block tracking-wider', ['FEATURED']),
                el('h2', 'text-3xl md:text-5xl font-extrabold text-white mb-2 tracking-tight drop-shadow-lg', [banner.title]),
                el('p', 'text-gray-300 text-sm md:text-base max-w-lg drop-shadow-md', [banner.subtitle])
            ])
        ], {
            'data-index': index
        });

        // Tambah event listener jika ada link
        if (hasLink) {
            slide.onclick = () => window.location.href = banner.link_url;
        }

        fragment.appendChild(slide);
    });

    // 5. Masukkan semua slide ke dalam container sekali gus
    sliderContainer.appendChild(fragment);
    
    // 6. Mulakan timer slider
    startSlider(banners.length);
}

function startSlider(totalSlides) {
    if (totalSlides <= 1) return;
    let currentSlide = 0;
    if (heroInterval) clearInterval(heroInterval);
    
    heroInterval = setInterval(() => {
        const slides = document.querySelectorAll('.slide-item');
        if(slides.length === 0) return;
        
        slides[currentSlide].classList.remove('opacity-100', 'z-10'); 
        slides[currentSlide].classList.add('opacity-0', 'z-0');
        
        currentSlide = (currentSlide + 1) % totalSlides;
        slides[currentSlide].classList.remove('opacity-0', 'z-0'); 
        slides[currentSlide].classList.add('opacity-100', 'z-10');
        
        const dots = document.getElementById('slider-dots');
        if(dots) {
            Array.from(dots.children).forEach((dot, idx) => {
                dot.classList.toggle('bg-yellow-400', idx === currentSlide);
                dot.classList.toggle('bg-white/50', idx !== currentSlide);
            });
        }
    }, 5000); 
}

function renderSkeleton() {
    const grid = document.getElementById('games-grid');
    if (!grid) return;
    grid.innerHTML = Array(12).fill(0).map((_, i) => `
        <div class="animate-pulse flex flex-col items-center gap-2" style="animation-delay: ${i * 50}ms">
            <div class="w-full aspect-square rounded-2xl bg-[#18181b] border border-gray-800"></div>
            <div class="w-3/4 h-3 bg-[#18181b] rounded mt-2"></div>
        </div>
    `).join('');
}

// --- HOME FLASH SALE SYSTEM (UPDATED: Stock Block & Auto Hide) ---

async function loadHomeFlashSale() {
    const container = document.getElementById('flash-sale-track');
    const section = document.getElementById('home-flash-sale-section');
    if (!container || !section) return; 

    // --- SKELETON LOADING ---
    // Kekalkan paparan skeleton semasa loading awal
    const skeletonHtml = Array(5).fill(0).map(() => `
        <div class="inline-block w-36 sm:w-40 mx-2 flex-shrink-0">
            <div class="bg-[#18181b] rounded-xl p-3 h-48 animate-pulse border border-gray-800/50 flex flex-col">
                <div class="w-full h-24 bg-white/5 rounded-lg mb-3"></div>
                <div class="h-3 w-3/4 bg-white/5 rounded mb-2"></div>
                <div class="h-3 w-1/2 bg-white/5 rounded mb-4"></div>
                <div class="h-1.5 w-full bg-white/5 rounded mt-auto"></div>
            </div>
        </div>
    `).join('');

    container.innerHTML = skeletonHtml;
    
    // Style container untuk skeleton & pastikan section nampak
    container.style.display = 'flex'; 
    container.classList.remove('justify-center');
    container.classList.add('no-scrollbar'); 
    section.classList.remove('hidden'); 

    // --- FETCH DATA ---
    const { data: games, error } = await supabaseClient
        .from('products_v2')
        .select('game_name, image_url, items')
        .eq('is_active', true);

    // --- ERROR HANDLING & RETRY MECHANISM (UPDATE 3) ---
    if (error) {
        console.error("Flash Sale Error:", error);
        
        // Jangan sembunyikan section, tapi tunjuk butang Retry dalam container
        // Kita hantar callback function loadHomeFlashSale sendiri untuk dipanggil semula
        renderErrorState('flash-sale-track', () => loadHomeFlashSale());
        return; 
    }

    // Jika tiada data games langsung (bukan error, tapi kosong), baru hide section
    if (!games) {
        section.classList.add('hidden');
        return;
    }

    // --- FILTER PROMO ITEMS ---
    let allPromos = [];
    const now = new Date();

    games.forEach(game => {
        if (game.items && Array.isArray(game.items)) {
            game.items.forEach(item => {
                if (item.is_promo && item.promo_end) {
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

    // Jika tiada item promo yang valid, sembunyikan section
    if (allPromos.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    // Pastikan section nampak jika ada promo
    section.classList.remove('hidden');

    // --- RENDERING (Guna DocumentFragment) ---
    const fragment = document.createDocumentFragment();
    
    // 3. Gandakan 4 kali untuk efek "Infinite Scroll"
    // Kita createFlashSaleCard(item) SETIAP KALI secara fresh untuk event listener unik
    for (let i = 0; i < 4; i++) {
        allPromos.forEach(item => {
            const card = createFlashSaleCard(item); 
            fragment.appendChild(card);
        });
    }
    
    // 4. Bersihkan skeleton/error & masukkan kad sebenar
    container.innerHTML = ''; 
    container.appendChild(fragment); 
    
    // --- STYLE & ANIMATION ---
    container.classList.remove('justify-center');
    container.style.display = 'flex';
    container.style.flexWrap = 'nowrap'; 
    
    initFlashSaleScroller(container);
}

function createFlashSaleCard(item) {
    const price = parseFloat(item.price) || 0;
    const originalPrice = parseFloat(item.original_price) || 0;
    const discount = originalPrice > 0 ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
    const stockVal = item.stock !== null ? item.stock : 999; 
    
    let stockBarWidth = stockVal < 20 ? 15 : (stockVal < 50 ? 50 : 80);
    let stockColor = stockVal < 20 ? 'bg-red-500' : 'bg-yellow-400';
    let containerClass = "cursor-pointer group hover:border-yellow-400";
    let opacityStyle = "";
    
    // Logic Click
    let clickHandler = () => window.location.href = `topup.html?game=${encodeURIComponent(item.game_name)}`;
    
    if (stockVal <= 0) {
        clickHandler = () => showToast('Maaf, stok item ini telah habis!', 'error');
        containerClass = "cursor-not-allowed border-gray-700";
        stockColor = 'bg-red-900';
        stockBarWidth = 100;
        opacityStyle = "opacity-60 grayscale";
    }

    // Wrapper Utama (Guna helper 'el')
    const cardWrapper = el('div', `flash-card inline-block w-36 sm:w-40 mx-2 flex-shrink-0 relative ${opacityStyle}`);
    
    // Bind event listener terus pada elemen
    cardWrapper.onclick = clickHandler;

    // Kad Dalam
    const innerCard = el('div', `bg-[#18181b] border border-yellow-400/20 rounded-xl p-3 overflow-hidden transition relative ${containerClass}`);

    // Overlay Habis Stok
    if (stockVal <= 0) {
        innerCard.appendChild(
            el('div', 'absolute inset-0 bg-black/70 flex items-center justify-center z-20 backdrop-blur-[1px]', [
                el('div', 'text-red-500 font-black border-2 border-red-500 px-2 py-1 -rotate-12 rounded opacity-90 text-[10px] tracking-wider uppercase', ['HABIS'])
            ])
        );
    }

    // Discount Badge
    if (discount > 0) {
        innerCard.appendChild(
            el('div', 'absolute top-2 right-2 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded z-10 animate-pulse', [`-${discount}%`])
        );
    }

    // Gambar
    const imgContainer = el('div', 'w-full h-24 mb-2 relative flex items-center justify-center bg-black/20 rounded-lg', [
        el('img', 'w-16 h-16 object-contain drop-shadow-lg group-hover:scale-110 transition duration-300', [], {
            src: item.final_image,
            onerror: "this.onerror=null; this.src='https://placehold.co/200x200/18181b/ffffff?text=No+Img';"
        })
    ]);
    innerCard.appendChild(imgContainer);

    // Teks Nama Game & Item
    innerCard.appendChild(el('div', 'text-[10px] text-gray-400 truncate font-bold mb-0.5', [item.game_name]));
    innerCard.appendChild(el('div', 'text-xs font-bold text-white truncate leading-tight', [item.name]));

    // Harga
    const priceContainer = el('div', 'flex items-end gap-1 mt-1', [
        el('div', 'text-sm font-black text-yellow-400', [`RM ${price.toFixed(2)}`])
    ]);
    if (originalPrice > 0) {
        priceContainer.appendChild(el('div', 'text-[9px] text-gray-600 line-through mb-0.5', [`RM ${originalPrice.toFixed(2)}`]));
    }
    innerCard.appendChild(priceContainer);

    // Stock Bar
    innerCard.appendChild(el('div', 'w-full h-1 bg-gray-700 rounded-full mt-2 overflow-hidden', [
        el('div', `h-full ${stockColor}`, [], { style: `width: ${stockBarWidth}%` })
    ]));

    // Footer Info
    innerCard.appendChild(el('div', 'flex justify-between mt-1', [
        el('span', 'text-[8px] text-gray-500', [`Stok: ${stockVal}`]),
        el('span', 'text-[8px] text-red-400 flex items-center gap-0.5', [
            el('i', 'ph-fill ph-fire'), ' Hot'
        ])
    ]));

    cardWrapper.appendChild(innerCard);
    return cardWrapper;
}

function initFlashSaleScroller(track) {
    isFlashSaleAutoScrolling = true;
    const speed = 0.6; 

    track.style.overflowX = 'hidden';
    track.classList.add('no-scrollbar'); 

    function animate() {
        if (isFlashSaleAutoScrolling) {
            // OPTIMASI: Hanya gerak jika elemen NAMPAK di skrin
            const rect = track.getBoundingClientRect();
            const isVisible = (rect.top < window.innerHeight && rect.bottom > 0);
            
            if (isVisible) {
                track.scrollLeft += speed;
                // Loop semula jika dah sampai hujung (trackWidth / 4 sebab kita duplicate 4x)
                if (track.scrollLeft >= track.scrollWidth / 4) {
                    track.scrollLeft = 0;
                }
            }
        }
        requestAnimationFrame(animate);
    }
    // ... (kekalkan event listener touch/mouse anda yang sedia ada)
    animate();

    // --- PAUSE BILA SENTUH (Touch/Mouse) ---
    const pauseAndResume = () => {
        isFlashSaleAutoScrolling = false;
        if (flashSaleResumeTimer) clearTimeout(flashSaleResumeTimer);

        flashSaleResumeTimer = setTimeout(() => {
            isFlashSaleAutoScrolling = true;
        }, 3000); // Sambung jalan selepas 3 saat
    };

    track.addEventListener('touchstart', pauseAndResume, { passive: true });
    track.addEventListener('mousedown', pauseAndResume); 
    track.addEventListener('wheel', pauseAndResume, { passive: true });

    animate();
}
// --- MANUAL REFRESH LOGIC ---
// --- MANUAL REFRESH LOGIC (WITH ANTI-SPAM) ---
async function handleManualRefresh(btn) {
    const COOLDOWN_TIME = 60000; // 60 Saat (dalam milisaat)
    const lastRefresh = sessionStorage.getItem('last_manual_refresh');
    const now = Date.now();

    // 1. Cek jika masih dalam tempoh Cooldown
    if (lastRefresh && (now - parseInt(lastRefresh)) < COOLDOWN_TIME) {
        const remaining = Math.ceil((COOLDOWN_TIME - (now - parseInt(lastRefresh))) / 1000);
        showToast(`Sila tunggu ${remaining} saat lagi untuk refresh.`, 'error');
        return; 
    }

    // 2. Lock Button (Visual Disable)
    btn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    
    // Tambah animasi putaran pada icon
    const icon = btn.querySelector('i');
    if(icon) icon.classList.add('animate-spin');
    
    try {
        // 3. Simpan masa sekarang sebagai 'last refresh'
        sessionStorage.setItem('last_manual_refresh', now.toString());

        // 4. Padam cache & Tarik data baru
        invalidateCache('games_data_v4');
        await loadGames(true);

        // 5. Timer untuk Enable balik butang selepas 60 saat
        setTimeout(() => {
            const currentBtn = document.getElementById('manual-refresh-btn');
            if(currentBtn) {
                currentBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
            }
        }, COOLDOWN_TIME);

    } catch (e) {
        console.error("Refresh error:", e);
        showToast("Ralat semasa refresh", "error");
    } finally {
        // Hentikan animasi putaran (ikon sahaja berhenti, butang kekal disable)
        if(icon) {
            setTimeout(() => {
                icon.classList.remove('animate-spin');
            }, 500);
        }
    }
}
// --- CORE: LOAD GAMES (UPDATED WITH FORCE REFRESH) ---

async function loadGames(forceRefresh = false) {
    // 1. Jika forceRefresh = true (user tekan butang refresh/retry), kita skip check cache
    let data = forceRefresh ? null : getFromCache('games_data_v4'); 
    
    // 2. UI UX: Jika sedang refresh/retry, tunjuk loading skeleton semula
    if (forceRefresh) {
        // Pastikan container wujud sebelum render skeleton
        const grid = document.getElementById('games-grid');
        if (grid) renderSkeleton(); 
    }

    if (!data) {
        // 3. Jika tiada cache atau force refresh, tarik dari DB
        const { data: dbData, error } = await supabaseClient
            .from('products_v2')
            .select('id, game_name, slug, category, image_url, is_maintenance, maintenance_message, click_count, items')
            .eq('is_active', true)
            .order('click_count', { ascending: false });
            
        if(!error && dbData) {
            data = dbData;
            // Simpan data baru ke cache
            saveToCache('games_data_v4', data); 
            
            // Jika ini manual refresh, beritahu user
            if(forceRefresh) {
                showToast("Berjaya refresh!", "success");
            }
        } else if (error) {
            console.error("Supabase Error:", error);
            if(forceRefresh) showToast("Gagal mengemaskini data.", "error");

            // --- UPDATE PENTING DI SINI ---
            // Jika error, panggil UI Retry Button
            // 'games-grid' ialah ID container tempat game dipaparkan
            renderErrorState('games-grid', () => loadGames(true));
            
            return; // Berhenti di sini, jangan sambung ke filterGames()
        }
    }
    
    if (data) {
        allGamesData = data; 
        extractCategoriesFromGames(); // Ini akan render kategori & butang refresh
        filterGames(); // Paparkan game
    }
}
// --- GANTI FUNCTION handleGameClick DENGAN INI ---

async function handleGameClick(gameId, gameName) {
    const url = `topup.html?game=${encodeURIComponent(gameName)}`;
    
    // Config Masa: 10 minit (dalam millisecond)
    const COOLDOWN_MS = 10 * 60 * 1000; 
    const storageKey = `last_click_${gameId}`;
    const lastClickTime = localStorage.getItem(storageKey);
    const now = Date.now();

    // 1. Cek dulu: Kalau user baru je klik tadi (kurang 10 minit), jangan rekod ke DB
    if (lastClickTime && (now - parseInt(lastClickTime)) < COOLDOWN_MS) {
        window.location.href = url; // Terus masuk page topup
        return; 
    }

    // 2. Kalau valid, simpan masa sekarang dalam browser user
    localStorage.setItem(storageKey, now.toString());

    // 3. Hantar signal ke database di background (tak perlu 'await' supaya laju)
    supabaseClient
        .rpc('increment_game_click', { target_game_id: gameId })
        .then(({ error }) => {
             if (error) console.error("Error logging click:", error);
        });

    // 4. Masuk page topup
    window.location.href = url;
}
// --- CATEGORY & FILTER ---

function extractCategoriesFromGames() {
    const categories = ['all'];
    const categoryCounts = {};
    
    allGamesData.forEach(game => {
        const cat = (game.category || 'Lain-lain').toLowerCase();
        if (!categories.includes(cat)) categories.push(cat);
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    renderCategories(categories);
}

function renderCategories(categories) {
    const container = document.getElementById('category-container');
    if (!container) return;

    // 1. Cipta "Bakul Maya" (DocumentFragment)
    // Semua butang akan dimasukkan ke sini dulu sebelum diletak ke skrin
    const fragment = document.createDocumentFragment();

    // --- LOGIC ANTI-SPAM CHECK (Masa Render) ---
    const lastRefresh = sessionStorage.getItem('last_manual_refresh');
    const now = Date.now();
    let isDisabled = false;
    let remainingTime = 0;

    if (lastRefresh) {
        const diff = now - parseInt(lastRefresh);
        if (diff < 60000) { // 60 Saat
            isDisabled = true;
            remainingTime = 60000 - diff;
        }
    }

    // --- SETUP BUTTON REFRESH (Manual Refresh) ---
    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'manual-refresh-btn';
    refreshBtn.title = 'Kemaskini Senarai Game';
    
    // Bind function terus (lebih selamat dari string onclick)
    refreshBtn.onclick = function() { handleManualRefresh(this); };

    // Set Class Asas
    let refreshBtnClass = 'cat-btn px-3 py-2.5 rounded-full border bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-yellow-400 transition-all duration-200 flex items-center justify-center group active:scale-95 mr-1';
    
    // Tambah class disable jika perlu
    if (isDisabled) {
        refreshBtnClass += ' opacity-50 cursor-not-allowed pointer-events-none';
        
        // Timer untuk enable balik button secara automatik
        setTimeout(() => {
            const btn = document.getElementById('manual-refresh-btn');
            if (btn) btn.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        }, remainingTime);
    }
    
    refreshBtn.className = refreshBtnClass;
    
    // Masukkan Icon ke dalam button
    refreshBtn.innerHTML = `<i class="ph-bold ph-arrows-clockwise text-base group-hover:text-yellow-400"></i>`;
    
    // Masukkan butang refresh ke dalam fragment
    fragment.appendChild(refreshBtn);

    // --- SETUP BUTTON KATEGORI (Loop) ---
    categories.forEach(cat => {
        const btn = document.createElement('button');
        
        // Tentukan sama ada kategori ini sedang aktif
        const isActive = activeCategory === cat;
        
        // Tentukan Class (Sama seperti kod asal anda)
        const activeClass = isActive 
            ? 'active bg-yellow-400 text-black border-yellow-400 font-bold dark:bg-yellow-500 dark:text-black dark:border-yellow-500' 
            : 'bg-gray-100 text-gray-700 border-gray-300 hover:border-yellow-400 hover:text-yellow-600 dark:bg-gray-800/80 dark:text-gray-300 dark:border-gray-700 dark:hover:border-yellow-500 dark:hover:text-yellow-400';

        btn.className = `cat-btn px-5 py-2.5 rounded-full border transition-all duration-200 text-[11px] font-bold uppercase flex items-center gap-2 whitespace-nowrap ${activeClass}`;
        
        // Set event listener
        btn.onclick = function() { setCategory(cat, this); };

        // Set kandungan dalam button (Icon + Teks)
        const iconColor = isActive ? 'text-black dark:text-black' : 'text-gray-600 dark:text-gray-400';
        btn.innerHTML = `
            <i class="ph-fill ph-game-controller text-base ${iconColor}"></i> 
            ${cat.toUpperCase()}
        `;

        // Masukkan ke dalam fragment
        fragment.appendChild(btn);
    });

    // 2. KEMASKINI DOM (Render ke skrin)
    // Kosongkan container lama dahulu
    container.innerHTML = '';
    // Masukkan fragment (hanya sekali reflow berlaku di sini)
    container.appendChild(fragment);
}

const handleSearch = debounce((val) => { filterGames(true); }, 300);

function filterGames(isUpdate = false) {
    const searchInput = document.getElementById('game-search'); 
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    
    if(!allGamesData) return;

    const filtered = allGamesData.filter(game => {
        const matchName = game.game_name.toLowerCase().includes(query);
        let matchCat = true;
        if (activeCategory !== 'all') {
            const type = (game.category || 'mobile').toLowerCase(); 
            matchCat = type === activeCategory;
        }
        return matchName && matchCat;
    });

    renderGameList(filtered, isUpdate);
    const noResEl = document.getElementById('no-results');
    if(noResEl) {
        if(filtered.length === 0) noResEl.classList.remove('hidden');
        else noResEl.classList.add('hidden');
    }
}

function setCategory(catSlug, btn) {
    if (activeCategory === catSlug) return;
    activeCategory = catSlug;
    
    // Reset semua butang ke state biasa
    document.querySelectorAll('.cat-btn').forEach(b => {
        b.classList.remove(
            'active', 
            'bg-yellow-400', 
            'text-black', 
            'border-yellow-400', 
            // 'shadow-lg', 'shadow-yellow-400/20', <-- DIBUANG (Tidak perlu lagi)
            'dark:bg-yellow-500',
            'dark:text-black',
            'dark:border-yellow-500'
        );
        b.classList.add(
            'bg-gray-100', 
            'text-gray-700', 
            'border-gray-300',
            'dark:bg-gray-800/80',
            'dark:text-gray-300',
            'dark:border-gray-700'
        );
        
        // Reset icon
        const icon = b.querySelector('i');
        if (icon) {
            icon.classList.remove('text-black', 'dark:text-black');
            icon.classList.add('text-gray-600', 'dark:text-gray-400');
        }
    });
    
    // Apply active state pada butang yang diklik
    btn.classList.remove(
        'bg-gray-100', 
        'text-gray-700', 
        'border-gray-300',
        'dark:bg-gray-800/80',
        'dark:text-gray-300',
        'dark:border-gray-700'
    );
    btn.classList.add(
        'active', 
        'bg-yellow-400', 
        'text-black', 
        'border-yellow-400',
        'dark:bg-yellow-500',
        'dark:text-black',
        'dark:border-yellow-500'
    );
    
    // Update icon
    const icon = btn.querySelector('i');
    if (icon) {
        icon.classList.remove('text-gray-600', 'dark:text-gray-400');
        icon.classList.add('text-black', 'dark:text-black');
    }
    
    filterGames(true); 
}
function renderGameList(games, isUpdate = false) {
    const grid = document.getElementById('games-grid');
    if (!grid) return;
    
    // Kosongkan grid (selamat untuk guna innerHTML = '' untuk clear)
    grid.innerHTML = '';

    if (games.length === 0) {
        // Gunakan helper 'el'
        const emptyState = el('div', 'col-span-full text-center py-12 animate-fade-in', [
            el('i', 'ph ph-ghost text-4xl text-gray-600 mb-3'),
            el('p', 'text-gray-400', ['Tiada permainan dijumpai.'])
        ]);
        grid.appendChild(emptyState);
        return;
    }
    
    const fragment = document.createDocumentFragment();
    const now = new Date();

    games.forEach((game, index) => {
        const isOffline = game.is_maintenance;
        const clickCount = game.click_count || 0;
        const displayImage = game.image_url || 'https://via.placeholder.com/300x300.png?text=No+Image';
        
        // 1. Badge Logic
        let badgeEl = null;
        if (isOffline) {
            badgeEl = el('div', 'absolute top-0 right-0 z-20 bg-black/80 backdrop-blur-sm text-red-500 text-[8px] font-bold px-2 py-1 rounded-bl-lg border-b border-l border-red-500/30 flex items-center gap-1', [
                el('i', 'ph-fill ph-wrench text-[10px]'), ' OFFLINE'
            ]);
        } else {
            const hasFlashSale = game.items?.some(item => item.is_promo && item.promo_end && new Date(item.promo_end) > now);
            if (hasFlashSale) {
                badgeEl = el('div', 'absolute top-0 right-0 z-20 bg-yellow-500 text-black text-[7px] font-black px-1.5 py-0.5 rounded-bl-md shadow-[0_0_8px_rgba(234,179,8,0.4)] flex items-center gap-0.5 border-b border-l border-white/20', [
                    el('i', 'ph-fill ph-lightning text-[8px] animate-pulse'), ' FLASH'
                ]);
            } else if (clickCount <= 10) {
                badgeEl = el('div', 'absolute top-0 right-0 z-20 bg-emerald-500 text-white text-[7px] font-semibold px-1.5 py-0.5 rounded-bl-md shadow-sm flex items-center gap-0.5 border-b border-l border-emerald-400', [
                    el('i', 'ph-fill ph-rocket-launch text-[8px]'), ' NEW'
                ]);
            } else if (clickCount > 500) {
                badgeEl = el('div', 'absolute top-0 right-0 z-20 bg-red-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded-bl-md shadow-sm flex items-center gap-0.5 border-b border-l border-red-400/30', [
                    el('i', 'ph-fill ph-fire text-[8px] text-yellow-300'), ' HOT'
                ]);
            }
        }

        // 2. Click Action
        const clickAction = isOffline 
            ? () => showToast(game.maintenance_message || "Game ini sedang diselenggara.", 'error')
            : () => handleGameClick(game.id, game.game_name);

        const cursorClass = isOffline ? "cursor-not-allowed" : "cursor-pointer";
        const animationClass = isUpdate ? 'animate-fade-in' : 'animate-up';
        const delay = isUpdate ? 0 : Math.min(index * 40, 400);

        // 3. Build Card DOM Structure
        const card = el('div', `group ${cursorClass} ${animationClass} relative flex flex-col items-center w-full select-none transform transition-all duration-300 hover:-translate-y-1 active:scale-95`, [
            // Image Container
            el('div', 'w-full aspect-square rounded-2xl overflow-hidden border border-white/5 group-hover:border-yellow-400/30 transition-all duration-500 relative bg-[#121214] shadow-lg group-hover:shadow-yellow-400/10', [
                badgeEl, // Masukkan badge tadi
                // Image
                el('img', `lazy-load-target w-full h-full object-cover transition-all duration-700 group-hover:scale-110 opacity-0 ${isOffline ? 'grayscale' : ''}`, [], {
                    'data-src': displayImage,
                    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E",
                    alt: game.game_name,
                    decoding: 'async',
                    loading: 'lazy'
                }),
                // Gradient Overlay
                el('div', 'absolute inset-0 bg-gradient-to-t from-[#0a0a0b] via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity duration-300'),
                // View Counter
                el('div', 'absolute bottom-2 right-2 flex items-center gap-1 opacity-70 group-hover:opacity-100 transition z-10 pointer-events-none', [
                    el('i', 'ph-fill ph-eye text-[10px] text-gray-400'),
                    el('span', 'text-[9px] font-bold text-gray-300 font-mono shadow-black drop-shadow-md', [formatCompactNumber(clickCount)])
                ])
            ]),
            // Game Title
            el('h4', 'text-center text-xs font-bold mt-3 text-gray-400 group-hover:text-white transition-colors duration-300 truncate w-full px-2 leading-tight group-hover:underline decoration-yellow-400/50 underline-offset-4', [game.game_name])
        ]);

        // Style & Event
        card.style.animationDelay = `${delay}ms`;
        card.addEventListener('click', clickAction);

        fragment.appendChild(card);
    });

    grid.appendChild(fragment);
    requestAnimationFrame(() => initLazyImages());
}

// --- SEARCH MODAL LOGIC ---
function setupSearchModal() {
    const searchInput = document.getElementById('modal-search-input');
    if(searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if(e.key === 'Enter') saveSearchHistory(e.target.value);
            handleModalSearch(e.target.value);
        });
    }
}

function openSearchUI() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('modal-search-input');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
        renderSearchHistory();
        renderPopularSearches();
        
        if(allGamesData.length === 0) loadGames();

        if(input) {
            input.value = '';
            setTimeout(() => input.focus(), 100);
            handleModalSearch(''); 
        }
    }
}

function closeSearchUI() {
    const modal = document.getElementById('search-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }
}

const handleModalSearch = debounce((query) => {
    const defaultView = document.getElementById('search-default-view');
    const resultsView = document.getElementById('search-results-view');
    const resultsContainer = document.getElementById('modal-results-container');
    const loadingEl = document.getElementById('search-loading');
    
    if (!query || query.trim() === '') {
        if(defaultView) defaultView.classList.remove('hidden');
        if(resultsView) resultsView.classList.add('hidden');
        return;
    }

    if(defaultView) defaultView.classList.add('hidden');
    if(resultsView) resultsView.classList.remove('hidden');
    if(loadingEl) loadingEl.classList.remove('hidden');
    if(resultsContainer) resultsContainer.innerHTML = '';

    setTimeout(() => {
        if(loadingEl) loadingEl.classList.add('hidden');
        if(!allGamesData) return;

        const lowerQ = query.toLowerCase();
        const filtered = allGamesData.filter(game => game.game_name.toLowerCase().includes(lowerQ));

        renderModalResults(filtered, query);
    }, 200);
}, 300);

function renderModalResults(products, query) {
    const container = document.getElementById('modal-results-container');
    const countEl = document.getElementById('search-result-count');
    
    if(countEl) countEl.innerText = `${products.length} Hasil Dijumpai`;
    if(!container) return;

    container.innerHTML = ''; // Clear lama

    if (products.length === 0) {
        container.appendChild(el('div', 'flex flex-col items-center justify-center py-10 opacity-50', [
            el('i', 'ph ph-ghost text-4xl mb-2'),
            el('p', 'text-xs', [`Tiada hasil untuk "${query}"`]) // Selamat, guna textContent
        ]));
        return;
    }

    const fragment = document.createDocumentFragment();
    products.forEach((item, idx) => {
        const isOffline = item.is_maintenance;
        
        // Status Badge
        const statusSpan = isOffline
            ? el('span', 'text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20', ['OFFLINE'])
            : el('span', 'text-[9px] bg-green-500/20 text-black-400 px-1.5 py-0.5 rounded border border-green-500/20', ['topup now']);

        const row = el('div', 'flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-yellow-400/30 transition cursor-pointer group animate-slide-left', [
            // Image
            el('img', `w-12 h-12 rounded-lg object-cover bg-gray-800 ${isOffline ? 'grayscale' : ''}`, [], { src: item.image_url }),
            // Content
            el('div', 'flex-grow', [
                el('h4', 'font-bold text-sm text-white group-hover:text-yellow-400 transition', [item.game_name]),
                el('div', 'flex items-center gap-2 mt-1', [
                    statusSpan,
                    el('span', 'text-[9px] text-gray-500 capitalize', [item.category || 'Game'])
                ])
            ]),
            // Icon Arrow
            el('i', 'ph ph-caret-right text-gray-600 group-hover:text-white')
        ], {
            style: `animation-delay: ${idx * 30}ms`,
            onclick: () => selectSearchResult(item.game_name)
        });

        fragment.appendChild(row);
    });
    
    container.appendChild(fragment);
}

function selectSearchResult(gameName) {
    saveSearchHistory(gameName);
    window.location.href = `topup.html?game=${encodeURIComponent(gameName)}`;
}

function saveSearchHistory(query) {
    if(!query) return;
    const cleanQ = query.trim();
    searchHistory = searchHistory.filter(x => x.toLowerCase() !== cleanQ.toLowerCase());
    searchHistory.unshift(cleanQ);
    if(searchHistory.length > 8) searchHistory.pop(); 
    localStorage.setItem('search_history', JSON.stringify(searchHistory));
}

function deleteHistoryItem(val, event) {
    if(event) event.stopPropagation();
    searchHistory = searchHistory.filter(x => x !== val);
    localStorage.setItem('search_history', JSON.stringify(searchHistory));
    renderSearchHistory();
}

function clearAllHistory() {
    searchHistory = [];
    localStorage.removeItem('search_history');
    renderSearchHistory();
}

function renderSearchHistory() {
    const container = document.getElementById('search-history-list');
    if(!container) return;

    if(searchHistory.length === 0) {
        container.innerHTML = `<div class="text-[10px] text-gray-600 italic py-2">Tiada sejarah carian.</div>`;
        return;
    }

    container.innerHTML = searchHistory.map(term => `
        <div onclick="document.getElementById('modal-search-input').value = '${term}'; handleModalSearch('${term}')" class="inline-flex items-center gap-2 bg-[#18181b] border border-gray-700 px-3 py-1.5 rounded-full text-xs text-gray-300 hover:text-white hover:border-yellow-400 transition cursor-pointer group mb-2 mr-2">
            <i class="ph ph-clock-counter-clockwise text-gray-500 group-hover:text-yellow-400"></i>
            <span>${term}</span>
            <button onclick="deleteHistoryItem('${term}', event)" class="hover:text-red-500 transition ml-1 p-0.5"><i class="ph ph-x"></i></button>
        </div>
    `).join('');
}

function renderPopularSearches() {
    const container = document.getElementById('popular-search-list');
    if(!container) return;

    container.innerHTML = popularSearches.map((term, idx) => `
        <div onclick="selectSearchResult('${term}')" class="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 cursor-pointer group transition border-b border-white/5 last:border-0">
            <div class="flex items-center gap-3">
                <div class="w-6 h-6 rounded flex items-center justify-center bg-yellow-400/10 text-yellow-500 font-bold text-xs border border-yellow-400/20 group-hover:bg-yellow-400 group-hover:text-black transition">
                    ${idx + 1}
                </div>
                <span class="text-sm text-gray-300 group-hover:text-white font-medium">${term}</span>
            </div>
            <div class="text-[10px] text-orange-400 flex items-center gap-1 bg-green-900/10 px-1.5 py-0.5 rounded">
                <i class="ph ph-fire text-orange-500"></i> Hot
            </div>
        </div>
    `).join('');
}


// --- AUTH & USER PROFILE (UPDATED WITH 2FA PASS) ---
async function checkSession() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        const authSection = document.getElementById('auth-section');

        if (error) throw error;

        if (session) {
            // 1. Check MFA / 2FA Status
            const { data: mfaData, error: mfaError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
            
            if (!mfaError && mfaData) {
                // Jika akaun perlukan AAL2 (2FA) tapi sesi masih AAL1...
                if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
                    
                    // [UPDATE 2: SEMAK PAS SEMENTARA]
                    // Kita cari bukti 'ld_backup_verified' dalam session storage
                    const isBackupVerified = sessionStorage.getItem('ld_backup_verified');

                    // Jika TIADA pas sementara, barulah tendang ke login
                    if (!isBackupVerified) {
                        window.location.href = 'login.html'; 
                        return; 
                    }
                    // Jika ADA pas, benarkan masuk (Bypass check AAL2)
                }
            }

            currentUser = session.user;

            // 2. Fetch Profile
            const { data: profile, error: profileError } = await supabaseClient
                .from('profiles')
                .select('id, username, wallet_balance, avatar_url, xp_balance, phone, is_banned, role') 
                .eq('id', currentUser.id)
                .single();
            
            if (profileError || !profile) {
                await supabaseClient.auth.signOut();
                return;
            }
            
            currentProfile = profile;

            // 3. Check Ban Status
            if (currentProfile.is_banned) {
                if(typeof showToast === 'function') showToast("Akaun digantung.", "error");
                else alert("Akaun digantung.");
                
                await supabaseClient.auth.signOut();
                setTimeout(() => window.location.href = 'index.html', 2000);
                return;
            }
            
            // 4. Render UI (Standard Template Literal untuk keserasian semua fail)
            if(authSection) {
                // Setup Avatar
                const displayName = currentProfile.username || currentUser.email.split('@')[0];
                let avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=facc15&color=000&bold=true`;
                
                if (currentProfile.avatar_url) {
                    const url = currentProfile.avatar_url.trim();
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        avatarUrl = url.replace(/"/g, '&quot;');
                    }
                }

                // Format Balance (Logic Ringkas)
                let rawBalance = currentProfile.wallet_balance;
                let formattedBalance = rawBalance.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                if (rawBalance >= 1000) formattedBalance = (rawBalance / 1000).toFixed(1) + 'K';

                authSection.innerHTML = `
                    <div onclick="if(typeof openModal === 'function') openModal('profile-modal')" class="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 py-1 pl-2 pr-1 rounded-full border border-white/5 transition group backdrop-blur-sm animate-fade-in max-w-[160px] sm:max-w-none hover:border-yellow-400/30">
                        <div class="flex flex-col items-end justify-center leading-none overflow-hidden">
                            <span class="text-[8px] text-gray-400 uppercase font-bold tracking-wider mb-[1px]">BAKI</span>
                            <span class="text-[10px] font-bold text-yellow-400 group-hover:text-white transition font-mono truncate w-full text-right">
                                RM ${formattedBalance}
                            </span>
                        </div>
                        <img src="${avatarUrl}" class="w-8 h-8 rounded-full border-2 border-yellow-400/50 object-cover shadow-sm shrink-0 group-hover:scale-105 transition">
                    </div>
                `;
            }
            
            // Update UI lain jika function wujud
            if(typeof updateProfileUI === 'function') await updateProfileUI();
            if(typeof loadInbox === 'function') loadInbox();

        } else {
            // User belum login -> Render Login Button
            if (authSection) {
                authSection.innerHTML = `
                    <a href="login.html" class="bg-white/10 hover:bg-white/20 border border-white/5 text-white px-5 py-2 rounded-full text-sm font-semibold transition backdrop-blur-md animate-fade-in hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] inline-block">
                        Log Masuk
                    </a>
                `;
            }
            // Papar warning login jika ada (untuk topup.js)
            const warn = document.getElementById('login-warning');
            if(warn) warn.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Session Check Error:", error);
    }
}

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
    
    // 3. Format Baki & Update Sidebar
    let formattedBalance = formatBalance(currentProfile.wallet_balance);
    
    const sidebarBalance = document.getElementById('sidebar-balance');
    if(sidebarBalance) sidebarBalance.innerText = formattedBalance;
    
    const walletPageBal = document.getElementById('wallet-page-balance');
    if(walletPageBal) {
        walletPageBal.innerText = formattedBalance; 
    }
    
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

    // 6. UPDATE BADGES (Panggil dari badges.js)
    if (typeof renderUserBadges === 'function') {
        await renderUserBadges('profile-badges', currentProfile);
    }

    // 7. UPDATE BORDER WARNA IKUT RANK (Updated: Guna Setting badges.js)
    const borderEl = document.getElementById('profile-rank-border');
    if (borderEl) {
        // Dapatkan data spending
        let totalSpent = 0;
        const { data: leaderboard } = await supabaseClient.rpc('get_monthly_leaderboard', { month_offset: 0 });
        
        if (leaderboard) {
            const userStat = leaderboard.find(u => u.id === currentProfile.id);
            if (userStat) totalSpent = userStat.total_spent;
        }

        // Ambil threshold dari BADGE_SETTINGS (jika ada), kalau tak guna default
        const goldMin = (typeof BADGE_SETTINGS !== 'undefined') ? BADGE_SETTINGS.TIERS.GOLD.min_spend : 1000;
        const silverMin = (typeof BADGE_SETTINGS !== 'undefined') ? BADGE_SETTINGS.TIERS.SILVER.min_spend : 500;

        // Logic Warna Border
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

        // Apply class
        borderEl.className = `relative p-[5px] rounded-full transition-all duration-700 ${gradientClass}`;
    }
}

// --- NOTIFICATION & INBOX ---

// Function to handle inbox button click with login check
function handleInboxClick() {
    if (!currentUser) {
        showToast("Sila log masuk untuk melihat notifikasi", "info");
        openModal('login-modal');
        return;
    }
    openInboxModal();
}

// New function to open inbox with loading state and login check
function openInboxModal() {
    // Check if user is logged in
    if (!currentUser) {
        showToast("Sila log masuk untuk melihat notifikasi", "info");
        // UBAH: Redirect ke login.html
        window.location.href = 'login.html';
        return;
    }
    
    openModal('inbox-modal');
    
    // Show loading state
    const inboxList = document.getElementById('inbox-list');
    if (inboxList) {
        inboxList.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 animate-fade-in">
                <div class="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                <span class="text-sm text-gray-400 font-medium">Memuatkan notifikasi...</span>
                <span class="text-[10px] text-gray-600 mt-1">Sila tunggu sebentar</span>
            </div>`;
    }
    
    // Load data after a short delay
    setTimeout(async () => {
        await loadInbox();
        await markNotificationsRead();
    }, 300);
}

// Main function to load inbox notifications
async function loadInbox() {
    // Show login prompt if user is not logged in
    if(!currentUser) {
        const inboxList = document.getElementById('inbox-list');
        if(inboxList) {
            inboxList.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-500 animate-fade-in">
                    <div class="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4 border border-yellow-500/20">
                        <i class="ph ph-user-circle text-2xl text-yellow-400"></i>
                    </div>
                    <span class="text-sm font-bold mb-1 text-white">Sila Log Masuk</span>
                    <p class="text-xs text-gray-400 text-center max-w-xs px-4 mb-4">
                        Log masuk untuk melihat notifikasi anda
                    </p>
                    <a href="login.html" 
                        class="text-xs font-bold bg-yellow-400 hover:bg-yellow-300 text-black px-5 py-2.5 rounded-lg transition active:scale-95 flex items-center gap-2">
                        <i class="ph ph-sign-in text-sm"></i> LOG MASUK
                    </a>
                </div>`;
        }
        
        // Hide notification dot and counter if exists
        const dot = document.getElementById('nav-notif-dot');
        const counter = document.getElementById('nav-notif-counter');
        if(dot) dot.classList.add('hidden');
        if(counter) counter.classList.add('hidden');
        return;
    }
    
    // Fetch notifications from database
    const { data, error } = await supabaseClient.from('notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30);

    const inboxList = document.getElementById('inbox-list');
    const dot = document.getElementById('nav-notif-dot');
    const counter = document.getElementById('nav-notif-counter');
    
    // Handle error
    if (error) {
        console.error("Error loading inbox:", error);
        if(inboxList) {
            inboxList.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-500 opacity-60 animate-fade-in">
                    <i class="ph ph-warning text-5xl mb-3 text-red-400"></i>
                    <span class="text-xs font-bold">Ralat memuatkan peti masuk</span>
                    <p class="text-[10px] text-gray-600 mt-1 text-center px-4">
                        Tidak dapat memuatkan notifikasi. Sila cuba lagi.
                    </p>
                    <button onclick="loadInbox()" 
                        class="mt-3 text-[10px] text-yellow-400 hover:text-yellow-300 font-bold flex items-center gap-1">
                        <i class="ph ph-arrow-clockwise"></i> Cuba semula
                    </button>
                </div>`;
        }
        return;
    }
    
    // Empty state
    if (!data || data.length === 0) { 
        if(inboxList) {
            inboxList.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-500 animate-fade-in">
                    <i class="ph ph-tray-open text-5xl mb-3 text-gray-600"></i>
                    <span class="text-sm font-bold text-white mb-1">Peti Masuk Kosong</span>
                    <p class="text-xs text-gray-400 text-center max-w-xs px-4">
                        Anda belum menerima sebarang notifikasi
                    </p>
                </div>`; 
        }
        
        // Hide both dot and counter
        if(dot) {
            dot.classList.add('hidden');
            dot.classList.remove('animate-pulse');
        }
        if(counter) {
            counter.classList.add('hidden');
        }
        return; 
    }
    
    // Update notification dot and counter
    // Count unread notifications
    const unreadCount = data.filter(n => !n.is_read).length;
    
    if (unreadCount > 0) {
        // Show counter if there are unread notifications
        if(counter) {
            counter.innerText = unreadCount > 9 ? '9+' : unreadCount.toString();
            counter.classList.remove('hidden');
            counter.classList.add('flex');
        }
        
        // Hide the simple dot since we're using counter
        if(dot) {
            dot.classList.add('hidden');
        }
    } else {
        // No unread notifications
        if(counter) {
            counter.classList.add('hidden');
        }
        if(dot) {
            dot.classList.add('hidden');
            dot.classList.remove('animate-pulse');
        }
    }
    
    // Render notifications
    if(inboxList) {
        inboxList.innerHTML = data.map(n => {
            // Theme based on notification type
            let theme = { 
                icon: 'info', 
                color: 'text-blue-400', 
                bg: 'bg-blue-500/10', 
                border: 'border-blue-500/20' 
            };
            
            if(n.type === 'reward') theme = { icon: 'gift', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' };
            if(n.type === 'security') theme = { icon: 'shield-warning', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' };
            if(n.type === 'success') theme = { icon: 'check-circle', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' };
            if(n.type === 'transaction') theme = { icon: 'receipt', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
            if(n.type === 'promotion') theme = { icon: 'megaphone', color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' };
            if(n.type === 'warning') theme = { icon: 'warning', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
            if(n.type === 'update') theme = { icon: 'bell-ringing', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' };

            // Action button
            let actionBtn = '';
            if(n.action_url && n.action_url.trim() !== '') {
                actionBtn = `
                <button onclick="handleNotificationAction('${n.action_url}', event)" 
                    class="mt-3 text-[10px] font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg flex items-center justify-center gap-2 transition hover:border-yellow-400/50 hover:text-yellow-400 active:scale-95">
                    LIHAT <i class="ph ph-arrow-right text-[12px]"></i>
                </button>`;
            }

            // Status tags
            const unreadTag = !n.is_read ? `
                <span class="inline-flex items-center gap-1 text-[8px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse ml-2">
                    <i class="ph ph-circle-fill text-[6px]"></i> BARU
                </span>` : '';
            
            const priorityTag = n.priority === 'high' ? `
                <span class="inline-flex items-center gap-1 text-[8px] bg-red-900/50 text-red-300 px-2 py-0.5 rounded-full font-bold ml-1 border border-red-500/30">
                    <i class="ph ph-star-fill text-[6px]"></i> PENTING
                </span>` : '';

            // Card styling
            const isUnread = !n.is_read;
            const cardClass = isUnread 
                ? 'bg-gradient-to-r from-[#1e1f24] to-[#2a2b30] border-l-4 border-l-yellow-400 shadow-lg shadow-yellow-400/5' 
                : 'bg-[#1e1f24] border border-white/5';
            
            const hoverClass = isUnread 
                ? 'hover:border-yellow-400/30 hover:shadow-lg hover:shadow-yellow-400/10' 
                : 'hover:border-white/10 hover:shadow-md';

            // Format date
            const now = new Date();
            const notifDate = new Date(n.created_at);
            const timeDiff = now - notifDate;
            const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            
            let timeDisplay = '';
            if (daysDiff === 0) {
                timeDisplay = 'Hari ini ' + notifDate.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
            } else if (daysDiff === 1) {
                timeDisplay = 'Semalam';
            } else if (daysDiff < 7) {
                const days = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
                timeDisplay = days[notifDate.getDay()];
            } else {
                timeDisplay = notifDate.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' });
            }

            return `
            <div class="${cardClass} p-4 rounded-xl mb-3 ${hoverClass} transition-all duration-300 group relative overflow-hidden animate-fade-in">
                <div class="flex gap-4">
                    <!-- Icon -->
                    <div class="flex-shrink-0">
                        <div class="w-10 h-10 rounded-full ${theme.bg} ${theme.border} border flex items-center justify-center shadow-sm">
                            <i class="ph ph-${theme.icon} text-lg ${theme.color}"></i>
                        </div>
                    </div>
                    
                    <!-- Content -->
                    <div class="flex-grow min-w-0">
                        <!-- Header -->
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex items-center flex-wrap gap-1">
                                <h4 class="text-sm font-bold text-white leading-tight">
                                    ${n.title}
                                </h4>
                                ${unreadTag}
                                ${priorityTag}
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] text-gray-500 font-mono whitespace-nowrap">
                                    ${timeDisplay}
                                </span>
                                <button onclick="askDeleteNotification('${n.id}', event)" 
                                    class="text-gray-500 hover:text-red-500 p-1 opacity-70 hover:opacity-100 transition active:scale-90"
                                    title="Padam notifikasi">
                                    <i class="ph ph-trash-simple text-sm"></i>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Message -->
                        <p class="text-xs text-gray-300 leading-relaxed break-words pr-2">
                            ${n.message}
                        </p>

                        <!-- Action Button -->
                        ${actionBtn}
                    </div>
                </div>
                
                <!-- Hover delete button (alternative) -->
                <button onclick="askDeleteNotification('${n.id}', event)" 
                    class="absolute top-3 right-3 text-gray-500 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition duration-200">
                    <i class="ph ph-x text-base"></i>
                </button>
            </div>
            `;
        }).join('');
    }
}

// Handle notification action with event prevention and login check
function handleNotificationAction(url, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    // Check if user is logged in
    if (!currentUser) {
        showToast("Sila log masuk untuk meneruskan", "info");
        // UBAH: Redirect ke login.html
        window.location.href = 'login.html';
        return;
    }
    
    if (url && url.trim() !== '') {
        // Mark as read before redirecting
        markNotificationsRead();
        
        // Handle different URL types
        if (url.startsWith('http://') || url.startsWith('https://')) {
            window.open(url, '_blank');
        } else if (url.startsWith('/') || url.startsWith('#')) {
            window.location.href = url;
        } else {
            // Assume it's a relative path
            window.location.href = url;
        }
    }
}

// Improved mark as read function with login check
async function markNotificationsRead() {
    if(!currentUser) {
        showToast("Sila log masuk untuk mengemas kini notifikasi", "info");
        return;
    }
    
    const dot = document.getElementById('nav-notif-dot');
    const counter = document.getElementById('nav-notif-counter');
    
    if(dot) {
        dot.classList.add('hidden');
        dot.classList.remove('animate-pulse');
    }
    
    if(counter) {
        counter.classList.add('hidden');
    }
    
    // Update only unread notifications
    const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
    
    if (error) {
        console.error("Error marking notifications as read:", error);
    } else {
        // Refresh inbox list visually
        const notifications = document.querySelectorAll('#inbox-list > div');
        notifications.forEach(notif => {
            notif.classList.remove('border-l-yellow-400', 'bg-gradient-to-r');
            notif.classList.add('bg-[#1e1f24]', 'border', 'border-white/5');
            
            // Remove "NEW" badge
            const newBadge = notif.querySelector('.animate-pulse');
            if (newBadge) newBadge.remove();
        });
    }
}

// Delete all notifications with confirmation and login check
async function deleteAllNotifications() {
    if(!currentUser) {
        showToast("Sila log masuk untuk memadam notifikasi", "info");
        // UBAH: Redirect ke login.html
        window.location.href = 'login.html';
        return;
    }
    
    // Custom confirmation modal
    if (window.confirmDeleteAllModal) {
        window.confirmDeleteAllModal();
        return;
    }
    
    // Fallback to browser confirmation
    const confirmed = confirm("Adakah anda pasti ingin memadam SEMUA notifikasi?\nTindakan ini tidak boleh dibatalkan.");
    if (!confirmed) return;
    
    showToast("Memadam semua notifikasi...", "info");
    
    const { error } = await supabaseClient
        .from('notifications')
        .delete()
        .eq('user_id', currentUser.id);
    
    if (!error) { 
        showToast("Semua notifikasi telah dipadam.", "success");
        await loadInbox();
        
        // Hide counter after deleting all
        const counter = document.getElementById('nav-notif-counter');
        if(counter) {
            counter.classList.add('hidden');
        }
    } else {
        showToast("Gagal memadam notifikasi.", "error");
    }
}

// Ask to delete single notification
function askDeleteNotification(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    notificationToDelete = id; 
    openModal('delete-confirm-modal');
}

// Confirm and delete single notification with login check
async function confirmDeleteNotification() {
    if(!notificationToDelete) return;
    
    if(!currentUser) {
        showToast("Sila log masuk untuk memadam notifikasi", "info");
        closeModal('delete-confirm-modal');
        // UBAH: Redirect ke login.html
        window.location.href = 'login.html';
        return;
    }
    
    closeModal('delete-confirm-modal');
    
    showToast("Memadam notifikasi...", "info");
    
    const { error } = await supabaseClient
        .from('notifications')
        .delete()
        .eq('id', notificationToDelete);
    
    if (!error) { 
        showToast("Notifikasi telah dipadam.", "success");
        await loadInbox();
        
        // Check if there are still notifications
        const { data } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', currentUser.id);
        
        const counter = document.getElementById('nav-notif-counter');
        if (data && data.length === 0 && counter) {
            counter.classList.add('hidden');
        } else if (data) {
            // Update counter with new count
            const unreadCount = data.filter(n => !n.is_read).length;
            if (counter) {
                if (unreadCount > 0) {
                    counter.innerText = unreadCount > 9 ? '9+' : unreadCount.toString();
                    counter.classList.remove('hidden');
                    counter.classList.add('flex');
                } else {
                    counter.classList.add('hidden');
                }
            }
        }
    } else {
        showToast("Gagal memadam notifikasi.", "error");
    }
    
    notificationToDelete = null;
}

// --- AUTH ACTIONS ---

async function handleLogout() { 
    showToast("Log keluar...", "info");
    await supabaseClient.auth.signOut(); 
    setTimeout(() => window.location.href='index.html', 500); 
}

// --- UI HELPERS ---
function openEditProfile() { 
    closeModal('profile-modal');
    setTimeout(() => openModal('edit-profile-modal'), 200);
}

function openModal(id) { 
    const el = document.getElementById(id); 
    if(el) { el.classList.remove('hidden'); el.classList.add('flex'); } 
    // Logic daily-reward-modal timer telah dibuang
}

function closeModal(id) { 
    const el = document.getElementById(id); 
    if(el) { el.classList.add('hidden'); el.classList.remove('flex'); } 
    // Logic daily-reward-modal timer telah dibuang
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
// Helper kecil untuk update badge (Placeholder function)
// Kita akan panggil ini untuk update bilangan item dalam katalog nanti
async function updateCatalogBadge() {
    if(!currentUser) return;
    
    // Logik simple untuk kira item (Hanya BACA data, jadi selamat)
    const { count, error } = await supabaseClient
        .from('catalogs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id);
    
    if(!error) {
        const badge = document.getElementById('catalog-nav-badge');
        if(badge) {
            if(count > 0) {
                badge.classList.remove('hidden');
                badge.innerText = count;
            } else {
                badge.classList.add('hidden');
            }
        }
    }
}

// Panggil badge check masa load page
window.addEventListener('load', () => {
    setTimeout(updateCatalogBadge, 2000); 
});

window.addEventListener('unhandledrejection', function(event) {
  // Cegah aplikasi daripada "crash" jika ada error rangkaian
  console.warn('Network/Promise error caught:', event.reason);
});