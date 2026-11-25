# Buku Kas — Spesifikasi UI/UX (yang benar-benar ada di aplikasi)

Dokumen ini memetakan master prompt UI/UX ke implementasi nyata. Status: ✔ ada & dites, ◐ sebagian, ✘ belum.

## 1. Arah desain
- Gaya: fintech minimalis yang ramah. Warna menurut fungsi: **hijau emerald** = aksi/uang masuk, **merah** = pengeluaran/peringatan, **biru** = informasi, **amber** = perhatian, **navy/abu** = netral.
- Font: Inter (dibundel offline). Angka saldo 38px/700 di kartu saldo; judul halaman 22px; teks isi 13–15px.
- Bentuk: kartu radius 16–20px, tombol/field radius 14px, area sentuh ≥ 44px (nav 48px, FAB 56px).
- Ikon: outline 1.9px konsisten (set inline, bergaya Lucide). Tanpa emoji sebagai ikon utama.
- Tema: **Terang / Gelap / Sistem** (Profil atau Pengaturan). "Sistem" mengikuti perangkat dan berubah langsung.

### Token (variabel CSS)
| Token | Terang | Gelap |
|---|---|---|
| --bg | #F5F8F7 | #0F1424 |
| --card | #FFFFFF | #182036 |
| --text / --text-dim | #16213A / #4D5A75 | #EDF1FA / #A9B4CE |
| --gold (aksen utama) | #0F9D75 | #4FD6AE |
| --success / --danger | #12A072 / #E5484D | sama |
| Kartu saldo | gradasi #34C38F → #0B6B4F | sama |

## 2. Arsitektur informasi
- **Bottom nav (5):** Home · Transaksi · **＋ Tambah** · Analisis · Profil.
- **Home** → saldo, aksi cepat (8), pengingat, tabungan/utang, anggaran, tren, kategori, transaksi terbaru, serta "Modul".
- **Tambah (lembar bawah, 9 aksi):** Pemasukan, Pengeluaran, Transfer, Menabung, Utang, Piutang, Pindai struk, Input suara, Input manual.
- **Semua Modul:** Dompet, Tabungan, Utang & Piutang, Anggaran, Kategori, Tagihan, Aset, Kalender, Impor, Ekspor, Riwayat, Usaha, Kelompok.
- **Profil:** ruang kerja, tema, Notifikasi, Akun & PIN, Pengaturan & Cadangan, Ekspor, Riwayat, Semua Modul, Bantuan & FAQ.
- **Ruang kerja:** Pribadi · Bisnis/UMKM · Kelompok (pembukuan terpisah secara logis) · Keluarga (dinonaktifkan: butuh multi-pengguna).

## 3. Komponen (ringkas)
| Komponen | Ukuran / aturan |
|---|---|
| Tombol utama | tinggi ≥ 44px, gradasi hijau, teks putih |
| Chip filter | tinggi ≥ 36px, aktif = hijau penuh |
| Kartu saldo | radius 20px, tombol mata (sembunyikan), pilihan periode, perbandingan periode lalu |
| Aksi cepat | grid 4 kolom, ubin 54px radius 18px |
| Lembar bawah (modal) | handle, judul, tombol tutup; dipakai Tambah, Ruang kerja, semua form |
| Notifikasi | titik status (kuning = segera, merah = terlambat) + label teks, "baru" |
| Empty state | ikon + judul + penjelasan untuk daftar kosong |
| Toast & dialog konfirmasi | untuk umpan balik dan tindakan permanen |

## 4. Aturan keuangan yang dijaga UI
Transfer/penyesuaian saldo/setoran tabungan/pokok utang **tidak** masuk laporan pemasukan-pengeluaran; transaksi usaha tidak masuk laporan pribadi; saldo selalu dihitung dari seluruh transaksi; duplikat terdeteksi; hapus/ubah butuh konfirmasi; hasil scan/suara selalu dikonfirmasi pengguna sebelum disimpan.

## 5. Alur utama
1. Pengguna baru: splash → pengantar 5 halaman (bisa Lewati) → login / lanjut tanpa akun → Home.
2. Catat manual: ＋ → jenis → form → simpan → Home diperbarui.
3. Scan struk: ＋ → Pindai struk → pilih foto → hasil diisi ke form → periksa → simpan.
4. Transfer: ＋ → Transfer → pilih dompet asal/tujuan → nominal → simpan.
5. Menabung: ＋ → Menabung → setor ke target (jika ada >1 target, pilih di halaman Tabungan).
6. Utang: ＋ → Utang/Piutang → isi → simpan; bayar lewat Hutang & Piutang.
7. Bisnis: ruang kerja Bisnis → Usaha → Stok/Penjualan/Biaya → laporan.
8. Analisis: Analisis → periode → grafik → Ekspor.

## 6. Responsif & performa
Satu kolom, lebar uji 400px; kontrol tetap terbaca di 320px (grid Tambah jadi 1 kolom). Safe-area dipakai di header/nav. Grafik canvas ringan, tanpa animasi berat; mendukung "kurangi gerakan". Daftar dibatasi (mis. transaksi terbaru 5, riwayat 15–50).

## 7. Checklist kejujuran (dibanding master prompt)
| Item | Status |
|---|---|
| Splash, onboarding (5 halaman, Lewati), login/daftar/tanpa akun | ✔ |
| OTP, lupa password, setup profil, foto profil, zona waktu | ✘ (login memakai Firebase email/Google; OTP belum ada) |
| Pilih/ganti ruang kerja | ◐ Pribadi, Bisnis, Kelompok sebagai ruang kerja terpisah logis; Keluarga ✘; buat/gabung via kode undangan ✘ |
| Dashboard (saldo, sembunyikan, periode, aksi cepat, grafik, anggaran, tabungan, pengingat, transaksi terbaru) | ✔ |
| Dashboard Bisnis & Kelompok | ◐ ada sebagai halaman Usaha & Kelompok, bukan Home tersendiri |
| Transaksi: daftar, pencarian, filter (jenis, kategori, dompet, tanggal), tambah/edit/hapus, transfer | ✔ |
| Detail transaksi dengan riwayat perubahan & duplikasi, lampiran, waktu | ◐ riwayat ada di menu Riwayat; duplikasi/lampiran/waktu ✘ |
| Dompet + rekonsiliasi saldo | ✔ ; detail dompet dengan grafik ✘; arsipkan ✘ |
| Tabungan, utang/piutang, anggaran, tagihan, aset, kalender | ✔ (sudah ada dari fase sebelumnya) |
| Analisis dasar + ekspor CSV/Excel/PDF | ✔ ; laporan per modul (12 jenis) ◐ |
| Smart input: scan struk, suara, impor CSV/Excel | ✔ ; scan bukti transfer, impor PDF, baca notifikasi ✘ |
| AI Assistant | ✘ |
| Keluarga (multi-pengguna) & hak akses | ✘ |
| Kelompok & Bisnis/UMKM (stok, penjualan, pembelian, biaya, laba) | ✔ ; pelanggan/pemasok sebagai entitas terpisah ✘ |
| Pusat notifikasi (tagihan, utang, anggaran, stok) | ✔ ; notifikasi push sistem Android ✘ |
| Profil, tema, PIN, backup/restore, ekspor, bantuan/FAQ, kebijakan (ringkasan), tentang | ✔ ; biometrik, perangkat aktif, riwayat login, izin Android, hapus akun ✘ |
| Empty/Loading/Error/Offline/Success/Validation state | ◐ empty, success (toast), validasi ✔ ; skeleton loading & banner offline ◐/✘ |
| Dokumen design system, sitemap, flow, handoff | ✔ (dokumen ini; bukan file Figma/prototipe terpisah) |

Kebijakan privasi & syarat di Bantuan adalah ringkasan teknis, **bukan** teks hukum resmi; ganti sebelum rilis publik.

## Putaran #3
Prinsip: lokal (IndexedDB) = sumber kebenaran. Online hanya tambahan: login Google, cadangan/sinkron, Kasbot AI, Keluarga. Kasbot punya fallback offline penuh. Biometrik hanya kemudahan; PIN tetap rahasia utama.
