// CONFIGURATION
const supabaseUrl = 'https://bgajuffwueesfibkdtvo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYWp1ZmZ3dWVlc2ZpYmtkdHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTE5OTksImV4cCI6MjA4MTk4Nzk5OX0.xCkGSeV0YvW5Zf3mKvJYNEUB40H4tP-osuxlQ_ra34M';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let allUsers = [];
let filteredUsers = [];
let currentUserEdit = null;
let currentFilter = 'all';

// UTILS
const fmtRM = (val) => `RM ${parseFloat(val || 0).toFixed(2)}`;
const showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
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
};

// INITIALIZATION
window.onload = async () => {
    await checkAdminAccess();
    await loadUsers();
};

async function checkAdminAccess() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        document.getElementById('unauthorized-msg').classList.remove('hidden');
        document.getElementById('unauthorized-msg').classList.add('flex');
        return;
    }

    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    
    if (!profile || profile.role !== 'admin') {
        document.getElementById('unauthorized-msg').classList.remove('hidden');
        document.getElementById('unauthorized-msg').classList.add('flex');
    }
}

// LOAD DATA
async function loadUsers() {
    const loader = document.getElementById('loading-indicator');
    const noResult = document.getElementById('no-results');
    
    loader.classList.remove('hidden');
    noResult.classList.add('hidden');
    document.getElementById('user-table-body').innerHTML = '';

    try {
        // PERUBAHAN UTAMA DI SINI:
        // Saya membuang .order('created_at') yang menyebabkan error 42703
        // Saya menggantikannya dengan susunan 'id' (ascending) untuk stabil, 
        // atau anda boleh padam .order() sepenuhnya.
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*');
            // .order('wallet_balance', { ascending: false }); // Optional: Boleh uncomment jika nak susun ikut baki

        if (error) throw error;

        allUsers = data;
        updateStats();
        filterUsers(); // Initial render

    } catch (err) {
        console.error(err);
        showToast("Gagal memuatkan data pengguna: " + err.message, "error");
    } finally {
        loader.classList.add('hidden');
    }
}

// RENDER & FILTER
function updateStats() {
    const totalUsers = allUsers.length;
    const totalWallet = allUsers.reduce((sum, u) => sum + (u.wallet_balance || 0), 0);
    
    // Risk Calculation: Banned Users OR Users with Balance > RM 500
    const riskUsers = allUsers.filter(u => u.is_banned || u.wallet_balance > 500).length;

    document.getElementById('stat-total-users').innerText = totalUsers;
    document.getElementById('stat-total-wallet').innerText = fmtRM(totalWallet);
    document.getElementById('stat-flagged-users').innerText = riskUsers;
    
    // Animate Risk Color
    const riskStat = document.getElementById('stat-flagged-users');
    if(riskUsers > 0) riskStat.classList.add('text-red-500');
    else riskStat.classList.remove('text-red-500');
}

function setFilter(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`filter-${type}`).classList.add('active');
    filterUsers();
}

function filterUsers() {
    const search = document.getElementById('user-search').value.toLowerCase();
    
    filteredUsers = allUsers.filter(user => {
        // Text Search
        const name = (user.username || '').toLowerCase();
        const email = (user.email || '').toLowerCase(); 
        const id = (user.id || '').toLowerCase();
        const phone = (user.phone || '').toLowerCase();
        
        // Handle kes di mana column mungkin null
        const matchesSearch = name.includes(search) || email.includes(search) || id.includes(search) || phone.includes(search);

        // Category Filter
        let matchesFilter = true;
        if (currentFilter === 'admin') matchesFilter = user.role === 'admin';
        else if (currentFilter === 'banned') matchesFilter = user.is_banned === true;
        else if (currentFilter === 'rich') matchesFilter = user.wallet_balance > 500;

        return matchesSearch && matchesFilter;
    });

    renderTable(filteredUsers);
}

function renderTable(users) {
    const tbody = document.getElementById('user-table-body');
    const noResult = document.getElementById('no-results');
    tbody.innerHTML = '';

    if (users.length === 0) {
        noResult.classList.remove('hidden');
        return;
    }
    noResult.classList.add('hidden');

    tbody.innerHTML = users.map(user => {
        const avatar = user.avatar_url || `https://ui-avatars.com/api/?name=${user.username || 'User'}&background=random`;
        const roleBadge = user.role === 'admin' 
            ? `<span class="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] px-1.5 py-0.5 rounded font-bold">ADMIN</span>` 
            : `<span class="bg-gray-700/50 text-gray-400 border border-gray-600/30 text-[9px] px-1.5 py-0.5 rounded font-bold">USER</span>`;
        
        const statusBadge = user.is_banned 
            ? `<span class="badge-banned text-[10px] px-2 py-1 rounded font-bold flex items-center gap-1 w-fit"><i class="ph-fill ph-prohibit"></i> BANNED</span>` 
            : `<span class="badge-active text-[10px] px-2 py-1 rounded font-bold flex items-center gap-1 w-fit"><i class="ph-fill ph-check-circle"></i> AKTIF</span>`;

        // Risk Highlight in Row
        const isRisk = user.wallet_balance > 500;
        const balanceColor = isRisk ? 'text-green-400 font-black' : 'text-white font-bold';
        const riskIndicator = isRisk ? '<i class="ph-fill ph-warning text-yellow-500 ml-1" title="High Balance Risk"></i>' : '';

        return `
            <tr class="user-row border-b border-white/5 transition hover:bg-white/5">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <img src="${avatar}" class="w-10 h-10 rounded-full bg-black border border-white/10 object-cover">
                        <div>
                            <div class="font-bold text-white text-xs md:text-sm truncate max-w-[150px]">${user.username || 'No Name'}</div>
                            <div class="text-[10px] text-gray-500 font-mono truncate max-w-[150px]">${user.id}</div>
                        </div>
                    </div>
                </td>
                <td class="p-4">${roleBadge}</td>
                <td class="p-4">
                    <div class="${balanceColor} text-xs font-mono flex items-center">
                        ${fmtRM(user.wallet_balance)} ${riskIndicator}
                    </div>
                </td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-right">
                    <button onclick="openEditModal('${user.id}')" class="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition border border-white/5 shadow-sm">
                        <i class="ph-bold ph-pencil-simple"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ACTION: OPEN EDIT MODAL
async function openEditModal(userId) {
    const user = allUsers.find(u => u.id === userId);
    if(!user) return;

    currentUserEdit = user;
    const modal = document.getElementById('edit-user-modal');
    
    // Populate Data
    document.getElementById('modal-user-avatar').src = user.avatar_url || `https://ui-avatars.com/api/?name=${user.username || 'User'}`;
    document.getElementById('modal-user-email').innerText = user.username || 'User';
    document.getElementById('modal-user-id').innerText = user.id;
    document.getElementById('modal-current-balance').innerText = fmtRM(user.wallet_balance);
    
    // Inputs
    document.getElementById('wallet-action').value = 'add';
    document.getElementById('wallet-amount').value = '';
    document.getElementById('modal-role').value = user.role;
    document.getElementById('modal-is-banned').checked = user.is_banned;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// ACTION: SAVE CHANGES
async function saveUserChanges() {
    if(!currentUserEdit) return;
    
    const btn = document.getElementById('btn-save-user');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> MEMPROSES...`;
    btn.disabled = true;

    try {
        const updates = {};
        let logMessage = `Admin Update User [${currentUserEdit.username}]: `;

        // 1. Handle Role & Ban
        const newRole = document.getElementById('modal-role').value;
        const newBanStatus = document.getElementById('modal-is-banned').checked;
        
        if(newRole !== currentUserEdit.role) {
            updates.role = newRole;
            logMessage += `Role changed to ${newRole}. `;
        }
        if(newBanStatus !== currentUserEdit.is_banned) {
            updates.is_banned = newBanStatus;
            logMessage += `Ban status changed to ${newBanStatus}. `;
        }

        // 2. Handle Wallet
        const action = document.getElementById('wallet-action').value;
        const amountStr = document.getElementById('wallet-amount').value;
        let newBalance = parseFloat(currentUserEdit.wallet_balance);
        
        if (amountStr && !isNaN(amountStr)) {
            const amount = parseFloat(amountStr);
            if(action === 'add') newBalance += amount;
            else if(action === 'subtract') newBalance -= amount;
            else if(action === 'set') newBalance = amount;

            if(newBalance < 0) newBalance = 0; // Prevent negative
            updates.wallet_balance = newBalance;
            logMessage += `Wallet updated (${action} ${amount}). New Bal: ${newBalance}.`;
            
            // Log to wallet_logs (Important for auditing)
            await supabaseClient.from('wallet_logs').insert({
                user_id: currentUserEdit.id,
                amount: action === 'subtract' ? -amount : amount,
                type: 'admin_adjustment', // Custom type
                description: `Admin Adjustment: ${action} RM${amount}`
            });
        }

        // 3. Perform Update
        if (Object.keys(updates).length > 0) {
            const { error } = await supabaseClient.from('profiles').update(updates).eq('id', currentUserEdit.id);
            if (error) throw error;
            
            showToast("Data pengguna berjaya dikemaskini!", "success");
            closeModal('edit-user-modal');
            await loadUsers(); // Refresh table
        } else {
            showToast("Tiada perubahan dikesan.", "info");
        }

    } catch (err) {
        console.error(err);
        showToast("Ralat kemaskini: " + err.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ACTION: RESET PIN
async function resetUserPin() {
    if(!currentUserEdit) return;
    if(!confirm("Adakah anda pasti mahu reset PIN pengguna ini kepada '123456'?")) return;

    try {
        const { error } = await supabaseClient.from('profiles').update({ security_pin: '123456' }).eq('id', currentUserEdit.id);
        if(error) throw error;
        showToast("PIN berjaya direset ke 123456", "success");
    } catch (err) {
        showToast("Gagal reset PIN", "error");
    }
}

// UTILITY UI
function closeModal(id) {
    const el = document.getElementById(id);
    if(el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
    }
}

// Tutup modal bila klik luar
window.onclick = function(event) {
    const modal = document.getElementById('edit-user-modal');
    if (event.target == modal) closeModal('edit-user-modal');
}