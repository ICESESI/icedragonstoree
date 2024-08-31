const basePrices = {
    'free-fire': { 
        Digi: { 5: 0.20, 10: 0.40, 20: 0.80, 50: 2.00, 100: 4.01, 500: 18.00, 1000: 35.00 }, 
        TNG: { 5: 0.21, 10: 0.42, 20: 0.84, 50: 2.10, 100: 4.20, 500: 18.50, 1000: 36.00 } 
    },
    'free-fire2': { 
        Digi: { 5: 0.18, 10: 0.36, 20: 0.72, 50: 1.80, 100: 3.50, 500: 16.00, 1000: 32.00 }, 
        TNG: { 5: 0.19, 10: 0.38, 20: 0.76, 50: 1.90, 100: 3.70, 500: 16.50, 1000: 33.00 } 
    }
};

let selectedPrice = null;

function selectPrice(price, productId) {
    selectedPrice = price;
    updatePrice(productId);
}

function updatePrice(productId) {
    if (selectedPrice !== null) {
        const paymentMethod = document.getElementById(productId + '-payment-method').value;
        const priceElement = document.getElementById(productId + '-price');
        const paymentInfoElement = document.getElementById(productId + '-payment-info');

        const updatedPrice = basePrices[productId][paymentMethod][selectedPrice];
        priceElement.textContent = "Harga: RM " + updatedPrice.toFixed(2);
        priceElement.style.visibility = 'visible';
        paymentInfoElement.style.visibility = 'visible';
    }
}

function getWhatsAppURL(product, idInputId) {
    const priceElement = document.getElementById(product + '-price');
    const price = encodeURIComponent(priceElement.textContent.split('RM ')[1]);
    const id = encodeURIComponent(document.getElementById(idInputId).value);
    const paymentMethod = encodeURIComponent(document.querySelector(`#${product}-payment-method`).value);
    
    if (id === "" || price === "" || paymentMethod === "") {
        alert("Sila masukkan ID anda, pilih jumlah diamond, dan kaedah pembayaran sebelum membeli.");
        return;
    }

    return 'https://wa.me/601135268529?text=' +
        encodeURIComponent('Saya ingin membeli ' + product.replace('-', ' ') + ' sebanyak RM ' + price + '.\n' +
        'ID saya adalah ' + id + '.\n' +
        'Kaedah pembayaran: ' + paymentMethod);
}
