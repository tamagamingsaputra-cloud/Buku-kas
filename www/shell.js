/* ============================================================
   shell.js — kerangka aplikasi (mengikuti spesifikasi UI/UX)
   Lembar "Tambah", ruang kerja, profil, bantuan, pusat notifikasi,
   pencarian & filter transaksi, rekonsiliasi saldo, onboarding,
   dan aksi cepat dasbor. Tidak mengubah aturan keuangan.
   ============================================================ */
(function () {
  'use strict';
  const BK = window.BK;
  if (!BK) return;
  const { state, DB, formatRupiah, escapeHtml, formatDateShort, todayISODate, showToast, openModal, closeModal } = BK;
  const $ = (id) => document.getElementById(id);
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
  };

  const I = {
    in: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    out: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
    save: '<path d="M19 6.5c-1.4 0-2.6 1-3 2-3.4-1.3-10-.2-10 4.7 0 1.7.3 2.8 2 4V21h4v-2h3v2h4v-3.8c.9-.5 1.6-1.1 2-2.2h2v-4h-2c-.2-.9-.6-1.5-1-2V6.5Z"/>',
    owe: '<path d="M4 8h13M13 4l4 4-4 4"/>',
    lent: '<path d="M20 16H7M11 12l-4 4 4 4"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    shop: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 2 2 3 4 3s4-1 4-3c0 2 2 3 4 3s4-1 4-3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    home: '<path d="M3.5 11 12 4l8.5 7v8.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1Z"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9ZM10 19a2 2 0 0 0 4 0"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    down: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h5M6 6l9-2.5V6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>'
  };
  const svg = (p, sz) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"${sz ? ` width="${sz}" height="${sz}"` : ''} aria-hidden="true">${p}</svg>`;

  /* ======================= LEMBAR TAMBAH ======================= */
  function guard(fn) { return () => { closeModal('modal-add-sheet'); setTimeout(fn, 60); }; }
  function startSaving() {
    if (!state.goals.length) { showToast('Buat target tabungan dulu.'); BK.switchView('target'); return; }
    if (state.goals.length === 1) { BK.openGoalTransferModal(state.goals[0].id, 'deposit'); return; }
    showToast('Pilih target lalu ketuk Setor.'); BK.switchView('target');
  }
  function startDebt(type) { BK.openDebtModal(null); BK.setDebtType(type); }
  function startScan() {
    BK.openTxDraft({ type: 'expense' });
    if ($('modal-tx').classList.contains('open')) BK.openReceiptPicker();
  }
  const ACTIONS = {
    income: { label: 'Pemasukan', hint: 'Gaji, bonus, hasil usaha', icon: I.in, tone: 'in', run: () => BK.openTxDraft({ type: 'income' }) },
    expense: { label: 'Pengeluaran', hint: 'Belanja, tagihan, makan', icon: I.out, tone: 'out', run: () => BK.openTxDraft({ type: 'expense' }) },
    transfer: { label: 'Transfer', hint: 'Pindah antar dompet', icon: I.swap, tone: 'info', run: () => BK.openTxDraft({ type: 'transfer' }) },
    save: { label: 'Menabung', hint: 'Setor ke target', icon: I.save, tone: 'in', run: startSaving },
    owe: { label: 'Utang', hint: 'Uang yang kamu pinjam', icon: I.owe, tone: 'warn', run: () => startDebt('owe') },
    lent: { label: 'Piutang', hint: 'Uang yang kamu pinjamkan', icon: I.lent, tone: 'info', run: () => startDebt('lent') },
    scan: { label: 'Pindai struk', hint: 'Foto struk belanja', icon: I.scan, tone: 'neutral', run: startScan },
    voice: { label: 'Input suara', hint: 'Ucapkan atau ketik', icon: I.mic, tone: 'neutral', run: () => BK.openQuick && BK.openQuick() },
    manual: { label: 'Input manual', hint: 'Isi formulir lengkap', icon: I.pen, tone: 'neutral', run: () => BK.openTxModal(null) }
  };
  const ADD_ORDER = ['income', 'expense', 'transfer', 'save', 'owe', 'lent', 'scan', 'voice', 'manual'];
  function openAddSheet() {
    $('add-grid').innerHTML = ADD_ORDER.map((k) => {
      const a = ACTIONS[k];
      return `<button type="button" class="add-item tone-${a.tone}" data-add="${k}"><span class="add-ic">${svg(a.icon, 22)}</span><span class="add-tx"><b>${a.label}</b><small>${a.hint}</small></span></button>`;
    }).join('');
    openModal('modal-add-sheet');
  }
  BK.openAddSheet = openAddSheet;

  /* ======================= RUANG KERJA ======================= */
  const WS = [
    { id: 'pribadi', name: 'Pribadi', desc: 'Dompet, transaksi, tabungan, dan utangmu', icon: I.user, views: null },
    { id: 'bisnis', name: 'Bisnis / UMKM', desc: 'Stok, penjualan, dan laba (terpisah dari pribadi)', icon: I.shop, views: ['usaha'], go: 'usaha' },
    { id: 'kelompok', name: 'Kelompok', desc: 'Kas RT, arisan, iuran (buku bendahara)', icon: I.users, views: ['kelompok'], go: 'kelompok' },
    { id: 'keluarga', name: 'Keluarga', desc: 'Butuh sinkronisasi antar pengguna', icon: I.home, disabled: true }
  ];
  function currentWorkspace() {
    const v = state.currentView;
    return WS.find((w) => w.views && w.views.includes(v)) || WS[0];
  }
  function updateWorkspaceChip() {
    const w = currentWorkspace();
    const el = $('hdr-ws-name');
    if (el) el.textContent = w.name.split(' ')[0];
  }
  function openWorkspaceSheet() {
    const cur = currentWorkspace();
    $('ws-list').innerHTML = WS.map((w) => `
      <button type="button" class="ws-item${w.id === cur.id ? ' active' : ''}" data-ws="${w.id}"${w.disabled ? ' disabled aria-disabled="true"' : ''}>
        <span class="ws-ic">${svg(w.icon, 22)}</span>
        <span class="ws-tx"><b>${w.name}</b><small>${w.disabled ? 'Belum tersedia · ' : ''}${w.desc}</small></span>
        ${w.id === cur.id ? `<span class="ws-check">${svg(I.check, 18)}</span>` : ''}
      </button>`).join('');
    openModal('modal-workspace');
  }

  /* ======================= NOTIFIKASI ======================= */
  const NCATS = { tagihan: 'Tagihan', utang: 'Utang', anggaran: 'Anggaran', bisnis: 'Bisnis' };
  function buildNotifications() {
    const out = [];
    const today = todayISODate();
    const dd = (s) => { const [y, m, d] = s.split('-').map(Number); const [ty, tm, td] = today.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5); };
    (state.bills || []).filter((b) => !b.paid && b.dueDate).forEach((b) => {
      const days = dd(b.dueDate);
      if (days > 3) return;
      out.push({ id: `bill:${b.id}:${b.dueDate}`, cat: 'tagihan', level: days < 0 ? 'late' : 'soon', title: b.name, text: (days < 0 ? `Terlambat ${-days} hari` : days === 0 ? 'Jatuh tempo hari ini' : days === 1 ? 'Jatuh tempo besok' : `Jatuh tempo ${days} hari lagi`) + ` · ${formatRupiah(b.amount)}`, go: 'tagihan', sort: days });
    });
    BK.getReminders().forEach((r) => {
      out.push({ id: `debt:${r.d.id}:${r.d.dueDate}`, cat: 'utang', level: r.days < 0 ? 'late' : 'soon', title: r.d.type === 'owe' ? `Bayar utang ke ${r.d.person}` : `Tagih piutang dari ${r.d.person}`, text: (r.days < 0 ? `Terlambat ${-r.days} hari` : r.days === 0 ? 'Jatuh tempo hari ini' : `${r.days} hari lagi`) + ` · ${formatRupiah(BK.debtRemaining(r.d))}`, go: 'hutang', sort: r.days });
    });
    const now = new Date();
    const ym = todayISODate().slice(0, 7);
    (state.budgets || []).forEach((bg) => {
      if (!(bg.monthlyLimit > 0)) return;
      const spent = state.transactions.filter((t) => t.type === 'expense' && BK.inReports(t) && t.categoryId === bg.categoryId && t.date.slice(0, 7) === ym).reduce((s, t) => s + t.amount, 0);
      const pct = Math.round((spent / bg.monthlyLimit) * 100);
      if (pct < 80) return;
      const c = BK.categoryById(bg.categoryId);
      out.push({ id: `budget:${bg.id || bg.categoryId}:${ym}:${pct >= 100 ? 'over' : 'near'}`, cat: 'anggaran', level: pct >= 100 ? 'late' : 'soon', title: `Anggaran ${c ? c.name : ''}`, text: pct >= 100 ? `Sudah melebihi batas (${pct}%)` : `Sudah terpakai ${pct}%`, go: 'anggaran', sort: pct >= 100 ? -2 : -1 });
    });
    if (BK._biz) {
      const map = BK._biz.stockMap();
      (state.items || []).forEach((i) => {
        const n = map[i.id];
        if (n <= i.minStock && (i.minStock > 0 || n <= 0)) out.push({ id: `stock:${i.id}:${n}`, cat: 'bisnis', level: n <= 0 ? 'late' : 'soon', title: `Stok ${i.name} ${n <= 0 ? 'habis' : 'menipis'}`, text: `Tersisa ${String(n).replace('.', ',')} ${i.unit}`, go: 'usaha', sort: n <= 0 ? -2 : 0 });
      });
    }
    return out.sort((a, b) => a.sort - b.sort);
  }
  function readSet() { try { return new Set(JSON.parse(ls.get('bukukas-notif-read') || '[]')); } catch (e) { return new Set(); } }
  function saveRead(set) { ls.set('bukukas-notif-read', JSON.stringify(Array.from(set).slice(-300))); }
  let nFilter = 'all';
  function renderNotifications() {
    const list = buildNotifications(), read = readSet();
    $('notif-filter').innerHTML = [['all', 'Semua']].concat(Object.entries(NCATS)).map(([k, l]) => `<button class="chip${nFilter === k ? ' active' : ''}" data-nf="${k}" type="button">${l}</button>`).join('');
    const shown = list.filter((n) => nFilter === 'all' || n.cat === nFilter);
    $('notif-root').innerHTML = shown.length
      ? `<div class="bk-list">${shown.map((n) => `<button type="button" class="bk-row notif ${n.level}${read.has(n.id) ? ' is-read' : ''}" data-n="${escapeHtml(n.id)}" data-go="${n.go}">
          <span class="notif-dot" aria-hidden="true"></span>
          <span class="bk-main"><b>${escapeHtml(n.title)}</b><small>${escapeHtml(n.text)}</small></span>
          <span class="bk-side"><small>${NCATS[n.cat]}</small>${read.has(n.id) ? '' : '<span class="badge-new">baru</span>'}</span></button>`).join('')}</div>`
      : `<div class="empty-state" style="display:block"><div class="empty-icon">${svg(I.bell, 26)}</div><p class="empty-title">Tidak ada notifikasi</p><p class="empty-desc">Tagihan, utang jatuh tempo, anggaran yang hampir habis, dan stok menipis akan muncul di sini.</p></div>`;
  }
  function updateBell() {
    updateWorkspaceChip();
    const badge = $('bell-badge');
    if (!badge) return;
    const read = readSet();
    const unread = buildNotifications().filter((n) => !read.has(n.id)).length;
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? '9+' : String(unread);
  }
  BK.updateBell = updateBell;
  BK.openNotifications = () => BK.switchView('notifikasi');
  BK.views.notifikasi = renderNotifications;

  /* ======================= PENCARIAN & FILTER TRANSAKSI ======================= */
  const tf = { q: '', cat: '', wallet: '', from: '', to: '' };
  const tfActive = () => !!(tf.cat || tf.wallet || tf.from || tf.to);
  BK.txFilterFn = (t) => {
    if (tf.cat && t.categoryId !== tf.cat) return false;
    if (tf.wallet && t.walletId !== tf.wallet && t.toWalletId !== tf.wallet) return false;
    if (tf.from && t.date < tf.from) return false;
    if (tf.to && t.date > tf.to) return false;
    if (tf.q) {
      const c = BK.categoryById(t.categoryId), w = BK.walletById(t.walletId);
      const hay = [t.note, c && c.name, w && w.name, String(t.amount)].join(' ').toLowerCase();
      if (!tf.q.toLowerCase().split(/\s+/).every((p) => hay.includes(p))) return false;
    }
    return true;
  };
  function openTxFilter() {
    BK.dynForm({
      title: 'Filter transaksi',
      submitText: 'Terapkan',
      fields: [
        { key: 'cat', label: 'Kategori', type: 'select', options: [['', 'Semua kategori']].concat(state.categories.map((c) => [c.id, c.name])), value: tf.cat },
        { key: 'wallet', label: 'Dompet', type: 'select', options: [['', 'Semua dompet']].concat(state.wallets.map((w) => [w.id, w.name])), value: tf.wallet },
        { key: 'from', label: 'Dari tanggal', type: 'date', value: tf.from },
        { key: 'to', label: 'Sampai tanggal', type: 'date', value: tf.to }
      ],
      danger: { text: 'Atur ulang filter', onClick: () => { tf.cat = tf.wallet = tf.from = tf.to = ''; closeModal('modal-dyn'); syncFilterDot(); BK.renderAll(); } },
      onSubmit: async (v) => {
        if (v.from && v.to && v.from > v.to) { showToast('Tanggal awal harus sebelum tanggal akhir.'); return false; }
        tf.cat = v.cat; tf.wallet = v.wallet; tf.from = v.from; tf.to = v.to;
        syncFilterDot(); BK.renderAll();
      }
    });
  }
  function syncFilterDot() { const d = $('tx-filter-dot'); if (d) d.hidden = !tfActive(); }

  /* ======================= REKONSILIASI SALDO ======================= */
  async function ensureCat(name, type) {
    let c = state.categories.find((x) => x.name === name && x.type === type);
    if (!c) { c = { id: DB.genId(), name, type }; await DB.saveCategory(c); await BK.reloadAll(); c = state.categories.find((x) => x.name === name && x.type === type) || c; }
    return c;
  }
  function openReconcile() {
    if (!state.wallets.length) { showToast('Tambahkan dompet dulu.'); return; }
    const sys = (id) => { const w = BK.walletById(id); return w ? BK.walletBalance(w) : 0; };
    const info = (v) => {
      const el = $('dyn-info-diff'); if (!el) return;
      const s = sys(v.wallet), a = v.actual, d = a - s;
      el.innerHTML = `<div class="kv"><span>Saldo di aplikasi</span><b>${formatRupiah(s)}</b></div>` + (a > 0 || $('dyn-actual').value
        ? `<div class="kv"><span>Selisih</span><b class="${d < 0 ? 'neg' : ''}">${d > 0 ? '+' : d < 0 ? '−' : ''}${formatRupiah(Math.abs(d))}</b></div><div class="kv"><span>Saldo setelah penyesuaian</span><b>${formatRupiah(a)}</b></div>` : '');
    };
    BK.dynForm({
      title: 'Rekonsiliasi saldo',
      submitText: 'Sesuaikan saldo',
      fields: [
        { key: 'wallet', label: 'Dompet', type: 'select', options: state.wallets.map((w) => [w.id, w.name]), onChange: (_, vals) => info(vals()) },
        { key: 'actual', label: 'Saldo sebenarnya (hasil cek)', type: 'money', required: true, onChange: (_, vals) => info(vals()) },
        { key: 'reason', label: 'Alasan penyesuaian', required: true, placeholder: 'Contoh: uang kembalian tak tercatat', max: 60 },
        { key: 'diff', type: 'info', html: '' }
      ],
      onSubmit: async (v) => {
        if (!v.reason) { showToast('Isi alasan penyesuaian.'); return false; }
        const w = BK.walletById(v.wallet); if (!w) return false;
        const diff = v.actual - BK.walletBalance(w);
        if (diff === 0) { showToast('Saldo sudah sama, tidak perlu penyesuaian.'); return false; }
        const type = diff > 0 ? 'income' : 'expense';
        const cat = await ensureCat('Penyesuaian Saldo', type);
        const t = { id: DB.genId(), type, amount: Math.abs(diff), categoryId: cat.id, walletId: w.id, date: todayISODate(), note: 'Penyesuaian saldo: ' + v.reason, adjust: true, source: 'manual', createdAt: new Date().toISOString() };
        await DB.atomic([{ s: 'transactions', put: t }, BK.auditRec('tambah', 'rekonsiliasi', t.id, `${w.name}: ${diff > 0 ? '+' : '−'}${formatRupiah(Math.abs(diff))} · ${v.reason}`)]);
        await BK.reloadAll(); BK.renderAll(); showToast('Saldo disesuaikan.');
      }
    });
    setTimeout(() => info({ wallet: $('dyn-wallet').value, actual: 0 }), 0);
  }
  BK.openReconcile = openReconcile;

  /* ======================= PROFIL ======================= */
  function renderProfil() {
    const name = ($('hdr-name') || {}).textContent || 'Buku Kas';
    const loggedIn = $('btn-hdr-daftar') ? $('btn-hdr-daftar').hidden : false;
    const mode = document.documentElement.getAttribute('data-theme-mode') || 'system';
    const row = (go, icon, title, desc) => `<button type="button" class="menu-item" data-pgo="${go}"><span class="menu-item-icon">${svg(icon, 22)}</span><span class="menu-item-text"><span class="menu-item-title">${title}</span><span class="menu-item-desc">${desc}</span></span><svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${I.chevron}</svg></button>`;
    $('profil-root').innerHTML = `
      <div class="profil-head"><span class="profil-avatar" aria-hidden="true">${escapeHtml(name.trim().charAt(0).toUpperCase() || 'B')}</span>
        <span class="profil-id"><b>${escapeHtml(name)}</b><small>${loggedIn ? 'Akun cloud aktif' : 'Mode tanpa akun · data di perangkat ini'}</small></span>
        <button type="button" class="btn-outline-sm" data-pgo="akun">${loggedIn ? 'Akun' : 'Masuk'}</button></div>
      <div class="card"><div class="settings-row-title">Ruang kerja</div>
        <button type="button" class="ws-current" data-pgo="__ws">${svg(currentWorkspace().icon, 20)}<span>${currentWorkspace().name}</span>${svg('<path d="M6 9l6 6 6-6"/>', 16)}</button></div>
      <div class="card"><div class="settings-row-title">Mode tampilan</div>
        <div class="theme-seg" role="group" aria-label="Mode tampilan">
          ${[['light', 'Terang'], ['dark', 'Gelap'], ['system', 'Sistem']].map(([k, l]) => `<button type="button" class="segment${mode === k ? ' active' : ''}" data-theme-set="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}
        </div></div>
      <div class="menu-list">
        ${row('notifikasi', I.bell, 'Notifikasi', 'Tagihan, utang, anggaran, stok')}
        ${row('akun', I.lock, 'Akun & Kunci PIN', 'Login cloud dan PIN aplikasi')}
        ${row('pengaturan', I.cog, 'Pengaturan & Cadangan', 'Pengingat, backup, pulihkan, reset')}
        ${row('ekspor', I.down, 'Ekspor Data', 'CSV, Excel, PDF')}
        ${row('riwayat', I.clock, 'Riwayat Aktivitas', 'Jejak perubahan data')}
        ${row('lainnya', I.grid, 'Semua Modul', 'Tagihan, aset, kalender, usaha, kelompok')}
        ${row('bantuan', I.help, 'Bantuan & FAQ', 'Cara pakai, privasi, tentang aplikasi')}
      </div>`;
  }

  /* ======================= BANTUAN ======================= */
  const FAQ = [
    ['Bagaimana cara mencatat transaksi?', 'Ketuk tombol + di tengah bawah, lalu pilih jenisnya: pemasukan, pengeluaran, transfer, menabung, utang, piutang, pindai struk, atau input suara. Sebelum menyimpan, periksa nominal, kategori, dan dompet.'],
    ['Apa beda transfer dengan pemasukan/pengeluaran?', 'Transfer hanya memindahkan uang antar dompet, sehingga tidak masuk laporan pemasukan atau pengeluaran. Saldo total tidak berubah, hanya letaknya.'],
    ['Apakah menabung dihitung pengeluaran?', 'Tidak. Setoran tabungan memindahkan uang dari dompet ke target, jadi tidak mengurangi kekayaan dan tidak masuk laporan pengeluaran. Menarik tabungan juga bukan pemasukan baru.'],
    ['Bagaimana utang dan piutang bekerja?', 'Saat kamu meminjam, uang pokok masuk ke dompet tetapi bukan pendapatan. Saat membayar, saldo dompet dan sisa utang sama-sama berkurang. Piutang kebalikannya: saat dibayar, kas bertambah dan piutang berkurang.'],
    ['Di mana data saya disimpan?', 'Di penyimpanan aplikasi pada perangkat ini. Jika kamu masuk dengan akun, data disinkronkan ke cloud. Tanpa akun, data tidak meninggalkan perangkat — jadi buat cadangan secara berkala.'],
    ['Bagaimana cara membuat cadangan?', 'Buka Profil → Pengaturan & Cadangan → Export Backup JSON. Untuk memulihkan, pakai Import Backup JSON. Pulihkan hanya dari file yang kamu buat sendiri.'],
    ['Saya lupa PIN. Apa yang harus dilakukan?', 'Di layar kunci pilih lupa PIN dan jawab pertanyaan keamanan yang kamu atur. Jika gagal, satu-satunya jalan adalah menghapus data aplikasi, jadi simpan cadangan.'],
    ['Seberapa akurat pemindaian struk dan input suara?', 'Hasilnya berupa tebakan yang selalu ditampilkan untuk kamu periksa dulu. Aplikasi tidak menyimpan transaksi otomatis tanpa konfirmasimu.'],
    ['Apa yang dimaksud ruang kerja?', 'Pribadi, Bisnis/UMKM, dan Kelompok punya pembukuan terpisah: transaksi usaha tidak masuk laporan pribadi, dan kas kelompok punya saldo sendiri. Ruang kerja Keluarga (banyak pengguna) belum tersedia.']
  ];
  const ABOUT = [
    ['Kebijakan privasi (ringkasan)', 'Buku Kas menyimpan data keuangan di perangkatmu. Jika kamu masuk dengan akun, data tersebut juga disimpan di layanan cloud (Firebase) milik akunmu agar bisa disinkronkan. Aplikasi tidak menjual data dan tidak menampilkan iklan. Ini ringkasan teknis dan belum ditinjau secara hukum; sebelum dirilis publik, gunakan kebijakan privasi resmi.'],
    ['Syarat penggunaan (ringkasan)', 'Aplikasi ini alat bantu pencatatan, bukan nasihat keuangan, pajak, atau hukum. Kamu bertanggung jawab memeriksa ketepatan data dan membuat cadangan. Gunakan teks resmi yang ditinjau hukum sebelum dirilis publik.'],
    ['Tentang Buku Kas', 'Aplikasi pencatatan keuangan untuk individu, usaha kecil, dan kelompok. Berjalan offline, dengan login Google opsional.']
  ];
  function renderBantuan() {
    const det = (arr) => arr.map(([q, a]) => `<details class="faq"><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join('');
    $('bantuan-root').innerHTML = `
      <div class="card"><div class="card-header"><h2 class="card-title">Pertanyaan umum</h2></div>${det(FAQ)}</div>
      <div class="card"><div class="card-header"><h2 class="card-title">Informasi</h2></div>${det(ABOUT)}</div>
      <button type="button" class="btn-secondary" id="btn-show-onboarding">Lihat pengantar lagi</button>`;
  }

  /* ======================= ONBOARDING ======================= */
  const SLIDES = [
    { icon: I.wallet, title: 'Atur keuangan pribadi', text: 'Catat pemasukan dan pengeluaran, pantau saldo semua dompet, dan lihat ke mana uangmu pergi.' },
    { icon: I.home, title: 'Siap untuk keluarga', text: 'Tabungan bersama, anggaran rumah tangga, dan tagihan rutin. Fitur multi-pengguna masih dalam rencana.' },
    { icon: I.shop, title: 'Kelola usaha kecil', text: 'Stok, penjualan, piutang pelanggan, dan laba — dibukukan terpisah dari keuangan pribadimu.' },
    { icon: I.users, title: 'Kas kelompok', text: 'Iuran RT, arisan, atau patungan: siapa sudah bayar, siapa belum, dan saldo kas dalam satu tempat.' },
    { icon: I.scan, title: 'Catat lebih cepat', text: 'Pindai struk, ucapkan transaksi, atau impor mutasi bank. Selalu ada langkah konfirmasi sebelum disimpan.' }
  ];
  let obIndex = 0, obDone = null;
  function obRender() {
    const s = SLIDES[obIndex], last = obIndex === SLIDES.length - 1;
    $('ob-body').innerHTML = `<div class="ob-art" aria-hidden="true"><span class="ob-ring"></span>${svg(s.icon, 56)}</div><h2 class="ob-title">${s.title}</h2><p class="ob-text">${s.text}</p>`;
    $('ob-dots').innerHTML = SLIDES.map((_, i) => `<i class="${i === obIndex ? 'on' : ''}"></i>`).join('');
    $('ob-next').textContent = last ? 'Mulai' : 'Lanjutkan';
    $('ob-skip').hidden = last;
  }
  function obClose() {
    const el = $('onboarding'); if (!el) return;
    ls.set('bukukas-onboarded', '1');
    el.classList.add('out');
    setTimeout(() => { el.remove(); }, 260);
    const cb = obDone; obDone = null;
    if (cb) cb();
  }
  function buildOnboarding(done) {
    if ($('onboarding')) return;
    obIndex = 0; obDone = done;
    const el = document.createElement('div');
    el.id = 'onboarding'; el.className = 'onboarding'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Pengantar Buku Kas');
    el.innerHTML = `<div class="ob-top"><button type="button" class="ob-skip" id="ob-skip">Lewati</button></div><div class="ob-body" id="ob-body"></div><div class="ob-foot"><div class="ob-dots" id="ob-dots"></div><button type="button" class="btn-primary ob-next" id="ob-next">Lanjutkan</button></div>`;
    document.body.appendChild(el);
    $('ob-skip').addEventListener('click', obClose);
    $('ob-next').addEventListener('click', () => { if (obIndex >= SLIDES.length - 1) obClose(); else { obIndex++; obRender(); } });
    obRender();
  }
  BK.maybeOnboard = (done) => { if (ls.get('bukukas-onboarded') === '1') { done(); return; } buildOnboarding(done); };
  BK.showOnboarding = () => buildOnboarding(null);

  /* ======================= AKSI DASBOR & EVENT ======================= */
  const QA = {
    tambah: openAddSheet,
    suara: () => BK.openQuick && BK.openQuick(),
    scan: startScan,
    transfer: () => BK.openTxDraft({ type: 'transfer' }),
    tabung: startSaving,
    utang: () => startDebt('owe'),
    dompet: () => BK.switchView('dompet'),
    modul: () => BK.switchView('lainnya')
  };

  function bind() {
    $('add-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (!b) return; guard(ACTIONS[b.dataset.add].run)(); });
    $('qa-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-qa]'); if (b) QA[b.dataset.qa](); });
    $('dash-period').addEventListener('click', (e) => { const b = e.target.closest('[data-dperiod]'); if (!b) return; state.dashPeriod = b.dataset.dperiod; BK.renderAll(); });
    $('btn-hide-balance').addEventListener('click', () => { const s = BK.loadSettings(); s.hideBalance = !s.hideBalance; BK.saveSettings(s); BK.renderAll(); });
    $('hdr-ws').addEventListener('click', openWorkspaceSheet);
    $('btn-hdr-search').addEventListener('click', () => { BK.switchView('transaksi'); setTimeout(() => $('tx-search').focus(), 80); });
    $('ws-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ws]'); if (!b || b.disabled) return;
      const w = WS.find((x) => x.id === b.dataset.ws);
      closeModal('modal-workspace'); BK.switchView(w.go || 'dashboard');
    });
    $('tx-search').addEventListener('input', (e) => { tf.q = e.target.value.trim(); BK.renderAll(); });
    $('btn-tx-filter').addEventListener('click', openTxFilter);
    $('notif-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-nf]'); if (!b) return; nFilter = b.dataset.nf; renderNotifications(); });
    $('notif-root').addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]'); if (!b) return;
      const r = readSet(); r.add(b.dataset.n); saveRead(r); updateBell();
      BK.switchView(b.dataset.go);
    });
    $('btn-notif-readall').addEventListener('click', () => { const r = readSet(); buildNotifications().forEach((n) => r.add(n.id)); saveRead(r); renderNotifications(); updateBell(); });
    $('profil-root').addEventListener('click', (e) => {
      const t = e.target.closest('[data-theme-set]');
      if (t) { BK.setThemeMode(t.dataset.themeSet); renderProfil(); return; }
      const b = e.target.closest('[data-pgo]'); if (!b) return;
      if (b.dataset.pgo === '__ws') openWorkspaceSheet(); else BK.switchView(b.dataset.pgo);
    });
    $('bantuan-root').addEventListener('click', (e) => { if (e.target.closest('#btn-show-onboarding')) BK.showOnboarding(); });
    // Dompet: tombol rekonsiliasi
    const head = document.querySelector('#view-dompet .view-header-row');
    if (head) { const b = document.createElement('button'); b.className = 'btn-outline-sm'; b.id = 'btn-reconcile'; b.type = 'button'; b.textContent = 'Rekonsiliasi'; b.addEventListener('click', openReconcile); head.appendChild(b); }
    // Semua Modul: judul + tombol kembali
    const lain = document.querySelector('#view-lainnya .view-title');
    if (lain) { lain.textContent = 'Semua Modul'; }
  }

  BK.views.profil = renderProfil;
  BK.views.bantuan = renderBantuan;
  BK._shell = { buildNotifications, tf, currentWorkspace, SLIDES };
  bind();
  syncFilterDot();
})();
