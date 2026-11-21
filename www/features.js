/* ============================================================
   features.js — Tagihan, Aset & Kekayaan Bersih, Kalender,
   Ekspor (CSV/Excel/PDF), Riwayat Aktivitas.
   Memakai jembatan window.BK dari script.js.
   ============================================================ */
(function () {
  'use strict';

  const BK = window.BK;
  if (!BK) return;
  const { state, DB, NATIVE, formatRupiah, escapeHtml, formatDateShort, todayISODate, parseAmount, showToast, openModal, closeModal, askConfirm } = BK;
  const $ = (id) => document.getElementById(id);

  /* ---------- util tanggal (tanpa zona waktu: hanya string YYYY-MM-DD) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  function parseISO(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return { y, m: m - 1, d }; }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function addDays(s, n) { const { y, m, d } = parseISO(s); const dt = new Date(y, m, d + n); return iso(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
  /* Maju satu periode; bulanan/tahunan memakai hari jangkar agar tidak "melorot" (31 Jan -> 28 Feb -> 31 Mar). */
  function nextDue(dateStr, repeat, anchorDay) {
    const { y, m, d } = parseISO(dateStr);
    if (repeat === 'weekly') return addDays(dateStr, 7);
    const day = anchorDay || d;
    if (repeat === 'yearly') { const ny = y + 1; return iso(ny, m, Math.min(day, daysInMonth(ny, m))); }
    const nm = m + 1, ny = y + Math.floor(nm / 12), mm = nm % 12;
    return iso(ny, mm, Math.min(day, daysInMonth(ny, mm)));
  }
  function daysFromToday(s) {
    const a = parseISO(s), t = parseISO(todayISODate());
    return Math.round((Date.UTC(a.y, a.m, a.d) - Date.UTC(t.y, t.m, t.d)) / 86400000);
  }
  function dueLabel(days) {
    if (days < 0) return `Terlambat ${-days} hari`;
    if (days === 0) return 'Jatuh tempo hari ini';
    if (days === 1) return 'Besok';
    return `${days} hari lagi`;
  }
  const REPEAT_LABEL = { once: 'Sekali', weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan' };

  /* ---------- muat data baru ---------- */
  state.bills = []; state.assets = []; state.audit = [];
  async function loadExtra() {
    const [b, a, au] = await Promise.all([DB.getBills(), DB.getAssets(), DB.getAudit()]);
    state.bills = b; state.assets = a; state.audit = au;
  }
  async function refresh() {
    await loadExtra();
    await BK.reloadAll();
    BK.renderAll();
  }
  /* reloadAll milik script.js hanya memuat data lama; sambungkan agar data baru selalu segar. */
  const origReload = BK.reloadAll;
  BK.reloadAll = async function () { await origReload.apply(null, arguments); await loadExtra(); };

  /* ======================= TAGIHAN ======================= */
  function activeBills() { return state.bills.filter((b) => !b.paid); }
  function sortedBills() {
    return state.bills.slice().sort((a, b) => (Number(!!a.paid) - Number(!!b.paid)) || a.dueDate.localeCompare(b.dueDate));
  }

  function renderBills() {
    const list = sortedBills();
    $('bill-empty').style.display = list.length ? 'none' : 'block';
    const act = activeBills();
    const late = act.filter((b) => daysFromToday(b.dueDate) < 0);
    const week = act.filter((b) => { const d = daysFromToday(b.dueDate); return d >= 0 && d <= 7; });
    const sum = (arr) => arr.reduce((s, b) => s + b.amount, 0);
    $('bill-summary').innerHTML = `
      <div class="bk-stats">
        <div><span class="bk-stat-label">Terlambat</span><b class="${late.length ? 'neg' : ''}">${formatRupiah(sum(late))}</b><small>${late.length} tagihan</small></div>
        <div><span class="bk-stat-label">7 hari ke depan</span><b>${formatRupiah(sum(week))}</b><small>${week.length} tagihan</small></div>
      </div>`;
    $('bill-list').innerHTML = list.map((b) => {
      const days = daysFromToday(b.dueDate);
      const cls = b.paid ? 'done' : days < 0 ? 'late' : days <= 3 ? 'soon' : '';
      const cat = BK.categoryById(b.categoryId);
      return `<div class="bk-row ${cls}" data-bill="${b.id}">
        ${BK.iconHTML(b.name, 40, 'receipt')}
        <span class="bk-main"><b>${escapeHtml(b.name)}</b>
          <small>${b.paid ? 'Lunas' : escapeHtml(dueLabel(days))} · ${formatDateShort(b.dueDate)} · ${REPEAT_LABEL[b.repeat] || ''}${cat ? ' · ' + escapeHtml(cat.name) : ''}</small></span>
        <span class="bk-side"><b>${formatRupiah(b.amount)}</b>
          ${b.paid ? '' : `<button type="button" class="btn-outline-sm" data-pay-bill="${b.id}">Bayar</button>`}</span>
      </div>`;
    }).join('');
  }

  function fillBillSelects(bill) {
    $('bill-category').innerHTML = state.categories.filter((c) => c.type === 'expense').map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    $('bill-wallet').innerHTML = state.wallets.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
    if (bill) { $('bill-category').value = bill.categoryId; $('bill-wallet').value = bill.walletId; }
  }

  /* Tagihan punya kategori sendiri ("Tagihan"), bukan kategori pertama di daftar (mis. Makan). */
  async function ensureBillCategory() {
    let c = state.categories.find((x) => x.type === 'expense' && x.name === 'Tagihan');
    if (!c) {
      c = { id: DB.genId(), name: 'Tagihan', type: 'expense' };
      await DB.saveCategory(c);
      await BK.reloadAll();
    }
    return c;
  }
  /* Jika ada kategori buatan sendiri yang namanya cocok dengan nama tagihan (mis. "Listrik"), pakai itu. */
  function guessBillCategory(name) {
    const n = String(name || '').trim().toLowerCase();
    if (n.length < 3) return null;
    return state.categories.find((c) => c.type === 'expense' && c.name !== 'Tagihan' && c.name.toLowerCase() === n) || null;
  }

  async function openBillModal(id, draft) {
    if (!state.wallets.length) { showToast('Tambahkan dompet terlebih dahulu.'); BK.switchView('dompet'); return; }
    const bill = id ? state.bills.find((b) => b.id === id) : null;
    const defCat = await ensureBillCategory();
    $('form-bill').reset();
    fillBillSelects(bill);
    if (!bill) $('bill-category').value = defCat.id;
    $('bill-category').dataset.touched = '';
    $('bill-id').value = bill ? bill.id : '';
    $('bill-modal-title').textContent = bill ? 'Edit Tagihan' : 'Tambah Tagihan';
    $('bill-delete-btn').hidden = !bill;
    if (bill) {
      $('bill-name').value = bill.name;
      $('bill-amount').value = bill.amount.toLocaleString('id-ID');
      $('bill-repeat').value = bill.repeat;
      $('bill-due').value = bill.dueDate;
      $('bill-note').value = bill.note || '';
    } else if (draft) {
      $('bill-name').value = draft.name || '';
      $('bill-amount').value = draft.amount ? draft.amount.toLocaleString('id-ID') : '';
      $('bill-repeat').value = draft.repeat || 'monthly';
      $('bill-due').value = draft.dueDate || todayISODate();
      if (draft.categoryId) $('bill-category').value = draft.categoryId;
      if (draft.walletId) $('bill-wallet').value = draft.walletId;
    } else {
      $('bill-due').value = todayISODate();
    }
    openModal('modal-bill');
  }

  async function submitBill(e) {
    e.preventDefault();
    const id = $('bill-id').value || null;
    const name = $('bill-name').value.trim();
    const amount = parseAmount($('bill-amount').value);
    const due = $('bill-due').value;
    if (!name || amount <= 0 || !due) { showToast('Lengkapi nama, nominal, dan tanggal.'); return; }
    const existing = id ? state.bills.find((b) => b.id === id) : null;
    const bill = Object.assign({}, existing || {}, {
      id: id || DB.genId(), name, amount, repeat: $('bill-repeat').value,
      categoryId: $('bill-category').value, walletId: $('bill-wallet').value,
      dueDate: due, anchorDay: parseISO(due).d, note: $('bill-note').value.trim(), paid: false
    });
    if (existing && existing.paid && due === existing.dueDate) bill.paid = true;
    await DB.atomic([{ s: 'bills', put: bill }, BK.auditRec(existing ? 'ubah' : 'tambah', 'tagihan', bill.id, `${name} ${formatRupiah(amount)}`)]);
    await refresh();
    closeModal('modal-bill');
    showToast(existing ? 'Tagihan diperbarui.' : 'Tagihan ditambahkan.');
  }

  let payingBill = false;
  async function payBill(id) {
    if (payingBill) return;
    const b = state.bills.find((x) => x.id === id);
    if (!b || b.paid) return;
    const w = BK.walletById(b.walletId);
    if (!w) { showToast('Dompet tagihan ini sudah tidak ada. Edit tagihannya dulu.'); return; }
    if (BK.walletBalance(w) < b.amount) { showToast('Saldo dompet ' + w.name + ' tidak cukup.'); return; }
    payingBill = true;
    try {
      const paidTx = { id: DB.genId(), type: 'expense', amount: b.amount, categoryId: b.categoryId, walletId: b.walletId, date: todayISODate(),
        note: 'Tagihan: ' + b.name, billId: b.id, source: 'manual', createdAt: new Date().toISOString() };
      const nb = Object.assign({}, b, { lastPaidDate: todayISODate() });
      if (b.repeat === 'once') nb.paid = true; else nb.dueDate = nextDue(b.dueDate, b.repeat, b.anchorDay);
      await DB.atomic([{ s: 'transactions', put: paidTx }, { s: 'bills', put: nb },
        BK.auditRec('tambah', 'tagihan', b.id, `Bayar ${b.name} ${formatRupiah(b.amount)}`)]);
      await refresh();
      BK.celebrate && BK.celebrate('check');
      showToast(b.repeat === 'once' ? 'Tagihan lunas.' : 'Dibayar. Jatuh tempo berikutnya ' + formatDateShort(nb.dueDate) + '.');
    } finally { payingBill = false; }
  }

  function deleteBill() {
    const id = $('bill-id').value;
    const b = state.bills.find((x) => x.id === id);
    if (!b) return;
    askConfirm('Hapus tagihan ini? Transaksi yang sudah tercatat tidak ikut dihapus.', async () => {
      await DB.atomic([{ s: 'bills', del: id }, BK.auditRec('hapus', 'tagihan', id, 'Hapus tagihan ' + b.name)]);
      await refresh();
      closeModal('modal-bill');
      showToast('Tagihan dihapus.');
    });
  }

  /* ======================= ASET & KEKAYAAN ======================= */
  const ASSET_ICON_NAME = { emas: 'emas', kendaraan: 'kendaraan', properti: 'properti', barang: 'barang berharga', investasi: 'investasi', lainnya: 'Lainnya' };
  const ASSET_LABEL = { emas: 'Emas', kendaraan: 'Kendaraan', properti: 'Properti', barang: 'Barang berharga', investasi: 'Investasi', lainnya: 'Lainnya' };

  function netWorth() {
    const wallets = BK.totalBalance();
    const savings = BK.totalSavings();
    const assets = state.assets.reduce((s, a) => s + a.value, 0);
    const open = state.debts.map((d) => ({ d, r: BK.debtRemaining(d) }));
    const owe = open.filter((x) => x.d.type === 'owe').reduce((s, x) => s + x.r, 0);
    const lent = open.filter((x) => x.d.type === 'lent').reduce((s, x) => s + x.r, 0);
    return { wallets, savings, assets, lent, owe, total: wallets + savings + assets + lent - owe };
  }

  function renderAssets() {
    const n = netWorth();
    const row = (label, v, cls) => `<div class="bk-line"><span>${label}</span><b class="${cls || ''}">${v < 0 ? '−' : ''}${formatRupiah(Math.abs(v))}</b></div>`;
    $('networth-card').innerHTML = `
      <span class="bk-stat-label">Kekayaan bersih</span>
      <div class="bk-big ${n.total < 0 ? 'neg' : ''}">${n.total < 0 ? '−' : ''}${formatRupiah(Math.abs(n.total))}</div>
      ${row('Saldo dompet', n.wallets)}${row('Tabungan target', n.savings)}${row('Aset', n.assets)}
      ${row('Piutang', n.lent)}${row('Hutang', -n.owe, n.owe ? 'neg' : '')}`;
    const list = state.assets.slice().sort((a, b) => b.value - a.value);
    $('asset-empty').style.display = list.length ? 'none' : 'block';
    $('asset-list').innerHTML = list.map((a) => `<div class="bk-row" data-asset="${a.id}">
      ${BK.iconHTML(ASSET_ICON_NAME[a.kind] || 'Lainnya', 40)}
      <span class="bk-main"><b>${escapeHtml(a.name)}</b><small>${escapeHtml(ASSET_LABEL[a.kind] || 'Lainnya')}${a.note ? ' · ' + escapeHtml(a.note) : ''}</small></span>
      <span class="bk-side"><b>${formatRupiah(a.value)}</b></span></div>`).join('');
  }

  function openAssetModal(id) {
    const a = id ? state.assets.find((x) => x.id === id) : null;
    $('form-asset').reset();
    $('asset-id').value = a ? a.id : '';
    $('asset-modal-title').textContent = a ? 'Edit Aset' : 'Tambah Aset';
    $('asset-delete-btn').hidden = !a;
    if (a) {
      $('asset-name').value = a.name; $('asset-kind').value = a.kind;
      $('asset-value').value = a.value.toLocaleString('id-ID'); $('asset-note').value = a.note || '';
    }
    openModal('modal-asset');
  }

  async function submitAsset(e) {
    e.preventDefault();
    const id = $('asset-id').value || null;
    const name = $('asset-name').value.trim();
    const value = parseAmount($('asset-value').value);
    if (!name || value <= 0) { showToast('Lengkapi nama dan nilai aset.'); return; }
    const existing = id ? state.assets.find((x) => x.id === id) : null;
    const asset = Object.assign({}, existing || {}, { id: id || DB.genId(), name, kind: $('asset-kind').value, value, note: $('asset-note').value.trim() });
    await DB.atomic([{ s: 'assets', put: asset }, BK.auditRec(existing ? 'ubah' : 'tambah', 'aset', asset.id, `${name} ${formatRupiah(value)}`)]);
    await refresh();
    closeModal('modal-asset');
    showToast(existing ? 'Aset diperbarui.' : 'Aset ditambahkan.');
  }

  function deleteAsset() {
    const id = $('asset-id').value;
    const a = state.assets.find((x) => x.id === id);
    if (!a) return;
    askConfirm('Hapus aset ini?', async () => {
      await DB.atomic([{ s: 'assets', del: id }, BK.auditRec('hapus', 'aset', id, 'Hapus aset ' + a.name)]);
      await refresh();
      closeModal('modal-asset');
      showToast('Aset dihapus.');
    });
  }

  /* ======================= KALENDER ======================= */
  let calRef = new Date();
  let calSel = todayISODate();

  function eventsOn(dateStr) {
    const bills = activeBills().filter((b) => b.dueDate === dateStr);
    const debts = state.debts.filter((d) => d.dueDate === dateStr && BK.debtRemaining(d) > 0);
    const txs = state.transactions.filter((t) => t.date === dateStr);
    return { bills, debts, txs };
  }

  function renderCalendar() {
    const y = calRef.getFullYear(), m = calRef.getMonth();
    $('cal-title').textContent = BK.monthLabel(calRef);
    const first = (new Date(y, m, 1).getDay() + 6) % 7; // Senin = 0
    const dim = daysInMonth(y, m);
    const today = todayISODate();
    let html = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => `<span class="cal-dow">${d}</span>`).join('');
    for (let i = 0; i < first; i++) html += '<span class="cal-cell empty"></span>';
    for (let d = 1; d <= dim; d++) {
      const ds = iso(y, m, d);
      const ev = eventsOn(ds);
      html += `<button type="button" class="cal-cell${ds === today ? ' today' : ''}${ds === calSel ? ' sel' : ''}" data-date="${ds}">
        <span>${d}</span><span class="cal-dots">${ev.bills.length ? '<i class="dot dot-bill"></i>' : ''}${ev.debts.length ? '<i class="dot dot-debt"></i>' : ''}${ev.txs.length ? '<i class="dot dot-tx"></i>' : ''}</span></button>`;
    }
    $('cal-grid').innerHTML = html;
    renderCalendarDay();
  }

  function renderCalendarDay() {
    const ev = eventsOn(calSel);
    $('cal-day-title').textContent = formatDateShort(calSel);
    const rows = [];
    ev.bills.forEach((b) => rows.push(`<div class="bk-row soon">${BK.iconHTML(b.name, 40, 'receipt')}<span class="bk-main"><b>${escapeHtml(b.name)}</b><small>Tagihan jatuh tempo</small></span><span class="bk-side"><b>${formatRupiah(b.amount)}</b></span></div>`));
    ev.debts.forEach((d) => rows.push(`<div class="bk-row late">${BK.iconHTML('Hutang & Piutang', 40)}<span class="bk-main"><b>${escapeHtml(d.person)}</b><small>${d.type === 'owe' ? 'Hutang jatuh tempo' : 'Piutang jatuh tempo'}</small></span><span class="bk-side"><b>${formatRupiah(BK.debtRemaining(d))}</b></span></div>`));
    ev.txs.forEach((t) => {
      const lbl = t.type === 'transfer' ? 'Transfer' : t.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
      rows.push(`<div class="bk-row">${BK.txIconHTML(t, 40)}<span class="bk-main"><b>${escapeHtml(t.note || lbl)}</b><small>${lbl}</small></span><span class="bk-side"><b class="${t.type === 'expense' ? 'neg' : ''}">${formatRupiah(t.amount)}</b></span></div>`);
    });
    $('cal-day-list').innerHTML = rows.length ? rows.join('') : '<p class="empty-desc">Tidak ada kegiatan di tanggal ini.</p>';
  }

  /* ======================= RIWAYAT ======================= */
  function renderAudit() {
    const list = state.audit.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
    $('audit-empty').style.display = list.length ? 'none' : 'block';
    const verb = { tambah: 'Ditambah', ubah: 'Diubah', hapus: 'Dihapus' };
    $('audit-list').innerHTML = list.map((a) => {
      const dt = new Date(a.at);
      const when = isNaN(dt) ? '' : `${formatDateShort(iso(dt.getFullYear(), dt.getMonth(), dt.getDate()))} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      return `<div class="bk-row ${a.action === 'hapus' ? 'late' : ''}"><span class="bk-main"><b>${escapeHtml(a.summary)}</b>
        <small>${verb[a.action] || escapeHtml(a.action)} · ${escapeHtml(a.entity)} · ${when}</small></span></div>`;
    }).join('');
  }

  /* ======================= DASHBOARD EXTRA ======================= */
  function renderDashExtra() {
    const n = netWorth();
    const soon = activeBills().map((b) => ({ b, d: daysFromToday(b.dueDate) })).filter((x) => x.d <= 7).sort((a, b) => a.d - b.d).slice(0, 3);
    $('dash-extra').innerHTML = `<div class="card bk-dash">
      <button type="button" class="bk-dash-row" data-go="quick"><span>Catat cepat (ketik atau suara)</span><b>+</b></button>
      <button type="button" class="bk-dash-row" data-go="aset"><span>Kekayaan bersih</span><b class="${n.total < 0 ? 'neg' : ''}">${n.total < 0 ? '−' : ''}${formatRupiah(Math.abs(n.total))}</b></button>
      ${soon.map((x) => `<button type="button" class="bk-dash-row ${x.d < 0 ? 'late' : ''}" data-go="tagihan"><span>${escapeHtml(x.b.name)} · ${escapeHtml(dueLabel(x.d))}</span><b>${formatRupiah(x.b.amount)}</b></button>`).join('')}
    </div>`;
  }

  /* ======================= EKSPOR ======================= */
  function periodRange() {
    const p = $('ex-period').value;
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    if (p === 'month') return { from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)), label: BK.monthLabel(now) };
    if (p === 'lastmonth') { const d = new Date(y, m - 1, 1); return { from: iso(d.getFullYear(), d.getMonth(), 1), to: iso(d.getFullYear(), d.getMonth(), daysInMonth(d.getFullYear(), d.getMonth())), label: BK.monthLabel(d) }; }
    if (p === 'year') return { from: iso(y, 0, 1), to: iso(y, 11, 31), label: 'Tahun ' + y };
    if (p === 'custom') { const f = $('ex-from').value || '0000-01-01', t = $('ex-to').value || '9999-12-31'; return { from: f, to: t, label: `${f} s/d ${t}` }; }
    return { from: '0000-01-01', to: '9999-12-31', label: 'Semua data' };
  }

  function exportRows() {
    const r = periodRange();
    const list = state.transactions.filter((t) => t.date >= r.from && t.date <= r.to).slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const rows = list.map((t) => {
      const cat = BK.categoryById(t.categoryId);
      const from = BK.walletById(t.walletId), to = BK.walletById(t.toWalletId);
      const jenis = t.type === 'transfer' ? 'Transfer' : t.goalId ? (t.type === 'expense' ? 'Setoran tabungan' : 'Penarikan tabungan')
        : t.debtId ? (t.type === 'expense' ? 'Pembayaran/pemberian pinjaman' : 'Penerimaan/pinjaman masuk') : (t.type === 'income' ? 'Pemasukan' : 'Pengeluaran');
      return [t.date, jenis, cat ? cat.name : '', t.type === 'transfer' ? `${from ? from.name : ''} → ${to ? to.name : ''}` : (from ? from.name : ''),
        t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0, t.note || '', t.source === 'ocr' ? 'Scan struk' : 'Manual'];
    });
    return { range: r, list, rows };
  }
  const HEADER = ['Tanggal', 'Jenis', 'Kategori', 'Dompet', 'Nominal (+masuk/−keluar)', 'Catatan', 'Sumber'];

  function summaryData(list) {
    const real = list.filter((t) => BK.inReports(t));
    const income = real.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = real.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const byCat = {};
    real.filter((t) => t.type === 'expense').forEach((t) => { const c = BK.categoryById(t.categoryId); const k = c ? c.name : 'Tanpa kategori'; byCat[k] = (byCat[k] || 0) + t.amount; });
    return { income, expense, net: income - expense, byCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]) };
  }

  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s; // cegah injeksi formula di Excel/Sheets
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function buildCSV(rows) {
    return '﻿' + [HEADER].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  /* ---- simpan / bagikan berkas (browser, atau APK lewat Filesystem + Share) ---- */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  window.BKFile = {
    save: async function (name, mime, blob) {
      try {
        if (NATIVE) {
          const FS = window.Capacitor.registerPlugin('Filesystem');
          const Share = window.Capacitor.registerPlugin('Share');
          const data = await blobToBase64(blob);
          const w = await FS.writeFile({ path: name, data, directory: 'CACHE', recursive: true });
          await Share.share({ title: name, dialogTitle: 'Simpan / bagikan ' + name, url: w.uri });
          return true;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        return true;
      } catch (e) {
        if (e && /cancel/i.test(String(e.message || e))) return false;
        showToast('Gagal menyimpan berkas.');
        return false;
      }
    }
  };

  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('Gagal memuat ' + src));
      document.head.appendChild(el);
    });
  }

  function stamp() { return todayISODate(); }

  async function exportCSV() {
    const { rows } = exportRows();
    if (!rows.length) { showToast('Tidak ada transaksi pada periode ini.'); return; }
    const ok = await window.BKFile.save(`bukukas-transaksi-${stamp()}.csv`, 'text/csv', new Blob([buildCSV(rows)], { type: 'text/csv;charset=utf-8' }));
    if (ok) showToast('CSV siap.');
  }

  async function exportXLSX() {
    const { range, list, rows } = exportRows();
    if (!rows.length) { showToast('Tidak ada transaksi pada periode ini.'); return; }
    await loadScript('vendor/xlsx.full.min.js', () => !!window.XLSX);
    const X = window.XLSX;
    const sd = summaryData(list);
    const wb = X.utils.book_new();
    const ws1 = X.utils.aoa_to_sheet([HEADER].concat(rows));
    ws1['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 34 }, { wch: 12 }];
    X.utils.book_append_sheet(wb, ws1, 'Transaksi');
    const sum = [['Ringkasan', range.label], ['Total pemasukan', sd.income], ['Total pengeluaran', sd.expense], ['Selisih', sd.net], [], ['Pengeluaran per kategori', 'Nominal']].concat(sd.byCat);
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(sum), 'Ringkasan');
    const w = [['Dompet', 'Saldo']].concat(state.wallets.map((x) => [x.name, BK.walletBalance(x)]));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(w), 'Dompet');
    const d = [['Jenis', 'Pihak', 'Nominal awal', 'Sisa', 'Jatuh tempo']].concat(state.debts.map((x) => [x.type === 'owe' ? 'Hutang' : 'Piutang', x.person, x.amount, BK.debtRemaining(x), x.dueDate || '']));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(d), 'Utang-Piutang');
    const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
    const ok = await window.BKFile.save(`bukukas-laporan-${stamp()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    if (ok) showToast('Excel siap.');
  }

  async function exportPDF() {
    const { range, list, rows } = exportRows();
    if (!rows.length) { showToast('Tidak ada transaksi pada periode ini.'); return; }
    await loadScript('vendor/jspdf.umd.min.js', () => !!(window.jspdf && window.jspdf.jsPDF));
    await loadScript('vendor/jspdf.plugin.autotable.min.js', () => !!(window.jspdf && window.jspdf.jsPDF.API.autoTable));
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const sd = summaryData(list);
    const rp = (n) => (n < 0 ? '-' : '') + 'Rp' + Math.abs(n).toLocaleString('id-ID');
    doc.setFontSize(16); doc.text('Laporan Keuangan Buku Kas', 40, 44);
    doc.setFontSize(10); doc.text('Periode: ' + range.label, 40, 62);
    doc.autoTable({
      startY: 76, head: [['Ringkasan', 'Nominal']], theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: [70, 195, 154] },
      body: [['Total pemasukan', rp(sd.income)], ['Total pengeluaran', rp(sd.expense)], ['Selisih', rp(sd.net)]].concat(sd.byCat.slice(0, 8).map(([k, v]) => ['  ' + k, rp(v)]))
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 16, theme: 'striped', styles: { fontSize: 8 }, headStyles: { fillColor: [70, 195, 154] },
      head: [['Tanggal', 'Jenis', 'Kategori', 'Dompet', 'Nominal', 'Catatan']],
      body: rows.map((r) => [r[0], r[1], r[2], r[3], rp(r[4]), r[5]]),
      columnStyles: { 4: { halign: 'right' } }
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 16, head: [['Dompet', 'Saldo']], theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: [70, 195, 154] },
      body: state.wallets.map((w) => [w.name, rp(BK.walletBalance(w))])
    });
    const ok = await window.BKFile.save(`bukukas-laporan-${stamp()}.pdf`, 'application/pdf', doc.output('blob'));
    if (ok) showToast('PDF siap.');
  }

  function updateExportInfo() {
    $('ex-custom').hidden = $('ex-period').value !== 'custom';
    const { range, rows } = exportRows();
    $('ex-info').textContent = `${range.label}: ${rows.length} transaksi`;
  }

  /* ======================= BINDING ======================= */
  function wrap(fn) { return () => fn().catch((e) => { console.error(e); showToast('Terjadi kesalahan: ' + (e && e.message ? e.message : e)); }); }

  function bind() {
    $('btn-bill-add').addEventListener('click', () => openBillModal(null));
    $('form-bill').addEventListener('submit', (e) => submitBill(e).catch((er) => { console.error(er); showToast('Gagal menyimpan tagihan.'); }));
    $('bill-delete-btn').addEventListener('click', deleteBill);
    $('bill-category').addEventListener('change', () => { $('bill-category').dataset.touched = '1'; });
    $('bill-name').addEventListener('input', () => {
      if ($('bill-category').dataset.touched) return;
      const g = guessBillCategory($('bill-name').value);
      if (g) $('bill-category').value = g.id;
    });
    BK.formatAmountInputLive($('bill-amount'));
    $('bill-list').addEventListener('click', (e) => {
      const pay = e.target.closest('[data-pay-bill]');
      if (pay) { payBill(pay.dataset.payBill).catch((er) => { console.error(er); showToast('Gagal membayar tagihan.'); }); return; }
      const row = e.target.closest('[data-bill]');
      if (row) openBillModal(row.dataset.bill);
    });

    $('btn-asset-add').addEventListener('click', () => openAssetModal(null));
    $('form-asset').addEventListener('submit', (e) => submitAsset(e).catch((er) => { console.error(er); showToast('Gagal menyimpan aset.'); }));
    $('asset-delete-btn').addEventListener('click', deleteAsset);
    BK.formatAmountInputLive($('asset-value'));
    $('asset-list').addEventListener('click', (e) => { const row = e.target.closest('[data-asset]'); if (row) openAssetModal(row.dataset.asset); });

    $('cal-prev').addEventListener('click', () => { calRef = new Date(calRef.getFullYear(), calRef.getMonth() - 1, 1); renderCalendar(); });
    $('cal-next').addEventListener('click', () => { calRef = new Date(calRef.getFullYear(), calRef.getMonth() + 1, 1); renderCalendar(); });
    $('cal-grid').addEventListener('click', (e) => { const c = e.target.closest('[data-date]'); if (!c) return; calSel = c.dataset.date; renderCalendar(); });

    $('ex-period').addEventListener('change', updateExportInfo);
    $('ex-from').addEventListener('change', updateExportInfo);
    $('ex-to').addEventListener('change', updateExportInfo);
    $('ex-csv').addEventListener('click', wrap(exportCSV));
    $('ex-xlsx').addEventListener('click', wrap(exportXLSX));
    $('ex-pdf').addEventListener('click', wrap(exportPDF));

    $('dash-extra').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (!b) return; if (b.dataset.go === 'quick') { if (BK.openQuick) BK.openQuick(); } else BK.switchView(b.dataset.go); });
  }

  BK.openBillModal = openBillModal;
  BK.ensureBillCategory = ensureBillCategory;
  BK.views.tagihan = renderBills;
  BK.views.aset = renderAssets;
  BK.views.kalender = () => { calRef = new Date(); calSel = todayISODate(); renderCalendar(); };
  BK.views.riwayat = () => { renderAudit(); loadExtra().then(renderAudit).catch(() => {}); };
  BK.views.ekspor = updateExportInfo;
  BK.views.dashboardExtra = renderDashExtra;
  BK._test = { nextDue, netWorth, buildCSV, csvCell, exportRows };

  bind();
  loadExtra().then(() => { if (BK.state.currentView === 'dashboard') renderDashExtra(); }).catch(() => {});
})();
