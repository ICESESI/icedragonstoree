        // --- SUPABASE CONFIG ---
        const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
        const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

        // VARIABLES
        let currentUser = null;
        let currentProfile = null;
        let currentFactorId = null;

        // DEVICE ID LOGIC
        let localDeviceId = localStorage.getItem('ld_device_id');
        if (!localDeviceId) {
            localDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('ld_device_id', localDeviceId);
        }

        // UTILITY
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            if (!container) return; 
            if(container.children.length > 1) container.removeChild(container.firstChild);

            const toast = document.createElement('div');
            toast.className = `p-4 rounded-xl shadow-lg border flex items-center gap-3 animate-slide-left ${
                type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 
                type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 
                'bg-[#18181b] border-gray-700 text-white'
            }`;
            let icon = type === 'success' ? 'check-circle' : type === 'error' ? 'warning-circle' : 'info';
            toast.innerHTML = `<i class="ph ph-${icon} text-xl"></i> <span class="text-xs font-bold">${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
        }

        // --- BACKUP CODES UTILITY ---
        function generateBackupCodes() {
            const codes = [];
            for (let i = 0; i < 8; i++) {
                const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
                const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
                codes.push(`${part1}-${part2}`);
            }
            return codes;
        }

        function displayBackupCodes(codes) {
            const container = document.getElementById('backup-codes-list');
            if(!container) return;
            container.innerHTML = codes.map(code => 
                `<div class="bg-black/40 border border-white/10 rounded-lg py-2 px-1 text-sm text-gray-300 select-all hover:border-yellow-400/50 transition cursor-pointer">${code}</div>`
            ).join('');
        }

        function copyBackupCodes() {
            const codesText = Array.from(document.querySelectorAll('#backup-codes-list div')).map(div => div.innerText).join('\n');
            navigator.clipboard.writeText(codesText).then(() => {
                showToast("Kod berjaya disalin!", "success");
            });
        }

        function finish2FASetup() {
            closeModal('backup-codes-modal');
            location.reload();
        }

        // WINDOW ONLOAD
        window.onload = async () => {
            setTimeout(() => {
                const loadingOverlay = document.getElementById('loading-overlay');
                if(loadingOverlay && loadingOverlay.style.opacity !== '0') {
                    loadingOverlay.style.opacity = '0';
                    setTimeout(() => loadingOverlay.remove(), 500);
                }
            }, 3000);
            
            await checkSession();
        };

async function checkSession() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const authSection = document.getElementById('auth-section');

        if (session) {
            // --- 2FA ENFORCEMENT LOGIC ---
            const { data: mfaData, error: mfaError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
            
            if (!mfaError && mfaData) {
                if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
                    window.location.href = 'login.html'; 
                    return; 
                }
            }
            // -----------------------------

            // ... dalam checkSession ...

            currentUser = session.user;
            
            // 1. [FIX] Tambah 'xp_balance' dan 'is_banned' yang tertinggal
            const { data: profileData } = await supabaseClient
                .from('profiles')
                .select('id, username, wallet_balance, avatar_url, phone, role, xp_balance, is_banned') 
                .eq('id', currentUser.id)
                .single();
            
            if (!profileData) return;
            currentProfile = profileData;

            // 2. [FIX] Panggil RPC untuk tahu status PIN (sebab kita tak download PIN sebenar)
            const { data: hasPin } = await supabaseClient.rpc('check_has_pin');
            
            // Simpan status pin dalam object currentProfile secara manual
            currentProfile.has_pin = hasPin; 

            if (currentProfile.is_banned) {
                await supabaseClient.auth.signOut();
                alert("Akaun Banned");
                window.location.href='index.html';
                return;
            }

            // --- UPDATE: LOGIC FORMAT BAKI (K, M, B, T, Q) ---
            let rawBalance = currentProfile.wallet_balance;
            let formattedBalance = '';

            if (rawBalance >= 1e15) formattedBalance = (rawBalance / 1e15).toFixed(2) + 'Q';
            else if (rawBalance >= 1e12) formattedBalance = (rawBalance / 1e12).toFixed(2) + 'T';
            else if (rawBalance >= 1e9) formattedBalance = (rawBalance / 1e9).toFixed(2) + 'B';
            else if (rawBalance >= 1e6) formattedBalance = (rawBalance / 1e6).toFixed(2) + 'M';
            else if (rawBalance >= 1e3) formattedBalance = (rawBalance / 1e3).toFixed(2) + 'K';
            else formattedBalance = rawBalance.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            // ---------------------------------------------------

            // Setup UI Navbar (Desktop/Header) - FIXED XSS HERE
            if(authSection) {
                // 1. SANITIZE URL: Pastikan URL selamat (http/https) dan escape quote
                let safeAvatarUrl = null;
                if (currentProfile.avatar_url) {
                    const url = currentProfile.avatar_url.trim();
                    // Hanya terima jika mula dengan http/https
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        // Escape double quotes supaya tak boleh inject script
                        safeAvatarUrl = url.replace(/"/g, '&quot;');
                    }
                }

                // 2. Guna safeAvatarUrl yang dah dibersihkan
                const avatarHtml = safeAvatarUrl 
                    ? `<img src="${safeAvatarUrl}" class="w-8 h-8 rounded-full border-2 border-yellow-400/50 object-cover shadow-sm shrink-0 group-hover:scale-105 transition">` 
                    : `<div class="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-black font-bold text-xs shadow-lg border-2 border-white/10 shrink-0">${currentUser.email.charAt(0).toUpperCase()}</div>`;

                authSection.innerHTML = `
                    <div onclick="openModal('profile-modal')" class="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 py-1 pl-2 pr-1 rounded-full border border-white/5 transition group backdrop-blur-sm animate-up max-w-[160px] sm:max-w-none hover:border-yellow-400/30">
                        <div class="flex flex-col items-end justify-center leading-none overflow-hidden">
                            <span class="text-[8px] text-gray-400 uppercase font-bold tracking-wider mb-[1px]">Baki</span>
                            <span class="text-[10px] font-bold text-yellow-400 group-hover:text-white transition font-mono truncate w-full text-right">
                                RM ${formattedBalance}
                            </span>
                        </div>
                        ${avatarHtml}
                    </div>
                `;
            }
            
            fillAccountPageData();
            check2FAStatus();
            updateDeviceList();
            loadInbox();

            // --- KEMASKINI UI PROFILE MODAL (XP & BAUCER) ---
            
            // 1. Update Nama & Gambar (Gunakan innerText untuk elak XSS pada nama)
            if(document.getElementById('profile-email')) {
                document.getElementById('profile-email').innerText = currentProfile.username || currentUser.email;
            }
            if(document.getElementById('profile-img')) {
                // Guna logik sanitize yang sama jika ada gambar
                let safeProfileImg = "https://via.placeholder.com/150"; // Default fallback
                if (currentProfile.avatar_url) {
                     const url = currentProfile.avatar_url.trim();
                     if (url.startsWith('http://') || url.startsWith('https://')) {
                         safeProfileImg = url; // Assign terus ke .src (safe property)
                     }
                }
                document.getElementById('profile-img').src = safeProfileImg;
            }

            // 2. Update Wallet (Sidebar)
            const sidebarBalance = document.getElementById('sidebar-balance');
            if (sidebarBalance) {
                sidebarBalance.innerText = formattedBalance;
            }

            // 3. Update XP Display
            const xpDisplay = document.getElementById('profile-xp-display');
            if (xpDisplay) {
                xpDisplay.innerText = currentProfile.xp_balance || 0;
            }

            // 4. Update Voucher Display
            const voucherDisplay = document.getElementById('profile-voucher-display');
            if (voucherDisplay) {
                const count = await getVoucherCount();
                voucherDisplay.innerText = count;
            }
            // ------------------------------------------------

        } else {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        const loadingOverlay = document.getElementById('loading-overlay');
        if(loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => loadingOverlay.remove(), 500);
        }
    }
}

        function fillAccountPageData() {
            if (!document.getElementById('acc-email')) return;
            document.getElementById('acc-email').value = currentUser.email;
            
            const displayName = currentProfile.username || currentUser.user_metadata?.username || currentUser.email.split('@')[0];
            document.getElementById('acc-display-email').innerText = displayName;
            document.getElementById('acc-username').value = displayName;
            if (currentProfile.phone) document.getElementById('acc-phone').value = currentProfile.phone;
            if (currentProfile.avatar_url) {
                document.getElementById('acc-avatar-url').value = currentProfile.avatar_url;
                document.getElementById('acc-img-preview').src = currentProfile.avatar_url;
            }

            // PIN Logic
            const pinBadge = document.getElementById('pin-status-badge');
            const oldPinContainer = document.getElementById('container-old-pin');
            // Guna .has_pin yang kita baru buat tadi
if (currentProfile.has_pin) {
                pinBadge.innerText = "PIN TELAH DISET";
                pinBadge.classList.add("bg-green-500", "text-black");
                pinBadge.classList.remove("bg-red-500", "text-white");
                oldPinContainer.classList.remove("hidden"); 
            } else {
                pinBadge.innerText = "BELUM DISET";
                pinBadge.classList.add("bg-red-500", "text-white");
                pinBadge.classList.remove("bg-green-500", "text-black");
                oldPinContainer.classList.add("hidden"); 
            }

            // Badges
            const badgeContainer = document.getElementById('acc-badge-container');
            const profileBadges = document.getElementById('profile-badges');
            let badgesHtml = '';
            if (currentProfile.role === 'admin') badgesHtml += '<span class="badge badge-admin mr-1">ADMIN</span>';
            
            if(badgeContainer) badgeContainer.innerHTML = badgesHtml;
            if(profileBadges) profileBadges.innerHTML = badgesHtml;
        }

async function saveAccountSettings() {
    const btn = document.getElementById('btn-save-acc');
    const originalText = btn.innerHTML;

    const username = document.getElementById('acc-username').value;
    const avatarUrl = document.getElementById('acc-avatar-url').value;
    const phone = document.getElementById('acc-phone').value;
    const oldPin = document.getElementById('acc-pin-old').value;
    const newPin = document.getElementById('acc-pin-new').value;
    const oldPass = document.getElementById('acc-pass-old').value;
    const newPass = document.getElementById('acc-pass-new').value;

    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Menyimpan...`;
    btn.disabled = true;

    try {
        let profileUpdates = {};

        // 1. Basic Info Updates
        if (!username) throw new Error("Username tidak boleh kosong.");
        if (username !== currentProfile.username) profileUpdates.username = username;
        if (avatarUrl && avatarUrl !== currentProfile.avatar_url) profileUpdates.avatar_url = avatarUrl;
        if (phone && phone !== currentProfile.phone) profileUpdates.phone = phone;

        // ============================================================
        // [SECURE] 2. PIN Logic (Guna RPC yang ada VIP Pass)
        // ============================================================
        if (newPin) {
            // Kita panggil function SQL 'update_pin_secure' direct.
            // Function ini telah di-whitelist dalam SQL tadi (Update 1), 
            // jadi Trigger tidak akan block.
            const { data: rpcResult, error: rpcError } = await supabaseClient
                .rpc('update_pin_secure', {
                    p_old_pin: oldPin || null, // Hantar null jika kosong
                    p_new_pin: newPin
                });

            // Handle Ralat Teknikal
            if (rpcError) throw new Error("Ralat sistem: " + rpcError.message);

            // Handle Ralat Logic (Contoh: PIN Lama salah)
            if (!rpcResult.success) {
                throw new Error(rpcResult.message);
            }
            
            // PENTING: Jangan masukkan 'security_pin' ke dalam object profileUpdates.
            // Kita dah update guna RPC di atas. Jika kita masukkan ke profileUpdates,
            // Trigger akan nampak 'double update' dan mungkin block.
        }

        // 3. Password Logic
        if (newPass) {
            if (!oldPass) throw new Error("Masukkan Password Lama.");
            if (newPass.length < 6) throw new Error("Password mesti > 6 karakter.");

            // Verify old password
            const { error } = await supabaseClient.auth.signInWithPassword({ email: currentUser.email, password: oldPass });
            if (error) throw new Error("Password Lama salah!");

            // Update to new password
            const { error: updatePassError } = await supabaseClient.auth.updateUser({ password: newPass });
            if (updatePassError) throw new Error(updatePassError.message);

            showToast("Password berjaya ditukar!", "success");
        }

        // 4. Commit Profile Updates (Username, Phone, dll - KECUALI PIN)
        if (Object.keys(profileUpdates).length > 0) {
            const { error } = await supabaseClient
                .from('profiles')
                .update(profileUpdates)
                .eq('id', currentUser.id);

            if (error) throw error;
        }

        showToast("Tetapan berjaya disimpan!", "success");
        setTimeout(() => location.reload(), 1500);

    } catch (err) {
        showToast(err.message, "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- 2FA / TOTP LOGIC (Updated) ---
async function check2FAStatus() {
    try {
        const statusBadge = document.getElementById('2fa-status-badge');
        const btnEnable = document.getElementById('btn-enable-2fa');
        const btnDisable = document.getElementById('btn-disable-2fa');

        // Logic untuk detect sama ada 2FA sudah diaktifkan (AAL2)
        const { data: factors } = await supabaseClient.auth.mfa.listFactors();
        
        // Safety check jika factors null
        if (!factors || !factors.totp) return;

        // Check faktor TOTP yang sudah 'verified'
        const totpFactor = factors.totp.find(f => f.status === 'verified');

        if (totpFactor) {
            currentFactorId = totpFactor.id;
            if(statusBadge) {
                statusBadge.innerText = "AKTIF";
                statusBadge.classList.replace("bg-gray-700", "bg-green-500");
            }
            if(btnEnable) btnEnable.classList.add("hidden");
            if(btnDisable) btnDisable.classList.remove("hidden");
        } else {
            if(statusBadge) statusBadge.innerText = "OFF";
            if(btnEnable) btnEnable.classList.remove("hidden");
            if(btnDisable) btnDisable.classList.add("hidden");
        }
    } catch (e) {
        console.error("2FA Check Error:", e);
    }
}

        async function start2FASetup() {
            const btn = document.getElementById('btn-enable-2fa');
            btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Loading...`;
            btn.disabled = true;

            try {
                // CLEANUP OLD (Remove unverified factors)
                const { data: factors, error: listError } = await supabaseClient.auth.mfa.listFactors();
                if (listError) throw listError;

                const unverifiedFactor = factors.totp.find(f => f.status === 'unverified');
                if (unverifiedFactor) {
                    await supabaseClient.auth.mfa.unenroll({ factorId: unverifiedFactor.id });
                }

                // ENROLL NEW
                const { data, error } = await supabaseClient.auth.mfa.enroll({ 
                    factorType: 'totp',
                    friendlyName: 'LD-Shop-' + Math.floor(Math.random() * 1000)
                });
                
                if (error) throw error;

                currentFactorId = data.id;
                
                const setupContainer = document.getElementById('2fa-setup-container');
                setupContainer.classList.remove('hidden');
                document.getElementById('2fa-action-btns').classList.add('hidden');
                
                document.getElementById('qrcode').innerHTML = "";
                new QRCode(document.getElementById("qrcode"), {
                    text: data.totp.uri,
                    width: 128,
                    height: 128
                });

            } catch (err) {
                console.error(err);
                showToast("Gagal memulakan 2FA: " + err.message, "error");
                btn.innerHTML = `<i class="ph ph-shield-plus"></i> AKTIFKAN 2FA`;
                btn.disabled = false;
            }
        }

// Function generateBackupCodes() BOLEH DIBUANG. Kita guna RPC di bawah.

async function verifyAndEnable2FA() {
    const code = document.getElementById('2fa-code-input').value;
    const verifyBtn = document.getElementById('btn-verify-2fa');
    
    if(!code) return showToast("Masukkan kod!", "error");

    const originalBtnText = verifyBtn.innerHTML;
    verifyBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Memproses...`;
    verifyBtn.disabled = true;

    try {
        // 1. Verify TOTP dengan Google Authenticator dulu
        const { data, error } = await supabaseClient.auth.mfa.challengeAndVerify({
            factorId: currentFactorId,
            code: code
        });
        
        if (error) throw error;

        // 2. PANGGIL SERVER UNTUK GENERATE & SIMPAN BACKUP CODE (Lebih Selamat)
        // Kita tak generate di browser, kita minta server buatkan.
        const { data: serverCodes, error: rpcError } = await supabaseClient
            .rpc('generate_save_backup_codes');

        if (rpcError) {
            console.error("RPC Error:", rpcError);
            throw new Error("Gagal menjana kod sandaran di server.");
        }

        // 3. Paparkan Backup Codes yang server bagi
        // Nota: serverCodes adalah array string ['XXXX-XXXX', ...]
        displayBackupCodes(serverCodes);
        
        openModal('backup-codes-modal');
        showToast("2FA Berjaya! Sila simpan kod sandaran.", "success");

        verifyBtn.innerHTML = "BERJAYA";
        
    } catch (err) {
        console.error(err);
        showToast(err.message || "Kod salah atau tamat tempoh.", "error");
        verifyBtn.innerHTML = originalBtnText;
        verifyBtn.disabled = false;
    }
}
async function disable2FA() {
    if(!confirm("Adakah anda pasti mahu mematikan 2FA? Akaun anda akan kurang selamat.")) return;
    
    const btn = document.getElementById('btn-disable-2fa');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> Memproses...`;
    btn.disabled = true;

    try {
        // 1. Cari Factor ID yang aktif
        const { data: factors, error: listError } = await supabaseClient.auth.mfa.listFactors();
        if (listError) throw listError;

        const factorToDelete = factors.totp.find(f => f.status === 'verified');

        if (!factorToDelete) throw new Error("Tiada 2FA aktif dijumpai.");

        // 2. Unenroll (Buang 2FA dari sistem Auth)
        const { error: unenrollError } = await supabaseClient.auth.mfa.unenroll({ 
            factorId: factorToDelete.id 
        });

        if (unenrollError) throw unenrollError;

        // 3. Clear Backup Codes dalam Database
        // Nota: Jika awak dah ketatkan RLS, line ini mungkin error tapi takpa asalkan unenroll berjaya.
        const { error: dbError } = await supabaseClient
            .from('profiles')
            .update({ backup_codes: null }) // Set null
            .eq('id', currentUser.id);
            
        if(dbError) console.warn("Isi backup code gagal dipadam (RLS), tapi 2FA dah off.");

        showToast("2FA Berjaya Dimatikan.", "success");
        setTimeout(() => location.reload(), 1500);

    } catch(err) {
        console.error(err);
        showToast("Gagal: " + (err.message || "Ralat tidak diketahui"), "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
        // --- DEVICE MANAGEMENT ---
        async function updateDeviceList() {
            const userAgent = navigator.userAgent;
            let deviceName = "Unknown Device";
            if(userAgent.includes("iPhone")) deviceName = "iPhone";
            else if(userAgent.includes("Android")) deviceName = "Android Phone";
            else if(userAgent.includes("Mac")) deviceName = "Mac Device";
            else if(userAgent.includes("Windows")) deviceName = "Windows PC";
            
            await supabaseClient.from('user_devices').upsert({
                user_id: currentUser.id,
                device_id: localDeviceId,
                device_name: deviceName + " (" + (navigator.platform || 'Web') + ")",
                last_active: new Date().toISOString()
            }, { onConflict: 'device_id' });

            const { data: devices } = await supabaseClient.from('user_devices').select('*').eq('user_id', currentUser.id).order('last_active', { ascending: false });
            
            const listEl = document.getElementById('device-list');
            if(listEl && devices) {
                listEl.innerHTML = devices.map(dev => {
                    const isCurrent = dev.device_id === localDeviceId;
                    const dateStr = new Date(dev.last_active).toLocaleString('ms-MY', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
                    return `
                        <div class="flex justify-between items-center bg-[#18181b] p-3 rounded-lg border border-gray-700">
                            <div class="flex items-center gap-3">
                                <i class="ph ${dev.device_name.toLowerCase().includes('phone') ? 'ph-device-mobile' : 'ph-monitor'} text-gray-400 text-lg"></i>
                                <div>
                                    <div class="text-xs font-bold text-white flex items-center gap-2">
                                        ${dev.device_name}
                                        ${isCurrent ? '<span class="text-[9px] bg-green-500/20 text-green-400 px-1.5 rounded border border-green-500/20">THIS DEVICE</span>' : ''}
                                    </div>
                                    <div class="text-[9px] text-gray-500">Last login: ${dateStr}</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        async function logoutAllOtherDevices() {
            if(!confirm("Log keluar semua peranti lain?")) return;
            const { error } = await supabaseClient.from('user_devices').delete().eq('user_id', currentUser.id).neq('device_id', localDeviceId);
            if(error) showToast("Ralat sistem.", "error");
            else {
                showToast("Berjaya.", "success");
                updateDeviceList();
            }
        }

        // --- GENERAL ---
        async function handleLogout() { await supabaseClient.auth.signOut(); window.location.href = 'index.html'; }
        function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.getElementById(id).classList.add('flex'); }
        function closeModal(id) { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); }
        async function markNotificationsRead() {
            document.getElementById('nav-notif-dot').classList.add('hidden');
            await supabaseClient.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false);
        }
        async function loadInbox() {
            const { data } = await supabaseClient.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
            const list = document.getElementById('inbox-list');
            if (!data || !list) return;
            const hasUnread = data.some(n => !n.is_read);
            if (hasUnread) document.getElementById('nav-notif-dot').classList.remove('hidden');
            
            list.innerHTML = data.length ? data.map(n => 
                `<div class="bg-[#1e1f24] p-4 rounded-2xl mb-2 flex gap-3 ${!n.is_read ? 'border-l-4 border-yellow-400' : ''}">
                    <i class="ph ph-info text-blue-400 text-xl mt-0.5"></i>
                    <div><h4 class="text-sm font-bold text-white">${n.title}</h4><p class="text-xs text-gray-400">${n.message}</p></div>
                </div>`
            ).join('') : '<div class="text-center text-gray-500 text-xs py-10">Tiada notifikasi.</div>';
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