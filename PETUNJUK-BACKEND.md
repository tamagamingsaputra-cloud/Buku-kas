# Petunjuk Backend (Asisten AI Kasbot + Keluarga)

Aplikasi TETAP jalan penuh tanpa langkah ini (offline). Langkah ini hanya untuk
mengaktifkan: **Kasbot AI online** dan **aturan keamanan Keluarga**.
Tanpa ini, Kasbot tetap menjawab memakai mode dasar (offline).

## 1. Upgrade Firebase ke Blaze
Firebase Console → proyek kamu → Usage and billing → ubah ke **Blaze** (bayar sesuai pakai,
ada kuota gratis; wajib agar Cloud Functions bisa dipasang).

## 2. Buat Service Account
Google Cloud Console → IAM & Admin → Service Accounts → Create.
Beri peran: **Editor**, **Secret Manager Admin**, **Cloud Functions Admin**,
**Service Account User**, **Firebase Rules Admin**. Lalu Keys → Add key → JSON (file terunduh).

## 3. Isi Secret di GitHub
Repo `Buku-kas` → Settings → Secrets and variables → Actions → New repository secret:
- `FIREBASE_SERVICE_ACCOUNT` = seluruh isi file JSON tadi
- `ANTHROPIC_API_KEY` = kunci API Anthropic kamu

## 4. Jalankan Deploy
Tab **Actions** → **Deploy Backend** → Run workflow. Ini memasang:
- fungsi `askAssistant` (region asia-southeast2, kunci disimpan di server, kuota 40 tanya/hari/pengguna)
- `firestore.rules` (menggantikan aturan lama; sudah mencakup `users/{uid}` untuk cadangan,
  serta `families` untuk fitur Keluarga)

Model default `claude-haiku-5-5`; ubah dengan env `AI_MODEL` di functions bila perlu.
Alamat fungsi otomatis dari projectId; kalau berbeda, set `window.BUKUKAS_AI_URL` di index.html.

## 5. Pakai di aplikasi
Login Google → Kasbot → setujui pengiriman ringkasan data → mode "Online". Keluarga: menu Keluarga → Buat / Gabung dengan kode.

## Catatan jujur
Aturan Firestore & fungsi belum diuji di server asli (hanya dengan simulasi). Jika deploy gagal,
kirim log Actions-nya. Cadangan awan adalah 1 dokumen (batas ±900KB).
