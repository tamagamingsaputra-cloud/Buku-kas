# Perubahan (Fase 1 + 2 PRD)

## Perbaikan fondasi
- Transfer antar-dompet (tipe baru): tidak dihitung sebagai pemasukan/pengeluaran.
- Setoran/penarikan tabungan tidak lagi dihitung sebagai pengeluaran/pemasukan di laporan, anggaran, dan grafik. Penulisan transaksi + target kini atomik (satu transaksi database).
- Pembayaran/penerimaan utang-piutang kini memengaruhi saldo dompet (pilih dompet), bukan pokok utang saja. Membatalkan pembayaran mengembalikan saldo. Pinjaman baru bisa dicatat ke dompet.
- Target tabungan yang masih berisi dana tidak bisa dihapus (sebelumnya dana "hilang").
- Transaksi tabungan/utang tidak bisa diedit dari form transaksi (mencegah saldo tak sinkron).
- Deteksi transaksi duplikat (nominal, tanggal, dompet, kategori sama) dengan konfirmasi.
- Riwayat aktivitas (audit trail) + kolom sumber pencatatan (manual / scan struk).
- Backup JSON di APK kini memakai Bagikan/Simpan (unduhan blob tidak jalan di WebView).

## Fitur baru
- Tagihan & langganan berulang (mingguan/bulanan/tahunan/sekali), tombol Bayar membuat pengeluaran dan memajukan jatuh tempo.
- Aset & kekayaan bersih (dompet + tabungan + aset + piutang − hutang), kartu di dasbor.
- Kalender keuangan (tagihan, jatuh tempo utang, transaksi per tanggal).
- Ekspor CSV, Excel (.xlsx), PDF per periode.
- Database naik ke v4 (data lama aman, sudah diuji).

# Fase 3 (input cerdas) + perbaikan ikon
- Ikon mengikuti jenis/nama: Listrik=petir, Air=tetes, Internet=wifi, Pulsa=ponsel, Kos/Sewa=rumah, Cicilan=kartu, Langganan=ulang, Tagihan=struk, Emas=koin, dll. Berlaku juga untuk kategori buatan sendiri, tagihan, aset, kalender, dan transaksi (ikon transaksi tagihan/tabungan/utang mengikuti jenisnya, bukan kategori yang kebetulan terpilih).
- Form tagihan memakai kategori "Tagihan" (bukan kategori pertama/Makan).
- Catat Cepat (dasbor): ketik atau ucapkan "beli makan dua puluh ribu", "terima gaji 3 juta", "bayar listrik 200rb", "pinjamkan Andi lima puluh ribu", "tabung seratus ribu". Hasilnya DRAFT yang diperiksa dulu; tidak pernah menyimpan otomatis.
- Auto-kategori: dari riwayat pengguna (belajar dari koreksi), nama kategori, lalu kata kunci. Pilihan manual tidak ditimpa.
- Impor mutasi CSV/Excel: kolom terdeteksi otomatis, format Indonesia (dd/mm/yyyy, 1.234.567,89, DB/CR), pratinjau, deteksi sudah diimpor / mirip catatan manual, impor atomik.
- Deteksi transaksi berulang (bulanan/mingguan) -> tombol "Jadikan tagihan".
- Suara: plugin native speech-recognition di APK (Indonesia), Web Speech API di browser. Belum diuji di HP.

## Fase 4 (lokal) + Fase 5
- **Usaha & Stok** (menu Lainnya → Usaha): barang, stok (dihitung dari riwayat pergerakan), barang masuk (harga beli rata-rata tertimbang), koreksi stok, penjualan multi-barang (diskon, pajak, tunai/kredit/sebagian), piutang pelanggan & utang pemasok, biaya/modal usaha, laporan omzet/HPP/laba, produk terlaris, rekap harian, peringatan stok menipis.
- Transaksi usaha **tidak** masuk laporan pribadi; saldo dompet tetap akurat. Pembatalan penjualan mengembalikan stok, uang, dan piutang secara atomik.
- **Kas Kelompok** (menu Lainnya → Kelompok): buku kas bendahara lokal untuk RT/arisan/iuran/patungan, anggota, iuran berkala + tunggakan, pengeluaran, saldo. Terpisah dari dompet pribadi; BUKAN sinkronisasi multi-pengguna.
- Database v5 (items, stockmoves, sales, groups) + backup/restore ikut.
- **Tampilan baru**: tema terang jadi default, palet biru-hijau hangat, ikon menu berwarna berbeda per fitur, kartu saldo gradasi, tombol & navigasi beraksen. Tema gelap tetap ada (Pengaturan).

## Penyesuaian UI/UX (mengikuti master prompt)
- Navigasi 5 menu: Home · Transaksi · ＋ · Analisis · Profil; lembar "Tambah" berisi 9 aksi.
- Home: tombol sembunyikan saldo, ringkasan hari/minggu/bulan + perbandingan, Aksi cepat (8), chip ruang kerja, pencarian & lonceng.
- Transaksi: pencarian + filter kategori/dompet/tanggal.
- Dompet: rekonsiliasi saldo (penyesuaian tidak masuk laporan pemasukan/pengeluaran).
- Pusat Notifikasi (tagihan, utang, anggaran, stok), Profil, Bantuan/FAQ, pengantar 5 halaman.
- Tema Terang/Gelap/Sistem; palet emerald-navy sesuai fungsi.
- Dokumen: DESIGN-SPEC.md.
