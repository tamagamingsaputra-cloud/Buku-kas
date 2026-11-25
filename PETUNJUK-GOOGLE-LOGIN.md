# Menyalakan Login Google di APK

APK ini memakai login Google native. Kamu perlu 2 hal dari Firebase (sekali saja):

1. Buka https://console.firebase.google.com -> project **buku-kas-7d577** -> Project settings -> **Add app -> Android**.
   - Package name: `com.bukukass.app`
   - SHA-1: `62:D9:FB:CF:38:C7:5A:70:C8:52:9F:2A:E1:2F:35:8A:85:05:49:1D`
     (milik file `debug.keystore` di repo ini, dipakai tetap tiap build)
2. Unduh **google-services.json**, taruh di ROOT repo (sejajar dengan package.json).
3. Pastikan Authentication -> Sign-in method -> **Google** sudah Enabled.
4. Push ke GitHub -> tab Actions -> Build APK -> unduh artifact **BukuKas-apk**.

Catatan:
- Jika setelah menambah app Android kamu mengunduh google-services.json lagi, pakai yang terbaru.
- Jadikan repo **Private**, karena `debug.keystore` ikut tersimpan di repo.
- Login email/password tetap jalan tanpa langkah di atas, tapi build akan berhenti jika google-services.json belum ada.
