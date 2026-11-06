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
