/**
 * KONFIGURASI INPUT GAME (DIKEMASKINI)
 * * Grid System:
 * - Sistem sekarang menggunakan 2 column grid.
 * - "col-span-2" = Lebar penuh (Full width)
 * - "col-span-1" = Separuh lebar (Side by side)
 * * Input Types:
 * - "text"     : Keyboard standard.
 * - "tel"      : Keypad nombor (Lebih baik dari 'number' untuk mobile).
 * - "password" : Teks tersembunyi.
 * * Validasi (Baru):
 * - "minLength" : Angka minimum huruf/nombor.
 * - "maxLength" : Angka maksimum huruf/nombor.
 */

const DEFAULT_INPUT_CONFIG = [
    { 
        label: "User ID", 
        placeholder: "Masukkan User ID", 
        type: "text", 
        width: "col-span-2",
        minLength: 5,
        maxLength: 20
    }
];

const GAME_INPUTS_CONFIG = {
    // --- MOBA GAMES ---
    
    "Mobile Legends": [
        { 
            label: "User ID", 
            placeholder: "Contoh: 12345678", 
            type: "tel", 
            width: "col-span-1", // Separuh (Kiri)
            minLength: 8,
            maxLength: 10
        },
        { 
            label: "Zone ID", 
            placeholder: "1234", 
            type: "tel", 
            width: "col-span-1", // Separuh (Kanan)
            minLength: 3,
            maxLength: 6
        }
    ],

    "Honor of Kings": [
        { 
            label: "Player ID", 
            placeholder: "Contoh: 12345678", 
            type: "tel", 
            width: "col-span-2",
            minLength: 8,
            maxLength: 15
        }
    ],

    "League of Legends: WR": [
        { 
            label: "Riot ID", 
            placeholder: "Nama#TAG", 
            type: "text", 
            width: "col-span-2",
            minLength: 3,
            maxLength: 30
        }
    ],

    // --- BATTLE ROYALE / SHOOTER ---

    "PUBG Mobile": [
        { 
            label: "Player ID", 
            placeholder: "Contoh: 5123456789", 
            type: "tel", 
            width: "col-span-2",
            minLength: 8,
            maxLength: 12
        }
    ],
    
    "Free Fire": [
         { 
            label: "Player ID", 
            placeholder: "Contoh: 123456789", 
            type: "tel", 
            width: "col-span-2",
            minLength: 8,
            maxLength: 12
         }
    ],

    "Call of Duty Mobile": [
        { 
            label: "OpenID / UID", 
            placeholder: "Contoh: 12345678901234567", 
            type: "tel", 
            width: "col-span-2",
            minLength: 10,
            maxLength: 20
        }
    ],

    "Valorant": [
        { 
            label: "Riot ID", 
            placeholder: "Username#TAG", 
            type: "text", 
            width: "col-span-2",
            minLength: 3,
            maxLength: 30
        }
    ],

    // --- RPG / GACHA ---

    "Genshin Impact": [
         { 
            label: "UID", 
            placeholder: "Contoh: 800123456", 
            type: "tel", 
            width: "col-span-1",
            minLength: 9,
            maxLength: 10
         },
         { 
            label: "Server", 
            placeholder: "Asia / America", 
            type: "text", 
            width: "col-span-1",
            minLength: 2,
            maxLength: 15
         }
    ],

    "Honkai: Star Rail": [
        { 
            label: "UID", 
            placeholder: "Contoh: 800123456", 
            type: "tel", 
            width: "col-span-1",
            minLength: 9,
            maxLength: 10
        },
        { 
            label: "Server", 
            placeholder: "Asia", 
            type: "text", 
            width: "col-span-1",
            minLength: 2,
            maxLength: 15
        }
    ],

    "Wuthering Waves": [
        { 
            label: "User ID", 
            placeholder: "Contoh: 900123456", 
            type: "tel", 
            width: "col-span-2",
            minLength: 9,
            maxLength: 10
        }
    ],

    "Black Clover M": [
        { 
            label: "AID", 
            placeholder: "Contoh: 123456789012", 
            type: "tel", 
            width: "col-span-2",
            minLength: 10,
            maxLength: 15
        }
    ],

    // --- STRATEGY / OTHERS ---

    "Clash of Clans": [
        { 
            label: "Player Tag", 
            placeholder: "#PG8V8...", 
            type: "text", 
            width: "col-span-2",
            minLength: 5,
            maxLength: 12
        }
    ],

    "Roblox": [
        { 
            label: "Username / Email", 
            placeholder: "Nama Pengguna Roblox", 
            type: "text",    
            width: "col-span-2",
            minLength: 3,
            maxLength: 50
        },
        { 
            label: "Kata Laluan", 
            placeholder: "********", 
            type: "password", 
            width: "col-span-2",
            minLength: 6,
            maxLength: 100
        },
        { 
            label: "2FA / Backup Code", 
            placeholder: "Kod Backup (Jika 2FA aktif)", 
            type: "text", 
            width: "col-span-2",
            minLength: 4,
            maxLength: 10
        }
    ]
};