/**
 * theme.js - ICEDRAGONSTORE (Updated V2)
 * Features: 
 * 1. Auto-detect System Preference
 * 2. Anti-flicker (Immediate Execution)
 * 3. Loading Overlay Animation
 * 4. Supports Multiple Toggle Buttons (Nav & Profile Modal)
 * 5. Auto-Injects required CSS for spinner
 */

// --- KONFIGURASI ---
const META_THEME_LIGHT = '#ffffff'; 
const META_THEME_DARK = '#09090b'; // Updated to match body bg

// =========================================================
// 1. FUNGSI UTAMA (DIJALANKAN SERTA-MERTA)
// =========================================================

function getPreferredTheme() {
    const savedTheme = localStorage.getItem('ld-theme');
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function setThemeClass(theme) {
    const html = document.documentElement;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');

    if (theme === 'light') {
        html.classList.add('light-mode');
        if (metaThemeColor) metaThemeColor.setAttribute('content', META_THEME_LIGHT);
    } else {
        html.classList.remove('light-mode');
        if (metaThemeColor) metaThemeColor.setAttribute('content', META_THEME_DARK);
    }
}

// JALANKAN INI SEGERA (Anti-Flicker)
const initialTheme = getPreferredTheme();
setThemeClass(initialTheme);


// =========================================================
// 2. CSS INJECTION (UNTUK LOADING SPINNER)
// =========================================================
// Kita inject style ini supaya anda tak perlu update file css manual
const themeStyles = document.createElement('style');
themeStyles.innerHTML = `
    #theme-loader-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: #09090b; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
    }
    html.light-mode #theme-loader-overlay { background-color: #ffffff; }
    #theme-loader-overlay.active { opacity: 1; pointer-events: all; }
    
    .theme-spinner {
        width: 40px; height: 40px;
        border: 4px solid rgba(250, 204, 21, 0.3);
        border-top-color: #facc15; border-radius: 50%;
        animation: themeSpin 0.8s linear infinite;
    }
    @keyframes themeSpin { to { transform: rotate(360deg); } }
    
    /* Smooth transition global bila bertukar tema */
    html.theme-transition, html.theme-transition *, html.theme-transition *:before, html.theme-transition *:after {
        transition: all 0.3s !important;
        transition-delay: 0 !important;
    }
`;
document.head.appendChild(themeStyles);


// =========================================================
// 3. FUNGSI UI & LOGIC (SELEPAS DOM READY)
// =========================================================

// Kita define toggleTheme di window scope supaya boleh guna onclick="toggleTheme()" di HTML
window.toggleTheme = function() {
    const html = document.documentElement;
    const overlay = document.getElementById('theme-loader-overlay');

    // 1. Tunjuk Loading Overlay
    if(overlay) overlay.classList.add('active');

    // 2. Delay sikit untuk render overlay, baru tukar tema
    setTimeout(() => {
        // Tambah class transition untuk efek smooth
        html.classList.add('theme-transition');

        const isLight = html.classList.contains('light-mode');
        const newTheme = isLight ? 'dark' : 'light';

        // Tukar logic
        setThemeClass(newTheme);
        updateThemeUI(newTheme);
        localStorage.setItem('ld-theme', newTheme);

        // 3. Hilangkan Loading selepas 500ms
        setTimeout(() => {
            if(overlay) overlay.classList.remove('active');
            // Buang class transition supaya tak ganggu performance page biasa
            setTimeout(() => html.classList.remove('theme-transition'), 300);
        }, 400); 

    }, 50); 
};

// Fungsi update Icon (Nav & Profile Modal)
function updateThemeUI(theme) {
    // 1. Update NAV Button Icon
    const navIcon = document.getElementById('theme-icon');
    if (navIcon) {
        if (theme === 'light') {
            navIcon.className = 'ph-fill ph-moon text-gray-800 text-xl sm:text-2xl';
        } else {
            navIcon.className = 'ph-fill ph-sun text-yellow-400 text-xl sm:text-2xl';
        }
    }

    // 2. Update PROFILE MODAL Button Icon (Kod Baru)
    const profileIcon = document.getElementById('profile-theme-icon-inner');
    if (profileIcon) {
        if (theme === 'light') {
            // Light Mode: Tunjuk Bulan (Nak tukar ke gelap)
            profileIcon.className = 'ph-fill ph-moon-stars text-gray-600 transition-colors';
        } else {
            // Dark Mode: Tunjuk Matahari (Nak tukar ke cerah)
            profileIcon.className = 'ph-fill ph-sun text-yellow-400 transition-colors';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    // Inject Loading Overlay Div
    if (!document.getElementById('theme-loader-overlay')) {
        const loaderOverlay = document.createElement('div');
        loaderOverlay.id = 'theme-loader-overlay';
        loaderOverlay.innerHTML = '<div class="theme-spinner"></div>';
        document.body.appendChild(loaderOverlay);
    }

    // Bind event listener untuk butang Nav (Fallback jika onclick html tak jalan)
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.onclick = (e) => {
            e.preventDefault();
            window.toggleTheme();
        };
    }

    // Jalankan update UI awal
    updateThemeUI(getPreferredTheme());

    // Sync Tab (Jika user buka 2 tab, tukar satu, semua bertukar)
    window.addEventListener('storage', (e) => {
        if (e.key === 'ld-theme') {
            const newTheme = e.newValue;
            setThemeClass(newTheme);
            updateThemeUI(newTheme);
        }
    });

    // Auto System Change (Jika user tukar setting Windows/Android/iOS)
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
        if (!localStorage.getItem('ld-theme')) {
            const newOsTheme = e.matches ? 'light' : 'dark';
            setThemeClass(newOsTheme);
            updateThemeUI(newOsTheme);
        }
    });
});