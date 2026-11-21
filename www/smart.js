/* ============================================================
   smart.js — Fase 3 (input cerdas):
   Catat Cepat (ketik / suara), auto-kategori yang belajar dari
   koreksi pengguna, impor mutasi CSV/Excel, deteksi transaksi berulang.
   Semua hasil otomatis hanya menjadi DRAFT yang diperiksa pengguna.
   ============================================================ */
(function () {
  'use strict';

  const BK = window.BK;
  if (!BK) return;
  const { state, DB, NATIVE, formatRupiah, escapeHtml, formatDateShort, todayISODate, showToast, openModal, closeModal } = BK;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');

  /* ======================= ANGKA INDONESIA ======================= */
  const UNITS = { nol: 0, satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };

  /** "dua puluh lima ribu" -> 25000. Mengembalikan null jika tidak ada kata bilangan. */
  function wordsToNumber(tokens) {
    let total = 0, chunk = 0, u = 0, seen = false;
    for (const t of tokens) {
      if (Object.prototype.hasOwnProperty.call(UNITS, t) && t !== 'se') { u = UNITS[t]; seen = true; }
      else if (t === 'sepuluh') { chunk += 10; seen = true; }
      else if (t === 'sebelas') { chunk += 11; seen = true; }
      else if (t === 'seratus') { chunk += 100; seen = true; }
      else if (t === 'seribu') { total += 1000; seen = true; }
      else if (t === 'sejuta') { total += 1e6; seen = true; }
      else if (t === 'belas') { chunk += u + 10; u = 0; seen = true; }
      else if (t === 'puluh') { chunk += (u || 1) * 10; u = 0; seen = true; }
      else if (t === 'ratus') { chunk += (u || 1) * 100; u = 0; seen = true; }
      else if (t === 'ribu') { total += ((chunk + u) || 1) * 1000; chunk = 0; u = 0; seen = true; }
      else if (t === 'juta') { total += ((chunk + u) || 1) * 1e6; chunk = 0; u = 0; seen = true; }
      else if (t === 'miliar') { total += ((chunk + u) || 1) * 1e9; chunk = 0; u = 0; seen = true; }
    }
    return seen ? total + chunk + u : null;
  }
  const NUM_WORDS = new Set(['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
    'seratus', 'seribu', 'sejuta', 'belas', 'puluh', 'ratus', 'ribu', 'juta', 'miliar']);

  /** Cari nominal pada teks. Mengembalikan { amount, start, end } (indeks karakter) atau null. */
  function findAmount(text) {
    const lower = text.toLowerCase();
    // 1) angka dengan satuan: "20rb", "20 ribu", "2,5 juta", "1.5jt", "50k"
    let m = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta|miliar|m)\b/i.exec(lower);
    if (m) {
      const mult = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, miliar: 1e9, m: 1e6 }[m[2].toLowerCase()];
      const n = parseFloat(m[1].replace(',', '.'));
      if (n > 0) return { amount: Math.round(n * mult), start: m.index, end: m.index + m[0].length };
    }
    // 2) angka polos dengan pemisah ribuan: "Rp20.000", "1.250.000", "20000"
    m = /(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{3,})(?!\d)/i.exec(lower);
    if (m) {
      const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
      if (n > 0) return { amount: n, start: m.index, end: m.index + m[0].length };
    }
    // 3) kata bilangan berturut-turut: "dua puluh lima ribu"
    const re = /[a-z]+/g;
    let run = null, best = null, w;
    while ((w = re.exec(lower))) {
      if (NUM_WORDS.has(w[0])) {
        if (!run) run = { tokens: [], start: w.index, end: w.index + w[0].length };
        run.tokens.push(w[0]); run.end = w.index + w[0].length;
      } else if (run) { if (!best || run.tokens.length > best.tokens.length) best = run; run = null; }
    }
    if (run && (!best || run.tokens.length > best.tokens.length)) best = run;
    if (best) {
      // "satu"/"dua" tunggal tanpa satuan uang di kalimat bukan nominal ("beli satu bakso")
      const val = wordsToNumber(best.tokens);
      const hasScale = best.tokens.some((t) => ['ribu', 'juta', 'miliar', 'ratus', 'puluh', 'belas', 'seribu', 'sejuta', 'seratus', 'sepuluh', 'sebelas'].includes(t));
      if (val && hasScale) return { amount: val, start: best.start, end: best.end };
    }
    return null;
  }

  /* ======================= PARSER CATAT CEPAT ======================= */
  const INCOME_RE = /^(terima|menerima|dapat|dapet|gajian|dibayar|pemasukan|masuk|jual|menjual|dikasih|diberi)\b/;
  const LEND_RE = /^(pinjamkan|pinjemin|meminjamkan|kasih pinjam|kasih pinjaman|ngutangin|memberi pinjaman)\b/;
  const BORROW_RE = /^(pinjam|meminjam|ngutang|utang|hutang|berutang|berhutang)\b/;
  const SAVE_RE = /^(tabung|menabung|nabung|setor tabungan|setor)\b/;
  const WITHDRAW_RE = /^(tarik tabungan|tarik dari tabungan|ambil tabungan|tarik)\b/;
  const EXPENSE_RE = /^(beli|membeli|bayar|membayar|belanja|makan|jajan|isi|isi ulang|topup|top up|keluar|pengeluaran|sewa|donasi|sedekah|transfer)\b/;

  function cleanNote(s) {
    return s.replace(/\s+/g, ' ').replace(/^(untuk|buat|di|ke|dari)\s+/i, '').trim();
  }

  /** Mengubah kalimat bebas menjadi draft terstruktur. Tidak pernah menyimpan apa pun. */
  function parseQuick(input) {
    const text = String(input || '').trim().replace(/\s+/g, ' ');
    if (!text) return null;
    const amt = findAmount(text);
    const lower = text.toLowerCase();
    const before = amt ? text.slice(0, amt.start).trim() : text;
    const after = amt ? text.slice(amt.end).trim() : '';
    const beforeLower = before.toLowerCase();
    const res = { kind: 'expense', amount: amt ? amt.amount : 0, note: '', person: '', confidence: 'rendah', raw: text };

    let verbMatch;
    if ((verbMatch = LEND_RE.exec(beforeLower))) {
      res.kind = 'lend';
      res.person = cleanNote(before.slice(verbMatch[0].length)).replace(/\s*(sebesar|senilai|sejumlah)$/i, '');
      res.note = after;
    } else if ((verbMatch = /^(pinjam|meminjam|ngutang|utang|hutang|berutang|berhutang)\s+(?:dari|ke|pada|sama)\s+(.+)$/.exec(beforeLower))) {
      res.kind = 'borrow';
      res.person = cleanNote(before.slice(before.toLowerCase().indexOf(verbMatch[2]))).replace(/\s*(sebesar|senilai|sejumlah)$/i, '');
      res.note = after;
    } else if (BORROW_RE.test(beforeLower)) {
      verbMatch = BORROW_RE.exec(beforeLower);
      res.kind = 'borrow';
      res.person = cleanNote(before.slice(verbMatch[0].length)).replace(/\s*(sebesar|senilai|sejumlah)$/i, '');
      res.note = after;
    } else if ((verbMatch = WITHDRAW_RE.exec(beforeLower))) {
      res.kind = 'withdraw';
      res.note = cleanNote(before.slice(verbMatch[0].length) + ' ' + after);
    } else if ((verbMatch = SAVE_RE.exec(beforeLower))) {
      res.kind = 'save';
      res.note = cleanNote(before.slice(verbMatch[0].length) + ' ' + after);
    } else if ((verbMatch = INCOME_RE.exec(beforeLower))) {
      res.kind = 'income';
      res.note = cleanNote(before.slice(verbMatch[0].length) + ' ' + after);
    } else if ((verbMatch = EXPENSE_RE.exec(beforeLower))) {
      res.kind = 'expense';
      // "makan" adalah kata kerja sekaligus isi catatan: pertahankan
      const keep = /^(makan|jajan|belanja|sewa)\b/.test(beforeLower);
      res.note = cleanNote((keep ? before : before.slice(verbMatch[0].length)) + ' ' + after);
    } else {
      res.note = cleanNote(before + ' ' + after);
    }
    res.note = res.note.replace(/\b(rp|rupiah)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
    if (res.note) res.note = res.note.charAt(0).toUpperCase() + res.note.slice(1);

    const verbFound = !!verbMatch;
    if (res.amount > 0 && (verbFound || res.note)) res.confidence = verbFound ? 'tinggi' : 'sedang';
    if ((res.kind === 'lend' || res.kind === 'borrow') && !res.person) res.confidence = 'rendah';
    return res;
  }

  /* ======================= AUTO-KATEGORI ======================= */
  const KEYWORD_CATEGORY = [
    [/listrik|\bpln\b|token|\bair\b|pdam|internet|wifi|indihome|pulsa|paket data|kuota|cicilan|angsuran|kredit|tagihan|langganan|netflix|spotify|bpjs/i, 'Tagihan'],
    [/makan|minum|kopi|warung|resto|jajan|sarapan|bakso|nasi|kafe|cafe|ayam|soto|gofood|grabfood/i, 'Makan'],
    [/bensin|pertamax|parkir|\btol\b|ojek|gojek|grab|angkot|\bbus\b|kereta|servis|transport/i, 'Transportasi'],
    [/belanja|market|toko|baju|sepatu|shopee|tokopedia|lazada|supermarket|alfamart|indomaret/i, 'Belanja'],
    [/spp|sekolah|kuliah|kursus|buku|pendidikan/i, 'Pendidikan'],
    [/dokter|obat|apotek|rumah sakit|klinik|kesehatan|vitamin/i, 'Kesehatan'],
    [/bioskop|game|film|nonton|hiburan|konser/i, 'Hiburan'],
    [/gaji|upah|honor|salary|gajian/i, 'Gaji'],
    [/bonus|thr|hadiah|angpao/i, 'Bonus']
  ];
  const STOP = new Set(['untuk', 'dengan', 'yang', 'dari', 'ke', 'di', 'dan', 'the', 'bayar', 'beli', 'terima']);
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokensOf = (s) => norm(s).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));

  /** Saran kategori dari catatan. Prioritas: pola riwayat pengguna > nama kategori > kata kunci. */
  function suggestCategory(note, type) {
    const n = norm(note);
    if (n.length < 3) return null;
    const cats = state.categories.filter((c) => c.type === type);
    const hist = state.transactions.filter((t) => t.type === type && BK.inReports(t) && t.categoryId && t.note && cats.some((c) => c.id === t.categoryId));

    // 1) catatan yang sama persis di riwayat -> kategori yang paling sering dipakai
    const exact = {};
    hist.forEach((t) => { if (norm(t.note) === n) exact[t.categoryId] = (exact[t.categoryId] || 0) + 1; });
    let best = Object.entries(exact).sort((a, b) => b[1] - a[1])[0];
    if (best) return { categoryId: best[0], reason: 'riwayat' };

    // 2) kata yang sama dengan beberapa transaksi lama
    const toks = tokensOf(note);
    if (toks.length) {
      const votes = {};
      hist.forEach((t) => { const tt = tokensOf(t.note); if (toks.some((w) => tt.includes(w))) votes[t.categoryId] = (votes[t.categoryId] || 0) + 1; });
      best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 2) return { categoryId: best[0], reason: 'riwayat' };
    }
    // 3) nama kategori muncul di catatan
    const byName = cats.find((c) => c.name.length >= 4 && n.includes(c.name.toLowerCase()));
    if (byName) return { categoryId: byName.id, reason: 'nama kategori' };
    // 4) kata kunci umum
    for (const [re, name] of KEYWORD_CATEGORY) {
      if (re.test(note)) { const c = cats.find((x) => x.name === name); if (c) return { categoryId: c.id, reason: 'kata kunci' }; }
    }
    return null;
  }

  /* ======================= CATAT CEPAT (UI) ======================= */
  let quickDraft = null;

  function describeDraft(d) {
    const kinds = { expense: 'Pengeluaran', income: 'Pemasukan', lend: 'Piutang (kamu meminjamkan)', borrow: 'Hutang (kamu meminjam)', save: 'Setor tabungan', withdraw: 'Tarik tabungan' };
    const rows = [`<span>Jenis: <b>${kinds[d.kind]}</b></span>`, `<span>Nominal: <b>${d.amount ? formatRupiah(d.amount) : '—'}</b></span>`];
    if (d.person) rows.push(`<span>Pihak: <b>${escapeHtml(d.person)}</b></span>`);
    if (d.note) rows.push(`<span>Catatan: <b>${escapeHtml(d.note)}</b></span>`);
    if (d.kind === 'expense' || d.kind === 'income') {
      const sg = suggestCategory(d.note, d.kind);
      const c = sg ? BK.categoryById(sg.categoryId) : null;
      if (c) rows.push(`<span>Kategori: <b>${escapeHtml(c.name)}</b> <small>(${sg.reason})</small></span>`);
    }
    rows.push(`<span><small>Keyakinan: ${d.confidence}. Kamu tetap bisa memeriksa dan mengubah sebelum disimpan.</small></span>`);
    return rows.join('');
  }

  function updateQuickPreview() {
    quickDraft = parseQuick($('quick-text').value);
    const box = $('quick-preview');
    if (!quickDraft || !quickDraft.amount) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = describeDraft(quickDraft);
  }

  function openQuick() {
    $('quick-text').value = '';
    $('quick-preview').hidden = true;
    quickDraft = null;
    $('quick-mic').hidden = !micAvailable();
    openModal('modal-quick');
  }

  function submitQuick(e) {
    e.preventDefault();
    updateQuickPreview();
    const d = quickDraft;
    if (!d || !d.amount) { showToast('Nominal belum terbaca. Coba: "beli makan 20 ribu".'); return; }
    if (!state.wallets.length) { showToast('Tambahkan dompet terlebih dahulu.'); closeModal('modal-quick'); BK.switchView('dompet'); return; }
    const source = quickVoiceUsed ? 'voice' : 'text';
    closeModal('modal-quick');
    if (d.kind === 'expense' || d.kind === 'income') {
      const sg = suggestCategory(d.note, d.kind);
      BK.openTxDraft({ type: d.kind, amount: d.amount, note: d.note, categoryId: sg ? sg.categoryId : '', source });
    } else if (d.kind === 'lend' || d.kind === 'borrow') {
      BK.openDebtModal(null);
      BK.setDebtType(d.kind === 'lend' ? 'lent' : 'owe');
      $('debt-person').value = d.person;
      $('debt-amount').value = d.amount.toLocaleString('id-ID');
      if ($('debt-note') && d.note) $('debt-note').value = d.note;
    } else {
      if (!state.goals.length) { showToast('Buat target tabungan dulu di menu Tabungan.'); BK.switchView('target'); return; }
      BK.openGoalTransferModal(state.goals[0].id, d.kind === 'save' ? 'deposit' : 'withdraw');
      const f = $('gt-amount'); if (f) f.value = d.amount.toLocaleString('id-ID');
    }
    quickVoiceUsed = false;
  }

  /* ---- suara: plugin native di APK, Web Speech API di browser ---- */
  let quickVoiceUsed = false;
  function webSpeech() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
  function micAvailable() { return NATIVE || !!webSpeech(); }

  async function listen() {
    try {
      if (NATIVE) {
        const SR = window.Capacitor.registerPlugin('SpeechRecognition');
        const av = await SR.available();
        if (!av || !av.available) { showToast('Pengenalan suara tidak tersedia di perangkat ini. Pakai ikon mikrofon di keyboard.'); return; }
        const perm = await SR.requestPermissions();
        if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') { showToast('Izin mikrofon ditolak.'); return; }
        const r = await SR.start({ language: 'id-ID', maxResults: 1, prompt: 'Ucapkan transaksi', partialResults: false, popup: true });
        const text = r && r.matches && r.matches[0];
        if (text) { $('quick-text').value = text; quickVoiceUsed = true; updateQuickPreview(); }
        return;
      }
      const Ctor = webSpeech();
      if (!Ctor) { showToast('Browser ini tidak mendukung suara. Pakai mikrofon di keyboard.'); return; }
      const rec = new Ctor();
      rec.lang = 'id-ID'; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (ev) => { $('quick-text').value = ev.results[0][0].transcript; quickVoiceUsed = true; updateQuickPreview(); };
      rec.onerror = () => showToast('Suara tidak terbaca. Coba lagi atau ketik.');
      rec.start();
    } catch (err) {
      if (!/cancel|dismiss/i.test(String(err && err.message))) showToast('Suara tidak terbaca. Coba lagi atau ketik.');
    }
  }

  /* ======================= IMPOR MUTASI ======================= */
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, ags: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n');
    const count = (ch) => (firstLines.match(new RegExp(ch === '\t' ? '\\t' : '\\' + ch, 'g')) || []).length;
    const delim = [',', ';', '\t', '|'].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  }

  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    const s = String(v == null ? '' : v).trim();
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
    let y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else if ((m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{2,4})/.exec(s))) { d = +m[1]; mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; y = +m[3]; if (y < 100) y += 2000; }
    else return null;
    if (!mo || mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    const dim = new Date(y, mo, 0).getDate();
    if (d > dim) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  /** Mengembalikan bilangan bertanda (rupiah utuh) atau null. Mengenali "1.234.567,89", "1,234,567.89", "(50.000)", "50.000 DB". */
  function parseMoney(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    let s = String(v == null ? '' : v).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/(\bDB\b|\bD\b|DR)\s*$/i.test(s)) neg = true;
    s = s.replace(/(\bDB\b|\bCR\b|\bD\b|\bK\b|DR)\s*$/i, '').replace(/rp\.?/ig, '').replace(/\s/g, '');
    if (s.startsWith('-')) { neg = true; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    let intPart = s, dec = '';
    if (lastDot >= 0 && lastComma >= 0) {
      const decPos = Math.max(lastDot, lastComma);
      intPart = s.slice(0, decPos); dec = s.slice(decPos + 1);
    } else if (lastDot >= 0 || lastComma >= 0) {
      const sep = lastDot >= 0 ? '.' : ',';
      const parts = s.split(sep);
      const last = parts[parts.length - 1];
      if (parts.length === 2 && last.length !== 3) { intPart = parts[0]; dec = last; } // "12,50" -> desimal
    }
    const n = parseInt(intPart.replace(/[.,]/g, ''), 10) + (dec ? Math.round(parseFloat('0.' + dec)) : 0);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  const HEADER_HINTS = {
    date: /tanggal|tgl|date|waktu|posting/i,
    desc: /keterangan|deskripsi|description|uraian|remark|berita|detail|transaksi|narasi|catatan/i,
    amount: /^(jumlah|nominal|amount|mutasi|nilai)$|jumlah|nominal|amount|mutasi/i,
    debit: /debit|keluar|^db$|withdrawal|pengeluaran|\bdr\b/i,
    credit: /kredit|credit|masuk|^cr$|deposit|pemasukan/i,
    dc: /^(d\/?k|db\/?cr|dc|tipe|jenis|type)$/i
  };

  function detectColumns(header) {
    const map = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1, dc: -1 };
    header.forEach((h, i) => {
      const name = String(h || '').trim();
      for (const k of ['date', 'debit', 'credit', 'dc', 'desc', 'amount']) {
        if (map[k] === -1 && HEADER_HINTS[k].test(name) && !Object.values(map).includes(i)) { map[k] = i; break; }
      }
    });
    return map;
  }

  /** Kunci unik per baris agar impor ulang file yang sama tidak membuat transaksi ganda. */
  function buildImportRows(table, cols, wallet, existing) {
    const seen = {};
    const manualKeys = new Set(existing.filter((t) => !t.importKey && t.walletId === wallet).map((t) => `${t.date}|${t.type}|${t.amount}`));
    const doneKeys = new Set(existing.filter((t) => t.importKey).map((t) => t.importKey));
    return table.map((r, i) => {
      const date = parseDate(r[cols.date]);
      const desc = String(r[cols.desc] == null ? '' : r[cols.desc]).replace(/\s+/g, ' ').trim().slice(0, 150);
      let signed = null;
      if (cols.amount >= 0) signed = parseMoney(r[cols.amount]);
      if (cols.debit >= 0 || cols.credit >= 0) {
        const dbt = cols.debit >= 0 ? parseMoney(r[cols.debit]) : null;
        const crd = cols.credit >= 0 ? parseMoney(r[cols.credit]) : null;
        if (dbt) signed = -Math.abs(dbt); else if (crd) signed = Math.abs(crd);
      }
      if (signed != null && cols.dc >= 0) {
        const f = String(r[cols.dc] || '').trim().toUpperCase();
        if (/^(DB|D|DR|DEBIT|K?ELUAR)$/.test(f)) signed = -Math.abs(signed);
        else if (/^(CR|K|C|KREDIT|CREDIT|MASUK)$/.test(f)) signed = Math.abs(signed);
      }
      if (!date || !signed) return { i, valid: false, reason: !date ? 'Tanggal tidak terbaca' : 'Nominal tidak terbaca', desc, date, signed };
      const type = signed < 0 ? 'expense' : 'income';
      const amount = Math.abs(signed);
      const base = `${date}|${signed}|${norm(desc).slice(0, 40)}`;
      seen[base] = (seen[base] || 0) + 1;
      const importKey = `${wallet}|${base}|${seen[base]}`;
      let status = 'new';
      if (doneKeys.has(importKey)) status = 'dup';
      else if (manualKeys.has(`${date}|${type}|${amount}`)) status = 'sim';
      return { i, valid: true, date, desc, type, amount, importKey, status };
    });
  }

  let imp = { table: [], header: [], cols: null, rows: [] };

  function fillColSelect(id, header, selected, optional) {
    const el = $(id);
    el.innerHTML = (optional ? '<option value="-1">— tidak dipakai —</option>' : '') + header.map((h, i) => `<option value="${i}">${escapeHtml(String(h || 'Kolom ' + (i + 1)).slice(0, 30))}</option>`).join('');
    el.value = String(selected);
  }

  function recomputeImport() {
    const cols = {
      date: +$('im-col-date').value, desc: +$('im-col-desc').value, amount: +$('im-col-amount').value,
      debit: +$('im-col-debit').value, credit: +$('im-col-credit').value, dc: +$('im-col-dc').value
    };
    imp.cols = cols;
    const wallet = $('im-wallet').value;
    imp.rows = buildImportRows(imp.table, cols, wallet, state.transactions);
    const valid = imp.rows.filter((r) => r.valid);
    const skipSim = $('im-skip-similar').checked;
    const importable = valid.filter((r) => r.status === 'new' || (r.status === 'sim' && !skipSim));
    $('im-summary').textContent = `${importable.length} akan diimpor · ${valid.filter((r) => r.status === 'dup').length} sudah ada · ${valid.filter((r) => r.status === 'sim').length} mirip · ${imp.rows.length - valid.length} dilewati`;
    $('im-rows').innerHTML = imp.rows.slice(0, 12).map((r) => {
      if (!r.valid) return `<div class="bk-row late"><span class="bk-main"><b>${escapeHtml(r.desc || '(baris kosong)')}</b><small>${escapeHtml(r.reason)}</small></span></div>`;
      const sg = suggestCategory(r.desc, r.type); const c = sg ? BK.categoryById(sg.categoryId) : null;
      const st = r.status === 'new' ? '<span class="im-st new">baru</span>' : r.status === 'dup' ? '<span class="im-st dup">sudah diimpor</span>' : '<span class="im-st sim">mirip manual</span>';
      return `<div class="bk-row"><span class="bk-main"><b>${escapeHtml(r.desc || '(tanpa keterangan)')}</b><small>${formatDateShort(r.date)}${c ? ' · ' + escapeHtml(c.name) : ''}</small></span>
        <span class="bk-side"><b class="${r.type === 'expense' ? 'neg' : ''}">${r.type === 'expense' ? '−' : '+'}${formatRupiah(r.amount)}</b>${st}</span></div>`;
    }).join('') + (imp.rows.length > 12 ? `<p class="field-hint">…dan ${imp.rows.length - 12} baris lainnya.</p>` : '');
    $('im-go').disabled = importable.length === 0;
    $('im-go').textContent = importable.length ? `Impor ${importable.length} transaksi` : 'Tidak ada yang bisa diimpor';
  }

  async function readFileAsTable(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('File terlalu besar (maks 5 MB).');
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      await new Promise((resolve, reject) => {
        if (window.XLSX) return resolve();
        const el = document.createElement('script'); el.src = 'vendor/xlsx.full.min.js'; el.onload = resolve; el.onerror = () => reject(new Error('Gagal memuat pembaca Excel'));
        document.head.appendChild(el);
      });
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter((r) => r.some((x) => String(x).trim() !== ''));
    }
    return parseCSV(await file.text());
  }

  async function onImportFile() {
    const file = $('im-file').files[0];
    if (!file) return;
    try {
      const all = await readFileAsTable(file);
      if (all.length < 2) { showToast('File kosong atau tidak terbaca.'); return; }
      if (all.length > 5001) { showToast('Maksimal 5000 baris per impor.'); return; }
      const looksLikeData = (row) => row.some((c) => parseDate(c)) && row.some((c) => parseMoney(c) != null && String(c).match(/\d/));
      const hasHeader = !looksLikeData(all[0]);
      const width = Math.max(...all.slice(0, 20).map((r) => r.length));
      const header = hasHeader ? all[0].concat(Array(Math.max(0, width - all[0].length)).fill('')) : Array.from({ length: width }, (_, i) => 'Kolom ' + (i + 1));
      imp.header = header; imp.table = hasHeader ? all.slice(1) : all;
      const det = hasHeader ? detectColumns(header) : { date: -1, desc: -1, amount: -1, debit: -1, credit: -1, dc: -1 };
      if (det.date === -1) det.date = header.findIndex((_, i) => imp.table.slice(0, 5).every((r) => parseDate(r[i])));
      fillColSelect('im-col-date', header, det.date, true);
      fillColSelect('im-col-desc', header, det.desc, true);
      fillColSelect('im-col-amount', header, det.amount, true);
      fillColSelect('im-col-debit', header, det.debit, true);
      fillColSelect('im-col-credit', header, det.credit, true);
      fillColSelect('im-col-dc', header, det.dc, true);
      $('im-map').hidden = false; $('im-preview').hidden = false;
      recomputeImport();
    } catch (e) { console.error(e); showToast(e.message || 'Gagal membaca file.'); }
  }

  let importing = false;
  async function doImport() {
    if (importing) return;
    const wallet = $('im-wallet').value;
    if (!wallet) { showToast('Pilih dompet tujuan.'); return; }
    recomputeImport();
    const skipSim = $('im-skip-similar').checked;
    const list = imp.rows.filter((r) => r.valid && (r.status === 'new' || (r.status === 'sim' && !skipSim)));
    if (!list.length) return;
    importing = true;
    try {
      if (BK.ensureBillCategory) await BK.ensureBillCategory();
      const catFallback = (type) => state.categories.find((c) => c.type === type && c.name === 'Lainnya') || state.categories.find((c) => c.type === type);
      const now = new Date().toISOString();
      const ops = list.map((r) => {
        const sg = suggestCategory(r.desc, r.type);
        const cat = sg ? BK.categoryById(sg.categoryId) : catFallback(r.type);
        return { s: 'transactions', put: { id: DB.genId(), type: r.type, amount: r.amount, categoryId: cat ? cat.id : '', walletId: wallet, date: r.date, note: r.desc, source: 'import', importKey: r.importKey, createdAt: now } };
      });
      ops.push(BK.auditRec('tambah', 'impor', wallet, `Impor ${list.length} transaksi dari file`));
      await DB.atomic(ops);
      await BK.reloadAll(); BK.renderAll();
      $('im-file').value = ''; $('im-map').hidden = true; $('im-preview').hidden = true;
      showToast(`${list.length} transaksi diimpor.`);
      BK.switchView('transaksi');
    } catch (e) { console.error(e); showToast('Impor gagal; tidak ada data yang berubah.'); }
    finally { importing = false; }
  }

  function renderImportView() {
    $('im-wallet').innerHTML = state.wallets.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
  }

  /* ======================= DETEKSI TRANSAKSI BERULANG ======================= */
  const DISMISS_KEY = 'bukukas-recurring-dismissed';
  function dismissed() { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch (e) { return []; } }
  function dismiss(key) { try { localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed().concat(key).slice(-100))); } catch (e) { /* abaikan */ } }

  const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

  function detectRecurring() {
    const groups = {};
    state.transactions.filter((t) => t.type === 'expense' && BK.inReports(t) && !t.billId && t.note).forEach((t) => {
      const k = norm(t.note); if (k.length < 3) return;
      (groups[k] = groups[k] || []).push(t);
    });
    const billNames = new Set(state.bills.map((b) => norm(b.name)));
    const out = [];
    Object.entries(groups).forEach(([key, list]) => {
      if (list.length < 3 || billNames.has(key) || dismissed().includes(key)) return;
      list.sort((a, b) => a.date.localeCompare(b.date));
      const med = median(list.map((t) => t.amount));
      if (!list.every((t) => Math.abs(t.amount - med) <= med * 0.1)) return;
      const gaps = list.slice(1).map((t, i) => dayNum(t.date) - dayNum(list[i].date));
      if (gaps.some((g) => g < 1)) return;
      const mg = median(gaps);
      let repeat = null;
      if (mg >= 26 && mg <= 35 && gaps.every((g) => g >= 24 && g <= 38)) repeat = 'monthly';
      else if (mg >= 6 && mg <= 8 && gaps.every((g) => g >= 5 && g <= 9)) repeat = 'weekly';
      if (!repeat) return;
      const last = list[list.length - 1];
      const d = new Date(dayNum(last.date) * 86400000 + (repeat === 'weekly' ? 7 : 31) * 86400000);
      let due = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      if (repeat === 'monthly') { const [y, m] = last.date.split('-').map(Number); const ny = m === 12 ? y + 1 : y; const nm = m === 12 ? 1 : m + 1; const day = Math.min(+last.date.slice(8, 10), new Date(ny, nm, 0).getDate()); due = `${ny}-${pad(nm)}-${pad(day)}`; }
      out.push({ key, name: last.note, amount: Math.round(med), repeat, count: list.length, dueDate: due, categoryId: last.categoryId, walletId: last.walletId });
    });
    return out.sort((a, b) => b.count - a.count);
  }

  function renderSuggestions() {
    let box = $('bill-suggest');
    if (!box) { box = document.createElement('div'); box.id = 'bill-suggest'; $('bill-list').parentNode.insertBefore(box, $('bill-list')); }
    const sug = detectRecurring().slice(0, 3);
    box.innerHTML = sug.length ? `<div class="card"><div class="card-header"><span class="card-title">Terdeteksi berulang</span></div>${sug.map((s) => `
      <div class="bk-row" data-sug="${escapeHtml(s.key)}">${BK.iconHTML(s.name, 40, 'receipt')}
        <span class="bk-main"><b>${escapeHtml(s.name)}</b><small>${s.repeat === 'monthly' ? 'Tiap bulan' : 'Tiap minggu'} · ${s.count}× · ${formatRupiah(s.amount)}</small></span>
        <span class="bk-side"><button type="button" class="btn-outline-sm" data-sug-add="${escapeHtml(s.key)}">Jadikan tagihan</button><button type="button" class="btn-outline-sm" data-sug-no="${escapeHtml(s.key)}">Abaikan</button></span>
      </div>`).join('')}</div>` : '';
  }

  /* ======================= BINDING ======================= */
  function bind() {
    $('form-quick').addEventListener('submit', submitQuick);
    $('quick-text').addEventListener('input', updateQuickPreview);
    $('quick-mic').addEventListener('click', listen);
    BK.openQuick = openQuick;

    $('im-file').addEventListener('change', onImportFile);
    ['im-col-date', 'im-col-desc', 'im-col-amount', 'im-col-debit', 'im-col-credit', 'im-col-dc', 'im-wallet', 'im-skip-similar'].forEach((id) => $(id).addEventListener('change', () => { if (imp.table.length) recomputeImport(); }));
    $('im-go').addEventListener('click', doImport);

    // auto-kategori pada form transaksi
    const cat = $('tx-category'), note = $('tx-note');
    cat.addEventListener('change', () => { cat.dataset.touched = '1'; $('tx-cat-hint').hidden = true; });
    let timer = null;
    note.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (cat.dataset.touched) return;
        const activeSeg = document.querySelector('#tx-type-segmented .segment.active');
        const type = activeSeg ? activeSeg.dataset.txType : 'expense';
        if (type === 'transfer') return;
        const sg = suggestCategory(note.value, type);
        const hint = $('tx-cat-hint');
        if (sg) { cat.value = sg.categoryId; const c = BK.categoryById(sg.categoryId); hint.textContent = `Kategori disarankan: ${c ? c.name : ''} (${sg.reason}). Ubah jika kurang tepat.`; hint.hidden = false; }
        else hint.hidden = true;
      }, 250);
    });

    document.addEventListener('click', (e) => {
      const add = e.target.closest('[data-sug-add]'), no = e.target.closest('[data-sug-no]');
      if (add) { const s = detectRecurring().find((x) => x.key === add.dataset.sugAdd); if (s && BK.openBillModal) BK.openBillModal(null, s); }
      if (no) { dismiss(no.dataset.sugNo); renderSuggestions(); }
    });
  }

  const baseTagihan = BK.views.tagihan;
  BK.views.tagihan = () => { baseTagihan(); renderSuggestions(); };
  BK.views.impor = renderImportView;
  BK.smart = { parseQuick, findAmount, wordsToNumber, suggestCategory, parseCSV, parseDate, parseMoney, detectColumns, buildImportRows, detectRecurring };

  bind();
})();
