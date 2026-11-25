/* ============================================================
   keluarga.js — Dompet Keluarga (multi-pengguna, ONLINE + cache offline).
   Beberapa akun berbagi satu kas lewat kode undangan. Data ada di Firestore
   (families/{kode}/entries) dan di-cache di HP: kalau offline kamu tetap bisa
   melihat & mencatat; perubahan terkirim otomatis saat online lagi.
   Terpisah dari dompet pribadi (tidak mengubah saldo pribadi).
   ============================================================ */
(function () {
  'use strict';
  const BK = window.BK;
  if (!BK) return;
  const { escapeHtml, formatRupiah, formatDateShort, todayISODate, showToast, askConfirm } = BK;
  const $ = (id) => document.getElementById(id);
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let fams = [];            // keluarga yang diikuti
  let openId = null;        // keluarga yang sedang dibuka
  let entries = [];
  let unsubFams = null, unsubEntries = null;
  let pending = false;      // ada perubahan menunggu sinkron
  let fromCache = false;
  let lastError = '';

  const fs = () => firebase.firestore();
  const user = () => (window.CloudSync && CloudSync.isReady() ? CloudSync.currentUser() : null);
  const online = () => navigator.onLine !== false;
  const rp = (n) => formatRupiah(Math.round(n));
  const fmtCode = (id) => id.replace(/(.{4})(?=.)/g, '$1-');
  const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function genId() {
    const a = new Uint32Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => ALPHA[x % ALPHA.length]).join('');
  }
  async function myName() {
    try { const n = await CloudSync.getUsername(); if (n) return n; } catch (e) { /* abaikan */ }
    const u = user();
    return (u && (u.displayName || (u.email || '').split('@')[0])) || 'Anggota';
  }

  /* ======================= LANGGANAN DATA ======================= */
  function stopAll() {
    if (unsubFams) { unsubFams(); unsubFams = null; }
    if (unsubEntries) { unsubEntries(); unsubEntries = null; }
    fams = []; entries = []; openId = null;
  }
  function watchFamilies() {
    const u = user();
    if (!u) { stopAll(); return; }
    if (unsubFams) return;
    try {
      unsubFams = fs().collection('families').where('memberUids', 'array-contains', u.uid).onSnapshot({ includeMetadataChanges: true }, (snap) => {
        fams = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        pending = snap.metadata.hasPendingWrites;
        fromCache = snap.metadata.fromCache;
        lastError = '';
        if (BK.state.currentView === 'keluarga') render();
      }, (err) => {
        unsubFams = null;
        lastError = err && err.code === 'permission-denied' ? 'Aturan Firestore untuk Keluarga belum dipasang. Ikuti PETUNJUK-BACKEND.md.' : (err && err.message) || 'Gagal memuat.';
        if (BK.state.currentView === 'keluarga') render();
      });
    } catch (e) { lastError = e.message; }
  }
  function watchEntries(id) {
    if (unsubEntries) { unsubEntries(); unsubEntries = null; }
    entries = [];
    unsubEntries = fs().collection('families').doc(id).collection('entries').orderBy('date', 'desc').limit(1000).onSnapshot({ includeMetadataChanges: true }, (snap) => {
      entries = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      pending = snap.metadata.hasPendingWrites;
      fromCache = snap.metadata.fromCache;
      if (BK.state.currentView === 'keluarga') render();
    }, (err) => { lastError = (err && err.message) || 'Gagal memuat catatan.'; render(); });
  }

  /* ======================= AKSI ======================= */
  function createFamily() {
    BK.dynForm({
      title: 'Buat Keluarga',
      fields: [{ key: 'name', label: 'Nama keluarga / grup', required: true, max: 40, placeholder: 'Contoh: Keluarga Budi' }],
      onSubmit: async (v) => {
        const u = user();
        if (!u) { showToast('Masuk akun dulu.'); return false; }
        if (!v.name) { showToast('Nama wajib diisi.'); return false; }
        const name = await myName();
        const id = genId();
        fs().collection('families').doc(id).set({
          name: v.name, ownerUid: u.uid, memberUids: [u.uid], memberNames: { [u.uid]: name },
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch((e) => showToast('Gagal membuat: ' + (e.code === 'permission-denied' ? 'aturan Firestore belum dipasang' : e.message)));
        openId = id; watchEntries(id);
        showToast('Keluarga dibuat. Bagikan kodenya ke anggota.');
      }
    });
  }
  function joinFamily() {
    BK.dynForm({
      title: 'Gabung Keluarga',
      fields: [{ key: 'code', label: 'Kode undangan', required: true, max: 20, placeholder: 'ABCD-EFGH-JKLM', hint: 'Minta kode dari pembuat keluarga. Butuh internet.' }],
      onSubmit: async (v) => {
        const u = user();
        if (!u) { showToast('Masuk akun dulu.'); return false; }
        if (!online()) { showToast('Bergabung butuh internet. Sambungkan dulu.'); return false; }
        const id = normCode(v.code);
        if (id.length !== 12) { showToast('Kode harus 12 karakter.'); return false; }
        const name = await myName();
        try {
          await fs().collection('families').doc(id).update({
            memberUids: firebase.firestore.FieldValue.arrayUnion(u.uid),
            ['memberNames.' + u.uid]: name
          });
        } catch (e) {
          showToast(e.code === 'not-found' ? 'Kode tidak ditemukan.' : e.code === 'permission-denied' ? 'Gagal gabung: kode salah, keluarga penuh, atau kamu sudah anggota.' : 'Gagal gabung: ' + e.message);
          return false;
        }
        openId = id; watchEntries(id);
        showToast('Berhasil bergabung!');
      }
    });
  }
  function entryForm(type) {
    const f = fams.find((x) => x.id === openId);
    const u = user();
    if (!f || !u) return;
    BK.dynForm({
      title: type === 'in' ? 'Setor ke Kas Keluarga' : 'Catat Pengeluaran Keluarga',
      fields: [
        { key: 'amount', label: 'Nominal', type: 'money', required: true },
        { key: 'note', label: 'Keterangan', max: 60, placeholder: type === 'out' ? 'Contoh: belanja bulanan' : 'Contoh: iuran bulan ini' },
        { key: 'date', label: 'Tanggal', type: 'date', required: true, value: todayISODate() }
      ],
      onSubmit: async (v) => {
        if (!(v.amount > 0)) { showToast('Nominal harus lebih dari 0.'); return false; }
        if (entries.length >= 1000) { showToast('Catatan sudah 1000. Hapus yang lama dulu.'); return false; }
        const name = (f.memberNames && f.memberNames[u.uid]) || (await myName());
        // tidak di-await: saat offline Firestore menyimpan di cache lalu mengirim nanti
        fs().collection('families').doc(f.id).collection('entries').add({
          type, amount: v.amount, date: v.date, note: v.note || '', byUid: u.uid, byName: name,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch((e) => showToast('Gagal menyimpan: ' + (e.code === 'permission-denied' ? 'tidak punya izin' : e.message)));
        showToast(online() ? 'Tercatat.' : 'Tersimpan di HP, dikirim saat online.');
      }
    });
  }
  function leaveFamily() {
    const f = fams.find((x) => x.id === openId), u = user();
    if (!f || !u) return;
    if (f.ownerUid === u.uid) { showToast('Pembuat keluarga tidak bisa keluar. Hapus keluarga bila tidak dipakai lagi.'); return; }
    askConfirm('Keluar dari keluarga ini? Catatan yang kamu buat tetap ada di kas keluarga.', async () => {
      try {
        await fs().collection('families').doc(f.id).update({ memberUids: firebase.firestore.FieldValue.arrayRemove(u.uid), ['memberNames.' + u.uid]: firebase.firestore.FieldValue.delete() });
        openId = null; if (unsubEntries) { unsubEntries(); unsubEntries = null; }
        showToast('Kamu sudah keluar.');
      } catch (e) { showToast('Gagal keluar: ' + e.message); }
    });
  }
  function deleteFamily() {
    const f = fams.find((x) => x.id === openId), u = user();
    if (!f || !u || f.ownerUid !== u.uid) return;
    askConfirm('Hapus keluarga beserta semua catatannya untuk SEMUA anggota? Tidak bisa dibatalkan.', async () => {
      try {
        const col = fs().collection('families').doc(f.id).collection('entries');
        const snap = await col.get();
        let batch = fs().batch(), n = 0;
        for (const d of snap.docs) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = fs().batch(); } }
        await batch.commit();
        await fs().collection('families').doc(f.id).delete();
        openId = null; if (unsubEntries) { unsubEntries(); unsubEntries = null; }
        showToast('Keluarga dihapus.');
      } catch (e) { showToast('Gagal menghapus: ' + e.message); }
    });
  }
  async function shareCode() {
    const f = fams.find((x) => x.id === openId);
    if (!f) return;
    const text = `Gabung kas keluarga "${f.name}" di Buku Kas. Kode undangan: ${fmtCode(f.id)}`;
    try {
      if (BKNative.isNative()) { await BKNative.plugin('Share').share({ title: 'Undangan Keluarga', text, dialogTitle: 'Bagikan kode' }); return; }
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch (e) { if (e && /cancel|abort/i.test(String(e.message || e.name))) return; }
    try { await navigator.clipboard.writeText(text); showToast('Kode disalin.'); } catch (e) { showToast('Kode: ' + fmtCode(f.id)); }
  }

  /* ======================= TAMPILAN ======================= */
  function statusChip() {
    if (!online()) return '<span class="kl-chip off">Offline · perubahan menunggu</span>';
    if (pending) return '<span class="kl-chip wait">Menyinkronkan…</span>';
    if (fromCache) return '<span class="kl-chip wait">Memuat dari cache…</span>';
    return '<span class="kl-chip on">Tersinkron</span>';
  }
  function render() {
    const root = $('kl-root');
    if (!root) return;
    const u = user();
    if (!window.CloudSync || !CloudSync.isReady()) { root.innerHTML = '<p class="empty-desc">Fitur ini butuh akun Firebase. Konfigurasi Firebase belum aktif di aplikasi ini.</p>'; return; }
    if (!u) { root.innerHTML = '<div class="card"><p class="empty-desc">Masuk atau daftar dulu supaya bisa berbagi kas dengan keluarga. Datamu yang lain tetap offline di HP.</p><button class="btn-primary" id="kl-login" type="button">Buka Akun</button></div>'; return; }
    watchFamilies();
    if (lastError) { root.innerHTML = `<div class="card"><p class="empty-desc">${escapeHtml(lastError)}</p></div>`; return; }
    if (openId && !fams.find((f) => f.id === openId)) { if (fams.length || !fromCache) { openId = null; if (unsubEntries) { unsubEntries(); unsubEntries = null; } } }
    if (!openId) {
      root.innerHTML = `<div class="kl-top">${statusChip()}</div>` + (fams.length
        ? `<div class="bk-list">${fams.map((f) => `<div class="bk-row" data-f="${f.id}">${BK.iconHTML(f.name, 40, 'users')}<span class="bk-main"><b>${escapeHtml(f.name)}</b><small>${f.memberUids.length} anggota${f.ownerUid === u.uid ? ' · kamu pembuat' : ''}</small></span></div>`).join('')}</div>`
        : '<p class="empty-desc">Belum ada keluarga. Buat satu lalu undang pasangan/anggota keluarga dengan kode, atau gabung pakai kode dari mereka.</p>') +
        '<div class="biz-actions"><button class="btn-primary" id="kl-new" type="button">Buat keluarga</button><button class="btn-outline-sm" id="kl-join" type="button">Gabung pakai kode</button></div>' +
        '<p class="field-hint">Kas keluarga disimpan online dan di-cache di HP, jadi tetap bisa dilihat dan dicatat saat offline. Terpisah dari saldo pribadimu.</p>';
      return;
    }
    const f = fams.find((x) => x.id === openId);
    if (!f) { root.innerHTML = '<p class="empty-desc">Memuat…</p>'; return; }
    const inn = entries.filter((e) => e.type === 'in').reduce((s, e) => s + e.amount, 0);
    const out = entries.filter((e) => e.type === 'out').reduce((s, e) => s + e.amount, 0);
    const perMember = f.memberUids.map((id) => ({ id, name: (f.memberNames && f.memberNames[id]) || 'Anggota', put: entries.filter((e) => e.type === 'in' && e.byUid === id).reduce((s, e) => s + e.amount, 0) }));
    root.innerHTML = `<div class="kl-top"><button class="btn-outline-sm" id="kl-back" type="button">← Semua keluarga</button>${statusChip()}</div>
      <div class="card kl-hero"><span class="bk-stat-label">${escapeHtml(f.name)} · Saldo kas</span><div class="bk-big">${rp(inn - out)}</div>
        <div class="bk-line"><span>Masuk ${rp(inn)}</span><span>Keluar ${rp(out)}</span></div>
        <button class="kl-code" id="kl-share" type="button" aria-label="Bagikan kode undangan"><small>Kode undangan</small><b>${fmtCode(f.id)}</b><span>Bagikan</span></button></div>
      <div class="biz-actions"><button class="btn-primary" id="kl-in" type="button">Setor</button><button class="btn-outline-sm" id="kl-out" type="button">Pengeluaran</button></div>
      <div class="card"><div class="card-header"><span class="card-title">Anggota (${f.memberUids.length})</span></div>${perMember.map((m) => `<div class="kv"><span>${escapeHtml(m.name)}${m.id === f.ownerUid ? ' · pembuat' : ''}${m.id === u.uid ? ' · kamu' : ''}</span><b>${rp(m.put)}</b></div>`).join('')}</div>
      <div class="card"><div class="card-header"><span class="card-title">Riwayat kas</span></div>${entries.length ? entries.slice(0, 60).map((e) => `<div class="kv" data-e="${e.id}"><span>${formatDateShort(e.date)} · ${escapeHtml(e.note || (e.type === 'in' ? 'Setoran' : 'Pengeluaran'))} <small class="wd-d">· ${escapeHtml(e.byName || '')}</small></span><b class="${e.type === 'out' ? 'neg' : ''}">${e.type === 'out' ? '−' : '+'}${rp(e.amount)}</b></div>`).join('') : '<p class="empty-desc">Belum ada catatan.</p>'}${entries.length >= 1000 ? '<p class="field-hint">Menampilkan 1000 catatan terbaru.</p>' : ''}</div>
      <div class="biz-actions"><button class="btn-outline-sm" id="kl-leave" type="button">${f.ownerUid === u.uid ? 'Hapus keluarga' : 'Keluar dari keluarga'}</button></div>`;
  }

  function bind() {
    const root = $('kl-root');
    root.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#kl-login')) return BK.switchView('akun');
      if (t.closest('#kl-new')) return createFamily();
      if (t.closest('#kl-join')) return joinFamily();
      if (t.closest('#kl-back')) { openId = null; if (unsubEntries) { unsubEntries(); unsubEntries = null; } return render(); }
      if (t.closest('#kl-in')) return entryForm('in');
      if (t.closest('#kl-out')) return entryForm('out');
      if (t.closest('#kl-share')) return shareCode();
      if (t.closest('#kl-leave')) { const f = fams.find((x) => x.id === openId); return f && f.ownerUid === (user() || {}).uid ? deleteFamily() : leaveFamily(); }
      const en = t.closest('[data-e]');
      if (en) {
        const ent = entries.find((x) => x.id === en.dataset.e), f = fams.find((x) => x.id === openId), u = user();
        if (!ent || !f || !u) return;
        if (ent.byUid !== u.uid && f.ownerUid !== u.uid) { showToast('Hanya pembuat catatan atau pembuat keluarga yang bisa menghapus.'); return; }
        return askConfirm(`Hapus catatan ${rp(ent.amount)} ini?`, () => {
          fs().collection('families').doc(f.id).collection('entries').doc(ent.id).delete().catch((er) => showToast('Gagal menghapus: ' + er.message));
        });
      }
      const row = t.closest('[data-f]');
      if (row) { openId = row.dataset.f; watchEntries(openId); render(); }
    });
    window.addEventListener('online', render);
    window.addEventListener('offline', render);
  }

  function build() {
    const main = $('view-lainnya') && $('view-lainnya').parentNode;
    if (!main || $('view-keluarga')) return;
    main.insertAdjacentHTML('beforeend', `<section class="view" id="view-keluarga" data-view="keluarga">
      <div class="view-header-row"><button class="back-btn" data-nav="lainnya" aria-label="Kembali"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg></button><h2 class="view-title">Keluarga</h2></div>
      <div id="kl-root"></div></section>`);
    const list = document.querySelector('#view-lainnya .menu-list');
    if (list) list.insertAdjacentHTML('afterbegin', `<button class="menu-item" data-nav="keluarga">
        <span class="menu-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15.5 14.8c3 0 5.5 1.7 5.5 4.7"/></svg></span>
        <span class="menu-item-text"><span class="menu-item-title">Keluarga · Kas Bersama</span><span class="menu-item-desc">Berbagi kas dengan pasangan/keluarga (online, cache offline)</span></span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>`);
    document.querySelectorAll('#view-keluarga [data-nav], #view-lainnya [data-nav="keluarga"]').forEach((el) => el.addEventListener('click', () => BK.switchView(el.dataset.nav)));
    bind();
    if (window.CloudSync && CloudSync.isReady()) CloudSync.onAuthChange((u) => { if (!u) stopAll(); else watchFamilies(); });
  }

  BK.views.keluarga = render;
  BK._family = { genId, normCode, fmtCode };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(build, 0));
  else setTimeout(build, 0);
})();
