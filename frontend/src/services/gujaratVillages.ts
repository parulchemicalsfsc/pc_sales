/**
 * gujaratVillages.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Comprehensive Gujarat Villages, Towns, and Talukas Geolocation Directory
 * with dynamic OpenStreetMap Nominatim live geocoding & multi-tier caching.
 *
 * Covers all 33 Gujarat Districts:
 * - Vadodara, Ahmedabad, Surat, Rajkot, Bhavnagar, Mehsana, Anand, Kheda,
 *   Bharuch, Gandhinagar, Banaskantha, Sabarkantha, Patan, Panchmahal,
 *   Dahod, Valsad, Navsari, Dang, Tapi, Narmada, Chhota Udepur, Mahisagar,
 *   Aravalli, Morbi, Botad, Gir Somnath, Devbhumi Dwarka, Porbandar,
 *   Surendranagar, Jamnagar, Junagadh, Amreli, Kutch.
 *
 * Rules:
 * 1. Fast static lookup across 200+ major Gujarat hubs and villages.
 * 2. Dynamic live geocoding via Nominatim OpenStreetMap for any unlisted village.
 * 3. Results cached in localStorage & memory so every lookup is instant.
 */

export interface VillageGeoItem {
  village_name: string;
  taluka: string;
  district: string;
  latitude: number;
  longitude: number;
}

// ── Comprehensive Static Gujarat Village & Taluka Directory ───────────────────

export const GUJARAT_VILLAGES_REGISTRY: Record<string, VillageGeoItem> = {
  // ── VADODARA DISTRICT ───────────────────────────────────────────────────────
  "gorwa": { village_name: "Gorwa", taluka: "Vadodara", district: "Vadodara", latitude: 22.3364, longitude: 73.1610 },
  "gotri": { village_name: "Gotri", taluka: "Vadodara", district: "Vadodara", latitude: 22.3168, longitude: 73.1492 },
  "bhayli": { village_name: "Bhayli", taluka: "Vadodara", district: "Vadodara", latitude: 22.2905, longitude: 73.1270 },
  "bil": { village_name: "Bil", taluka: "Vadodara", district: "Vadodara", latitude: 22.2600, longitude: 73.1350 },
  "chapad": { village_name: "Chapad", taluka: "Vadodara", district: "Vadodara", latitude: 22.2350, longitude: 73.1650 },
  "samiyala": { village_name: "Samiyala", taluka: "Vadodara", district: "Vadodara", latitude: 22.2450, longitude: 73.1400 },
  "sevasi": { village_name: "Sevasi", taluka: "Vadodara", district: "Vadodara", latitude: 22.3150, longitude: 73.1100 },
  "ampad": { village_name: "Ampad", taluka: "Vadodara", district: "Vadodara", latitude: 22.3250, longitude: 73.0900 },
  "manjalpur": { village_name: "Manjalpur", taluka: "Vadodara", district: "Vadodara", latitude: 22.2680, longitude: 73.1950 },
  "makarpura": { village_name: "Makarpura", taluka: "Vadodara", district: "Vadodara", latitude: 22.2536, longitude: 73.1965 },
  "tarsali": { village_name: "Tarsali", taluka: "Vadodara", district: "Vadodara", latitude: 22.2450, longitude: 73.2100 },
  "alkapuri": { village_name: "Alkapuri", taluka: "Vadodara", district: "Vadodara", latitude: 22.3100, longitude: 73.1700 },
  "karelibagh": { village_name: "Karelibagh", taluka: "Vadodara", district: "Vadodara", latitude: 22.3280, longitude: 73.2050 },
  "bapunagar": { village_name: "Bapunagar", taluka: "Vadodara", district: "Vadodara", latitude: 22.3244, longitude: 73.2086 },
  "warasiya": { village_name: "Warasiya", taluka: "Vadodara", district: "Vadodara", latitude: 22.3260, longitude: 73.2180 },
  "harni": { village_name: "Harni", taluka: "Vadodara", district: "Vadodara", latitude: 22.3380, longitude: 73.2250 },
  "chhani": { village_name: "Chhani", taluka: "Vadodara", district: "Vadodara", latitude: 22.3600, longitude: 73.1800 },
  "bajwa": { village_name: "Bajwa", taluka: "Vadodara", district: "Vadodara", latitude: 22.3800, longitude: 73.1500 },
  "ranoli": { village_name: "Ranoli", taluka: "Vadodara", district: "Vadodara", latitude: 22.4100, longitude: 73.1500 },
  "nandesari": { village_name: "Nandesari", taluka: "Vadodara", district: "Vadodara", latitude: 22.4250, longitude: 73.1200 },
  "koyali": { village_name: "Koyali", taluka: "Vadodara", district: "Vadodara", latitude: 22.3800, longitude: 73.1200 },
  "subhanpura": { village_name: "Subhanpura", taluka: "Vadodara", district: "Vadodara", latitude: 22.3250, longitude: 73.1700 },
  "atladara": { village_name: "Atladara", taluka: "Vadodara", district: "Vadodara", latitude: 22.2780, longitude: 73.1550 },
  "vadsar": { village_name: "Vadsar", taluka: "Vadodara", district: "Vadodara", latitude: 22.2550, longitude: 73.1800 },
  "padra": { village_name: "Padra", taluka: "Padra", district: "Vadodara", latitude: 22.2415, longitude: 73.0848 },
  "savli": { village_name: "Savli", taluka: "Savli", district: "Vadodara", latitude: 22.5600, longitude: 73.2200 },
  "desar": { village_name: "Desar", taluka: "Desar", district: "Vadodara", latitude: 22.6100, longitude: 73.3000 },
  "waghodia": { village_name: "Waghodia", taluka: "Waghodia", district: "Vadodara", latitude: 22.3000, longitude: 73.4200 },
  "jarod": { village_name: "Jarod", taluka: "Waghodia", district: "Vadodara", latitude: 22.4200, longitude: 73.3600 },
  "dabhoi": { village_name: "Dabhoi", taluka: "Dabhoi", district: "Vadodara", latitude: 22.1800, longitude: 73.4300 },
  "karjan": { village_name: "Karjan", taluka: "Karjan", district: "Vadodara", latitude: 22.0500, longitude: 73.1200 },
  "sinor": { village_name: "Sinor", taluka: "Sinor", district: "Vadodara", latitude: 21.9167, longitude: 73.3333 },
  "chandod": { village_name: "Chandod", taluka: "Dabhoi", district: "Vadodara", latitude: 21.9600, longitude: 73.4400 },
  "por": { village_name: "Por", taluka: "Vadodara", district: "Vadodara", latitude: 22.1600, longitude: 73.1800 },
  "varnama": { village_name: "Varnama", taluka: "Vadodara", district: "Vadodara", latitude: 22.1900, longitude: 73.1900 },
  "kayavarohan": { village_name: "Kayavarohan", taluka: "Dabhoi", district: "Vadodara", latitude: 22.0800, longitude: 73.2400 },
  "sadhli": { village_name: "Sadhli", taluka: "Sinor", district: "Vadodara", latitude: 22.1000, longitude: 73.3100 },
  "nimeta": { village_name: "Nimeta", taluka: "Waghodia", district: "Vadodara", latitude: 22.3500, longitude: 73.3400 },
  "ajwa": { village_name: "Ajwa", taluka: "Waghodia", district: "Vadodara", latitude: 22.3700, longitude: 73.3900 },

  // ── BHAVNAGAR & SAURASHTRA ──────────────────────────────────────────────────
  "bhavnagar": { village_name: "Bhavnagar", taluka: "Bhavnagar", district: "Bhavnagar", latitude: 21.7645, longitude: 72.1519 },
  "palitana": { village_name: "Palitana", taluka: "Palitana", district: "Bhavnagar", latitude: 21.5236, longitude: 71.8315 },
  "gariadhar": { village_name: "Gariadhar", taluka: "Gariadhar", district: "Bhavnagar", latitude: 21.5333, longitude: 71.5833 },
  "gadh": { village_name: "Gadh", taluka: "Gariadhar", district: "Bhavnagar", latitude: 21.8000, longitude: 71.5500 },
  "ranghola": { village_name: "Ranghola", taluka: "Umrala", district: "Bhavnagar", latitude: 21.7289, longitude: 71.8795 },
  "umrala": { village_name: "Umrala", taluka: "Umrala", district: "Bhavnagar", latitude: 21.8333, longitude: 71.9000 },
  "sihor": { village_name: "Sihor", taluka: "Sihor", district: "Bhavnagar", latitude: 21.7000, longitude: 71.9700 },
  "songadh": { village_name: "Songadh", taluka: "Sihor", district: "Bhavnagar", latitude: 21.6800, longitude: 71.8800 },
  "talaja": { village_name: "Talaja", taluka: "Talaja", district: "Bhavnagar", latitude: 21.3500, longitude: 72.0500 },
  "mahuva": { village_name: "Mahuva", taluka: "Mahuva", district: "Bhavnagar", latitude: 21.0833, longitude: 71.7667 },
  "vallabhipur": { village_name: "Vallabhipur", taluka: "Vallabhipur", district: "Bhavnagar", latitude: 21.8800, longitude: 71.8700 },
  "jesar": { village_name: "Jesar", taluka: "Jesar", district: "Bhavnagar", latitude: 21.3700, longitude: 71.8000 },
  "ghogha": { village_name: "Ghogha", taluka: "Ghogha", district: "Bhavnagar", latitude: 21.6800, longitude: 72.2800 },
  "alang": { village_name: "Alang", taluka: "Talaja", district: "Bhavnagar", latitude: 21.4100, longitude: 72.1800 },

  // ── MEHSANA & NORTH GUJARAT ─────────────────────────────────────────────────
  "mehsana": { village_name: "Mehsana", taluka: "Mehsana", district: "Mehsana", latitude: 23.6000, longitude: 72.4000 },
  "kadi": { village_name: "Kadi", taluka: "Kadi", district: "Mehsana", latitude: 23.3000, longitude: 72.3300 },
  "visnagar": { village_name: "Visnagar", taluka: "Visnagar", district: "Mehsana", latitude: 23.7000, longitude: 72.5500 },
  "vadnagar": { village_name: "Vadnagar", taluka: "Vadnagar", district: "Mehsana", latitude: 23.7800, longitude: 72.6300 },
  "vijapur": { village_name: "Vijapur", taluka: "Vijapur", district: "Mehsana", latitude: 23.5600, longitude: 72.7500 },
  "becharaji": { village_name: "Becharaji", taluka: "Becharaji", district: "Mehsana", latitude: 23.5005, longitude: 72.0366 },
  "unjha": { village_name: "Unjha", taluka: "Unjha", district: "Mehsana", latitude: 23.8000, longitude: 72.3900 },
  "kheralu": { village_name: "Kheralu", taluka: "Kheralu", district: "Mehsana", latitude: 23.8800, longitude: 72.6200 },
  "satlasana": { village_name: "Satlasana", taluka: "Satlasana", district: "Mehsana", latitude: 23.9800, longitude: 72.7200 },
  "jotana": { village_name: "Jotana", taluka: "Jotana", district: "Mehsana", latitude: 23.4700, longitude: 72.3800 },
  "modhera": { village_name: "Modhera", taluka: "Becharaji", district: "Mehsana", latitude: 23.5800, longitude: 72.1300 },
  "chhatral": { village_name: "Chhatral", taluka: "Kalol", district: "Gandhinagar", latitude: 23.3200, longitude: 72.4500 },
  "nandasan": { village_name: "Nandasan", taluka: "Kadi", district: "Mehsana", latitude: 23.3800, longitude: 72.4200 },

  // ── PATAN DISTRICT ──────────────────────────────────────────────────────────
  "patan": { village_name: "Patan", taluka: "Patan", district: "Patan", latitude: 23.8500, longitude: 72.1300 },
  "sidhpur": { village_name: "Sidhpur", taluka: "Sidhpur", district: "Patan", latitude: 23.9200, longitude: 72.3800 },
  "chanasma": { village_name: "Chanasma", taluka: "Chanasma", district: "Patan", latitude: 23.7200, longitude: 72.1200 },
  "radhanpur": { village_name: "Radhanpur", taluka: "Radhanpur", district: "Patan", latitude: 23.8300, longitude: 71.6000 },
  "harij": { village_name: "Harij", taluka: "Harij", district: "Patan", latitude: 23.7000, longitude: 71.9000 },
  "sami": { village_name: "Sami", taluka: "Sami", district: "Patan", latitude: 23.6300, longitude: 71.7200 },
  "shankheshwar": { village_name: "Shankheshwar", taluka: "Shankheshwar", district: "Patan", latitude: 23.5000, longitude: 71.7800 },
  "santalpur": { village_name: "Santalpur", taluka: "Santalpur", district: "Patan", latitude: 23.8800, longitude: 71.2800 },

  // ── ANAND DISTRICT (CHAROTAR) ───────────────────────────────────────────────
  "anand": { village_name: "Anand", taluka: "Anand", district: "Anand", latitude: 22.5645, longitude: 72.9289 },
  "vallabh vidyanagar": { village_name: "Vallabh Vidyanagar", taluka: "Anand", district: "Anand", latitude: 22.5530, longitude: 72.9230 },
  "karamsad": { village_name: "Karamsad", taluka: "Anand", district: "Anand", latitude: 22.5480, longitude: 72.8980 },
  "petlad": { village_name: "Petlad", taluka: "Petlad", district: "Anand", latitude: 22.4700, longitude: 72.8000 },
  "borsad": { village_name: "Borsad", taluka: "Borsad", district: "Anand", latitude: 22.4100, longitude: 72.9000 },
  "khambhat": { village_name: "Khambhat", taluka: "Khambhat", district: "Anand", latitude: 22.3130, longitude: 72.6190 },
  "sojitra": { village_name: "Sojitra", taluka: "Sojitra", district: "Anand", latitude: 22.5400, longitude: 72.7200 },
  "tarapur": { village_name: "Tarapur", taluka: "Tarapur", district: "Anand", latitude: 22.4900, longitude: 72.6500 },
  "umreth": { village_name: "Umreth", taluka: "Umreth", district: "Anand", latitude: 22.7000, longitude: 73.1200 },
  "anklav": { village_name: "Anklav", taluka: "Anklav", district: "Anand", latitude: 22.3900, longitude: 73.0000 },
  "vasad": { village_name: "Vasad", taluka: "Anand", district: "Anand", latitude: 22.4500, longitude: 73.0800 },
  "dharmaj": { village_name: "Dharmaj", taluka: "Petlad", district: "Anand", latitude: 22.4300, longitude: 72.8100 },
  "bhadran": { village_name: "Bhadran", taluka: "Borsad", district: "Anand", latitude: 22.3600, longitude: 72.9000 },

  // ── KHEDA DISTRICT ──────────────────────────────────────────────────────────
  "nadiad": { village_name: "Nadiad", taluka: "Nadiad", district: "Kheda", latitude: 22.6916, longitude: 72.8634 },
  "kheda": { village_name: "Kheda", taluka: "Kheda", district: "Kheda", latitude: 22.7500, longitude: 72.6800 },
  "kapadvanj": { village_name: "Kapadvanj", taluka: "Kapadvanj", district: "Kheda", latitude: 23.0200, longitude: 73.0700 },
  "mahudha": { village_name: "Mahudha", taluka: "Mahudha", district: "Kheda", latitude: 22.8200, longitude: 72.9300 },
  "matar": { village_name: "Matar", taluka: "Matar", district: "Kheda", latitude: 22.7100, longitude: 72.6600 },
  "mehmedabad": { village_name: "Mehmedabad", taluka: "Mehmedabad", district: "Kheda", latitude: 22.8300, longitude: 72.7600 },
  "thasra": { village_name: "Thasra", taluka: "Thasra", district: "Kheda", latitude: 22.8000, longitude: 73.2000 },
  "dakor": { village_name: "Dakor", taluka: "Thasra", district: "Kheda", latitude: 22.7500, longitude: 73.1500 },
  "vaso": { village_name: "Vaso", taluka: "Vaso", district: "Kheda", latitude: 22.6600, longitude: 72.7600 },
  "kathlal": { village_name: "Kathlal", taluka: "Kathlal", district: "Kheda", latitude: 22.9500, longitude: 72.9800 },

  // ── AHMEDABAD DISTRICT ──────────────────────────────────────────────────────
  "ahmedabad": { village_name: "Ahmedabad", taluka: "Ahmedabad", district: "Ahmedabad", latitude: 23.0225, longitude: 72.5714 },
  "sanand": { village_name: "Sanand", taluka: "Sanand", district: "Ahmedabad", latitude: 22.9900, longitude: 72.3800 },
  "bavla": { village_name: "Bavla", taluka: "Bavla", district: "Ahmedabad", latitude: 22.8300, longitude: 72.3600 },
  "dholka": { village_name: "Dholka", taluka: "Dholka", district: "Ahmedabad", latitude: 22.7200, longitude: 72.4600 },
  "dhandhuka": { village_name: "Dhandhuka", taluka: "Dhandhuka", district: "Ahmedabad", latitude: 22.3700, longitude: 71.9800 },
  "viramgam": { village_name: "Viramgam", taluka: "Viramgam", district: "Ahmedabad", latitude: 23.1200, longitude: 72.0300 },
  "mandal": { village_name: "Mandal", taluka: "Mandal", district: "Ahmedabad", latitude: 23.2800, longitude: 71.9200 },
  "detroj": { village_name: "Detroj", taluka: "Detroj", district: "Ahmedabad", latitude: 23.3300, longitude: 72.1800 },
  "changodar": { village_name: "Changodar", taluka: "Sanand", district: "Ahmedabad", latitude: 22.9200, longitude: 72.4300 },
  "moraiya": { village_name: "Moraiya", taluka: "Sanand", district: "Ahmedabad", latitude: 22.8900, longitude: 72.4100 },
  "bopal": { village_name: "Bopal", taluka: "Daskroi", district: "Ahmedabad", latitude: 23.0300, longitude: 72.4700 },

  // ── GANDHINAGAR DISTRICT ────────────────────────────────────────────────────
  "gandhinagar": { village_name: "Gandhinagar", taluka: "Gandhinagar", district: "Gandhinagar", latitude: 23.2156, longitude: 72.6369 },
  "kalol": { village_name: "Kalol", taluka: "Kalol", district: "Gandhinagar", latitude: 23.2400, longitude: 72.5000 },
  "dehgam": { village_name: "Dehgam", taluka: "Dehgam", district: "Gandhinagar", latitude: 23.1700, longitude: 72.8200 },
  "mansa": { village_name: "Mansa", taluka: "Mansa", district: "Gandhinagar", latitude: 23.4300, longitude: 72.6600 },

  // ── BHARUCH & NARMADA ───────────────────────────────────────────────────────
  "bharuch": { village_name: "Bharuch", taluka: "Bharuch", district: "Bharuch", latitude: 21.7051, longitude: 72.9959 },
  "ankleshwar": { village_name: "Ankleshwar", taluka: "Ankleshwar", district: "Bharuch", latitude: 21.6300, longitude: 73.0000 },
  "jambusar": { village_name: "Jambusar", taluka: "Jambusar", district: "Bharuch", latitude: 22.0500, longitude: 72.8000 },
  "hansot": { village_name: "Hansot", taluka: "Hansot", district: "Bharuch", latitude: 21.5800, longitude: 72.8000 },
  "zaghadia": { village_name: "Zaghadia", taluka: "Zaghadia", district: "Bharuch", latitude: 21.7200, longitude: 73.1500 },
  "vagra": { village_name: "Vagra", taluka: "Vagra", district: "Bharuch", latitude: 21.8500, longitude: 72.8500 },
  "dahej": { village_name: "Dahej", taluka: "Vagra", district: "Bharuch", latitude: 21.7100, longitude: 72.5800 },
  "amod": { village_name: "Amod", taluka: "Amod", district: "Bharuch", latitude: 21.9900, longitude: 72.8700 },
  "valia": { village_name: "Valia", taluka: "Valia", district: "Bharuch", latitude: 21.5800, longitude: 73.1300 },
  "netrang": { village_name: "Netrang", taluka: "Netrang", district: "Bharuch", latitude: 21.6500, longitude: 73.3500 },
  "rajpipla": { village_name: "Rajpipla", taluka: "Nandod", district: "Narmada", latitude: 21.8700, longitude: 73.5700 },
  "dediapada": { village_name: "Dediapada", taluka: "Dediapada", district: "Narmada", latitude: 21.6300, longitude: 73.5900 },
  "sagbara": { village_name: "Sagbara", taluka: "Sagbara", district: "Narmada", latitude: 21.5500, longitude: 73.7800 },
  "tilakwada": { village_name: "Tilakwada", taluka: "Tilakwada", district: "Narmada", latitude: 21.9600, longitude: 73.6100 },
  "kevadia": { village_name: "Kevadia", taluka: "Garudeshwar", district: "Narmada", latitude: 21.8833, longitude: 73.7167 },

  // ── SURAT & SOUTH GUJARAT ───────────────────────────────────────────────────
  "surat": { village_name: "Surat", taluka: "Surat", district: "Surat", latitude: 21.1702, longitude: 72.8311 },
  "bardoli": { village_name: "Bardoli", taluka: "Bardoli", district: "Surat", latitude: 21.1200, longitude: 73.1100 },
  "mandvi (surat)": { village_name: "Mandvi", taluka: "Mandvi", district: "Surat", latitude: 21.2600, longitude: 73.3000 },
  "olpad": { village_name: "Olpad", taluka: "Olpad", district: "Surat", latitude: 21.3300, longitude: 72.7500 },
  "kamrej": { village_name: "Kamrej", taluka: "Kamrej", district: "Surat", latitude: 21.2700, longitude: 72.9600 },
  "palsana": { village_name: "Palsana", taluka: "Palsana", district: "Surat", latitude: 21.0800, longitude: 72.9800 },
  "mangrol (surat)": { village_name: "Mangrol", taluka: "Mangrol", district: "Surat", latitude: 21.4100, longitude: 73.0500 },
  "kosamba": { village_name: "Kosamba", taluka: "Mangrol", district: "Surat", latitude: 21.4800, longitude: 72.9500 },
  "kim": { village_name: "Kim", taluka: "Olpad", district: "Surat", latitude: 21.4000, longitude: 72.9300 },
  "sayan": { village_name: "Sayan", taluka: "Olpad", district: "Surat", latitude: 21.3200, longitude: 72.8800 },
  "kadodara": { village_name: "Kadodara", taluka: "Palsana", district: "Surat", latitude: 21.1700, longitude: 72.9600 },
  "navsari": { village_name: "Navsari", taluka: "Navsari", district: "Navsari", latitude: 20.9500, longitude: 72.9300 },
  "bilimora": { village_name: "Bilimora", taluka: "Gandevi", district: "Navsari", latitude: 20.7600, longitude: 72.9500 },
  "gandevi": { village_name: "Gandevi", taluka: "Gandevi", district: "Navsari", latitude: 20.8100, longitude: 72.9800 },
  "chikhli": { village_name: "Chikhli", taluka: "Chikhli", district: "Navsari", latitude: 20.7500, longitude: 73.0600 },
  "valsad": { village_name: "Valsad", taluka: "Valsad", district: "Valsad", latitude: 20.6000, longitude: 72.9300 },
  "vapi": { village_name: "Vapi", taluka: "Pardi", district: "Valsad", latitude: 20.3700, longitude: 72.9100 },
  "pardi": { village_name: "Pardi", taluka: "Pardi", district: "Valsad", latitude: 20.5100, longitude: 72.9500 },
  "umbergaon": { village_name: "Umbergaon", taluka: "Umbergaon", district: "Valsad", latitude: 20.2000, longitude: 72.7500 },
  "dharampur": { village_name: "Dharampur", taluka: "Dharampur", district: "Valsad", latitude: 20.5400, longitude: 73.1800 },
  "vyara": { village_name: "Vyara", taluka: "Vyara", district: "Tapi", latitude: 21.1100, longitude: 73.4000 },
  "songadh (tapi)": { village_name: "Songadh", taluka: "Songadh", district: "Tapi", latitude: 21.1700, longitude: 73.5600 },
  "ahwa": { village_name: "Ahwa", taluka: "Ahwa", district: "Dang", latitude: 20.7600, longitude: 73.6800 },
  "waghai": { village_name: "Waghai", taluka: "Waghai", district: "Dang", latitude: 20.7700, longitude: 73.5000 },
  "saputara": { village_name: "Saputara", taluka: "Ahwa", district: "Dang", latitude: 20.5800, longitude: 73.7500 },

  // ── PANCHMAHAL, DAHOD & CHHOTA UDEPUR ───────────────────────────────────────
  "godhra": { village_name: "Godhra", taluka: "Godhra", district: "Panchmahal", latitude: 22.7750, longitude: 73.6150 },
  "halol": { village_name: "Halol", taluka: "Halol", district: "Panchmahal", latitude: 22.5000, longitude: 73.4700 },
  "kalol (panchmahal)": { village_name: "Kalol", taluka: "Kalol", district: "Panchmahal", latitude: 22.6100, longitude: 73.4600 },
  "pavagadh": { village_name: "Pavagadh", taluka: "Halol", district: "Panchmahal", latitude: 22.4600, longitude: 73.5200 },
  "shehra": { village_name: "Shehra", taluka: "Shehra", district: "Panchmahal", latitude: 22.9500, longitude: 73.6300 },
  "dahod": { village_name: "Dahod", taluka: "Dahod", district: "Dahod", latitude: 22.8300, longitude: 74.2600 },
  "jhalod": { village_name: "Jhalod", taluka: "Jhalod", district: "Dahod", latitude: 23.1000, longitude: 74.1500 },
  "limkheda": { village_name: "Limkheda", taluka: "Limkheda", district: "Dahod", latitude: 22.8300, longitude: 73.9800 },
  "devgadh baria": { village_name: "Devgadh Baria", taluka: "Devgadh Baria", district: "Dahod", latitude: 22.7000, longitude: 73.9000 },
  "bodeli": { village_name: "Bodeli", taluka: "Bodeli", district: "Chhota Udepur", latitude: 22.2500, longitude: 73.7100 },
  "sankheda": { village_name: "Sankheda", taluka: "Sankheda", district: "Chhota Udepur", latitude: 22.1600, longitude: 73.5800 },
  "chhota udepur": { village_name: "Chhota Udepur", taluka: "Chhota Udepur", district: "Chhota Udepur", latitude: 22.3000, longitude: 74.0100 },
  "jetpur pavi": { village_name: "Jetpur Pavi", taluka: "Jetpur Pavi", district: "Chhota Udepur", latitude: 22.3400, longitude: 73.8000 },
  "lunawada": { village_name: "Lunawada", taluka: "Lunawada", district: "Mahisagar", latitude: 23.1300, longitude: 73.6100 },
  "balasinor": { village_name: "Balasinor", taluka: "Balasinor", district: "Mahisagar", latitude: 22.9500, longitude: 73.3300 },

  // ── RAJKOT & MORBI ──────────────────────────────────────────────────────────
  "rajkot": { village_name: "Rajkot", taluka: "Rajkot", district: "Rajkot", latitude: 22.3039, longitude: 70.8022 },
  "gondal": { village_name: "Gondal", taluka: "Gondal", district: "Rajkot", latitude: 21.9600, longitude: 70.8000 },
  "jetpur": { village_name: "Jetpur", taluka: "Jetpur", district: "Rajkot", latitude: 21.7500, longitude: 70.7800 },
  "dhoraji": { village_name: "Dhoraji", taluka: "Dhoraji", district: "Rajkot", latitude: 21.7300, longitude: 70.4500 },
  "upleta": { village_name: "Upleta", taluka: "Upleta", district: "Rajkot", latitude: 21.7300, longitude: 70.2800 },
  "jasdan": { village_name: "Jasdan", taluka: "Jasdan", district: "Rajkot", latitude: 22.0300, longitude: 71.2000 },
  "shapar": { village_name: "Shapar", taluka: "Kotda Sangani", district: "Rajkot", latitude: 22.1800, longitude: 70.7800 },
  "morbi": { village_name: "Morbi", taluka: "Morbi", district: "Morbi", latitude: 22.8200, longitude: 70.8300 },
  "wankaner": { village_name: "Wankaner", taluka: "Wankaner", district: "Morbi", latitude: 22.6100, longitude: 70.9300 },
  "halvad": { village_name: "Halvad", taluka: "Halvad", district: "Morbi", latitude: 23.0100, longitude: 71.1800 },

  // ── JUNAGADH, GIR SOMNATH & AMRELI ──────────────────────────────────────────
  "junagadh": { village_name: "Junagadh", taluka: "Junagadh", district: "Junagadh", latitude: 21.5222, longitude: 70.4579 },
  "keshod": { village_name: "Keshod", taluka: "Keshod", district: "Junagadh", latitude: 21.3000, longitude: 70.2500 },
  "mangrol (junagadh)": { village_name: "Mangrol", taluka: "Mangrol", district: "Junagadh", latitude: 21.1200, longitude: 70.1200 },
  "manavadar": { village_name: "Manavadar", taluka: "Manavadar", district: "Junagadh", latitude: 21.5000, longitude: 70.1300 },
  "visavadar": { village_name: "Visavadar", taluka: "Visavadar", district: "Junagadh", latitude: 21.3800, longitude: 70.7000 },
  "veraval": { village_name: "Veraval", taluka: "Veraval", district: "Gir Somnath", latitude: 20.9000, longitude: 70.3700 },
  "somnath": { village_name: "Somnath", taluka: "Veraval", district: "Gir Somnath", latitude: 20.8880, longitude: 70.4010 },
  "talala": { village_name: "Talala", taluka: "Talala", district: "Gir Somnath", latitude: 21.0500, longitude: 70.5200 },
  "kodinar": { village_name: "Kodinar", taluka: "Kodinar", district: "Gir Somnath", latitude: 20.7900, longitude: 70.7000 },
  "una": { village_name: "Una", taluka: "Una", district: "Gir Somnath", latitude: 20.8200, longitude: 71.0300 },
  "amreli": { village_name: "Amreli", taluka: "Amreli", district: "Amreli", latitude: 21.6000, longitude: 71.2200 },
  "babra": { village_name: "Babra", taluka: "Babra", district: "Amreli", latitude: 21.8500, longitude: 71.3000 },
  "dhari": { village_name: "Dhari", taluka: "Dhari", district: "Amreli", latitude: 21.3200, longitude: 71.0200 },
  "bagasara": { village_name: "Bagasara", taluka: "Bagasara", district: "Amreli", latitude: 21.4800, longitude: 70.9800 },
  "rajula": { village_name: "Rajula", taluka: "Rajula", district: "Amreli", latitude: 20.9800, longitude: 71.4300 },
  "jafrabad": { village_name: "Jafrabad", taluka: "Jafrabad", district: "Amreli", latitude: 20.8700, longitude: 71.3700 },
  "savarkundla": { village_name: "Savarkundla", taluka: "Savarkundla", district: "Amreli", latitude: 21.3300, longitude: 71.3000 },
  "lathi": { village_name: "Lathi", taluka: "Lathi", district: "Amreli", latitude: 21.7200, longitude: 71.3800 },
  "botad": { village_name: "Botad", taluka: "Botad", district: "Botad", latitude: 22.1700, longitude: 71.6700 },
  "gadhada": { village_name: "Gadhada", taluka: "Gadhada", district: "Botad", latitude: 21.9700, longitude: 71.5700 },

  // ── JAMNAGAR, DWARKA & PORBANDAR ───────────────────────────────────────────
  "jamnagar": { village_name: "Jamnagar", taluka: "Jamnagar", district: "Jamnagar", latitude: 22.4707, longitude: 70.0577 },
  "dhrol": { village_name: "Dhrol", taluka: "Dhrol", district: "Jamnagar", latitude: 22.5700, longitude: 70.4200 },
  "kalavad": { village_name: "Kalavad", taluka: "Kalavad", district: "Jamnagar", latitude: 22.2100, longitude: 70.3800 },
  "khambhalia": { village_name: "Khambhalia", taluka: "Khambhalia", district: "Devbhumi Dwarka", latitude: 22.2000, longitude: 69.6500 },
  "dwarka": { village_name: "Dwarka", taluka: "Dwarka", district: "Devbhumi Dwarka", latitude: 22.2442, longitude: 68.9685 },
  "bhanvad": { village_name: "Bhanvad", taluka: "Bhanvad", district: "Devbhumi Dwarka", latitude: 21.9300, longitude: 69.7800 },
  "porbandar": { village_name: "Porbandar", taluka: "Porbandar", district: "Porbandar", latitude: 21.6417, longitude: 69.6293 },
  "ranavav": { village_name: "Ranavav", taluka: "Ranavav", district: "Porbandar", latitude: 21.6800, longitude: 69.7500 },

  // ── SURENDRANAGAR DISTRICT ──────────────────────────────────────────────────
  "surendranagar": { village_name: "Surendranagar", taluka: "Wadhwan", district: "Surendranagar", latitude: 22.7268, longitude: 71.6370 },
  "wadhwan": { village_name: "Wadhwan", taluka: "Wadhwan", district: "Surendranagar", latitude: 22.7000, longitude: 71.6800 },
  "dhrangadhra": { village_name: "Dhrangadhra", taluka: "Dhrangadhra", district: "Surendranagar", latitude: 22.9800, longitude: 71.4700 },
  "limbdi": { village_name: "Limbdi", taluka: "Limbdi", district: "Surendranagar", latitude: 22.5700, longitude: 71.8000 },
  "chotila": { village_name: "Chotila", taluka: "Chotila", district: "Surendranagar", latitude: 22.4200, longitude: 71.1800 },
  "patdi": { village_name: "Patdi", taluka: "Dasada", district: "Surendranagar", latitude: 23.1800, longitude: 71.8000 },
  "thangadh": { village_name: "Thangadh", taluka: "Thangadh", district: "Surendranagar", latitude: 22.5800, longitude: 71.2000 },

  // ── KUTCH DISTRICT ──────────────────────────────────────────────────────────
  "bhuj": { village_name: "Bhuj", taluka: "Bhuj", district: "Kutch", latitude: 23.2420, longitude: 69.6669 },
  "gandhidham": { village_name: "Gandhidham", taluka: "Gandhidham", district: "Kutch", latitude: 23.0800, longitude: 70.1300 },
  "anjar": { village_name: "Anjar", taluka: "Anjar", district: "Kutch", latitude: 23.1100, longitude: 70.0300 },
  "mandvi (kutch)": { village_name: "Mandvi", taluka: "Mandvi", district: "Kutch", latitude: 22.8100, longitude: 69.3600 },
  "mundra": { village_name: "Mundra", taluka: "Mundra", district: "Kutch", latitude: 22.8400, longitude: 69.7300 },
  "nakhatrana": { village_name: "Nakhatrana", taluka: "Nakhatrana", district: "Kutch", latitude: 23.3500, longitude: 69.2700 },
  "bhachau": { village_name: "Bhachau", taluka: "Bhachau", district: "Kutch", latitude: 23.2900, longitude: 70.3500 },
  "rapar": { village_name: "Rapar", taluka: "Rapar", district: "Kutch", latitude: 23.5700, longitude: 70.6300 },
};

// ── Multi-tier Village Coordinate Lookup ──────────────────────────────────────

const DYNAMIC_CACHE_KEY = "aura_gujarat_dynamic_villages_v1";

function getDynamicCache(): Record<string, VillageGeoItem> {
  try {
    const raw = localStorage.getItem(DYNAMIC_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDynamicCache(item: VillageGeoItem) {
  try {
    const current = getDynamicCache();
    current[item.village_name.toLowerCase().trim()] = item;
    localStorage.setItem(DYNAMIC_CACHE_KEY, JSON.stringify(current));
  } catch {}
}

/**
 * Fast synchronous lookup in static registry + dynamic local cache.
 */
export function lookupVillageFast(villageName: string): VillageGeoItem | null {
  if (!villageName) return null;
  const key = villageName.toLowerCase().trim();

  // 1. Direct hit in static registry
  if (GUJARAT_VILLAGES_REGISTRY[key]) {
    return GUJARAT_VILLAGES_REGISTRY[key];
  }

  // 2. Direct hit in dynamic cache
  const dynCache = getDynamicCache();
  if (dynCache[key]) {
    return dynCache[key];
  }

  // 3. Partial substring match in static registry (e.g. "Bhayli village" matches "bhayli")
  for (const [k, v] of Object.entries(GUJARAT_VILLAGES_REGISTRY)) {
    if (key.includes(k) || (k.length >= 4 && k.includes(key))) {
      return v;
    }
  }

  // 4. Partial substring in dynamic cache
  for (const [k, v] of Object.entries(dynCache)) {
    if (key.includes(k) || (k.length >= 4 && k.includes(key))) {
      return v;
    }
  }

  return null;
}

/**
 * Asynchronous resolver:
 * 1. Checks fast registry & cache.
 * 2. If not found, dynamically queries OpenStreetMap Nominatim API for exact Gujarat coordinates.
 * 3. Saves to cache and returns coordinates.
 */
export async function resolveVillageLocation(
  villageName: string,
  taluka?: string
): Promise<VillageGeoItem | null> {
  const cleanName = (villageName || "").trim();
  if (!cleanName) return null;

  // 1. Check existing fast cache
  const cached = lookupVillageFast(cleanName);
  if (cached) return cached;

  // 2. Query OpenStreetMap Nominatim for accurate Gujarat village coordinates
  try {
    const queryParts = [cleanName];
    if (taluka && taluka.trim()) queryParts.push(taluka.trim());
    queryParts.push("Gujarat", "India");
    const query = encodeURIComponent(queryParts.join(", "));

    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: {
        "Accept-Language": "en",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          const resolvedItem: VillageGeoItem = {
            village_name: cleanName,
            taluka: taluka || "Gujarat",
            district: "Gujarat",
            latitude: lat,
            longitude: lng,
          };
          saveDynamicCache(resolvedItem);
          return resolvedItem;
        }
      }
    }
  } catch (err) {
    console.warn(`[VillageGeo] Dynamic geocoding failed for ${cleanName}:`, err);
  }

  return null;
}

/**
 * Return all registered village names for autocomplete and suggestions
 */
export function getAllGujaratVillageNames(): string[] {
  const staticNames = Object.values(GUJARAT_VILLAGES_REGISTRY).map((v) => v.village_name);
  const dynNames = Object.values(getDynamicCache()).map((v) => v.village_name);
  return Array.from(new Set([...staticNames, ...dynNames])).sort((a, b) => a.localeCompare(b));
}
