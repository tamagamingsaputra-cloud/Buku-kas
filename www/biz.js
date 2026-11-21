/* ============================================================
   biz.js — Fase 5: Usaha & UMKM
   Stok barang, penjualan, pembelian stok, biaya & modal usaha,
   piutang pelanggan / utang pemasok, laporan laba.
   Transaksi usaha ditandai `biz` dan TIDAK masuk laporan pribadi.
   Stok = stok awal + jumlah pergerakan (tidak disimpan terpisah,
   jadi tidak bisa "melenceng" dari riwayatnya).
   ============================================================ */
(function () {
  'use strict';

  const BK = window.BK;
  if (!BK) return;
  const { state, DB, formatRupiah, escapeHtml, formatDateShort, todayISODate, parseAmount, showToast, openModal, closeModal, askConfirm } = BK;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');

  state.items = []; state.stockmoves = []; state.sales = []; state.groups = [];
  async function loadBiz() {
    const [i, m, s, g] = await Promise.all([DB.getItems(), DB.getStockMoves(), DB.getSales(), DB.getGroups()]);
    state.items = i; state.stockmoves = m; state.sales = s; state.groups = g;
  }
  const prevReload = BK.reloadAll;
  BK.reloadAll = async function () { await prevReload.apply(null, arguments); await loadBiz(); };
  async function refresh() { await BK.reloadAll(); BK.renderAll(); }
  BK.refreshBiz = refresh;

  const r3 = (n) => Math.round(n * 1000) / 1000;
  const fmtQty = (n) => String(r3(n)).replace('.', ',');
  const parseQty = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? r3(n) : NaN; };

  /* ---------- stok (diturunkan dari riwayat) ---------- */
  function stockOf(item, moves) {
    const list = moves || state.stockmoves;
    return r3((item.openingStock || 0) + list.filter((m) => m.itemId === item.id).reduce((s, m) => s + m.qty, 0));
  }
  function stockMap() {
    const map = {};
    state.items.forEach((i) => { map[i.id] = i.openingStock || 0; });
    state.stockmoves.forEach((m) => { if (m.itemId in map) map[m.itemId] = map[m.itemId] + m.qty; });
    Object.keys(map).forEach((k) => { map[k] = r3(map[k]); });
    return map;
  }

  /* ---------- kategori usaha ---------- */
  async function ensureCategory(name, type) {
    let c = state.categories.find((x) => x.name === name && x.type === type);
    if (!c) { c = { id: DB.genId(), name, type }; await DB.saveCategory(c); await BK.reloadAll(); c = state.categories.find((x) => x.name === name && x.type === type) || c; }
    return c;
  }

  /* ======================= FORM DINAMIS ======================= */
  let dynState = null;
  function dynForm(cfg) {
    dynState = cfg;
    $('dyn-title').textContent = cfg.title;
    const body = $('dyn-body');
    body.innerHTML = (cfg.fields || []).map((f) => {
      const id = 'dyn-' + f.key;
      const req = f.required ? ' required' : '';
      if (f.type === 'info') return `<div class="quick-preview" id="dyn-info-${f.key}">${f.html}</div>`;
      let input;
      if (f.type === 'select') input = `<select id="${id}"${req}>${f.options.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>`;
      else if (f.type === 'money') input = `<div class="amount-input"><span class="amount-prefix">Rp</span><input type="text" inputmode="numeric" id="${id}" placeholder="0"${req} /></div>`;
      else if (f.type === 'number') input = `<input type="text" inputmode="decimal" id="${id}" placeholder="${escapeHtml(f.placeholder || '0')}"${req} />`;
      else if (f.type === 'date') input = `<input type="date" id="${id}"${req} />`;
      else input = `<input type="text" id="${id}" maxlength="${f.max || 60}" placeholder="${escapeHtml(f.placeholder || '')}"${req} />`;
      return `<label class="field"${f.hidden ? ' hidden' : ''}><span class="field-label">${escapeHtml(f.label)}</span>${input}${f.hint ? `<span class="field-hint">${escapeHtml(f.hint)}</span>` : ''}</label>`;
    }).join('');
    (cfg.fields || []).forEach((f) => {
      if (f.type === 'info') return;
      const el = $('dyn-' + f.key);
      if (f.type === 'money') BK.formatAmountInputLive(el);
      if (f.value !== undefined && f.value !== null && f.value !== '') {
        el.value = f.type === 'money' ? Number(f.value).toLocaleString('id-ID') : f.type === 'number' ? fmtQty(f.value) : String(f.value);
      }
      if (f.onChange) el.addEventListener('input', () => f.onChange(el.value, dynValues));
      if (f.onChange && f.type === 'select') el.addEventListener('change', () => f.onChange(el.value, dynValues));
    });
    const danger = $('dyn-danger');
    danger.onclick = null;
    danger.hidden = !cfg.danger;
    if (cfg.danger) danger.textContent = cfg.danger.text;
    $('dyn-submit').hidden = !!cfg.hideSubmit;
    $('dyn-submit').textContent = cfg.submitText || 'Simpan';
    openModal('modal-dyn');
  }
  function dynValues() {
    const v = {};
    (dynState.fields || []).forEach((f) => {
      if (f.type === 'info') return;
      const raw = $('dyn-' + f.key).value;
      v[f.key] = f.type === 'money' ? parseAmount(raw) : f.type === 'number' ? parseQty(raw) : String(raw).trim();
    });
    return v;
  }
  let dynBusy = false;
  async function dynSubmit(e) {
    e.preventDefault();
    if (dynBusy || !dynState || !dynState.onSubmit) return;
    dynBusy = true;
    try {
      const done = await dynState.onSubmit(dynValues());
      if (done !== false) closeModal('modal-dyn');
    } catch (err) { console.error(err); showToast('Gagal menyimpan: ' + (err && err.message ? err.message : err)); }
    finally { dynBusy = false; }
  }
  BK.dynForm = dynForm;

  /* ======================= BARANG ======================= */
  function itemForm(id) {
    const it = id ? state.items.find((x) => x.id === id) : null;
    dynForm({
      title: it ? 'Edit Barang' : 'Tambah Barang',
      submitText: 'Simpan',
      fields: [
        { key: 'name', label: 'Nama barang', required: true, value: it && it.name, max: 40 },
        { key: 'sku', label: 'SKU / kode (opsional)', value: it && it.sku, max: 24 },
        { key: 'unit', label: 'Satuan', value: it ? it.unit : 'pcs', max: 10 },
        { key: 'buy', label: 'Harga beli', type: 'money', value: it && it.buyPrice },
        { key: 'sell', label: 'Harga jual', type: 'money', required: true, value: it && it.sellPrice },
        { key: 'open', label: 'Stok awal', type: 'number', value: it ? undefined : 0, hidden: !!it, hint: it ? '' : 'Untuk mengubah stok kemudian, pakai Barang masuk atau Koreksi stok.' },
        { key: 'min', label: 'Stok minimum (peringatan)', type: 'number', value: it ? it.minStock : 0 }
      ],
      danger: it ? { text: 'Hapus' } : null,
      onSubmit: async (v) => {
        if (!v.name) { showToast('Nama barang wajib diisi.'); return false; }
        if (state.items.some((x) => x.id !== id && x.name.toLowerCase() === v.name.toLowerCase())) { showToast('Nama barang sudah ada.'); return false; }
        if (v.sell <= 0) { showToast('Harga jual harus lebih dari 0.'); return false; }
        const open = it ? it.openingStock : v.open;
        if (isNaN(open) || open < 0 || isNaN(v.min) || v.min < 0) { showToast('Stok tidak valid.'); return false; }
        const item = Object.assign({}, it || {}, { id: id || DB.genId(), name: v.name, sku: v.sku, unit: v.unit || 'pcs', buyPrice: v.buy, sellPrice: v.sell, openingStock: open, minStock: v.min });
        await DB.atomic([{ s: 'items', put: item }, BK.auditRec(it ? 'ubah' : 'tambah', 'barang', item.id, `${item.name} · jual ${formatRupiah(item.sellPrice)}`)]);
        await refresh(); showToast(it ? 'Barang diperbarui.' : 'Barang ditambahkan.');
      }
    });
    if (it) $('dyn-danger').onclick = () => {
      const used = state.stockmoves.some((m) => m.itemId === id) || state.sales.some((s) => s.lines.some((l) => l.itemId === id));
      if (used) { showToast('Barang punya riwayat stok/penjualan sehingga tidak bisa dihapus. Atur stoknya ke 0.'); return; }
      askConfirm('Hapus barang ini?', async () => {
        await DB.atomic([{ s: 'items', del: id }, BK.auditRec('hapus', 'barang', id, 'Hapus barang ' + it.name)]);
        await refresh(); closeModal('modal-dyn'); showToast('Barang dihapus.');
      });
    };
  }

  function restockForm() {
    if (!state.items.length) { showToast('Tambahkan barang dulu.'); return; }
    if (!state.wallets.length) { showToast('Tambahkan dompet dulu.'); return; }
    dynForm({
      title: 'Barang Masuk (Beli Stok)',
      fields: [
        { key: 'item', label: 'Barang', type: 'select', options: state.items.map((i) => [i.id, i.name]) },
        { key: 'qty', label: 'Jumlah masuk', type: 'number', required: true },
        { key: 'total', label: 'Total harga beli', type: 'money', required: true },
        { key: 'supplier', label: 'Pemasok (wajib bila utang)', max: 40 },
        { key: 'method', label: 'Pembayaran', type: 'select', options: [['cash', 'Tunai (keluar dari dompet)'], ['credit', 'Utang ke pemasok']] },
        { key: 'wallet', label: 'Dompet', type: 'select', options: state.wallets.map((w) => [w.id, w.name]) },
        { key: 'date', label: 'Tanggal', type: 'date', required: true, value: todayISODate() }
      ],
      onSubmit: async (v) => {
        const item = state.items.find((i) => i.id === v.item);
        if (!item) return false;
        if (!(v.qty > 0)) { showToast('Jumlah harus lebih dari 0.'); return false; }
        if (!(v.total > 0)) { showToast('Total harga beli harus lebih dari 0.'); return false; }
        if (v.method === 'credit' && !v.supplier) { showToast('Isi nama pemasok untuk utang.'); return false; }
        const now = new Date().toISOString();
        const purchaseId = DB.genId();
        const unitCost = Math.round(v.total / v.qty);
        const oldStock = stockOf(item);
        const newBuy = oldStock > 0 ? Math.round((oldStock * item.buyPrice + v.total) / (oldStock + v.qty)) : unitCost; // harga rata-rata tertimbang
        const ops = [
          { s: 'stockmoves', put: { id: DB.genId(), itemId: item.id, kind: 'in', qty: v.qty, unitCost, date: v.date, note: v.supplier ? 'Beli dari ' + v.supplier : 'Barang masuk', refId: purchaseId, createdAt: now } },
          { s: 'items', put: Object.assign({}, item, { buyPrice: newBuy }) }
        ];
        if (v.method === 'cash') {
          const w = BK.walletById(v.wallet);
          if (w && BK.walletBalance(w) < v.total) { showToast('Saldo dompet tidak cukup.'); return false; }
          const cat = await ensureCategory('Pembelian Stok', 'expense');
          ops.push({ s: 'transactions', put: { id: DB.genId(), type: 'expense', amount: v.total, categoryId: cat.id, walletId: v.wallet, date: v.date, note: 'Beli stok: ' + item.name, biz: 'purchase', purchaseId, source: 'manual', createdAt: now } });
        } else {
          ops.push({ s: 'debts', put: { id: DB.genId(), type: 'owe', person: v.supplier, amount: v.total, dueDate: '', note: 'Beli stok: ' + item.name, biz: true, purchaseId, payments: [], remindBefore: 0, createdAt: now } });
        }
        ops.push(BK.auditRec('tambah', 'stok', item.id, `Masuk ${fmtQty(v.qty)} ${item.unit} ${item.name} · ${formatRupiah(v.total)}`));
        await DB.atomic(ops);
        await refresh(); showToast('Stok bertambah.');
      }
    });
  }

  function adjustForm() {
    if (!state.items.length) { showToast('Tambahkan barang dulu.'); return; }
    const map = stockMap();
    dynForm({
      title: 'Koreksi Stok',
      fields: [
        { key: 'item', label: 'Barang', type: 'select', options: state.items.map((i) => [i.id, `${i.name} (stok ${fmtQty(map[i.id])})`]) },
        { key: 'count', label: 'Jumlah stok sebenarnya (hasil hitung)', type: 'number', required: true },
        { key: 'note', label: 'Alasan', placeholder: 'Contoh: rusak, hilang, salah hitung', max: 60 }
      ],
      onSubmit: async (v) => {
        const item = state.items.find((i) => i.id === v.item);
        if (!item || isNaN(v.count) || v.count < 0) { showToast('Jumlah tidak valid.'); return false; }
        const delta = r3(v.count - stockOf(item));
        if (delta === 0) { showToast('Stok sudah sama.'); return false; }
        await DB.atomic([
          { s: 'stockmoves', put: { id: DB.genId(), itemId: item.id, kind: 'adjust', qty: delta, unitCost: item.buyPrice, date: todayISODate(), note: v.note || 'Koreksi stok', refId: '', createdAt: new Date().toISOString() } },
          BK.auditRec('ubah', 'stok', item.id, `Koreksi ${item.name}: ${delta > 0 ? '+' : ''}${fmtQty(delta)}`)
        ]);
        await refresh(); showToast('Stok dikoreksi.');
      }
    });
  }

  /* ======================= PENJUALAN ======================= */
  let saleLines = [];
  function newLine() { return { uid: DB.genId(), itemId: state.items[0] ? state.items[0].id : '', qty: '1', price: state.items[0] ? state.items[0].sellPrice : 0 }; }

  function renderSaleLines() {
    const stock = stockMap();
    $('sale-lines').innerHTML = saleLines.map((l) => `
      <div class="sale-line" data-uid="${l.uid}">
        <label class="field"><span class="field-label">Barang</span><select data-f="item">${state.items.map((i) => `<option value="${i.id}"${i.id === l.itemId ? ' selected' : ''}>${escapeHtml(i.name)} (stok ${fmtQty(stock[i.id])})</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Jml</span><input type="text" inputmode="decimal" data-f="qty" value="${escapeHtml(l.qty)}" /></label>
        <button type="button" data-f="del" aria-label="Hapus baris">&times;</button>
        <label class="field price"><span class="field-label">Harga satuan (Rp)</span><input type="text" inputmode="numeric" data-f="price" value="${Number(l.price).toLocaleString('id-ID')}" /></label>
      </div>`).join('');
    updateSaleTotal();
  }

  function saleCalc() {
    let subtotal = 0, cost = 0;
    const lines = [];
    for (const l of saleLines) {
      const item = state.items.find((i) => i.id === l.itemId);
      const qty = parseQty(l.qty);
      const price = typeof l.price === 'number' ? l.price : parseAmount(String(l.price));
      if (!item || !(qty > 0)) continue;
      subtotal += Math.round(qty * price);
      cost += Math.round(qty * item.buyPrice);
      lines.push({ id: DB.genId(), itemId: item.id, name: item.name, qty, price, cost: item.buyPrice });
    }
    const discount = Math.min(parseAmount($('sale-discount').value), subtotal);
    const taxPct = parseFloat(String($('sale-tax').value || '0').replace(',', '.')) || 0;
    const tax = taxPct > 0 ? Math.round((subtotal - discount) * taxPct / 100) : 0;
    const total = subtotal - discount + tax;
    return { subtotal, discount, tax, total, cost, lines };
  }

  function updateSaleTotal() {
    const c = saleCalc();
    $('sale-total').innerHTML = `<span>Subtotal: <b>${formatRupiah(c.subtotal)}</b></span>${c.discount ? `<span>Diskon: <b>−${formatRupiah(c.discount)}</b></span>` : ''}${c.tax ? `<span>Pajak: <b>${formatRupiah(c.tax)}</b></span>` : ''}<span>Total: <b>${formatRupiah(c.total)}</b></span>`;
    $('sale-paid-field').hidden = $('sale-method').value !== 'partial';
  }

  function openSale() {
    if (!state.items.length) { showToast('Tambahkan barang dulu di tab Stok.'); return; }
    if (!state.wallets.length) { showToast('Tambahkan dompet dulu.'); return; }
    saleLines = [newLine()];
    $('form-sale').reset();
    $('sale-wallet').innerHTML = state.wallets.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
    $('sale-date').value = todayISODate();
    renderSaleLines();
    openModal('modal-sale');
  }

  let saleBusy = false;
  async function submitSale(e) {
    e.preventDefault();
    if (saleBusy) return;
    const c = saleCalc();
    if (!c.lines.length) { showToast('Tambahkan minimal satu barang dengan jumlah lebih dari 0.'); return; }
    if (state.saleInvalid) return;
    const stock = stockMap();
    const need = {};
    c.lines.forEach((l) => { need[l.itemId] = r3((need[l.itemId] || 0) + l.qty); });
    for (const id of Object.keys(need)) {
      if (need[id] > stock[id]) { const it = state.items.find((i) => i.id === id); showToast(`Stok ${it.name} tidak cukup (tersisa ${fmtQty(stock[id])}).`); return; }
    }
    if (c.lines.some((l) => l.price < 0)) { showToast('Harga tidak valid.'); return; }
    const method = $('sale-method').value;
    const customer = $('sale-customer').value.trim();
    let paid = c.total;
    if (method === 'credit') paid = 0;
    if (method === 'partial') {
      paid = parseAmount($('sale-paid').value);
      if (!(paid > 0 && paid < c.total)) { showToast('Pembayaran sebagian harus lebih dari 0 dan kurang dari total.'); return; }
    }
    if (paid < c.total && !customer) { showToast('Isi nama pelanggan untuk penjualan yang belum lunas.'); return; }
    saleBusy = true;
    try {
      const walletId = $('sale-wallet').value, date = $('sale-date').value || todayISODate();
      const now = new Date().toISOString();
      const saleId = DB.genId();
      const sale = { id: saleId, date, customer, walletId, method, note: $('sale-note').value.trim(), subtotal: c.subtotal, discount: c.discount, tax: c.tax, total: c.total, cost: c.cost, paid, lines: c.lines, createdAt: now };
      const ops = [{ s: 'sales', put: sale }];
      c.lines.forEach((l) => ops.push({ s: 'stockmoves', put: { id: DB.genId(), itemId: l.itemId, kind: 'sale', qty: -l.qty, unitCost: l.cost, date, note: 'Penjualan' + (customer ? ' ke ' + customer : ''), refId: saleId, createdAt: now } }));
      if (paid > 0) {
        const cat = await ensureCategory('Penjualan', 'income');
        ops.push({ s: 'transactions', put: { id: DB.genId(), type: 'income', amount: paid, categoryId: cat.id, walletId, date, note: 'Penjualan' + (customer ? ' ke ' + customer : ''), biz: 'sale', saleId, source: 'manual', createdAt: now } });
      }
      if (paid < c.total) ops.push({ s: 'debts', put: { id: DB.genId(), type: 'lent', person: customer, amount: c.total - paid, dueDate: '', note: 'Piutang penjualan', biz: true, saleId, payments: [], remindBefore: 0, createdAt: now } });
      ops.push(BK.auditRec('tambah', 'penjualan', saleId, `Jual ${formatRupiah(c.total)}${customer ? ' · ' + customer : ''}`));
      await DB.atomic(ops);
      await refresh();
      closeModal('modal-sale');
      showToast('Penjualan tercatat.');
    } catch (err) { console.error(err); showToast('Gagal menyimpan penjualan; data tidak berubah.'); }
    finally { saleBusy = false; }
  }

  function saleDetail(id) {
    const s = state.sales.find((x) => x.id === id);
    if (!s) return;
    const debt = state.debts.find((d) => d.saleId === id);
    const rows = s.lines.map((l) => `<div class="kv"><span>${escapeHtml(l.name)} × ${fmtQty(l.qty)}</span><b>${formatRupiah(Math.round(l.qty * l.price))}</b></div>`).join('');
    dynForm({
      title: 'Penjualan ' + formatDateShort(s.date),
      hideSubmit: true,
      fields: [{ key: 'i', type: 'info', html: `${rows}${s.discount ? `<div class="kv"><span>Diskon</span><b>−${formatRupiah(s.discount)}</b></div>` : ''}${s.tax ? `<div class="kv"><span>Pajak</span><b>${formatRupiah(s.tax)}</b></div>` : ''}<div class="kv"><span>Total</span><b>${formatRupiah(s.total)}</b></div><div class="kv"><span>Dibayar</span><b>${formatRupiah(s.paid)}</b></div>${s.customer ? `<div class="kv"><span>Pelanggan</span><b>${escapeHtml(s.customer)}</b></div>` : ''}${debt ? `<div class="kv"><span>Sisa piutang</span><b>${formatRupiah(BK.debtRemaining(debt))}</b></div>` : ''}` }],
      danger: { text: 'Batalkan penjualan' }
    });
    $('dyn-danger').onclick = () => {
      if (debt && (debt.payments || []).length) { showToast('Piutang penjualan ini sudah ada pembayaran. Batalkan pembayarannya dulu di menu Hutang & Piutang.'); return; }
      askConfirm('Batalkan penjualan ini? Stok kembali dan uang yang masuk ke dompet dibatalkan.', async () => {
        const ops = [{ s: 'sales', del: id }]
          .concat(state.stockmoves.filter((m) => m.refId === id).map((m) => ({ s: 'stockmoves', del: m.id })))
          .concat(state.transactions.filter((t) => t.saleId === id).map((t) => ({ s: 'transactions', del: t.id })))
          .concat(debt ? [{ s: 'debts', del: debt.id }] : [])
          .concat([BK.auditRec('hapus', 'penjualan', id, `Batalkan penjualan ${formatRupiah(s.total)}`)]);
        await DB.atomic(ops);
        await refresh(); closeModal('modal-dyn'); showToast('Penjualan dibatalkan.');
      });
    };
  }

  /* ======================= BIAYA & MODAL ======================= */
  function costForm() {
    if (!state.wallets.length) { showToast('Tambahkan dompet dulu.'); return; }
    dynForm({
      title: 'Biaya / Modal Usaha',
      fields: [
        { key: 'kind', label: 'Jenis', type: 'select', options: [['opex', 'Biaya operasional (keluar)'], ['capital', 'Modal masuk (tambah modal)']] },
        { key: 'amount', label: 'Nominal', type: 'money', required: true },
        { key: 'note', label: 'Keterangan', required: true, placeholder: 'Contoh: sewa lapak, plastik, listrik toko', max: 60 },
        { key: 'wallet', label: 'Dompet', type: 'select', options: state.wallets.map((w) => [w.id, w.name]) },
        { key: 'date', label: 'Tanggal', type: 'date', required: true, value: todayISODate() }
      ],
      onSubmit: async (v) => {
        if (!(v.amount > 0)) { showToast('Nominal harus lebih dari 0.'); return false; }
        if (!v.note) { showToast('Isi keterangan.'); return false; }
        const expense = v.kind === 'opex';
        if (expense) { const w = BK.walletById(v.wallet); if (w && BK.walletBalance(w) < v.amount) { showToast('Saldo dompet tidak cukup.'); return false; } }
        const cat = await ensureCategory(expense ? 'Biaya Usaha' : 'Modal Usaha', expense ? 'expense' : 'income');
        const t = { id: DB.genId(), type: expense ? 'expense' : 'income', amount: v.amount, categoryId: cat.id, walletId: v.wallet, date: v.date, note: v.note, biz: v.kind, source: 'manual', createdAt: new Date().toISOString() };
        await DB.atomic([{ s: 'transactions', put: t }, BK.auditRec('tambah', 'usaha', t.id, `${expense ? 'Biaya' : 'Modal'} ${formatRupiah(v.amount)} · ${v.note}`)]);
        await refresh(); showToast('Tercatat.');
      }
    });
  }
  function deleteCost(id) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return;
    askConfirm('Hapus catatan ini? Saldo dompet kembali seperti sebelum dicatat.', async () => {
      await DB.atomic([{ s: 'transactions', del: id }, BK.auditRec('hapus', 'usaha', id, `Hapus ${t.note} ${formatRupiah(t.amount)}`)]);
      await refresh(); showToast('Dihapus.');
    });
  }

  /* ======================= LAPORAN ======================= */
  let tab = 'ringkasan', period = 'month';
  function periodRange(p) {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth(), t = todayISODate();
    const dim = (yy, mm) => new Date(yy, mm + 1, 0).getDate();
    if (p === 'today') return { from: t, to: t, label: 'Hari ini' };
    if (p === 'month') return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(dim(y, m))}`, label: 'Bulan ini' };
    if (p === 'last') { const d = new Date(y, m - 1, 1), yy = d.getFullYear(), mm = d.getMonth(); return { from: `${yy}-${pad(mm + 1)}-01`, to: `${yy}-${pad(mm + 1)}-${pad(dim(yy, mm))}`, label: 'Bulan lalu' }; }
    return { from: '0000-01-01', to: '9999-12-31', label: 'Semua' };
  }

  function report(p) {
    const r = periodRange(p);
    const sales = state.sales.filter((s) => s.date >= r.from && s.date <= r.to);
    const omzet = sales.reduce((a, s) => a + s.subtotal - s.discount, 0);
    const hpp = sales.reduce((a, s) => a + s.cost, 0);
    const opex = state.transactions.filter((t) => t.biz === 'opex' && t.date >= r.from && t.date <= r.to).reduce((a, t) => a + t.amount, 0);
    const prod = {};
    sales.forEach((s) => s.lines.forEach((l) => { const o = prod[l.itemId] || (prod[l.itemId] = { name: l.name, qty: 0, rev: 0 }); o.qty = r3(o.qty + l.qty); o.rev += Math.round(l.qty * l.price); }));
    const daily = {};
    sales.forEach((s) => { const o = daily[s.date] || (daily[s.date] = { n: 0, omzet: 0 }); o.n++; o.omzet += s.subtotal - s.discount; });
    const bizDebts = state.debts.filter((d) => d.biz);
    return {
      range: r, count: sales.length, omzet, hpp, gross: omzet - hpp, opex, net: omzet - hpp - opex,
      top: Object.values(prod).sort((a, b) => b.qty - a.qty || b.rev - a.rev).slice(0, 5),
      daily: Object.entries(daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10),
      receivable: bizDebts.filter((d) => d.type === 'lent').reduce((a, d) => a + BK.debtRemaining(d), 0),
      payable: bizDebts.filter((d) => d.type === 'owe').reduce((a, d) => a + BK.debtRemaining(d), 0)
    };
  }

  const stat = (label, v, cls) => `<div class="biz-stat"><span class="bk-stat-label">${label}</span><b class="${cls || ''}">${v < 0 ? '−' : ''}${formatRupiah(Math.abs(v))}</b></div>`;

  function renderBiz() {
    document.querySelectorAll('#biz-tabs .chip').forEach((c) => c.classList.toggle('active', c.dataset.bizTab === tab));
    const root = $('biz-root');
    const map = stockMap();
    if (tab === 'ringkasan') {
      const r = report(period);
      const low = state.items.filter((i) => map[i.id] <= i.minStock && (i.minStock > 0 || map[i.id] <= 0));
      root.innerHTML = `
        <label class="field"><span class="field-label">Periode</span><select id="biz-period"><option value="today">Hari ini</option><option value="month">Bulan ini</option><option value="last">Bulan lalu</option><option value="all">Semua</option></select></label>
        <div class="biz-grid">${stat('Omzet', r.omzet)}${stat('Modal barang (HPP)', r.hpp)}${stat('Laba kotor', r.gross, r.gross < 0 ? 'neg' : '')}${stat('Biaya operasional', r.opex)}</div>
        <div class="card"><span class="bk-stat-label">Estimasi laba bersih · ${r.count} penjualan</span><div class="bk-big ${r.net < 0 ? 'neg' : ''}">${r.net < 0 ? '−' : ''}${formatRupiah(Math.abs(r.net))}</div>
          <div class="bk-line"><span>Piutang pelanggan</span><b>${formatRupiah(r.receivable)}</b></div><div class="bk-line"><span>Utang pemasok</span><b class="${r.payable ? 'neg' : ''}">${formatRupiah(r.payable)}</b></div></div>
        ${r.top.length ? `<div class="card"><div class="card-header"><span class="card-title">Produk terlaris</span></div>${r.top.map((p) => `<div class="kv"><span>${escapeHtml(p.name)} · ${fmtQty(p.qty)}</span><b>${formatRupiah(p.rev)}</b></div>`).join('')}</div>` : ''}
        ${r.daily.length ? `<div class="card"><div class="card-header"><span class="card-title">Rekap harian</span></div>${r.daily.map(([d, o]) => `<div class="kv"><span>${formatDateShort(d)} · ${o.n} transaksi</span><b>${formatRupiah(o.omzet)}</b></div>`).join('')}</div>` : ''}
        ${low.length ? `<div class="card"><div class="card-header"><span class="card-title">Stok menipis</span></div>${low.map((i) => `<div class="kv"><span>${escapeHtml(i.name)}</span><b class="neg">${fmtQty(map[i.id])} ${escapeHtml(i.unit)}</b></div>`).join('')}</div>` : ''}`;
      $('biz-period').value = period;
    } else if (tab === 'stok') {
      const moves = state.stockmoves.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 15);
      const kindLbl = { in: 'Masuk', sale: 'Terjual', adjust: 'Koreksi', out: 'Keluar' };
      root.innerHTML = `<div class="biz-actions"><button class="btn-outline-sm" id="biz-add-item">+ Barang</button><button class="btn-outline-sm" id="biz-restock">Barang masuk</button><button class="btn-outline-sm" id="biz-adjust">Koreksi stok</button></div>
        <div class="bk-list">${state.items.length ? state.items.slice().sort((a, b) => a.name.localeCompare(b.name)).map((i) => {
          const lowFlag = map[i.id] <= i.minStock && (i.minStock > 0 || map[i.id] <= 0);
          return `<div class="bk-row" data-item="${i.id}">${BK.iconHTML(i.name, 40, 'bag')}<span class="bk-main"><b>${escapeHtml(i.name)}</b><small>Beli ${formatRupiah(i.buyPrice)} · Jual ${formatRupiah(i.sellPrice)}${i.sku ? ' · ' + escapeHtml(i.sku) : ''}</small></span>
            <span class="bk-side"><b>${fmtQty(map[i.id])} ${escapeHtml(i.unit)}</b>${lowFlag ? '<span class="badge-low">menipis</span>' : ''}</span></div>`;
        }).join('') : '<p class="empty-desc">Belum ada barang. Tambahkan barang dagangan pertamamu.</p>'}</div>
        ${moves.length ? `<div class="card"><div class="card-header"><span class="card-title">Riwayat pergerakan stok</span></div>${moves.map((m) => { const it = state.items.find((i) => i.id === m.itemId); return `<div class="kv"><span>${formatDateShort(m.date)} · ${escapeHtml(it ? it.name : '?')} · ${kindLbl[m.kind] || m.kind}</span><b class="${m.qty < 0 ? 'neg' : ''}">${m.qty > 0 ? '+' : ''}${fmtQty(m.qty)}</b></div>`; }).join('')}</div>` : ''}`;
    } else if (tab === 'jual') {
      const list = state.sales.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
      root.innerHTML = `<div class="biz-actions"><button class="btn-primary" id="biz-sell">+ Catat penjualan</button></div>
        <div class="bk-list">${list.length ? list.map((s) => `<div class="bk-row ${s.paid < s.total ? 'soon' : ''}" data-sale="${s.id}">${BK.iconHTML('Penjualan', 40)}<span class="bk-main"><b>${escapeHtml(s.customer || 'Penjualan')}</b><small>${formatDateShort(s.date)} · ${s.lines.length} barang${s.paid < s.total ? ' · belum lunas' : ''}</small></span><span class="bk-side"><b>${formatRupiah(s.total)}</b></span></div>`).join('') : '<p class="empty-desc">Belum ada penjualan.</p>'}</div>`;
    } else {
      const list = state.transactions.filter((t) => t.biz === 'opex' || t.biz === 'capital').sort((a, b) => b.date.localeCompare(a.date));
      root.innerHTML = `<div class="biz-actions"><button class="btn-primary" id="biz-cost">+ Biaya / modal</button></div>
        <div class="bk-list">${list.length ? list.map((t) => `<div class="bk-row" data-cost="${t.id}">${BK.iconHTML(t.note, 40, t.biz === 'opex' ? 'receipt' : 'coins')}<span class="bk-main"><b>${escapeHtml(t.note)}</b><small>${formatDateShort(t.date)} · ${t.biz === 'opex' ? 'Biaya operasional' : 'Modal masuk'}</small></span><span class="bk-side"><b class="${t.biz === 'opex' ? 'neg' : ''}">${formatRupiah(t.amount)}</b></span></div>`).join('') : '<p class="empty-desc">Belum ada biaya atau modal usaha.</p>'}</div>
        <p class="field-hint">Pembelian stok dicatat lewat tab Stok → Barang masuk, dan tidak dihitung dua kali sebagai biaya.</p>`;
    }
  }

  function bind() {
    $('form-dyn').addEventListener('submit', dynSubmit);
    $('dyn-danger').addEventListener('click', () => { if (dynState && dynState.danger && dynState.danger.onClick) dynState.danger.onClick(); });
    $('biz-tabs').addEventListener('click', (e) => { const c = e.target.closest('[data-biz-tab]'); if (!c) return; tab = c.dataset.bizTab; renderBiz(); });
    $('biz-root').addEventListener('change', (e) => { if (e.target.id === 'biz-period') { period = e.target.value; renderBiz(); } });
    $('biz-root').addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#biz-add-item')) return itemForm(null);
      if (t.closest('#biz-restock')) return restockForm();
      if (t.closest('#biz-adjust')) return adjustForm();
      if (t.closest('#biz-sell')) return openSale();
      if (t.closest('#biz-cost')) return costForm();
      const it = t.closest('[data-item]'); if (it) return itemForm(it.dataset.item);
      const sl = t.closest('[data-sale]'); if (sl) return saleDetail(sl.dataset.sale);
      const co = t.closest('[data-cost]'); if (co) return deleteCost(co.dataset.cost);
    });
    // penjualan
    $('sale-add-line').addEventListener('click', () => { saleLines.push(newLine()); renderSaleLines(); });
    $('sale-lines').addEventListener('input', (e) => {
      const row = e.target.closest('.sale-line'); if (!row) return;
      const l = saleLines.find((x) => x.uid === row.dataset.uid); if (!l) return;
      const f = e.target.dataset.f;
      if (f === 'qty') l.qty = e.target.value;
      if (f === 'price') { const n = parseAmount(e.target.value); l.price = n; e.target.value = n ? n.toLocaleString('id-ID') : ''; }
      updateSaleTotal();
    });
    $('sale-lines').addEventListener('change', (e) => {
      const row = e.target.closest('.sale-line'); if (!row) return;
      const l = saleLines.find((x) => x.uid === row.dataset.uid); if (!l) return;
      if (e.target.dataset.f === 'item') { l.itemId = e.target.value; const it = state.items.find((i) => i.id === l.itemId); l.price = it ? it.sellPrice : 0; renderSaleLines(); }
    });
    $('sale-lines').addEventListener('click', (e) => {
      const d = e.target.closest('[data-f="del"]'); if (!d) return;
      const row = d.closest('.sale-line');
      if (saleLines.length > 1) { saleLines = saleLines.filter((x) => x.uid !== row.dataset.uid); renderSaleLines(); }
    });
    BK.formatAmountInputLive($('sale-discount')); BK.formatAmountInputLive($('sale-paid'));
    ['sale-discount', 'sale-tax'].forEach((id) => $(id).addEventListener('input', updateSaleTotal));
    $('sale-method').addEventListener('change', updateSaleTotal);
    $('form-sale').addEventListener('submit', submitSale);
  }

  BK.views.usaha = renderBiz;
  BK._biz = { stockOf, stockMap, report, saleCalc: () => saleCalc(), setTab: (t) => { tab = t; } };
  bind();
  loadBiz().catch(() => {});
})();
