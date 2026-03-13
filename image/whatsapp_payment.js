// js/whatsapp_payment.js

// --- CONFIGURATION ---
const ADMIN_WHATSAPP_NUMBER = "601135268529"; // No Admin (tanpa +)
// URL QR Code Default (Jika payment method tiada gambar QR)
const DEFAULT_QR_URL = "https://placehold.co/200x200/png?text=QR+Code"; 

// Global variables untuk simpan data sementara
let tempWaProduct = null;
let tempWaQty = 0;
let tempWaConfig = [];
let tempWaPrice = 0;

// 1. Function dipanggil dari topup.js (Hanya buka modal)
function openWhatsAppPaymentModal(product, quantity, inputConfig, totalPrice, paymentDetails) {
    // Simpan data ke variable global
    tempWaProduct = product;
    tempWaQty = quantity;
    tempWaConfig = inputConfig;
    tempWaPrice = totalPrice;

    // Reset UI Modal
    document.getElementById('wa-display-price').innerText = `RM ${totalPrice.toFixed(2)}`;
    document.getElementById('wa-pin-input').value = '';
    
    // Set QR Image jika ada dalam database, jika tiada guna default
    const qrImgEl = document.getElementById('wa-qr-image');
    if (qrImgEl) {
        // paymentDetails.qr_image datang dari table payment_methods
        qrImgEl.src = (paymentDetails && paymentDetails.qr_image) ? paymentDetails.qr_image : DEFAULT_QR_URL;
    }

    // Default ke Tab QR
    switchWaTab('qr');

    // Buka Modal
    const modal = document.getElementById('whatsapp-payment-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

// 2. Logic Tukar Tab (QR vs PIN)
function switchWaTab(mode) {
    const btnQr = document.getElementById('btn-tab-qr');
    const btnPin = document.getElementById('btn-tab-pin');
    const contentQr = document.getElementById('wa-content-qr');
    const contentPin = document.getElementById('wa-content-pin');

    if (mode === 'qr') {
        // UI Button Style
        btnQr.className = "py-2.5 rounded-lg text-xs font-bold transition-all border border-transparent bg-white/10 text-white shadow-sm";
        btnPin.className = "py-2.5 rounded-lg text-xs font-bold transition-all border border-transparent text-gray-500 hover:text-gray-300";
        
        // Show/Hide Content
        contentQr.classList.remove('hidden');
        contentQr.classList.add('flex');
        contentPin.classList.add('hidden');
        contentPin.classList.remove('flex');
    } else {
        // UI Button Style
        btnQr.className = "py-2.5 rounded-lg text-xs font-bold transition-all border border-transparent text-gray-500 hover:text-gray-300";
        btnPin.className = "py-2.5 rounded-lg text-xs font-bold transition-all border border-transparent bg-white/10 text-white shadow-sm";

        // Show/Hide Content
        contentQr.classList.add('hidden');
        contentQr.classList.remove('flex');
        contentPin.classList.remove('hidden');
        contentPin.classList.add('flex');
        
        // Auto focus input PIN
        setTimeout(() => document.getElementById('wa-pin-input').focus(), 100);
    }
}

// 3. Logic Hantar ke WhatsApp
function submitWaPayment(type) {
    
    let additionalInfo = "";
    let headerText = "";

    // A. Logic jika user pilih QR
    if (type === 'qr') {
        headerText = "*SAYA DAH TRANSFER (QR)*";
        additionalInfo = "Sila lihat bukti resit (screenshot) yang saya sertakan ini.";
    } 
    // B. Logic jika user pilih PIN
    else if (type === 'pin') {
        const pinCode = document.getElementById('wa-pin-input').value.trim();
        
        // Validation: Pastikan PIN diisi
        if (!pinCode) {
            alert("Sila masukkan TnG PIN anda!"); // Atau guna showToast jika ada akses
            document.getElementById('wa-pin-input').focus();
            return;
        }

        headerText = "*SAYA NAK BAYAR GUNA PIN*";
        additionalInfo = `*TnG PIN:* ${pinCode}`;
    }

    // Prepare User Details String
    let userDetails = "";
    tempWaConfig.forEach((field, index) => {
        const inputId = `dynamic-input-${index}`;
        const val = document.getElementById(inputId)?.value || "-";
        userDetails += `${field.label}: ${val}\n`;
    });

    // Prepare WhatsApp Number
    const userWhatsapp = document.getElementById('whatsapp-input')?.value || "Tidak dinyatakan";
    const refID = 'WA-' + Math.floor(Math.random() * 1000000);

    // Format Mesej Akhir
    const message = `
${headerText} ------------------
*Game:* ${tempWaProduct.game_name}
*Item:* ${tempWaProduct.item_name}
*Qty:* ${tempWaQty}
*Total:* RM ${tempWaPrice.toFixed(2)}
---------------------------
*MAKLUMAT AKAUN:*
${userDetails}
*No. WhatsApp:* ${userWhatsapp}
*Ref ID:* ${refID}
---------------------------
${additionalInfo}
`.trim();

    // Tutup Modal
    const modal = document.getElementById('whatsapp-payment-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // Redirect ke WhatsApp
    const encodedMessage = encodeURIComponent(message);
    const waLink = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodedMessage}`;
    window.open(waLink, '_blank');
}