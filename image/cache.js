// js/cache.js
// Sistem Caching Berasingan

// --- CONFIGURATION ---
const CACHE_VERSION = '1.1.1'; 
const CACHE_DURATION = 10 * 60 * 1000; // 10 Minit

// --- CORE FUNCTIONS ---
function getFromCache(key) {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    try {
        const parsed = JSON.parse(cached);
        const now = new Date().getTime();
        
        // Check version dan masa luput
        if (parsed.version !== CACHE_VERSION || (now - parsed.timestamp > CACHE_DURATION)) {
            sessionStorage.removeItem(key);
            return null;
        }
        return parsed.data;
    } catch (e) {
        sessionStorage.removeItem(key); 
        return null;
    }
}

// Update function saveToCache dalam cache.js
function saveToCache(key, data) {
    try {
        const payload = { 
            version: CACHE_VERSION, 
            timestamp: new Date().getTime(), 
            data: data 
        };
        sessionStorage.setItem(key, JSON.stringify(payload));
    } catch (e) { 
        console.warn("Storage full, cuba bersihkan...", e); 
        sessionStorage.clear(); // Kosongkan storage jika penuh
        // Cuba simpan sekali lagi (optional)
    }
}

// --- NEW: FORCE INVALIDATE ---
// Gunakan ini untuk padam cache spesifik bila user tekan refresh
function invalidateCache(key) {
    sessionStorage.removeItem(key);
}

// Gunakan ini untuk padam semua data cache aplikasi
function clearAppCache() {
    sessionStorage.clear();
    console.log("Cache dibersihkan sepenuhnya.");
}