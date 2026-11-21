/* ============================================================
   group.js — Fase 4 (versi lokal): Kas Kelompok
   Buku kas bendahara untuk kelompok (RT, arisan, iuran, patungan).
   Disimpan di perangkat ini, TERPISAH dari dompet pribadi.
   Bukan sinkronisasi multi-pengguna.
   ============================================================ */
(function () {
  'use strict';
  const BK = window.BK;
  if (!BK) return;
  const { state, DB, formatRupiah, escapeHtml, formatDateShort, todayISODate, showToast, askConfirm } = BK;
  const $ = (id) => document.getElementById(id);
  const KIND = { kas: 'Kas', arisan: 'Arisan', iuran: 'Iuran', patungan: 'Patungan' };
  let openId = null;

  async function save(g, action, summary) {
    await DB.atomic([{ s: 'groups', put: g }, BK.auditRec(action, 'kelompok', g.id, summary)]);
    await BK.refreshBiz();
  }

  /* jumlah periode yang sudah jatuh tempo sejak startDate sampai hari ini */
  function periodsDue(g, today) {
    if (!g.dues || !g.startDate || g.startDate > today) return 0;
    if (g.repeat === 'once') return 1;
    const a = new Date(g.startDate + 'T00:00:00'), b = new Date(today + 'T00:00:00');
    if (g.repeat === 'weekly') return Math.floor((b - a) / (7 * 864e5)) + 1;
    let n = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) n -= 1;
    return Math.max(0, n + 1);
  }
  function memberPaid(g, mid) { return g.entries.filter((e) => e.type === 'in' && e.memberId === mid).reduce((s, e) => s + e.amount, 0); }
  function arrears(g, mid, today) { return Math.max(0, periodsDue(g, today || todayISODate()) * g.dues - memberPaid(g, mid)); }
  function balance(g) { return g.entries.reduce((s, e) => s + (e.type === 'in' ? e.amount : -e.amount), 0); }

  function groupForm(id) {
    const g = id ? state.groups.find((x) => x.id === id) : null;
    BK.dynForm({
      title: g ? 'Edit Kelompok' : 'Kelompok Baru',
      fields: [
        { key: 'name', label: 'Nama kelompok', required: true, value: g && g.name, max: 40 },
        { key: 'kind', label: 'Jenis', type: 'select', options: Object.entries(KIND), value: g ? g.kind : 'kas' },
        { key: 'dues', label: 'Iuran per anggota per periode (opsional)', type: 'money', value: g && g.dues },
        { key: 'repeat', label: 'Periode iuran', type: 'select', options: [['monthly', 'Bulanan'], ['weekly', 'Mingguan'], ['once', 'Sekali']], value: g ? g.repeat : 'monthly' },
        { key: 'start', label: 'Mulai iuran', type: 'date', value: g ? g.startDate : todayISODate() }
      ],
      danger: g ? { text: 'Hapus kelompok' } : null,
      onSubmit: async (v) => {
        if (!v.name) { showToast('Nama kelompok wajib diisi.'); return false; }
        if (state.groups.some((x) => x.id !== id && x.name.toLowerCase() === v.name.toLowerCase())) { showToast('Nama kelompok sudah ada.'); return false; }
        const ng = Object.assign({ members: [], entries: [], createdAt: new Date().toISOString() }, g || {}, { id: id || DB.genId(), name: v.name, kind: v.kind, dues: v.dues || 0, repeat: v.repeat, startDate: v.start || todayISODate() });
        await save(ng, g ? 'ubah' : 'tambah', 'Kelompok ' + ng.name);
        openId = ng.id;
      }
    });
    if (g) $('dyn-danger').onclick = () => askConfirm('Hapus kelompok beserta seluruh catatannya?', async () => {
      await DB.atomic([{ s: 'groups', del: id }, BK.auditRec('hapus', 'kelompok', id, 'Hapus kelompok ' + g.name)]);
      openId = null; await BK.refreshBiz(); BK.closeModal('modal-dyn'); showToast('Kelompok dihapus.');
    });
  }

  function memberForm(gid) {
    BK.dynForm({
      title: 'Tambah Anggota',
      fields: [{ key: 'name', label: 'Nama anggota', required: true, max: 40 }],
      onSubmit: async (v) => {
        const g = state.groups.find((x) => x.id === gid);
        if (!g || !v.name) { showToast('Nama wajib diisi.'); return false; }
        if (g.members.some((m) => m.name.toLowerCase() === v.name.toLowerCase())) { showToast('Anggota sudah ada.'); return false; }
        if (g.members.length >= 300) { showToast('Maksimal 300 anggota.'); return false; }
        const ng = Object.assign({}, g, { members: g.members.concat([{ id: DB.genId(), name: v.name }]) });
        await save(ng, 'tambah', `Anggota ${v.name} di ${g.name}`);
      }
    });
  }

  function entryForm(gid, type, memberId) {
    const g = state.groups.find((x) => x.id === gid);
    if (!g) return;
    if (type === 'in' && !g.members.length) { showToast('Tambahkan anggota dulu.'); return; }
    const opts = [['', '— Tanpa anggota —']].concat(g.members.map((m) => [m.id, m.name]));
    const first = g.members.find((m) => m.id === memberId);
    BK.dynForm({
      title: type === 'in' ? 'Terima Iuran / Setoran' : (g.kind === 'arisan' ? 'Bayar Pemenang Arisan' : 'Catat Pengeluaran'),
      fields: [
        { key: 'member', label: type === 'in' ? 'Dari anggota' : 'Penerima', type: 'select', options: type === 'in' ? opts.slice(1) : opts, value: memberId || '' },
        { key: 'amount', label: 'Nominal', type: 'money', required: true, value: type === 'in' && first && g.dues ? Math.max(0, Math.min(g.dues, arrears(g, first.id))) || g.dues : undefined },
        { key: 'note', label: 'Keterangan', max: 60, placeholder: type === 'out' ? 'Contoh: beli konsumsi' : '' },
        { key: 'date', label: 'Tanggal', type: 'date', required: true, value: todayISODate() }
      ],
      onSubmit: async (v) => {
        if (!(v.amount > 0)) { showToast('Nominal harus lebih dari 0.'); return false; }
        if (type === 'out' && !v.note && !v.member) { showToast('Isi keterangan atau penerima.'); return false; }
        if (type === 'out' && v.amount > balance(g)) { showToast('Saldo kas kelompok tidak cukup.'); return false; }
        if (g.entries.length >= 5000) { showToast('Catatan terlalu banyak (maks 5000).'); return false; }
        const e = { id: DB.genId(), type, amount: v.amount, memberId: v.member || '', date: v.date, note: v.note, createdAt: new Date().toISOString() };
        const ng = Object.assign({}, g, { entries: g.entries.concat([e]) });
        await save(ng, 'tambah', `${type === 'in' ? 'Terima' : 'Keluar'} ${formatRupiah(v.amount)} · ${g.name}`);
        showToast('Tercatat.');
      }
    });
  }

  function render() {
    const root = $('grp-root');
    if (!root) return;
    if (openId && !state.groups.find((g) => g.id === openId)) openId = null;
    if (!openId) {
      root.innerHTML = state.groups.length
        ? `<div class="bk-list">${state.groups.map((g) => `<div class="bk-row" data-g="${g.id}">${BK.iconHTML(g.name, 40, 'users')}<span class="bk-main"><b>${escapeHtml(g.name)}</b><small>${KIND[g.kind]} · ${g.members.length} anggota</small></span><span class="bk-side"><b>${formatRupiah(balance(g))}</b></span></div>`).join('')}</div>`
        : '<p class="empty-desc">Belum ada kelompok. Buat untuk mencatat kas RT, arisan, iuran, atau patungan.</p>';
      root.insertAdjacentHTML('beforeend', '<p class="field-hint">Catatan kelompok tersimpan di perangkat ini dan terpisah dari saldo dompet pribadimu.</p>');
      return;
    }
    const g = state.groups.find((x) => x.id === openId);
    const today = todayISODate();
    const entries = g.entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
    const nm = (id) => { const m = g.members.find((x) => x.id === id); return m ? m.name : ''; };
    root.innerHTML = `
      <button class="btn-outline-sm" id="grp-back" type="button">← Semua kelompok</button>
      <div class="card"><span class="bk-stat-label">${KIND[g.kind]} · Saldo kas</span><div class="bk-big">${formatRupiah(balance(g))}</div>
        ${g.dues ? `<div class="bk-line"><span>Iuran ${g.repeat === 'weekly' ? 'mingguan' : g.repeat === 'once' ? 'sekali' : 'bulanan'}</span><b>${formatRupiah(g.dues)}</b></div>` : ''}</div>
      <div class="biz-actions"><button class="btn-primary" id="grp-in">Terima iuran</button><button class="btn-outline-sm" id="grp-out">${g.kind === 'arisan' ? 'Bayar pemenang' : 'Pengeluaran'}</button><button class="btn-outline-sm" id="grp-mem">+ Anggota</button><button class="btn-outline-sm" id="grp-edit">Edit</button></div>
      <div class="card"><div class="card-header"><span class="card-title">Anggota</span></div>${g.members.length ? g.members.map((m) => {
        const paid = memberPaid(g, m.id), ar = arrears(g, m.id, today);
        return `<div class="kv" data-m="${m.id}"><span>${escapeHtml(m.name)}${g.dues ? (ar ? ` · <span class="neg">nunggak ${formatRupiah(ar)}</span>` : ' · lunas') : ''}</span><b>${formatRupiah(paid)}</b></div>`;
      }).join('') : '<p class="empty-desc">Belum ada anggota.</p>'}</div>
      ${entries.length ? `<div class="card"><div class="card-header"><span class="card-title">Riwayat kas</span></div>${entries.map((e) => `<div class="kv" data-e="${e.id}"><span>${formatDateShort(e.date)} · ${escapeHtml(nm(e.memberId) || e.note || (e.type === 'in' ? 'Setoran' : 'Pengeluaran'))}${e.note && nm(e.memberId) ? ' · ' + escapeHtml(e.note) : ''}</span><b class="${e.type === 'out' ? 'neg' : ''}">${e.type === 'out' ? '−' : '+'}${formatRupiah(e.amount)}</b></div>`).join('')}</div>` : ''}`;
  }

  function bind() {
    $('btn-grp-add').addEventListener('click', () => groupForm(null));
    $('grp-root').addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#grp-back')) { openId = null; return render(); }
      if (t.closest('#grp-in')) return entryForm(openId, 'in');
      if (t.closest('#grp-out')) return entryForm(openId, 'out');
      if (t.closest('#grp-mem')) return memberForm(openId);
      if (t.closest('#grp-edit')) return groupForm(openId);
      const en = t.closest('[data-e]');
      if (en) {
        const g = state.groups.find((x) => x.id === openId), ent = g && g.entries.find((x) => x.id === en.dataset.e);
        if (!ent) return;
        return askConfirm(`Hapus catatan ${formatRupiah(ent.amount)} ini?`, async () => {
          if (ent.type === 'in' && balance(g) - ent.amount < 0) { showToast('Tidak bisa dihapus: saldo kas akan negatif.'); return; }
          await save(Object.assign({}, g, { entries: g.entries.filter((x) => x.id !== ent.id) }), 'hapus', `Hapus catatan kelompok ${g.name}`);
        });
      }
      const me = t.closest('[data-m]');
      if (me) return entryForm(openId, 'in', me.dataset.m);
      const row = t.closest('[data-g]'); if (row) { openId = row.dataset.g; render(); }
    });
  }

  BK.views.kelompok = render;
  BK._group = { periodsDue, arrears, balance, memberPaid };
  bind();
})();
