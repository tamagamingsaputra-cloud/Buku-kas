/* ============================================================
   receipt.js — Membaca hasil OCR struk belanja
   Murni pengolah teks (tanpa DOM) supaya mudah diuji.
   Input : teks hasil OCR + daftar nama kategori pengeluaran
   Output: { amount, date, merchant, category, confidence }
   ============================================================ */
(function (root) {
  'use strict';

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, ags: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

  // Kata kunci toko/barang -> nama kategori (dicocokkan ke kategori milik pengguna)
  const CATEGORY_HINTS = [
    ['Makan', ['resto', 'restoran', 'restaurant', 'cafe', 'kafe', 'coffee', 'kopi', 'bakso', 'warung', 'warteg', 'ayam', 'mie ', 'nasi', 'bakery', 'roti', 'kfc', 'mcd', 'mcdonald', 'burger', 'pizza', 'starbucks', 'sate', 'soto', 'kantin', 'food', 'dapur', 'geprek', 'seafood', 'es teh', 'boba', 'chatime', 'janji jiwa', 'kenangan']],
    ['Transportasi', ['spbu', 'pertamina', 'shell', 'bbm', 'pertalite', 'pertamax', 'solar', 'parkir', 'parking', 'tol ', 'grab', 'gojek', 'taxi', 'taksi', 'bluebird', 'kereta', 'tiket', 'bengkel', 'oli ']],
    ['Kesehatan', ['apotek', 'apotik', 'farma', 'klinik', 'clinic', 'rumah sakit', ' rs ', 'dokter', 'kimia farma', 'k24', 'obat', 'laboratorium']],
    ['Pendidikan', ['gramedia', 'buku', 'sekolah', 'kursus', 'kampus', 'universitas', 'les ', 'fotokopi', 'foto copy', 'alat tulis']],
    ['Hiburan', ['cinema', 'bioskop', 'xxi', 'cgv', 'game', 'karaoke', 'netflix', 'spotify', 'wahana', 'timezone']],
    ['Belanja', ['indomaret', 'alfamart', 'alfamidi', 'supermarket', 'minimarket', 'hypermart', 'transmart', 'superindo', 'super indo', 'giant', 'lotte', 'carrefour', 'mart', 'toko', 'swalayan', 'ranch market', 'farmers', 'miniso', 'uniqlo', 'hnm']]
  ];

  const TOTAL_STRONG = /(grand\s*total|total\s*(bayar|belanja|tagihan|pembayaran|akhir|harga)|jumlah\s*(bayar|tagihan|total)|amount\s*due|total\s*due|netto|net\s*total|total\s*rp|total\s*:)/i;
  const TOTAL_WEAK = /(^|\s)(total|jumlah|tagihan|bayar|amount)(\s|:|$)/i;
  const NOT_TOTAL = /(sub\s*-?\s*total|kembali|change|kembalian|tunai|cash|debit|kredit|credit|ppn|pajak|tax|diskon|discount|hemat|point|poin|saldo|dpp|service|servis|qty|harga\s*satuan|item)/i;

  /** "Rp 45.000,00" / "45,000" / "45000" -> angka bulat, atau null */
  function parseMoney(token) {
    if (!token) return null;
    let t = String(token).replace(/rp\.?/ig, '').replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/\s+/g, '');
    t = t.replace(/[^0-9.,]/g, '');
    if (!t || !/\d/.test(t)) return null;
    // desimal 2 digit di belakang pemisah terakhir, mis. 45.000,00 atau 12,50
    const dec = t.match(/^(.*\d)[.,](\d{2})$/);
    if (dec && /[.,]/.test(dec[1])) t = dec[1];            // 45.000,00 -> 45.000
    else if (dec && dec[1].length <= 3 && !/[.,]/.test(dec[1])) t = dec[1]; // 12,50 -> 12 (jarang di Rupiah)
    t = t.replace(/[.,]/g, '');
    const n = parseInt(t, 10);
    return isFinite(n) ? n : null;
  }

  function amountsIn(line) {
    // ambil semua token angka (boleh ada pemisah ribuan)
    const out = [];
    const re = /(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{3,9})(?![\d])/ig;
    let m;
    while ((m = re.exec(line))) {
      const v = parseMoney(m[1]);
      if (v && v >= 100 && v < 1e9) out.push(v);
    }
    return out;
  }

  function findTotal(lines) {
    // 1) baris "total" yang kuat, dari bawah ke atas
    for (let pass = 0; pass < 2; pass++) {
      const rx = pass === 0 ? TOTAL_STRONG : TOTAL_WEAK;
      for (let i = lines.length - 1; i >= 0; i--) {
        const ln = lines[i];
        if (!rx.test(ln)) continue;
        if (pass === 1 && NOT_TOTAL.test(ln)) continue;
        if (pass === 0 && /sub\s*-?\s*total/i.test(ln)) continue;
        let vals = amountsIn(ln);
        if (!vals.length && lines[i + 1] && !NOT_TOTAL.test(lines[i + 1])) vals = amountsIn(lines[i + 1]); // angka di baris bawahnya
        if (vals.length) return { value: vals[vals.length - 1], confidence: pass === 0 ? 0.9 : 0.7 };
      }
    }
    // 2) cadangan: angka terbesar pada baris yang bukan kembalian/tunai/dll
    let best = 0;
    lines.forEach((ln) => {
      if (/kembali|change|tunai|cash|debit|kredit|card|telp|tel\b|npwp|no\.|kasir|tlp|hp\b/i.test(ln)) return;
      amountsIn(ln).forEach((v) => { if (v > best) best = v; });
    });
    if (best) return { value: best, confidence: 0.4 };
    return { value: null, confidence: 0 };
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function findDate(text, today) {
    const now = today || new Date();
    const maxTime = now.getTime() + 2 * 86400000;
    const valid = (y, m, d) => {
      if (y < 100) y += 2000;
      if (y < 2015 || m < 1 || m > 12 || d < 1 || d > 31) return null;
      const dt = new Date(y, m - 1, d);
      if (dt.getMonth() !== m - 1 || dt.getTime() > maxTime) return null;
      return `${y}-${pad(m)}-${pad(d)}`;
    };
    let m;
    // 2026-11-06
    m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) { const v = valid(+m[1], +m[2], +m[3]); if (v) return v; }
    // 06/11/2026, 06-11-26, 06.11.2026
    const re = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
    while ((m = re.exec(text))) {
      const v = valid(+m[3], +m[2], +m[1]);
      if (v) return v;
    }
    // 6 Nov 2026 / 06 November 26
    const re2 = /\b(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{2,4})\b/g;
    while ((m = re2.exec(text))) {
      const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
      if (!mon) continue;
      const v = valid(+m[3], mon, +m[1]);
      if (v) return v;
    }
    return null;
  }

  function findMerchant(lines) {
    for (let i = 0; i < Math.min(lines.length, 7); i++) {
      const ln = lines[i].replace(/[^A-Za-z0-9&.' -]/g, ' ').replace(/\s+/g, ' ').trim();
      const letters = (ln.match(/[A-Za-z]/g) || []).length;
      if (letters < 3 || letters / Math.max(ln.length, 1) < 0.55) continue;
      if (/^(struk|nota|invoice|receipt|kasir|tanggal|date|no\b|npwp|telp|tel\b|jl\b|jalan|www|http)/i.test(ln)) continue;
      return ln.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ').slice(0, 32);
    }
    return '';
  }

  function guessCategory(text, names) {
    const pick = (wanted) => (names || []).find((n) => n.toLowerCase() === wanted.toLowerCase());
    // Nama toko (baris-baris awal) lebih menentukan daripada isi belanjaan
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const scopes = [lines.slice(0, 3).join(' \n '), String(text)];
    for (const scope of scopes) {
      const hay = ' ' + scope.toLowerCase() + ' ';
      for (const [cat, words] of CATEGORY_HINTS) {
        if (words.some((w) => hay.includes(w))) {
          const found = pick(cat);
          if (found) return found;
        }
      }
    }
    return pick('Lainnya') || '';
  }

  function parse(text, categoryNames, today) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const total = findTotal(lines);
    const date = findDate(String(text || ''), today);
    const merchant = findMerchant(lines);
    const category = guessCategory(String(text || ''), categoryNames);
    return { amount: total.value, date, merchant, category, confidence: total.confidence };
  }

  const api = { parse, parseMoney, findTotal, findDate, findMerchant, guessCategory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Receipt = api;
})(typeof window !== 'undefined' ? window : globalThis);
