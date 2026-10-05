/* ============================================================
   firebase-config.js — Konfigurasi project Firebase kamu
   ============================================================
   Fitur Akun & Sinkronisasi Cloud bersifat OPSIONAL. Tanpa file
   ini diisi, aplikasi tetap berjalan normal 100% offline seperti
   biasa — hanya menu "Akun" yang tidak akan berfungsi.

   CARA MENGISI (gratis, ±5 menit):
   1. Buka https://console.firebase.google.com → "Add project"
      → beri nama bebas (mis. "buku-kas-saya") → lanjutkan sampai selesai.
   2. Di dashboard project → klik ikon web "</>" → daftarkan app
      (nama bebas) → Firebase akan menampilkan kode "firebaseConfig".
      Salin isinya ke bawah ini, menggantikan nilai contoh.
   3. Di menu kiri Firebase Console → "Authentication" → tab
      "Sign-in method" → aktifkan "Email/Password" dan "Google".
   4. Di menu kiri → "Firestore Database" → "Create database"
      → pilih mode "Start in production mode" (aturan akses sudah
      diatur lewat Firestore Rules, lihat README-FIREBASE.md).
   5. Jika app ini kamu hosting online (Netlify/dll), tambahkan
      domainnya di Authentication → Settings → Authorized domains.
   ============================================================ */

const firebaseConfig = {
  apiKey: "GANTI_DENGAN_API_KEY_KAMU",
  authDomain: "GANTI.firebaseapp.com",
  projectId: "GANTI_PROJECT_ID",
  storageBucket: "GANTI.appspot.com",
  messagingSenderId: "GANTI_SENDER_ID",
  appId: "GANTI_APP_ID"
};

window.BUKUKAS_FIREBASE_READY = false;

(function initFirebase() {
  const isPlaceholder = firebaseConfig.apiKey === "GANTI_DENGAN_API_KEY_KAMU";
  if (isPlaceholder) {
    console.warn('[Buku Kas] firebase-config.js belum diisi — fitur Akun & Sinkronisasi Cloud dinonaktifkan. Lihat petunjuk di dalam file ini.');
    return;
  }
  if (typeof firebase === 'undefined') {
    console.warn('[Buku Kas] SDK Firebase gagal dimuat (cek koneksi internet).');
    return;
  }
  try {
    firebase.initializeApp(firebaseConfig);
    window.BUKUKAS_FIREBASE_READY = true;
  } catch (e) {
    console.error('[Buku Kas] Gagal inisialisasi Firebase:', e);
  }
})();
