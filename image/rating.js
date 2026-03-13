// --- RATING SYSTEM MODULE (vip.js / rating.js) ---
// Features: Display Reviews, Skeleton Loading, Rating Distribution, Admin Reply Support, Pagination 1/2/3

let ratingData = {
    avg: 5.0,
    total: 0,
    reviews: [],
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
};

// --- CONFIGURATION FOR PAGINATION ---
let currentPage = 1;
const reviewsPerPage = 5; // Paparkan 5 review setiap halaman

// Fungsi utama
async function initRatingSystem() {
    // Tunggu sehingga currentGameNameGlobal tersedia
    const checkGameName = setInterval(async () => {
        if (typeof currentGameNameGlobal !== 'undefined' && currentGameNameGlobal) {
            clearInterval(checkGameName);
            
            // 1. Paparkan Skeleton (Loading UI) dahulu
            injectSkeletonUI();

            // 2. Fetch data sebenar
            await fetchReviews(currentGameNameGlobal);

            // 3. Paparkan UI sebenar
            injectRatingUI();
        }
    }, 500);
}

// Fetch data review dari Supabase
async function fetchReviews(gameName) {
    try {
        const { data, error } = await supabaseClient
            .from('reviews')
            .select('*')
            .ilike('game_name', `%${gameName}%`)
            .order('created_at', { ascending: false })
            .limit(100); // Ambil 100 terkini

        if (error) throw error;

        if (data && data.length > 0) {
            // Kira purata rating
            const totalScore = data.reduce((acc, curr) => acc + curr.rating, 0);
            ratingData.avg = (totalScore / data.length).toFixed(1);
            ratingData.total = data.length;
            ratingData.reviews = data;

            // Kira Distribution (Pecahan Bintang)
            ratingData.distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
            data.forEach(r => {
                if (ratingData.distribution[r.rating] !== undefined) {
                    ratingData.distribution[r.rating]++;
                }
            });
        } else {
            // Default dummy data
            ratingData.avg = "0.0";
            ratingData.total = 0;
            ratingData.reviews = [];
            ratingData.distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        }

    } catch (err) {
        console.error("Gagal memuatkan rating:", err);
    }
}

// UI: Skeleton Loading
function injectSkeletonUI() {
    const whatsappInput = document.getElementById('whatsapp-input');
    if (!whatsappInput) return;
    const targetContainer = whatsappInput.closest('.glass-panel');
    if (!targetContainer) return;

    let ratingSection = document.getElementById('rating-section-container');
    if (!ratingSection) {
        ratingSection = document.createElement('div');
        ratingSection.id = 'rating-section-container';
        ratingSection.className = "mt-4 animate-up";
        targetContainer.parentNode.insertBefore(ratingSection, targetContainer.nextSibling);
    }

    ratingSection.innerHTML = `
        <div class="animate-pulse">
            <div class="flex justify-between mb-3 px-1">
                <div class="h-4 w-24 bg-white/10 rounded"></div>
                <div class="h-4 w-16 bg-white/10 rounded"></div>
            </div>
            <div class="glass-panel p-4 rounded-xl bg-[#18181b] border border-white/5">
                <div class="space-y-3">
                    <div class="h-12 bg-white/5 rounded-lg"></div>
                    <div class="h-12 bg-white/5 rounded-lg"></div>
                    <div class="h-12 bg-white/5 rounded-lg"></div>
                </div>
            </div>
        </div>
    `;
}

// UI: Generate Distribution Bars
function generateDistributionHtml() {
    let html = '<div class="flex flex-col gap-1 w-full pl-2 border-l border-white/10">';
    const total = ratingData.total || 1;

    for (let i = 5; i >= 1; i--) {
        const count = ratingData.distribution[i];
        const percentage = (count / total) * 100;
        
        html += `
            <div class="flex items-center gap-2 text-[8px]">
                <span class="w-2 text-gray-500 font-mono">${i}</span>
                <i class="ph-fill ph-star text-[6px] text-gray-600"></i>
                <div class="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div class="h-full bg-yellow-500/80 rounded-full" style="width: ${percentage}%"></div>
                </div>
                <span class="w-6 text-right text-gray-500 font-mono">${count}</span>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

// UI: Render Single Review Card
function renderReviewCard(r) {
    const adminImageURL = "https://i.imgur.com/6Xq33k4.png"; 

    // Parsing Tags
    let cleanComment = r.comment || 'Transaksi pantas!';
    let tagsHtml = '';

    if (cleanComment.includes('[Tags:')) {
        const parts = cleanComment.split('[Tags:');
        cleanComment = parts[0].trim();
        
        const tagsRaw = parts[1].replace(']', '').trim();
        if (tagsRaw.length > 0) {
            const tagsArray = tagsRaw.split(',').map(t => t.trim());
            // TAGS: Guna text-yellow-500 supaya jelas dalam kedua-dua mode
            const tagsSpans = tagsArray.map(tag => 
                `<span class="text-[9px] px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/40 text-yellow-500 font-bold">${tag}</span>`
            ).join('');
            tagsHtml = `<div class="flex flex-wrap gap-1.5 mt-2 pl-7">${tagsSpans}</div>`;
        }
    }

    // Admin Reply
    // PEMBETULAN DISINI:
    // 1. Tukar bg-[#1e1e22] -> bg-[#18181b] (Supaya automatik jadi Putih dalam Light Mode)
    // 2. Tukar text-gray-300 -> text-white (Supaya automatik jadi Hitam dalam Light Mode)
    const adminReplyHtml = r.admin_reply ? `
        <div class="mt-3 pl-8 relative group">
            <div class="absolute left-0 top-0">
                <div class="w-6 h-6 rounded-full bg-gradient-to-b from-blue-600 to-blue-800 p-[1px] shadow-lg shadow-blue-500/20 z-10">
                    <div class="w-full h-full rounded-full bg-[#09090b] flex items-center justify-center overflow-hidden">
                        <img src="${adminImageURL}" alt="Admin" class="w-full h-full object-cover">
                    </div>
                </div>
            </div>
            <div class="bg-[#18181b] border border-blue-500/20 rounded-xl rounded-tl-none p-3 relative transition hover:bg-white/5">
                <div class="flex justify-between items-center mb-1 pb-1 border-b border-white/5">
                    <span class="text-[9px] font-extrabold text-blue-400 tracking-wide uppercase">Admin Official</span>
                    <div class="flex items-center gap-1 bg-blue-500/10 px-1.5 py-0.5 rounded-full border border-blue-500/20">
                        <i class="ph-fill ph-seal-check text-blue-500 text-[10px]"></i>
                        <span class="text-[8px] text-blue-300 font-bold">Verified</span>
                    </div>
                </div>
                <p class="text-[10px] text-white leading-relaxed font-sans font-medium">${r.admin_reply}</p>
            </div>
        </div>
    ` : '';

    return `
        <div class="bg-white/5 p-3 rounded-xl border border-white/10 mb-2 transition hover:bg-white/10 animate-fade-in">
            <div class="flex justify-between items-start mb-1">
                <div class="flex items-center gap-2">
                    <div class="w-5 h-5 rounded-full bg-gradient-to-tr from-yellow-400 to-orange-500 flex items-center justify-center text-[8px] font-black text-black shadow-lg shadow-orange-500/20">
                        ${r.display_name.charAt(0).toUpperCase()}
                    </div>
                    <span class="text-[10px] font-bold text-white">${maskName(r.display_name)}</span>
                </div>
                <div class="flex text-[8px] text-yellow-400 gap-0.5">
                    ${Array(r.rating).fill('<i class="ph-fill ph-star"></i>').join('')}
                </div>
            </div>
            
            <p class="text-[10px] text-white pl-7 leading-relaxed font-medium">"${cleanComment}"</p>
            
            ${tagsHtml}
            ${adminReplyHtml}

            <div class="text-[8px] text-gray-500 mt-2 pl-7 font-mono flex items-center gap-2">
                <span>${new Date(r.created_at).toLocaleDateString()}</span>
                <span class="w-1 h-1 rounded-full bg-gray-600"></span>
                <span class="text-yellow-500/80 font-bold">${r.item_name}</span>
            </div>
        </div>
    `;
}

// UI: Inject Struktur Utama Rating
function injectRatingUI() {
    const ratingSection = document.getElementById('rating-section-container');
    if (!ratingSection) return;

    // Generate Stars Header
    const fullStars = Math.floor(ratingData.avg);
    const hasHalfStar = ratingData.avg % 1 >= 0.5;
    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
        if (i < fullStars) starsHtml += `<i class="ph-fill ph-star text-yellow-400"></i>`;
        else if (i === fullStars && hasHalfStar) starsHtml += `<i class="ph-fill ph-star-half text-yellow-400"></i>`;
        else starsHtml += `<i class="ph-fill ph-star text-gray-600"></i>`;
    }

    ratingSection.innerHTML = `
        <div class="flex items-center justify-between mb-3 px-1 animate-fade-in">
            <div class="flex items-center gap-2">
                <div class="bg-yellow-500/10 p-1 rounded">
                    <i class="ph-fill ph-star text-yellow-400"></i>
                </div>
                <h3 class="font-bold text-white text-xs uppercase tracking-wide">Rating & Review</h3>
            </div>
            <div class="text-right flex items-center gap-2">
                 <div class="flex text-[10px]">
                    ${starsHtml}
                </div>
                <span class="font-bold text-white text-xs">${ratingData.avg}/5.0</span>
            </div>
        </div>

        <div class="glass-panel p-4 rounded-xl bg-[#18181b] relative overflow-hidden group border border-white/5 animate-fade-in">
            
            <div class="flex items-start gap-4 mb-4 pb-4 border-b border-white/5">
                <div class="text-center w-1/4 pt-1">
                    <div class="text-3xl font-black text-white leading-none">${ratingData.avg}</div>
                    <div class="text-[8px] text-gray-500 mt-1 uppercase tracking-wider">${ratingData.total} Reviews</div>
                </div>
                <div class="w-3/4">
                    ${generateDistributionHtml()}
                </div>
            </div>

            <div id="rating-list-container" class="flex flex-col gap-1 min-h-[200px]">
            </div>
            
            <div id="pagination-controls" class="flex items-center justify-center gap-1 mt-4 pt-2 border-t border-white/5">
            </div>
        </div>
    `;

    renderCurrentPage();
}

// LOGIC BARU: Render Halaman Semasa
function renderCurrentPage() {
    const listContainer = document.getElementById('rating-list-container');
    if (!listContainer) return;

    if (ratingData.reviews.length === 0) {
        listContainer.innerHTML = `<div class="text-center text-[10px] text-gray-500 py-8 italic border border-dashed border-white/10 rounded-xl">Belum ada review. Jadilah yang pertama!</div>`;
        document.getElementById('pagination-controls').innerHTML = ''; // Kosongkan pagination
        return;
    }

    // Kira index mula dan tamat berdasarkan page semasa
    const startIndex = (currentPage - 1) * reviewsPerPage;
    const endIndex = startIndex + reviewsPerPage;
    
    // Potong array review
    const reviewsToShow = ratingData.reviews.slice(startIndex, endIndex);

    // Fade effect semasa tukar page
    listContainer.style.opacity = '0.5';
    
    setTimeout(() => {
        listContainer.innerHTML = reviewsToShow.map(r => renderReviewCard(r)).join('');
        listContainer.style.opacity = '1';
        // Scroll sikit ke atas list container jika perlu
        // listContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);

    // Update butang pagination
    renderPaginationControls();
}

// LOGIC BARU: Render Butang Pagination
function renderPaginationControls() {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;

    const totalPages = Math.ceil(ratingData.reviews.length / reviewsPerPage);
    
    // Jika hanya 1 page, tak perlu tunjuk pagination
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let html = '';

    // Butang Prev (<)
    const prevDisabled = currentPage === 1 ? 'opacity-30 pointer-events-none' : 'hover:bg-white/10 hover:text-white';
    html += `
        <button onclick="changePage(${currentPage - 1})" class="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 transition ${prevDisabled}">
            <i class="ph-bold ph-caret-left"></i>
        </button>
    `;

    // Butang Nombor
    // Logic simple: Tunjuk max 5 nombor. Kalau page banyak, adjust sikit (tapi untuk <100 review, show all pun ok)
    for (let i = 1; i <= totalPages; i++) {
        // Highlight page semasa
        if (i === currentPage) {
            html += `
                <button class="w-7 h-7 flex items-center justify-center rounded-lg bg-yellow-500 text-black font-bold text-[10px] shadow-lg shadow-yellow-500/20 cursor-default">
                    ${i}
                </button>
            `;
        } else {
            html += `
                <button onclick="changePage(${i})" class="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-white hover:bg-white/10 transition text-[10px]">
                    ${i}
                </button>
            `;
        }
    }

    // Butang Next (>)
    const nextDisabled = currentPage === totalPages ? 'opacity-30 pointer-events-none' : 'hover:bg-white/10 hover:text-white';
    html += `
        <button onclick="changePage(${currentPage + 1})" class="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 transition ${nextDisabled}">
            <i class="ph-bold ph-caret-right"></i>
        </button>
    `;

    paginationContainer.innerHTML = html;
}

// Fungsi Tukar Page
function changePage(newPage) {
    const totalPages = Math.ceil(ratingData.reviews.length / reviewsPerPage);
    if (newPage < 1 || newPage > totalPages) return;
    
    currentPage = newPage;
    renderCurrentPage();
}

// Helper: Mask nama
function maskName(name) {
    if (!name) return 'Anonim';
    if (name.length <= 3) return name;
    return name.substring(0, 2) + '****' + name.substring(name.length - 1);
}

// Jalankan sistem
window.addEventListener('DOMContentLoaded', initRatingSystem);