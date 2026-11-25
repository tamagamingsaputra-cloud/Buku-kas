/* ============================================================
   assistant.js — Kasbot, asisten keuangan.
   • Offline (selalu bisa): menjawab dari data di HP lewat aturan.
   • Online (opsional): bila sudah masuk akun, ada internet, dan kamu mengizinkan,
     pertanyaan + RINGKASAN data (bukan seluruh data) dikirim ke Cloud Function
     milikmu yang memanggil AI. Kunci API ada di server, bukan di aplikasi.
   ============================================================ */
(function () {
  'use strict';
  const BK = window.BK;
  if (!BK) return;
  const { state, formatRupiah, escapeHtml, todayISODate, showToast } = BK;
  const $ = (id) => document.getElementById(id);
  const rp = (n) => formatRupiah(Math.round(n));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  /* ======================= DATA RINGKAS ======================= */
  function expenses() { return state.transactions.filter((t) => t.type === 'expense' && BK.inReports(t)); }
  function incomes() { return state.transactions.filter((t) => t.type === 'income' && BK.inReports(t)); }
  const sum = (a) => a.reduce((s, t) => s + t.amount, 0);
  function range(kind) {
    const now = parseISO(todayISODate());
    if (kind === 'today') return [iso(now), iso(now)];
    if (kind === 'week') { const m = (now.getDay() + 6) % 7; const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - m); return [iso(s), iso(now)]; }
    if (kind === 'lastmonth') { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1), e = new Date(now.getFullYear(), now.getMonth(), 0); return [iso(s), iso(e)]; }
    return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)];
  }
  const inRange = (list, r) => list.filter((t) => t.date >= r[0] && t.date <= r[1]);
  function catTotals(list) {
    const m = {};
    list.forEach((t) => { m[t.categoryId] = (m[t.categoryId] || 0) + t.amount; });
    return Object.keys(m).map((id) => { const c = BK.categoryById(id); return { name: c ? c.name : 'Tanpa kategori', total: m[id], id }; }).sort((a, b) => b.total - a.total);
  }
  function daysDiff(dateStr) { return Math.round((parseISO(dateStr) - parseISO(todayISODate())) / 864e5); }

  function buildContext() {
    const mon = range('month'), last = range('lastmonth');
    const budgets = (state.budgets || []).filter((b) => b.monthlyLimit > 0).map((b) => {
      const c = BK.categoryById(b.categoryId);
      return { kategori: c ? c.name : '?', batas: b.monthlyLimit, terpakai: sum(inRange(expenses(), mon).filter((t) => t.categoryId === b.categoryId)) };
    });
    const info = BK._engage ? BK._engage.streakInfo() : null;
    return {
      tanggal: todayISODate(),
      totalSaldo: BK.totalBalance(),
      dompet: state.wallets.map((w) => ({ nama: w.name, saldo: BK.walletBalance(w) })),
      bulanIni: { masuk: sum(inRange(incomes(), mon)), keluar: sum(inRange(expenses(), mon)) },
      bulanLalu: { masuk: sum(inRange(incomes(), last)), keluar: sum(inRange(expenses(), last)) },
      kategoriTerbesarBulanIni: catTotals(inRange(expenses(), mon)).slice(0, 6).map((c) => ({ nama: c.name, total: c.total })),
      anggaran: budgets,
      tagihan: (state.bills || []).filter((b) => !b.paid && b.dueDate).map((b) => ({ nama: b.name, jumlah: b.amount, hariLagi: daysDiff(b.dueDate) })).sort((a, b) => a.hariLagi - b.hariLagi).slice(0, 5),
      utang: (state.debts || []).filter((d) => BK.debtRemaining(d) > 0).slice(0, 5).map((d) => ({ jenis: d.type === 'owe' ? 'utang saya' : 'piutang', orang: d.person, sisa: BK.debtRemaining(d) })),
      target: (state.goals || []).slice(0, 5).map((g) => ({ nama: g.name, terkumpul: g.currentAmount, target: g.targetAmount })),
      streakNabung: info ? { hari: info.streak, rekor: info.best } : null,
      transaksiTerakhir: state.transactions.slice(0, 15).map((t) => { const c = BK.categoryById(t.categoryId); return { tgl: t.date, jenis: t.type, jumlah: t.amount, kategori: c ? c.name : '', catatan: String(t.note || '').slice(0, 30) }; })
    };
  }

  /* ======================= MESIN OFFLINE ======================= */
  const has = (q, re) => re.test(q);
  function fmtCats(list, n) { return list.slice(0, n).map((c, i) => `${i + 1}. ${c.name}: ${rp(c.total)}`).join('\n'); }

  function tips() {
    const out = [];
    const mon = range('month'), last = range('lastmonth');
    const exp = sum(inRange(expenses(), mon)), inc = sum(inRange(incomes(), mon)), lastExp = sum(inRange(expenses(), last));
    const cats = catTotals(inRange(expenses(), mon));
    if (inc > 0 && exp > inc) out.push(`Pengeluaran bulan ini (${rp(exp)}) udah lewat pemasukan (${rp(inc)}). Rem dulu belanja non-esensial ya.`);
    if (cats[0] && exp > 0 && cats[0].total / exp > 0.4) out.push(`${cats[0].name} makan ${Math.round(cats[0].total / exp * 100)}% dari jajan bulan ini. Coba pasang anggaran khusus di kategori itu.`);
    if (lastExp > 0 && exp > lastExp * 1.2 && parseISO(todayISODate()).getDate() > 20) out.push(`Pengeluaran bulan ini naik ${Math.round((exp / lastExp - 1) * 100)}% dibanding bulan lalu.`);
    const goalDeposits = state.transactions.filter((t) => t.goalId && t.date >= mon[0]);
    if (!goalDeposits.length && (state.goals || []).length) out.push('Bulan ini belum ada setoran ke target tabungan. Sisihkan dulu di awal, jangan nunggu sisa.');
    if (!(state.budgets || []).some((b) => b.monthlyLimit > 0)) out.push('Kamu belum punya anggaran. Mulai dari 2–3 kategori terbesar biar kebaca arahnya.');
    const late = (state.bills || []).filter((b) => !b.paid && b.dueDate && daysDiff(b.dueDate) < 0);
    if (late.length) out.push(`${late.length} tagihan sudah lewat tempo. Bayar dulu biar nggak kena denda.`);
    if (!out.length) out.push('Keuanganmu bulan ini kelihatan sehat. Pertahankan, dan coba naikkan setoran tabungan sedikit demi sedikit.');
    return out;
  }

  function answerOffline(raw) {
    const q = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!q) return 'Tanya apa aja soal keuanganmu ya.';
    // perintah catat
    const cm = /^(catat|tambah|input)\s+(.+)/i.exec(raw.trim());
    if (cm && BK.smart) {
      const d = BK.smart.parseQuick(cm[2]);
      if (d && d.amount) {
        setTimeout(() => BK.openTxDraft({ type: d.type || 'expense', amount: d.amount, note: d.note || '', categoryId: d.categoryId, date: d.date }), 350);
        return `Siap! Aku siapin transaksi ${rp(d.amount)}${d.note ? ' (' + d.note + ')' : ''}. Cek lalu simpan ya.`;
      }
      return 'Aku belum nangkep nominalnya. Coba: "catat makan siang 25 ribu".';
    }
    const mon = range('month'), wk = range('week'), td = range('today');
    if (has(q, /(saldo|total uang|uang (gue|aku|saya)|punya berapa|sisa uang)/)) {
      const w = state.wallets.map((x) => `• ${x.name}: ${rp(BK.walletBalance(x))}`).join('\n');
      return `Total saldo kamu ${rp(BK.totalBalance())}.\n${w}`;
    }
    if (has(q, /(streak|api nabung|beruntun)/) && BK._engage) {
      const i = BK._engage.streakInfo();
      return i.cfg.days.length ? `Streak nabung kamu ${i.streak} hari, rekor ${i.best} hari. ${i.todayScheduled ? (i.todayDone ? 'Hari ini udah nabung, mantap!' : 'Hari ini belum nabung, ayo setor dulu!') : 'Hari ini libur nabung.'}` : 'Hari nabung belum kamu pilih. Atur lewat widget Streak di Beranda.';
    }
    if (has(q, /(target|tabungan|nabung|goal)/)) {
      const gs = state.goals || [];
      if (!gs.length) return 'Belum ada target tabungan. Bikin satu di menu Target biar ada yang dikejar.';
      return gs.slice(0, 5).map((g) => `• ${g.name}: ${rp(g.currentAmount)} / ${rp(g.targetAmount)} (${Math.min(100, Math.floor(g.currentAmount / Math.max(1, g.targetAmount) * 100))}%)`).join('\n');
    }
    if (has(q, /(tagihan|langganan|jatuh tempo|bayar apa)/)) {
      const b = (state.bills || []).filter((x) => !x.paid && x.dueDate).sort((a, c) => a.dueDate.localeCompare(c.dueDate)).slice(0, 4);
      if (!b.length) return 'Nggak ada tagihan yang belum dibayar. Aman!';
      return b.map((x) => { const d = daysDiff(x.dueDate); return `• ${x.name}: ${rp(x.amount)} · ${d < 0 ? 'telat ' + -d + ' hari' : d === 0 ? 'hari ini' : d + ' hari lagi'}`; }).join('\n');
    }
    if (has(q, /(utang|hutang|piutang|pinjam)/)) {
      const ds = (state.debts || []).filter((d) => BK.debtRemaining(d) > 0);
      if (!ds.length) return 'Nggak ada utang atau piutang yang aktif.';
      const owe = ds.filter((d) => d.type === 'owe'), lent = ds.filter((d) => d.type !== 'owe');
      return `Utangmu ${rp(owe.reduce((s, d) => s + BK.debtRemaining(d), 0))} (${owe.length} orang), piutangmu ${rp(lent.reduce((s, d) => s + BK.debtRemaining(d), 0))} (${lent.length} orang).`;
    }
    if (has(q, /(anggaran|budget|limit)/)) {
      const bs = (state.budgets || []).filter((b) => b.monthlyLimit > 0);
      if (!bs.length) return 'Belum ada anggaran. Atur di menu Anggaran supaya aku bisa pantau.';
      return bs.map((b) => { const c = BK.categoryById(b.categoryId); const used = sum(inRange(expenses(), mon).filter((t) => t.categoryId === b.categoryId)); const p = Math.round(used / b.monthlyLimit * 100); return `• ${c ? c.name : '?'}: ${rp(used)} / ${rp(b.monthlyLimit)} (${p}%)${p >= 100 ? ' 🚨' : p >= 80 ? ' ⚠️' : ''}`; }).join('\n');
    }
    if (has(q, /(kategori|terbesar|paling banyak|paling boros|habis buat apa|buat apa)/)) {
      const c = catTotals(inRange(expenses(), mon));
      return c.length ? `Pengeluaran terbesar bulan ini:\n${fmtCats(c, 5)}` : 'Belum ada pengeluaran bulan ini.';
    }
    if (has(q, /(saran|tips|hemat|boros|evaluasi|analisa|analisis)/)) {
      return tips().map((t) => '• ' + t).join('\n');
    }
    if (has(q, /(pemasukan|gaji|pendapatan|income|masuk)/)) {
      return `Pemasukan bulan ini ${rp(sum(inRange(incomes(), mon)))}${incomes().length ? '' : '. Belum ada yang tercatat.'}`;
    }
    if (has(q, /(ringkas|ringkasan|laporan|rekap|gimana keuangan|kondisi)/)) {
      const e = sum(inRange(expenses(), mon)), i = sum(inRange(incomes(), mon));
      return `Rekap bulan ini:\n• Masuk: ${rp(i)}\n• Keluar: ${rp(e)}\n• Selisih: ${rp(i - e)}\n• Saldo total: ${rp(BK.totalBalance())}`;
    }
    if (has(q, /(jajan|keluar|pengeluaran|belanja|habis|spend|boros)/)) {
      const r = has(q, /hari ini|today/) ? td : has(q, /(minggu|pekan)/) ? wk : has(q, /bulan lalu/) ? range('lastmonth') : mon;
      const label = r === td ? 'hari ini' : r === wk ? 'minggu ini' : r === mon ? 'bulan ini' : 'bulan lalu';
      const list = inRange(expenses(), r);
      const top = catTotals(list)[0];
      return `Pengeluaran ${label}: ${rp(sum(list))} (${list.length} transaksi).${top ? ` Terbesar di ${top.name} (${rp(top.total)}).` : ''}`;
    }
    return 'Aku bisa bantu jawab: saldo, jajan (hari ini/minggu/bulan), kategori terbesar, anggaran, tagihan, utang, target & streak, serta saran hemat. Atau ketik "catat makan siang 25 ribu" buat nyatat cepat.';
  }

  /* ======================= MESIN ONLINE ======================= */
  const aiCfg = () => (BK.loadSettings().ai || {});
  const saveAi = (p) => { const s = BK.loadSettings(); s.ai = Object.assign({}, s.ai, p); BK.saveSettings(s); };
  function endpoint() {
    if (window.BUKUKAS_AI_URL) return window.BUKUKAS_AI_URL;
    if (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) return `https://asia-southeast2-${firebaseConfig.projectId}.cloudfunctions.net/askAssistant`;
    return '';
  }
  function signedIn() { try { return !!(window.CloudSync && CloudSync.isReady && CloudSync.isReady() && CloudSync.currentUser()); } catch (e) { return false; } }
  function onlineReady() { return navigator.onLine !== false && signedIn() && !!endpoint(); }

  async function askOnline(q, history) {
    const user = firebase.auth().currentUser;
    const token = await user.getIdToken();
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 35000);
    try {
      const r = await fetch(endpoint(), { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ question: q, context: buildContext(), history }) });
      let data = {};
      try { data = await r.json(); } catch (e) { /* bukan JSON */ }
      if (!r.ok) { const err = new Error(data.error || 'Server AI error ' + r.status); err.status = r.status; throw err; }
      return String(data.answer || '');
    } finally { clearTimeout(to); }
  }

  /* ======================= UI ======================= */
  const chat = [];
  let busy = false;
  const SUGGEST = ['Berapa jajanku bulan ini?', 'Kategori paling boros?', 'Saran hemat dong', 'Tagihan terdekat?', 'Streak nabungku?'];

  function modeInfo() {
    const c = aiCfg();
    if (navigator.onLine === false) return { on: false, text: 'Offline · mode dasar' };
    if (!signedIn()) return { on: false, text: 'Mode dasar · masuk akun untuk AI online' };
    if (c.consent === false) return { on: false, text: 'Mode dasar (AI online dimatikan)' };
    if (c.consent !== true) return { on: false, text: 'Mode dasar · AI online butuh izinmu', ask: true };
    return { on: true, text: 'Online · AI aktif' };
  }
  function md(t) { return escapeHtml(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }

  function render() {
    const root = $('asisten-root');
    if (!root) return;
    const mi = modeInfo();
    $('as-status').textContent = mi.text;
    $('as-status').className = 'as-status ' + (mi.on ? 'on' : 'off');
    const consent = mi.ask ? `<div class="as-consent"><b>Aktifkan AI online?</b><p>Saat kamu bertanya, pertanyaan + <u>ringkasan</u> keuanganmu (saldo, total per kategori, 15 transaksi terakhir) dikirim ke server AI milikmu. Tanpa ini, Kasbot tetap jalan offline.</p>
      <div class="as-consent-btns"><button type="button" class="btn-primary" data-as="allow">Izinkan</button><button type="button" class="btn-outline-sm" data-as="deny">Tetap offline</button></div></div>` : '';
    const msgs = chat.length ? chat.map((m) => `<div class="as-msg ${m.role}"><div class="as-bub">${md(m.text)}${m.tag ? `<small>${escapeHtml(m.tag)}</small>` : ''}</div></div>`).join('')
      : `<div class="as-hello"><div class="as-bot">🤖</div><b>Halo, aku Kasbot!</b><p>Tanya soal duitmu: saldo, jajan, tagihan, target, atau minta saran hemat.</p></div>`;
    $('as-log').innerHTML = msgs + (busy ? '<div class="as-msg assistant"><div class="as-bub as-typing"><i></i><i></i><i></i></div></div>' : '') + consent;
    $('as-chips').innerHTML = SUGGEST.map((s) => `<button type="button" class="chip" data-as-q="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');
    const log = $('as-log'); log.scrollTop = log.scrollHeight;
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    chat.push({ role: 'user', text });
    $('as-input').value = '';
    const mi = modeInfo();
    busy = true; render();
    let answer, tag = '';
    if (mi.on && onlineReady() && !/^(catat|tambah|input)\s/i.test(text)) {
      try {
        const hist = chat.slice(0, -1).slice(-6).map((m) => ({ role: m.role, text: m.text }));
        answer = await askOnline(text, hist);
        tag = 'AI online';
      } catch (e) {
        const why = e.status === 429 ? e.message : e.status === 401 || e.status === 403 ? 'Sesi/akses ditolak server AI. Coba masuk ulang.' : e.status === 404 || e.name === 'TypeError' ? 'Server AI belum aktif/terjangkau, jadi aku jawab dari data di HP.' : (e.name === 'AbortError' ? 'Server AI kelamaan, jadi aku jawab dari data di HP.' : 'Server AI lagi bermasalah, jadi aku jawab dari data di HP.');
        answer = answerOffline(text);
        tag = why;
      }
    } else {
      answer = answerOffline(text);
      tag = 'Offline · dasar';
    }
    busy = false;
    chat.push({ role: 'assistant', text: answer, tag });
    render();
  }

  function build() {
    const main = $('view-lainnya') && $('view-lainnya').parentNode;
    if (!main || $('view-asisten')) return;
    main.insertAdjacentHTML('beforeend', `<section class="view" id="view-asisten" data-view="asisten">
      <div class="view-header-row">
        <button class="back-btn" data-nav="lainnya" aria-label="Kembali"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h2 class="view-title">Kasbot</h2>
      </div>
      <div class="as-bar"><span class="as-status off" id="as-status"></span><button type="button" class="btn-outline-sm" id="as-toggle">Mode AI</button></div>
      <div class="as-wrap" id="asisten-root"><div class="as-log" id="as-log" aria-live="polite"></div>
        <div class="as-chips" id="as-chips"></div>
        <form class="as-form" id="as-form" autocomplete="off"><input id="as-input" type="text" maxlength="300" placeholder="Tanya Kasbot…" aria-label="Pertanyaan" /><button class="as-send" type="submit" aria-label="Kirim"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form></div>
    </section>`);
    const list = document.querySelector('#view-lainnya .menu-list');
    if (list) list.insertAdjacentHTML('afterbegin', `<button class="menu-item" data-nav="asisten">
        <span class="menu-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 13h.01M15 13h.01M9 16.2c1.8 1 4.2 1 6 0"/></svg></span>
        <span class="menu-item-text"><span class="menu-item-title">Kasbot · Asisten</span><span class="menu-item-desc">Tanya saldo, jajan & saran hemat (offline / AI online)</span></span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>`);
    document.querySelectorAll('#view-asisten [data-nav], #view-lainnya [data-nav="asisten"]').forEach((el) => el.addEventListener('click', () => BK.switchView(el.dataset.nav)));
    $('as-form').addEventListener('submit', (e) => { e.preventDefault(); send($('as-input').value); });
    $('as-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-as-q]'); if (b) send(b.dataset.asQ); });
    $('as-log').addEventListener('click', (e) => {
      const b = e.target.closest('[data-as]');
      if (!b) return;
      saveAi({ consent: b.dataset.as === 'allow' });
      render();
    });
    $('as-toggle').addEventListener('click', () => {
      const c = aiCfg();
      if (!signedIn()) { showToast('Masuk akun dulu untuk memakai AI online. Mode dasar tetap jalan offline.'); return; }
      saveAi({ consent: c.consent !== true });
      showToast(c.consent !== true ? 'AI online aktif.' : 'AI online dimatikan. Kasbot jalan offline.');
      render();
    });
    window.addEventListener('online', render);
    window.addEventListener('offline', render);
  }

  BK.views.asisten = render;
  BK.assistant = { answerOffline, buildContext, send, modeInfo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(build, 0));
  else setTimeout(build, 0);
})();
