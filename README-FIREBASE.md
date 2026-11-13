# Setup Akun & Sinkronisasi Cloud (Opsional)

Buku Kas tetap 100% berfungsi offline tanpa langkah ini. Ikuti panduan
ini hanya jika kamu mau fitur **Akun** (login username/password atau
Google, dan data tersimpan walau ganti HP/akun).

## 1. Buat project Firebase (gratis)
1. Buka https://console.firebase.google.com → **Add project**.
2. Beri nama bebas, lanjutkan sampai project selesai dibuat.

## 2. Daftarkan aplikasi web
1. Di dashboard project, klik ikon **</>** (Web).
2. Beri nama app bebas → **Register app**.
3. Firebase menampilkan blok kode `firebaseConfig = {...}`.
   Salin seluruh isinya ke file **firebase-config.js** (menggantikan
   nilai `"GANTI_..."`).

## 3. Aktifkan metode login
1. Menu kiri → **Authentication** → tab **Sign-in method**.
2. Aktifkan provider **Email/Password**.
3. Aktifkan provider **Google** (pilih email dukungan project, Save).

## 4. Buat database Firestore
1. Menu kiri → **Firestore Database** → **Create database**.
2. Pilih lokasi server terdekat (mis. `asia-southeast2` Jakarta).
3. Pilih mode **production**.

## 5. Pasang aturan keamanan (Firestore Rules)
Di tab **Rules** pada Firestore, ganti isinya dengan ini, lalu **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Aturan ini memastikan setiap pengguna **hanya** bisa membaca/menulis
datanya sendiri — bukan milik pengguna lain.

## 6. (Jika di-hosting online) Izinkan domainnya
Authentication → **Settings** → **Authorized domains** → tambahkan
domain tempat kamu hosting app ini (mis. `buku-kas-kamu.netlify.app`).
Tanpa ini, tombol "Lanjutkan dengan Google" akan gagal.

## Selesai
Buka ulang aplikasi → menu **Lainnya → Akun** → daftar/masuk sudah bisa
dipakai. Gunakan tombol **Sinkronkan ke Cloud** untuk menyimpan data
perangkat ini ke cloud, dan **Pulihkan dari Cloud** di perangkat lain
untuk menariknya kembali.

## Catatan biaya
Firebase gratis (paket Spark) sudah lebih dari cukup untuk pemakaian
pribadi. Tidak ada biaya SMS karena login memakai Email/Password dan
Google, bukan OTP SMS.

---

## Login Google tanpa pindah halaman (opsional)

Secara bawaan "Lanjutkan dengan Google" membuka popup Google. Agar pemilih akun muncul
**di dalam halaman** (panel kecil, tanpa pindah tab), isi `BUKUKAS_GOOGLE_CLIENT_ID`
di `firebase-config.js`:

1. Firebase Console → **Authentication → Sign-in method → Google** → buka bagian
   **Web SDK configuration** → salin **Web client ID**
   (bentuknya `123456-abcdef.apps.googleusercontent.com`).
2. Tempel ke `firebase-config.js`:
   `window.BUKUKAS_GOOGLE_CLIENT_ID = "123456-abcdef.apps.googleusercontent.com";`
3. Buka **console.cloud.google.com** → pilih project yang sama → **APIs & Services → Credentials**
   → klik **Web client (auto created by Google Service)** → di **Authorized JavaScript origins**
   klik **Add URI** dan tambahkan alamat websitemu, misalnya `https://buku-kas-five.vercel.app`
   (tanpa garis miring di akhir) → **Save** (bisa butuh beberapa menit untuk aktif).
4. Deploy ulang. Jika panel tidak bisa tampil (client ID kosong, origin belum didaftarkan,
   dsb.) aplikasi otomatis memakai popup biasa, jadi login tetap berjalan.

## Foto struk

Di form "Tambah Transaksi" ada tombol **Foto Struk**. Teks struk dibaca di HP dengan
Tesseract.js (gratis). Pertama kali dipakai perlu internet untuk mengunduh pembaca teks,
berikutnya tersimpan di browser. Foto tidak diunggah dan tidak disimpan. Hasilnya selalu
perlu dicek sebelum disimpan.

## Lupa PIN

Di layar kunci, **Lupa PIN?** membuka dialog dengan dua tombol: **Batal** dan **Konfirmasi**. Setelah
Konfirmasi, kamu membuat PIN baru lalu mengulanginya (2 langkah). Karena tombol Konfirmasi tidak membuktikan
siapa pemegang HP, PIN baru hanya diberikan dengan **menghapus data di perangkat itu**:
- Pengguna **tanpa akun**: datanya hilang permanen.
- Pengguna **akun**: data di perangkat dihapus dan akun otomatis **keluar**. Saat masuk lagi (email/password
  atau Google), data dipulihkan otomatis dari cadangan cloud (pastikan sudah pernah "Cadangkan ke cloud").
Tidak ada server tambahan yang dibutuhkan.

## Data & PIN per pemilik
Data (IndexedDB) dan PIN dipisah per pemilik di perangkat: satu untuk **tanpa akun (tamu)** dan satu untuk
setiap akun. Akun baru tidak mewarisi PIN atau data akun lain. Data tamu yang dibuat sebelum versi ini tetap ada
di mode tamu ("Lanjutkan tanpa akun"). Akun yang masuk dengan perangkat/akun kosong otomatis memulihkan
cadangan cloud jika ada.

---

## Keamanan akun: email asli + password kuat

Pemeriksaan di dalam aplikasi (browser) **bisa dilewati** oleh orang yang mengutak-atik kode,
jadi penjaga yang sebenarnya harus ada di server Firebase. Lakukan semua langkah ini:

### 1. Aturan Firestore: wajib email terverifikasi
Firebase Console -> Firestore Database -> Rules, ganti dengan ini lalu **Publish**:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid} {
      function owner() {
        return request.auth != null
            && request.auth.uid == uid
            && request.auth.token.email_verified == true;
      }
      function validDoc() {
        let d = request.resource.data;
        return d.keys().hasOnly(['email', 'createdAt', 'username', 'usernameSet', 'backup', 'backupUpdatedAt'])
            && (!('email' in d) || d.email is string)
            && (!('username' in d) || (d.username is string && d.username.size() <= 40))
            && (!('backup' in d) || (d.backup is map && d.backup.app == 'buku-kas'));
      }
      allow read, delete: if owner();
      allow create, update: if owner() && validDoc();
    }
  }
}
```
Selain wajib email terverifikasi dan hanya boleh menyentuh dokumen miliknya sendiri, aturan ini juga
menolak field asing dan data cadangan yang bentuknya bukan dari Buku Kas. Semua path lain otomatis ditolak.
Ukuran dokumen dibatasi Firestore sendiri (maks 1 MiB).
Dengan aturan ini, akun yang emailnya belum diverifikasi tidak bisa menyimpan atau membaca data cloud,
walaupun orang itu memanggil Firebase langsung dari luar aplikasi.

### 1b. Batasi API key (sangat disarankan)
API key Firebase memang tampak di kode (itu normal, bukan rahasia), tapi sebaiknya dikunci supaya hanya
domainmu yang bisa memakainya: Google Cloud Console -> APIs & Services -> Credentials -> klik
**Browser key** milik project -> *Application restrictions* = **Websites** -> tambahkan
`https://domain-kamu.vercel.app/*` (dan domain lain yang dipakai) -> Save.
Lalu di Firebase -> Authentication -> Settings -> **Authorized domains**, hapus domain yang tidak dipakai.

### 1c. Header keamanan (sudah termasuk)
`vercel.json` (Vercel) dan `_headers` (Cloudflare Pages) berisi Content-Security-Policy, anti-clickjacking,
nosniff, dan HSTS. Cukup ikut ter-deploy bersama file lain.

### 2. Kebijakan password di server
Authentication -> Settings -> **Password policy** -> aktifkan, lalu atur: minimal 8 karakter,
wajib huruf besar, huruf kecil, dan angka -> Save. Aturan ini dipaksakan oleh Firebase,
bukan hanya oleh aplikasi.

### 3. Perlindungan lainnya (Authentication -> Settings)
- **User actions**: biarkan *Email enumeration protection* aktif (mencegah orang menebak email yang sudah terdaftar).
- **Authorized domains**: hanya isi domain websitemu sendiri, hapus yang tidak dipakai.

### Cara kerja di aplikasi
- Daftar dengan email: aplikasi mengirim **tautan verifikasi** ke emailnya. Akun baru **belum bisa masuk**
  sampai tautan itu diketuk. Email palsu atau milik orang lain tidak akan pernah menerima tautannya.
- Masuk sebelum verifikasi: aplikasi menolak dan mengirim ulang tautannya.
- Login Google: email sudah diverifikasi Google, jadi langsung sah.
- Password minimal 8 karakter, wajib huruf dan angka, ditolak jika terlalu umum atau memuat email/username.
- Email sementara (mailinator dll.) dan salah ketik domain (gmial.com) ditolak.
- Akun email lama yang dibuat sebelum fitur ini harus memverifikasi emailnya sekali saat masuk berikutnya.
