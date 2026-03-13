// js/badges.js

/**
 * Fungsi utama untuk memaparkan semua badges di dalam container
 * @param {string} containerId - ID elemen HTML (contoh: 'profile-badges')
 * @param {object} userProfile - Data profile dari Supabase (mesti ada id, role)
 */
async function renderUserBadges(containerId, userProfile) {
    const container = document.getElementById(containerId);
    if (!container || !userProfile) return;

    // Reset container & letak loading animation kecil
    container.innerHTML = '<div class="w-4 h-4 border-2 border-white/20 border-t-yellow-400 rounded-full animate-spin"></div>';

    try {
        const badges = [];

        // 1. CHECK ROLE (ADMIN / STAFF)
        if (userProfile.role === 'admin' || userProfile.role === 'owner') {
            badges.push(createBadgeHTML('ADMIN', 'shield-check', 'bg-red-500 text-white border-red-400 shadow-red-500/20'));
        } else if (userProfile.role === 'staff') {
            badges.push(createBadgeHTML('STAFF', 'user-gear', 'bg-blue-500 text-white border-blue-400 shadow-blue-500/20'));
        }

        // 2. DAPATKAN DATA SPENDING & RANKING DARI SERVER
        // Kita panggil RPC yang sama macam di rank.js untuk konsistensi
        let totalSpent = 0;
        let rankPosition = null;

        const { data: leaderboard, error } = await supabaseClient.rpc('get_monthly_leaderboard', { month_offset: 0 });

        if (!error && leaderboard) {
            // Cari user dalam leaderboard
            const userStat = leaderboard.find(u => u.id === userProfile.id);
            const userIndex = leaderboard.findIndex(u => u.id === userProfile.id);

            if (userStat) {
                totalSpent = userStat.total_spent;
                rankPosition = userIndex + 1; // Index mula dari 0, jadi tambah 1
            }
        }

        // 3. TENTUKAN TIER BADGE (GOLD / SILVER / BRONZE)
        // Syarat ini mesti sama dengan rank.js anda
        if (totalSpent >= 1000) {
            badges.push(createBadgeHTML('GOLD', 'crown', 'bg-gradient-to-r from-yellow-300 to-yellow-500 text-black border-yellow-200 shadow-yellow-400/30 font-black'));
        } else if (totalSpent >= 500) {
            badges.push(createBadgeHTML('SILVER', 'medal', 'bg-gradient-to-r from-gray-300 to-gray-400 text-black border-gray-200 font-bold'));
        } else {
            badges.push(createBadgeHTML('BRONZE', 'medal', 'bg-gradient-to-r from-orange-700 to-orange-600 text-white border-orange-500 font-bold'));
        }

        // 4. TENTUKAN POSISI TOP RANK (Top 1, 2, 3 atau Top 10)
        if (rankPosition) {
            if (rankPosition === 1) {
                badges.push(createBadgeHTML('TOP #1', 'trophy', 'bg-black text-yellow-400 border-yellow-400 border animate-pulse shadow-yellow-400/20'));
            } else if (rankPosition <= 3) {
                badges.push(createBadgeHTML(`TOP #${rankPosition}`, 'trophy', 'bg-black text-gray-200 border-gray-500 border'));
            } else if (rankPosition <= 10) {
                badges.push(createBadgeHTML(`TOP 10`, 'chart-bar', 'bg-black/50 text-gray-400 border-gray-700 border'));
            }
        }

        // 5. RENDER KE HTML
        container.innerHTML = badges.join('');

    } catch (e) {
        console.error("Error rendering badges:", e);
        container.innerHTML = '';
    }
}

/**
 * Helper untuk buat HTML badge
 */
function createBadgeHTML(text, icon, colorClasses) {
    return `
        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider shadow-lg border transform hover:scale-105 transition-transform cursor-default ${colorClasses}">
            <i class="ph-fill ph-${icon}"></i>
            <span>${text}</span>
        </div>
    `;
}