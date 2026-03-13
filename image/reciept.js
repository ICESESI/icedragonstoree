        // --- KONFIGURASI KEDAI (SILA UBAH SINI) ---
        const ADMIN_PHONE = "601135268529"; // No telefon admin untuk button support
        
        // --- SUPABASE CONFIGURATION ---
        const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
        const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

        let currentData = null;
        let refreshInterval = null;
        let userProfile = null; // Menyimpan data profile user yang login
        let currentUserSession = null; // Menyimpan session user penuh
        
        // Rating Variables
        let currentRating = 0;
        let selectedTags = [];
        const ratingTexts = [
            "Sila pilih bintang", 
            "Sangat Kecewa 😡", 
            "Kurang Memuaskan 😞", 
            "Boleh Tahan 😐", 
            "Puas Hati 😊", 
            "Mantap Pak Abu! 🔥"
        ];

        const defaultComments = [
            "Servis pantas dan terbaik! ⚡",
            "Transaksi mudah dan laju. Terima kasih! 👍",
            "Trusted seller, akan repeat order lagi. 🔥",
            "Mantap, masuk terus tak payah tunggu lama. 💯",
            "Harga murah, servis tiptop. Recommended! ⭐",
            "Respon admin pantas, sangat berpuas hati. 😊",
            "Memang padu, terbaik LD Shop! 🚀"
        ];

        window.onload = async () => {
            await fetchUserProfile(); // Fetch user profile awal-awal
            fetchTransactionData();
        };

        // --- FETCH USER PROFILE (WITH BAN CHECK) ---
        async function fetchUserProfile() {
            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                
                if (session) {
                    const { data: mfaData, error: mfaError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
                    
                    if (!mfaError && mfaData) {
                        if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
                            window.location.href = 'login.html';
                            return;
                        }
                    }

                    currentUserSession = session.user; 
                    // Fetch is_banned untuk check status ban
                    const { data } = await supabaseClient.from('profiles').select('username, email, is_banned').eq('id', session.user.id).single();
                    userProfile = data;

                    // --- SECURITY: BAN CHECK ---
                    if (userProfile && userProfile.is_banned) {
                        showToast("Akaun anda telah digantung/banned.");
                        await supabaseClient.auth.signOut();
                        setTimeout(() => window.location.href = 'index.html', 1500);
                        return;
                    }
                }
            } catch (e) {
                console.log("Guest User or Error Fetching Profile");
            }
        }

async function fetchTransactionData() {
            const urlParams = new URLSearchParams(window.location.search);
            const orderId = urlParams.get('order_id');

            // 1. Pastikan orderId wujud dalam URL
            if (!orderId) {
                showError();
                return;
            }

            try {
                // 2. Fetch Transaksi menggunakan order_id SAHAJA
                // Kita dah BUANG logic cari guna ID nombor (1, 2, 3...) untuk keselamatan.
                let { data, error } = await supabaseClient
                    .from('transactions')
                    .select('*')
                    .eq('order_id', orderId)
                    .single();

                // 3. Jika error atau data tak jumpa, terus tunjuk error (Tiada percubaan kedua)
                if (error || !data) {
                    console.error("Rekod tidak dijumpai atau error:", error);
                    showError(); 
                    return;
                }

                // 4. Jika berjaya, simpan data dan render
                currentData = data; 
                renderReceipt(data);

                // 5. Setup Auto-Refresh jika status masih pending/processing
                if (data.status === 'processing' || data.status === 'pending') {
                    setupAutoRefresh(orderId);
                } else {
                    stopAutoRefresh();
                }

            } catch (err) {
                console.error("System Error:", err);
                showError();
            }
        }

        function setupAutoRefresh(orderId) {
            if (refreshInterval) return; 
            
            refreshInterval = setInterval(async () => {
                const toast = document.getElementById('last-updated');
                toast.innerText = "Mengemaskini data...";
                
                const { data } = await supabaseClient.from('transactions').select('status, admin_note, payment_details').eq('order_id', orderId).single();
                
                if (data) {
                    // Update jika status bertukar (termasuk rejected)
                    if (data.status !== currentData.status || data.admin_note !== currentData.admin_note) {
                        fetchTransactionData();
                        showToast("Status Dikemaskini!");
                    } else {
                        const now = new Date();
                        document.getElementById('last-updated').innerText = `Dikemaskini: ${now.toLocaleTimeString()}`;
                    }
                }
            }, 15000); 
        }

        function stopAutoRefresh() {
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        }

function renderReceipt(data) {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('receipt-card').classList.remove('hidden');

    // 1. Setup QR Code
    const qrContainer = document.getElementById('qrcode-container');
    qrContainer.innerHTML = ""; 
    new QRCode(qrContainer, {
        text: data.order_id || `TRX-${data.id}`,
        width: 60, height: 60,
        colorDark : "#000000", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.L
    });

    // 2. Info Asas
    document.getElementById('order-id-display').innerText = data.order_id || `TRX-${data.id}`;
    document.getElementById('item-name').innerText = data.item_name;
    document.getElementById('item-quantity').innerText = `Kuantiti: x${data.quantity || 1}`;

    // ============================================================
    // [BARU] LOGIK PENGIRAAN HARGA & BREAKDOWN
    // ============================================================
    
    // A. Ambil Data Dari Database (Pastikan nombor float)
    const finalTotal = parseFloat(data.total_paid || data.amount);
    const feeVal = data.fee_amount ? parseFloat(data.fee_amount) : 0;
    const voucherVal = data.voucher_amount ? parseFloat(data.voucher_amount) : 0;
    
    // B. Kira Harga Asal Produk (Backwards Calculation)
    // Formula: Total Akhir - Fee + Baucar = Harga Asal
    let basePrice = finalTotal - feeVal + voucherVal;
    
    // Safety check (takut negatif)
    if (basePrice < 0) basePrice = finalTotal;

    // C. Render Breakdown ke HTML
    const breakdownContainer = document.getElementById('price-breakdown');
    if (breakdownContainer) {
        let html = '';

        // 1. Harga Asal Produk
        html += `
            <div class="flex justify-between text-[10px] text-gray-400">
                <span>Harga Asal Produk</span>
                <span class="font-mono text-white">RM ${basePrice.toFixed(2)}</span>
            </div>
        `;

        // 2. Tolak Baucar (Diskaun)
        if (voucherVal > 0) {
            html += `
                <div class="flex justify-between text-[10px] text-green-400">
                    <span class="flex items-center gap-1"><i class="ph-fill ph-ticket"></i> Tolak Baucar</span>
                    <span class="font-mono font-bold">- RM ${voucherVal.toFixed(2)}</span>
                </div>
            `;
        }

        // 3. Caj Pembayaran
        if (feeVal > 0) {
            // Dapatkan nama method (cth: QR Pay / FPX)
            const methodName = data.payment_method ? data.payment_method.toUpperCase() : 'FEE';
            html += `
                <div class="flex justify-between text-[10px] text-gray-400">
                    <span>Caj Pembayaran (${methodName})</span>
                    <span class="font-mono text-white">+ RM ${feeVal.toFixed(2)}</span>
                </div>
            `;
        }

        // Masukkan ke dalam div
        breakdownContainer.innerHTML = html;
    }

    // ============================================================
    // TAMAT LOGIK HARGA
    // ============================================================

    // Render Total Amount Besar
    const totalContainer = document.getElementById('total-amount');
    const formattedPrice = `RM ${finalTotal.toFixed(2)}`;

    if (data.status === 'success') {
        const xp = Math.floor(finalTotal); 
        totalContainer.innerHTML = `
            <div class="flex flex-col items-end">
                <span>${formattedPrice}</span>
                <div class="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-lg mt-1 animate-pulse">
                    <i class="ph-fill ph-star text-yellow-400 text-xs"></i>
                    <span class="text-[10px] font-bold text-yellow-400">+${xp} XP</span>
                </div>
            </div>
        `;
    } else {
        totalContainer.innerText = formattedPrice;
    }

    // Date & Time
    const dateObj = new Date(data.created_at);
    document.getElementById('date-display').innerText = dateObj.toLocaleDateString('ms-MY', { 
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' 
    });

    // Payment Method Label
    const methodMap = {
        'wallet': 'E-Wallet', 'bank_qr': 'QR Pay', 'digi_pin': 'Digi PIN', 'tng_pin': 'TnG PIN', 'whatsapp_manual': 'WhatsApp'
    };
    document.getElementById('payment-method').innerText = methodMap[data.payment_method] || data.payment_method.toUpperCase();

    // Game ID Details
    const idContainer = document.getElementById('game-id-container');
    idContainer.innerHTML = ''; 

    if (data.game_id_input) {
        const lines = data.game_id_input.split(' | ');
        lines.forEach(line => {
            if (line.includes(':')) {
                const [label, value] = line.split(/:(.+)/);
                const cleanValue = value ? value.trim() : '';
                idContainer.innerHTML += `
                    <div class="flex justify-between items-center text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <span class="text-gray-400 font-medium">${label.trim()}</span>
                        <div class="flex items-center gap-2">
                            <span class="text-white font-bold font-mono text-right truncate max-w-[150px]">${cleanValue}</span>
                            <button onclick="copyTextStr('${cleanValue}')" class="text-gray-500 hover:text-yellow-400"><i class="ph-bold ph-copy"></i></button>
                        </div>
                    </div>
                `;
            } else {
                idContainer.innerHTML += `<div class="text-white text-xs font-mono border-b border-white/5 pb-2">${line}</div>`;
            }
        });
    } else {
        idContainer.innerHTML = '<span class="text-gray-500 italic text-xs">Tiada maklumat akaun.</span>';
    }

    const timeString = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    document.getElementById('created-time-display').innerText = timeString;

    // Tracker & Status Visuals
    const tracker = document.getElementById('order-tracker');
    const line = document.getElementById('tracker-line');
    
    const s2Dot = document.getElementById('step-2-dot');
    const s2Text = document.getElementById('step-2-text');
    const s3Dot = document.getElementById('step-3-dot');
    const s3Text = document.getElementById('step-3-text');
    const s4Dot = document.getElementById('step-4-dot');
    const s4Text = document.getElementById('step-4-text');

    const activeDotClass = "bg-yellow-500 text-black border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]";
    const activeTextClass = "text-yellow-400";
    const finishDotClass = "bg-green-500 text-black border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]";
    const finishTextClass = "text-green-400";

    if (data.status !== 'canceled' && data.status !== 'rejected') {
        tracker.classList.remove('hidden');
        if (data.status === 'pending') {
            line.style.width = "33%";
            s2Dot.className = `w-7 h-7 rounded-full flex items-center justify-center border-[3px] border-[#18181b] transition-all duration-500 z-20 ${activeDotClass}`;
            s2Text.className = `text-[8px] font-bold uppercase text-center leading-tight transition-colors duration-500 mt-0.5 ${activeTextClass}`;
        } else if (data.status === 'processing') {
            line.style.width = "66%";
            s2Dot.className = `w-7 h-7 rounded-full flex items-center justify-center border-[3px] border-[#18181b] z-20 ${finishDotClass}`;
            s2Text.className = `text-[8px] font-bold uppercase text-center leading-tight mt-0.5 ${finishTextClass}`;
            s3Dot.className = `w-7 h-7 rounded-full flex items-center justify-center border-[3px] border-[#18181b] animate-pulse z-20 ${activeDotClass}`;
            s3Text.className = `text-[8px] font-bold uppercase text-center leading-tight mt-0.5 ${activeTextClass}`;
        } else if (data.status === 'success') {
            line.style.width = "100%";
            line.classList.remove('from-yellow-500'); 
            line.classList.add('from-green-500');
            [s2Dot, s3Dot, s4Dot].forEach(el => el.className = `w-7 h-7 rounded-full flex items-center justify-center border-[3px] border-[#18181b] z-20 ${finishDotClass}`);
            [s2Text, s3Text, s4Text].forEach(el => el.className = `text-[8px] font-bold uppercase text-center leading-tight mt-0.5 ${finishTextClass}`);
        }
    } else {
        tracker.classList.add('hidden');
    }

    // Status Icon & Box Logic
    const statusIcon = document.getElementById('status-icon');
    const statusBg = document.getElementById('status-icon-bg');
    const statusText = document.getElementById('status-text');
    const statusRing = document.getElementById('status-ring');
    const noteBox = document.getElementById('note-box');
    const detailsRow = document.getElementById('details-row');
    const rateBtn = document.getElementById('btn-rate-service');
    const actionArea = document.getElementById('dynamic-action-area'); 

    statusBg.className = "relative z-10 w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl border border-white/10 transition-all duration-500";
    statusRing.classList.add('hidden');
    noteBox.classList.add('hidden');
    detailsRow.classList.add('hidden');
    detailsRow.classList.remove('flex');
    rateBtn.classList.add('hidden');
    actionArea.innerHTML = ''; 

    if (data.status === 'success') {
        statusText.innerText = 'SELESAI';
        statusText.className = "text-2xl font-black tracking-tight uppercase mb-1 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]";
        statusBg.classList.add('bg-green-500', 'text-black', 'shadow-green-500/20');
        statusIcon.className = "ph-fill ph-check-fat text-4xl";
        
        if (data.payment_details && data.payment_details !== '-') {
            detailsRow.classList.remove('hidden');
            detailsRow.classList.add('flex');
            document.getElementById('payment-details').innerText = data.payment_details;
        }

        checkIfRated(data.order_id);

        const orderDate = new Date(data.created_at);
        const diffInHours = (new Date() - orderDate) / (1000 * 60 * 60);

        if (diffInHours <= 24) {
            const message = `Salam Admin, Order ID: ${data.order_id || `TRX-${data.id}`} status SUCCESS tapi item belum masuk. Mohon semakan.`;
            const waLink = `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(message)}`;

            actionArea.innerHTML = `
                <div class="bg-red-500/10 border border-red-500/20 p-3 rounded-xl mb-3 animate-pulse">
                    <div class="flex items-center gap-2 text-red-400 mb-2 justify-center">
                         <i class="ph-fill ph-warning-circle"></i>
                         <span class="text-[10px] font-bold uppercase">Produk Belum Masuk?</span>
                    </div>
                    <a href="${waLink}" target="_blank" class="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3 rounded-lg text-xs transition">
                        <i class="ph-bold ph-whatsapp-logo text-lg"></i> LAPOR KE WHATSAPP
                    </a>
                </div>
            `;
        }

    } else if (data.status === 'canceled' || data.status === 'rejected') {
        const isRejected = data.status === 'rejected';
        statusText.innerText = isRejected ? 'DITOLAK / REJECTED' : 'GAGAL / BATAL';
        statusText.className = "text-2xl font-black tracking-tight uppercase mb-1 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]";
        statusBg.classList.add('bg-red-500', 'text-white', 'shadow-red-500/20');
        statusIcon.className = isRejected ? "ph-fill ph-prohibit text-4xl" : "ph-fill ph-x text-4xl";
        
        if (data.admin_note) {
            noteBox.classList.remove('hidden');
            noteBox.classList.add('flex');
            document.getElementById('note-text').innerText = data.admin_note;
        }

    } else if (data.status === 'processing') {
        statusText.innerText = 'DIPROSES';
        statusText.className = "text-2xl font-black tracking-tight uppercase mb-1 text-blue-400 animate-pulse";
        statusBg.classList.add('bg-blue-600', 'text-white', 'shadow-blue-500/20');
        statusIcon.className = "ph-bold ph-gear-fine text-4xl animate-spin-slow";
        statusRing.classList.remove('hidden');
        statusRing.classList.add('bg-blue-500/30');

    } else { 
        statusText.innerText = 'MENUNGGU';
        statusText.className = "text-2xl font-black tracking-tight uppercase mb-1 text-yellow-400";
        statusBg.classList.add('bg-yellow-500', 'text-black', 'shadow-yellow-500/20');
        statusIcon.className = "ph-fill ph-clock text-4xl";
        statusRing.classList.remove('hidden');

        if (currentUserSession && currentUserSession.id === data.user_id) {
            actionArea.innerHTML = `
                <div class="mb-3">
                    <button onclick="attemptCancelOrder()" id="btn-cancel-receipt" class="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2">
                        <i class="ph-bold ph-trash"></i> BATALKAN ORDER & REFUND
                    </button>
                    <p class="text-[9px] text-gray-500 text-center mt-2">Wang akan dikembalikan ke wallet serta merta.</p>
                </div>
            `;
        }
    }
}

        // --- NEW: CANCEL ORDER FUNCTION ---
        async function attemptCancelOrder() {
            if(!currentData || !currentUserSession) return;
            if(!confirm("Adakah anda pasti mahu membatalkan pesanan ini? Wang akan dikembalikan ke Wallet.")) return;

            const btn = document.getElementById('btn-cancel-receipt');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> MEMPROSES...';
            btn.disabled = true;

            try {
                const { data, error } = await supabaseClient.rpc('user_cancel_order', { target_tx_id: currentData.id, user_uid: currentUserSession.id });
                
                if (error) throw error;

                if (data.success) {
                    showToast(data.message);
                    setTimeout(() => window.location.reload(), 1500); // Reload untuk update status
                } else {
                    showToast(data.message);
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            } catch (err) {
                console.error(err);
                showToast("Ralat sistem. Sila cuba lagi.");
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }

        // --- UPGRADED RATING FUNCTIONS ---
        async function checkIfRated(orderId) {
            const { data } = await supabaseClient.from('reviews').select('id').eq('order_id', orderId).single();
            if(!data) {
                document.getElementById('btn-rate-service').classList.remove('hidden');
                document.getElementById('btn-rate-service').classList.add('flex');
            }
        }

        function openRatingModal() {
            document.getElementById('rating-modal').classList.remove('hidden');
            document.getElementById('rating-modal').classList.add('flex');
            
            if (userProfile && userProfile.username) {
                const nameInput = document.getElementById('rating-name');
                nameInput.value = userProfile.username;
                nameInput.disabled = true; 
                nameInput.classList.add('opacity-50', 'cursor-not-allowed'); 
            }
        }

        function closeRatingModal() {
            document.getElementById('rating-modal').classList.add('hidden');
            document.getElementById('rating-modal').classList.remove('flex');
        }

        function setRating(val) {
            currentRating = val;
            
            const textEl = document.getElementById('rating-text-display');
            textEl.innerText = ratingTexts[val];
            
            if(val <= 2) textEl.className = "text-xs text-red-400 font-bold mt-1";
            else if(val == 3) textEl.className = "text-xs text-yellow-200 font-bold mt-1";
            else textEl.className = "text-xs text-yellow-400 font-bold mt-1";

            const stars = document.querySelectorAll('#star-container i');
            stars.forEach(star => {
                const sVal = parseInt(star.getAttribute('data-val'));
                if (sVal <= val) {
                    star.classList.add('active', 'text-yellow-400');
                    star.classList.remove('text-gray-700');
                } else {
                    star.classList.remove('active', 'text-yellow-400');
                    star.classList.add('text-gray-700');
                }
            });
        }

        function toggleTag(btn, tagName) {
            if (selectedTags.includes(tagName)) {
                selectedTags = selectedTags.filter(t => t !== tagName);
                btn.classList.remove('selected');
            } else {
                selectedTags.push(tagName);
                btn.classList.add('selected');
            }
        }

        async function submitRating() {
            if (currentRating === 0) return showToast("Sila pilih bintang!");
            if (!currentData) return;

            let comment = document.getElementById('rating-comment').value.trim();
            const name = (userProfile && userProfile.username) ? userProfile.username : (document.getElementById('rating-name').value || "Hamba Allah");
            
            if (!comment) {
                const randomIndex = Math.floor(Math.random() * defaultComments.length);
                comment = defaultComments[randomIndex];
            }

            if (selectedTags.length > 0) {
                const tagsStr = selectedTags.join(", ");
                comment += ` [Tags: ${tagsStr}]`;
            }

            const gameName = currentData.item_name.split('-')[0].trim();

            const btn = document.querySelector('#rating-modal button');
            const oriHTML = btn.innerHTML;
            btn.innerHTML = "Processing...";
            btn.disabled = true;

            try {
                const { error } = await supabaseClient.from('reviews').insert({
                    order_id: currentData.order_id,
                    user_id: currentData.user_id, 
                    game_name: gameName,
                    item_name: currentData.item_name,
                    rating: currentRating,
                    comment: comment,
                    display_name: name
                });

                if (error) throw error;

                closeRatingModal();
                document.getElementById('btn-rate-service').classList.add('hidden'); 
                
                if (currentRating >= 4) {
                    launchConfetti();
                    showToast("Terima kasih! Anda memang awesome! 🎉");
                } else {
                    showToast("Terima kasih atas maklum balas.");
                }

            } catch (err) {
                console.error(err);
                showToast("Gagal menghantar rating.");
                btn.innerHTML = oriHTML;
                btn.disabled = false;
            }
        }

        function launchConfetti() {
            var duration = 3 * 1000;
            var animationEnd = Date.now() + duration;
            var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 999 };

            var random = function(min, max) { return Math.random() * (max - min) + min; }

            var interval = setInterval(function() {
                var timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) return clearInterval(interval);

                var particleCount = 50 * (timeLeft / duration);
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 } }));
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 } }));
            }, 250);
        }

        // --- USER ACTIONS ---
        function contactSupport() {
            if(!currentData) return;
            const message = `Hi Admin, saya ada isu dengan Order ID: ${currentData.order_id || currentData.id}. Mohon bantuan.`;
            const url = `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(message)}`;
            window.open(url, '_blank');
        }

        async function shareReceipt() {
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Resit LD SHOP',
                        text: `Resit pembelian ${currentData.item_name} (Order: ${currentData.order_id})`,
                        url: window.location.href
                    });
                } catch (err) {
                    console.log('Error sharing:', err);
                    copyTextStr(window.location.href); 
                }
            } else {
                copyTextStr(window.location.href);
                showToast("Pautan resit disalin!");
            }
        }

        function downloadReceiptImage() {
            const card = document.getElementById('capture-area'); 
            showToast("Menjana gambar...");
            
            html2canvas(card, {
                backgroundColor: null,
                scale: 3, 
                useCORS: true
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `Resit-${currentData.order_id}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(err => {
                console.error(err);
                showToast("Gagal simpan gambar.");
            });
        }

        // --- UTILS ---
        function showError() {
            document.getElementById('loading-state').classList.add('hidden');
            document.getElementById('error-state').classList.remove('hidden');
        }

        function copyText(elementId) {
            const text = document.getElementById(elementId).innerText;
            copyTextStr(text);
        }

        function copyTextStr(text) {
            navigator.clipboard.writeText(text).then(() => {
                showToast("Berjaya disalin!");
            }).catch(() => showToast("Gagal menyalin"));
        }

        function showToast(message) {
            const toast = document.getElementById('toast');
            document.getElementById('toast-msg').innerText = message;
            toast.classList.remove('opacity-0', 'translate-y-[-20px]');
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-[-20px]');
            }, 3000);
        }