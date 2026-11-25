/* ============================================================
   engage.js — Widget dashboard (jam, streak, dll), streak menabung,
   notifikasi native (bilah notifikasi HP), banner dalam-aplikasi,
   izin aplikasi, detail & arsip dompet, banner offline.
   ============================================================ */
(function () {
  'use strict';
  const BK = window.BK;
  if (!BK) return;
  const { state, formatRupiah, escapeHtml, todayISODate, showToast } = BK;
  const $ = (id) => document.getElementById(id);
  const NATIVE = BK.NATIVE;
  const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; };
  const rp = (n) => formatRupiah(Math.round(n));
  const svgI = (p, s) => `<svg viewBox="0 0 24 24" width="${s || 20}" height="${s || 20}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

  /* ======================= PENGATURAN TERSIMPAN ======================= */
  const WIDGET_IDS = ['clock', 'streak', 'allow', 'goal', 'bill', 'spend', 'top', 'tip'];
  const WIDGET_NAMES = {
    clock: ['Jam & Sapaan', 'Waktu real-time dengan sapaan sesuai jam'],
    streak: ['Streak Nabung', 'Api beruntun kalau rajin menabung'],
    allow: ['Jatah Harian', 'Sisa jatah jajan hari ini'],
    goal: ['Target Terdekat', 'Progres target tabungan yang paling dekat'],
    bill: ['Tagihan Terdekat', 'Tagihan / utang yang mau jatuh tempo'],
    spend: ['Jajan 7 Hari', 'Grafik mini pengeluaran seminggu'],
    top: ['Si Paling Boros', 'Kategori terbesar bulan ini'],
    tip: ['Tips Receh', 'Tips hemat singkat yang ganti-ganti']
  };
  const INTERVALS = [[1, '1 mnt'], [5, '5 mnt'], [15, '15 mnt'], [30, '30 mnt'], [60, '1 jam'], [180, '3 jam'], [360, '6 jam']];

  function widgetCfg() {
    const s = BK.loadSettings().widget || {};
    return {
      off: !!s.off,
      mode: s.mode === 'fixed' ? 'fixed' : 'rotate',
      interval: INTERVALS.some((x) => x[0] === s.interval) ? s.interval : 5,
      fixed: WIDGET_IDS.includes(s.fixed) ? s.fixed : 'clock',
      list: Array.isArray(s.list) && s.list.some((x) => WIDGET_IDS.includes(x)) ? s.list.filter((x) => WIDGET_IDS.includes(x)) : WIDGET_IDS.slice()
    };
  }
  function saveWidgetCfg(patch) {
    const s = BK.loadSettings();
    s.widget = Object.assign({}, widgetCfg(), patch);
    BK.saveSettings(s);
  }
  function streakCfg() {
    const s = BK.loadSettings().streak || {};
    return {
      days: Array.isArray(s.days) ? s.days.filter((x) => x >= 0 && x <= 6) : [0, 1, 2, 3, 4, 5, 6],
      remind: s.remind !== false,
      best: Number(s.best) || 0,
      cel: s.cel || ''
    };
  }
  function saveStreakCfg(patch) {
    const s = BK.loadSettings();
    s.streak = Object.assign({}, streakCfg(), patch);
    BK.saveSettings(s);
  }

  /* ======================= STREAK MENABUNG ======================= */
  function depositDates() {
    const set = new Set();
    state.transactions.forEach((t) => { if (t.goalId && t.type === 'expense') set.add(t.date); });
    return set;
  }
  /** Hitung streak: hari-hari terjadwal berturut-turut yang ada setoran tabungannya.
      Hari ini yang belum menabung tidak memutus streak (masih ada waktu); hari terjadwal
      sebelumnya yang kosong memutus streak. */
  function calcStreak(days, dep, todayStr) {
    const today = parseISO(todayStr);
    let streak = 0;
    if (!days.length) return { streak: 0, todayDone: false, todayScheduled: false };
    const todayScheduled = days.includes(today.getDay());
    const todayDone = dep.has(todayStr);
    for (let i = 0; i < 400; i++) {
      const d = addDays(today, -i);
      if (!days.includes(d.getDay())) continue;
      if (dep.has(isoOf(d))) streak++;
      else if (i === 0) continue;
      else break;
    }
    return { streak, todayDone, todayScheduled };
  }
  function streakInfo() {
    const cfg = streakCfg();
    const r = calcStreak(cfg.days, depositDates(), todayISODate());
    r.best = Math.max(cfg.best, r.streak);
    r.cfg = cfg;
    return r;
  }
  function streakLevel(n) {
    if (n >= 100) return 'Legenda Cuan';
    if (n >= 30) return 'Raja Hemat';
    if (n >= 14) return 'Api Membara';
    if (n >= 7) return 'Api Unggun';
    if (n >= 3) return 'Api Kecil';
    if (n >= 1) return 'Percikan';
    return 'Belum Nyala';
  }
  /** dot minggu ini (Sen–Min) */
  function weekDots(info) {
    const today = parseISO(todayISODate());
    const dep = depositDates();
    const mondayOffset = (today.getDay() + 6) % 7;
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i - mondayOffset);
      const iso = isoOf(d);
      let st;
      if (!info.cfg.days.includes(d.getDay())) st = 'off';
      else if (dep.has(iso)) st = 'done';
      else if (iso === todayISODate()) st = 'today';
      else if (d < today) st = 'miss';
      else st = 'next';
      out.push({ st, label: DAY_SHORT[d.getDay()][0] });
    }
    return out;
  }

  /* ======================= DATA UNTUK WIDGET ======================= */
  function ymNow() { return todayISODate().slice(0, 7); }
  function monthExpenses() {
    const ym = ymNow();
    return state.transactions.filter((t) => t.type === 'expense' && BK.inReports(t) && t.date.slice(0, 7) === ym);
  }
  function daysLeftInMonth() {
    const n = parseISO(todayISODate());
    const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
    return last - n.getDate() + 1;
  }
  function allowance() {
    const spent = monthExpenses();
    const today = todayISODate();
    const spentToday = spent.filter((t) => t.date === today).reduce((s, t) => s + t.amount, 0);
    const limits = (state.budgets || []).filter((b) => b.monthlyLimit > 0);
    const left = daysLeftInMonth();
    if (limits.length) {
      const total = limits.reduce((s, b) => s + b.monthlyLimit, 0);
      const used = spent.filter((t) => limits.some((b) => b.categoryId === t.categoryId)).reduce((s, t) => s + t.amount, 0);
      const remain = total - used;
      return { kind: 'budget', remain, perDay: remain / left, spentToday, left, total };
    }
    const inc = state.transactions.filter((t) => t.type === 'income' && BK.inReports(t) && t.date.slice(0, 7) === ymNow()).reduce((s, t) => s + t.amount, 0);
    if (inc > 0) {
      const remain = inc - spent.reduce((s, t) => s + t.amount, 0);
      return { kind: 'income', remain, perDay: remain / left, spentToday, left, total: inc };
    }
    return { kind: 'none', spentToday, left };
  }
  function nearestGoal() {
    const gs = (state.goals || []).filter((g) => g.targetAmount > 0 && g.currentAmount < g.targetAmount);
    if (!gs.length) return null;
    gs.sort((a, b) => (b.currentAmount / b.targetAmount) - (a.currentAmount / a.targetAmount));
    return gs[0];
  }
  function nearestDue() {
    const today = parseISO(todayISODate());
    const dd = (s) => Math.round((parseISO(s) - today) / 864e5);
    const items = [];
    (state.bills || []).filter((b) => !b.paid && b.dueDate).forEach((b) => items.push({ name: b.name, days: dd(b.dueDate), amount: b.amount, go: 'tagihan', kind: 'Tagihan' }));
    (state.debts || []).filter((d) => BK.debtRemaining(d) > 0 && d.dueDate).forEach((d) => items.push({ name: d.type === 'owe' ? 'Utang ke ' + d.person : 'Piutang dari ' + d.person, days: dd(d.dueDate), amount: BK.debtRemaining(d), go: 'hutang', kind: d.type === 'owe' ? 'Utang' : 'Piutang' }));
    items.sort((a, b) => a.days - b.days);
    return items[0] || null;
  }
  function last7() {
    const today = parseISO(todayISODate());
    const map = {};
    state.transactions.forEach((t) => { if (t.type === 'expense' && BK.inReports(t)) map[t.date] = (map[t.date] || 0) + t.amount; });
    const out = [];
    for (let i = 6; i >= 0; i--) { const d = addDays(today, -i); out.push({ d, v: map[isoOf(d)] || 0 }); }
    return out;
  }
  function topCategory() {
    const m = {};
    monthExpenses().forEach((t) => { m[t.categoryId] = (m[t.categoryId] || 0) + t.amount; });
    const ids = Object.keys(m).sort((a, b) => m[b] - m[a]);
    if (!ids.length) return null;
    const c = BK.categoryById(ids[0]);
    const total = monthExpenses().reduce((s, t) => s + t.amount, 0);
    return { name: c ? c.name : 'Tanpa kategori', value: m[ids[0]], pct: Math.round((m[ids[0]] / total) * 100) };
  }

  const TIPS = [
    'Gaji masuk? Sisihin dulu buat nabung, baru jajan. Urutannya jangan kebalik, bestie 😎',
    'Kopi kekinian tiap hari = satu cicilan motor setahun. Seminggu dua kali aja cukup ☕',
    'Catat jajan receh juga. Yang kecil-kecil itu yang diam-diam bikin dompet kurus 🐜',
    'Lapar mata itu penyakit. Tunggu 24 jam sebelum checkout, kalau masih pengen baru beli 🛒',
    'Nabung Rp5.000 tiap hari = Rp1,8 juta setahun. Receh juga punya kekuatan 💪',
    'Bayar tagihan sebelum jatuh tempo. Denda itu uang yang pergi tanpa kenangan 😤',
    'Sebelum ngutang, tanya diri sendiri: butuh atau cuma pengen? 🤔',
    'Punya dana darurat itu bukan pelit, tapi pinter. Mulai dari 1 bulan pengeluaran 🛟',
    'Cek langganan streaming. Yang udah jarang dipakai, cancel aja biar nggak kebakar 🔥',
    'Bawa bekal 2x seminggu aja udah lumayan hemat. Dompet bilang makasih 🍱',
    'Target nabung yang jelas bikin semangat. Kasih nama yang bikin senyum, mis. "Liburan Bali" 🏝️',
    'Jangan bandingin gaya hidup sama orang lain. Sosmed itu panggung, bukan rekening 🎭'
  ];

  /* ======================= RENDER WIDGET ======================= */
  const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>';
  const MOON = '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/><path d="M16.5 4.5v2M15.5 5.5h2"/>';
  const SUNSET = '<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 7v3M5.2 10.2l1.7 1.7M18.8 10.2l-1.7 1.7"/>';
  const FLAME = '<path d="M12 2.5c.6 3.1-1.7 4.6-3.2 6.5C7.3 10.9 6.5 12.6 6.5 14.6a5.5 5.5 0 0 0 11 0c0-2.2-1-3.8-2.2-5.2-.3 1.4-1 2.3-2 2.8.5-3.4-.3-6.9-1.3-9.7Z"/>';

  function partOfDay(h) {
    if (h >= 4 && h < 11) return 'pagi';
    if (h >= 11 && h < 15) return 'siang';
    if (h >= 15 && h < 18) return 'sore';
    return 'malam';
  }
  function greeting(h) {
    if (h >= 4 && h < 11) return 'Pagi! Semangat cari cuan ☀️';
    if (h >= 11 && h < 15) return 'Siang! Jangan lupa makan, dompet aman 🍜';
    if (h >= 15 && h < 18) return 'Sore! Cek pengeluaran dulu yuk 🌇';
    if (h >= 18 && h < 22) return 'Malam! Rekap jajan hari ini udah belum? 🌙';
    return 'Udah malem. Catat dulu, abis itu bobo 😴';
  }

  const RENDER = {
    clock() {
      const n = new Date(), h = n.getHours(), part = partOfDay(h);
      const art = part === 'malam' ? MOON : part === 'sore' ? SUNSET : SUN;
      return {
        cls: 'dw-clock dw-' + part, tag: 'SEKARANG',
        html: `<div class="dw-big dw-time"><span id="dw-time">${pad(h)}:${pad(n.getMinutes())}</span><small id="dw-sec">:${pad(n.getSeconds())}</small></div>
          <div class="dw-date" id="dw-date">${DAY_NAMES[n.getDay()]}, ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}</div>
          <div class="dw-sub">${greeting(h)}</div>`,
        art
      };
    },
    streak() {
      const info = streakInfo();
      const dots = weekDots(info);
      let sub, cta = '';
      if (!info.cfg.days.length) sub = 'Belum ada hari nabung yang dipilih. Ketuk untuk atur.';
      else if (!info.todayScheduled) sub = 'Hari ini libur nabung. Santai, apimu aman 😎';
      else if (info.todayDone) sub = 'Hari ini udah nabung. Mantap, pertahankan! 🔥';
      else {
        sub = info.streak > 0 ? `Belum nabung hari ini. Setor dulu biar api ${info.streak} harimu nggak padam!` : 'Belum ada api. Mulai nabung hari ini yuk!';
        cta = '<button type="button" class="dw-cta" data-dw-save>Nabung sekarang</button>';
      }
      return {
        cls: 'dw-streak', tag: 'STREAK NABUNG · ' + streakLevel(info.streak).toUpperCase(),
        html: `<div class="dw-big">${info.streak}<small> hari beruntun</small></div>
          <div class="dw-sub">${sub}</div>
          <div class="dw-week" aria-hidden="true">${dots.map((d) => `<i class="wd ${d.st}"><b>${d.label}</b></i>`).join('')}</div>
          <div class="dw-sub dw-best">Rekor: ${info.best} hari</div>${cta}`,
        art: FLAME
      };
    },
    allow() {
      const a = allowance();
      let big, sub;
      if (a.kind === 'none') { big = '—'; sub = 'Belum ada anggaran atau pemasukan bulan ini. Atur anggaran dulu biar jatahnya kebaca.'; }
      else if (a.remain <= 0) { big = rp(0); sub = a.kind === 'budget' ? 'Anggaran bulan ini udah habis. Rem dulu, bestie! 🚨' : 'Pemasukan bulan ini udah terpakai semua. Tahan jajan dulu 🚨'; }
      else { big = rp(a.perDay); sub = `Jatah aman per hari sampai akhir bulan (${a.left} hari lagi). Hari ini udah keluar ${rp(a.spentToday)}.`; }
      return { cls: 'dw-allow', tag: 'JATAH HARIAN', html: `<div class="dw-big dw-money">${big}</div><div class="dw-sub">${sub}</div>`, art: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 15h2.5"/>' };
    },
    goal() {
      const g = nearestGoal();
      if (!g) return { cls: 'dw-goal', tag: 'TARGET TERDEKAT', html: '<div class="dw-big dw-money">Belum ada</div><div class="dw-sub">Bikin target tabungan biar ada yang dikejar. Ketuk lalu buka menu Target.</div>', art: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>' };
      const pct = Math.min(100, Math.floor((g.currentAmount / g.targetAmount) * 100));
      const circ = 2 * Math.PI * 26;
      return {
        cls: 'dw-goal', tag: 'TARGET TERDEKAT',
        html: `<div class="dw-ring"><svg viewBox="0 0 64 64" width="72" height="72"><circle cx="32" cy="32" r="26" class="rb"/><circle cx="32" cy="32" r="26" class="rf" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 32 32)"/></svg><b>${pct}%</b></div>
          <div class="dw-goalx"><div class="dw-name">${escapeHtml(g.name)}</div><div class="dw-sub">${rp(g.currentAmount)} dari ${rp(g.targetAmount)}. Tinggal ${rp(g.targetAmount - g.currentAmount)} lagi, gaskeun! 🎯</div></div>`,
        art: ''
      };
    },
    bill() {
      const b = nearestDue();
      if (!b) return { cls: 'dw-bill ok', tag: 'TAGIHAN', html: '<div class="dw-big dw-money">Aman 😌</div><div class="dw-sub">Nggak ada tagihan atau utang yang mepet jatuh tempo. Nikmati harimu!</div>', art: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' };
      const when = b.days < 0 ? `Nunggak ${-b.days} hari 😬` : b.days === 0 ? 'Jatuh tempo HARI INI!' : b.days === 1 ? 'Besok jatuh tempo' : `${b.days} hari lagi`;
      return { cls: 'dw-bill' + (b.days <= 1 ? ' hot' : ''), tag: b.kind.toUpperCase() + ' TERDEKAT', html: `<div class="dw-name">${escapeHtml(b.name)}</div><div class="dw-big dw-money">${rp(b.amount)}</div><div class="dw-sub">${when}</div>`, art: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>', go: b.go };
    },
    spend() {
      const d = last7();
      const max = Math.max.apply(null, d.map((x) => x.v).concat([1]));
      const total = d.reduce((s, x) => s + x.v, 0);
      const bars = d.map((x, i) => `<i class="${i === 6 ? 'now' : ''}" style="height:${Math.max(6, Math.round((x.v / max) * 100))}%"><b>${DAY_SHORT[x.d.getDay()][0]}</b></i>`).join('');
      return { cls: 'dw-spend', tag: 'JAJAN 7 HARI', html: `<div class="dw-big dw-money">${rp(total)}</div><div class="dw-sub">Rata-rata ${rp(total / 7)} per hari</div><div class="dw-bars" aria-hidden="true">${bars}</div>`, art: '' };
    },
    top() {
      const t = topCategory();
      if (!t) return { cls: 'dw-top', tag: 'SI PALING BOROS', html: '<div class="dw-big dw-money">Belum ada</div><div class="dw-sub">Belum ada pengeluaran bulan ini. Dompetmu masih perawan 😇</div>', art: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>' };
      return { cls: 'dw-top', tag: 'SI PALING BOROS', html: `<div class="dw-name">${escapeHtml(t.name)}</div><div class="dw-big dw-money">${rp(t.value)}</div><div class="dw-sub">${t.pct}% dari semua jajan bulan ini. Hmm, ada yang bisa dikurangin? 👀</div>`, art: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>' };
    },
    tip() {
      const cfg = widgetCfg();
      const slot = Math.floor(Date.now() / (Math.max(1, cfg.interval) * 60000));
      const day = Math.floor(Date.now() / 864e5);
      const t = TIPS[(cfg.mode === 'rotate' ? slot : day) % TIPS.length];
      return { cls: 'dw-tip', tag: 'TIPS RECEH', html: `<div class="dw-quote">${escapeHtml(t)}</div>`, art: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>' };
    }
  };

  let shownId = null;
  function currentWidgetId() {
    const cfg = widgetCfg();
    if (cfg.mode === 'fixed') return cfg.fixed;
    const list = cfg.list.length ? cfg.list : WIDGET_IDS;
    const slot = Math.floor(Date.now() / (cfg.interval * 60000));
    return list[slot % list.length];
  }
  function renderWidget(animate) {
    const host = $('dash-widget');
    if (!host) return;
    const cfg = widgetCfg();
    host.hidden = cfg.off;
    if (cfg.off) { shownId = null; return; }
    const id = currentWidgetId();
    const w = RENDER[id]();
    const list = cfg.mode === 'rotate' ? (cfg.list.length ? cfg.list : WIDGET_IDS) : [];
    const dots = list.length > 1 ? `<span class="dw-dots" aria-hidden="true">${list.map((x) => `<i class="${x === id ? 'on' : ''}"></i>`).join('')}</span>` : '';
    const hint = cfg.mode === 'rotate' ? `Bergilir tiap ${(INTERVALS.find((x) => x[0] === cfg.interval) || [0, '5 mnt'])[1]}` : 'Tampilan tetap';
    const wasId = shownId;
    host.innerHTML = `<div class="dw-card ${w.cls}${animate && wasId !== id ? ' dw-in' : ''}" role="button" tabindex="0" aria-label="${escapeHtml(WIDGET_NAMES[id][0])}. Ketuk untuk mengatur tampilan widget" data-dw="${id}"${w.go ? ` data-dw-go="${w.go}"` : ''}>
      <span class="dw-glow g1"></span><span class="dw-glow g2"></span>
      <div class="dw-body"><span class="dw-tag">${escapeHtml(w.tag)}</span>${w.html}</div>
      ${w.art ? `<div class="dw-art">${svgI(w.art, 56)}</div>` : ''}
      <div class="dw-foot">${dots}<span class="dw-hint">${hint} · ketuk untuk atur</span></div>
    </div>`;
    shownId = id;
  }
  function tickWidget() {
    if (document.hidden || state.currentView !== 'dashboard' || !$('dash-widget') || $('dash-widget').hidden) return;
    const cfg = widgetCfg();
    if (!cfg.off && currentWidgetId() !== shownId) { renderWidget(true); return; }
    if (shownId === 'clock') {
      const n = new Date();
      const t = $('dw-time'), s = $('dw-sec');
      if (t) { const v = `${pad(n.getHours())}:${pad(n.getMinutes())}`; if (t.textContent !== v) { t.textContent = v; if (partOfDay(n.getHours()) !== (document.querySelector('.dw-clock') || { className: '' }).className.match(/dw-(pagi|siang|sore|malam)/)?.[1]) renderWidget(false); } }
      if (s) s.textContent = ':' + pad(n.getSeconds());
      const dt = $('dw-date');
      if (dt) { const v = `${DAY_NAMES[n.getDay()]}, ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`; if (dt.textContent !== v) dt.textContent = v; }
    }
  }

  /* ======================= PENGATURAN WIDGET (sheet) ======================= */
  function chip(attr, on, label) { return `<button type="button" class="chip${on ? ' active' : ''}" ${attr} aria-pressed="${on}">${label}</button>`; }
  function renderWidgetSettings() {
    const cfg = widgetCfg(), st = streakCfg(), info = streakInfo();
    const body = $('widget-settings-body');
    if (!body) return;
    body.innerHTML = `
      <div class="ws-block">
        <div class="ws-row"><span><b>Tampilkan widget</b><small>Area di bawah kartu saldo</small></span>
          <button class="switch" id="ws-on" role="switch" aria-checked="${!cfg.off}"><span class="switch-knob"></span></button></div>
      </div>
      <div class="ws-block"${cfg.off ? ' hidden' : ''} id="ws-main">
        <div class="ws-title">Cara tampil</div>
        <div class="seg-mini ws-seg" role="group">
          <button type="button" class="segment${cfg.mode === 'rotate' ? ' active' : ''}" data-ws-mode="rotate">Bergilir</button>
          <button type="button" class="segment${cfg.mode === 'fixed' ? ' active' : ''}" data-ws-mode="fixed">Satu tetap</button>
        </div>
        ${cfg.mode === 'rotate' ? `
          <div class="ws-title">Ganti tiap</div>
          <div class="ws-chips">${INTERVALS.map((x) => chip(`data-ws-int="${x[0]}"`, cfg.interval === x[0], x[1])).join('')}</div>
          <div class="ws-title">Widget yang ikut bergilir</div>
          <div class="ws-list">${WIDGET_IDS.map((id) => `<button type="button" class="ws-opt${cfg.list.includes(id) ? ' on' : ''}" data-ws-inc="${id}" aria-pressed="${cfg.list.includes(id)}"><span class="ws-chk"></span><span><b>${WIDGET_NAMES[id][0]}</b><small>${WIDGET_NAMES[id][1]}</small></span></button>`).join('')}</div>`
        : `
          <div class="ws-title">Pilih satu widget</div>
          <div class="ws-list">${WIDGET_IDS.map((id) => `<button type="button" class="ws-opt${cfg.fixed === id ? ' on' : ''}" data-ws-fix="${id}" aria-pressed="${cfg.fixed === id}"><span class="ws-rad"></span><span><b>${WIDGET_NAMES[id][0]}</b><small>${WIDGET_NAMES[id][1]}</small></span></button>`).join('')}</div>`}
      </div>
      <div class="ws-block ws-streak">
        <div class="ws-title">🔥 Streak menabung <span class="ws-pill">${info.streak} hari · rekor ${info.best}</span></div>
        <p class="field-hint">Pilih hari kamu berkomitmen menabung. Streak putus kalau di hari terpilih kamu nggak mencatat setoran tabungan.</p>
        <div class="ws-chips ws-days">${[1, 2, 3, 4, 5, 6, 0].map((d) => chip(`data-ws-day="${d}"`, st.days.includes(d), DAY_SHORT[d])).join('')}</div>
        <div class="ws-row"><span><b>Pengingat 16.00–20.00</b><small>Tiap jam kalau hari ini belum ada setoran tabungan</small></span>
          <button class="switch" id="ws-remind" role="switch" aria-checked="${st.remind}"><span class="switch-knob"></span></button></div>
        <p class="field-hint" id="ws-remind-note"></p>
      </div>`;
    const note = $('ws-remind-note');
    if (note) note.textContent = NATIVE ? (notif.isOn() ? '' : 'Notifikasi HP belum aktif. Menyalakan pengingat akan meminta izin notifikasi.') : 'Pengingat berjalan di bilah notifikasi saat memakai APK. Di browser, pengingat hanya muncul saat aplikasi terbuka.';
  }
  function bindWidgetSettings() {
    const body = $('widget-settings-body');
    body.addEventListener('click', async (e) => {
      const t = e.target;
      let el;
      if (t.closest('#ws-on')) { const c = widgetCfg(); saveWidgetCfg({ off: !c.off }); }
      else if ((el = t.closest('[data-ws-mode]'))) saveWidgetCfg({ mode: el.dataset.wsMode });
      else if ((el = t.closest('[data-ws-int]'))) saveWidgetCfg({ interval: Number(el.dataset.wsInt) });
      else if ((el = t.closest('[data-ws-inc]'))) {
        const c = widgetCfg(), id = el.dataset.wsInc;
        let list = c.list.includes(id) ? c.list.filter((x) => x !== id) : c.list.concat([id]);
        if (!list.length) { showToast('Minimal satu widget harus ikut bergilir.'); return; }
        list = WIDGET_IDS.filter((x) => list.includes(x));
        saveWidgetCfg({ list });
      } else if ((el = t.closest('[data-ws-fix]'))) saveWidgetCfg({ fixed: el.dataset.wsFix });
      else if ((el = t.closest('[data-ws-day]'))) {
        const s = streakCfg(), d = Number(el.dataset.wsDay);
        const days = s.days.includes(d) ? s.days.filter((x) => x !== d) : s.days.concat([d]);
        saveStreakCfg({ days: days.sort() });
        notif.reschedule(true);
      } else if (t.closest('#ws-remind')) {
        const s = streakCfg();
        if (!s.remind) {
          const ok = await notif.ensure();
          if (!ok) { showToast('Izin notifikasi belum diberikan.'); }
        }
        saveStreakCfg({ remind: !s.remind });
        notif.reschedule(true);
      } else return;
      renderWidgetSettings();
      renderWidget(false);
    });
  }
  function openWidgetSettings() { renderWidgetSettings(); BK.openModal('modal-widget'); }
  BK.openWidgetSettings = openWidgetSettings;

  function goSave() {
    const goals = state.goals || [];
    if (!goals.length) { showToast('Buat target tabungan dulu ya.'); BK.switchView('target'); return; }
    if (goals.length === 1) { BK.openGoalTransferModal(goals[0].id, 'deposit'); return; }
    showToast('Pilih target lalu ketuk Setor.'); BK.switchView('target');
  }

  /* ======================= BANNER DALAM APLIKASI ======================= */
  let bannerTimer = null;
  const BANNER_KIND = { streak: 'bn-streak', bill: 'bn-bill', debt: 'bn-debt', info: 'bn-info', win: 'bn-win' };
  function banner(o) {
    let el = $('bk-banner');
    if (!el) { el = document.createElement('div'); el.id = 'bk-banner'; el.className = 'bk-banner'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    clearTimeout(bannerTimer);
    el.className = 'bk-banner ' + (BANNER_KIND[o.kind] || 'bn-info');
    el.innerHTML = `<span class="bn-ic">${svgI(o.kind === 'streak' || o.kind === 'win' ? FLAME : '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z"/><path d="M10 20a2 2 0 0 0 4 0"/>', 22)}</span>
      <span class="bn-tx"><b>${escapeHtml(o.title)}</b><small>${escapeHtml(o.body || '')}</small></span><i class="bn-bar"></i>`;
    el.onclick = () => { el.classList.remove('show'); if (o.go) go(o.go); };
    void el.offsetWidth;
    el.classList.add('show');
    bannerTimer = setTimeout(() => el.classList.remove('show'), 6000);
  }
  BK.banner = banner;
  function go(where) {
    if (where === 'save') goSave();
    else if (where) BK.switchView(where);
  }

  /* ======================= NOTIFIKASI ======================= */
  const CH = {
    streak: { id: 'bk_streak', name: 'Streak Nabung', description: 'Pengingat nabung harian jam 16.00–20.00', importance: 4, color: '#FF7A1A' },
    bill: { id: 'bk_tagihan', name: 'Tagihan', description: 'Pengingat tagihan jatuh tempo', importance: 4, color: '#FF4D6D' },
    debt: { id: 'bk_utang', name: 'Utang & Piutang', description: 'Pengingat utang dan piutang', importance: 4, color: '#7C5CFF' },
    info: { id: 'bk_info', name: 'Info Buku Kas', description: 'Notifikasi umum Buku Kas', importance: 3, color: '#16C79A' }
  };
  const STREAK_COPY = {
    16: (n) => n > 0 ? ['Eh, jam 4 sore nih ⏰', `Streak ${n} harimu lagi nungguin setoran. Sisihin Rp5rb aja udah cukup, gaskeun!`] : ['Jam 4 sore, waktunya mulai! ⏰', 'Belum ada api hari ini. Setor receh dikit buat nyalain streak pertamamu 🔥'],
    17: (n) => n > 0 ? ['Dompet lagi nungguin kamu 💸', `Belum nabung hari ini nih. Streak ${n} hari sayang banget kalau ambyar.`] : ['Dompet kangen disetor 💸', 'Hari ini belum ada tabungan. Yuk mulai dari yang kecil, yang penting konsisten.'],
    18: (n) => n > 0 ? ['Golden hour buat nabung ✨', `Masih ada waktu! Setor sekarang, api ${n} harimu tetap nyala.`] : ['Golden hour buat nabung ✨', 'Sebelum malam, sisihin sedikit ya. Masa depanmu bakal bilang makasih.'],
    19: (n) => n > 0 ? ['Awas, streak-mu mau pensiun dini 🔥', `Tinggal 5 jam lagi sebelum streak ${n} hari padam. Jangan sampai nyesel!`] : ['Malam datang, tabungan belum ada 🌙', 'Satu setoran kecil sekarang = awal streak panjang. Ayo!'],
    20: (n) => n > 0 ? ['LAST CALL, bestie! 🚨', `Sebentar lagi hari ganti. Nabung sekarang atau streak ${n} hari lenyap!`] : ['Last call hari ini 🚨', 'Belum telat kok. Setor sekarang, besok mulai dari api yang udah nyala.']
  };
  const STREAK_HOURS = [16, 17, 18, 19, 20];

  const notif = (function () {
    let permCached = null; // true/false/null(belum dicek)
    let lastSig = '';
    let timer = null;
    let chReady = false;
    const lnp = () => BKNative.plugin('LocalNotifications');

    function enabledFlag() { return BK.loadSettings().notif === true; }
    function isOn() {
      if (!enabledFlag()) return false;
      if (NATIVE) return permCached === true;
      return 'Notification' in window && Notification.permission === 'granted';
    }
    async function refreshPerm() {
      if (NATIVE) {
        try { const p = await lnp().checkPermissions(); permCached = BKNative.granted(p, 'display'); } catch (e) { permCached = false; }
      }
      return permCached;
    }
    async function requestPerm() {
      if (NATIVE) {
        try {
          const p = await lnp().requestPermissions();
          permCached = BKNative.granted(p, 'display');
        } catch (e) { permCached = false; }
        return permCached;
      }
      if (!('Notification' in window)) return false;
      let perm = Notification.permission;
      if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
      return perm === 'granted';
    }
    async function ensureChannels() {
      if (!NATIVE || chReady) return;
      const L = lnp();
      for (const c of Object.values(CH)) {
        try { await L.createChannel({ id: c.id, name: c.name, description: c.description, importance: c.importance, visibility: 1, vibration: true, lights: true, lightColor: c.color }); } catch (e) { /* abaikan */ }
      }
      chReady = true;
    }
    async function updateSwitch() {
      const sw = $('settings-notif-switch'), desc = $('notif-desc');
      if (!sw) return;
      if (NATIVE && permCached === null) await refreshPerm();
      sw.setAttribute('aria-checked', isOn() ? 'true' : 'false');
      if (!desc) return;
      if (NATIVE) {
        if (permCached === false && enabledFlag()) desc.textContent = 'Izin notifikasi belum diberikan. Ketuk saklar lalu pilih Izinkan, atau buka Izin aplikasi.';
        else desc.textContent = 'Pengingat tagihan, utang & streak nabung langsung di bilah notifikasi HP';
      } else if (!('Notification' in window)) desc.textContent = 'Browser ini belum mendukung notifikasi. Pasang APK untuk notifikasi di HP.';
      else if (Notification.permission === 'denied') desc.textContent = 'Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.';
      else desc.textContent = 'Ingatkan jatuh tempo hutang & piutang saat aplikasi dibuka';
    }
    async function ensure() {
      const ok = await requestPerm();
      if (ok) { const s = BK.loadSettings(); s.notif = true; BK.saveSettings(s); await ensureChannels(); }
      await updateSwitch();
      return ok;
    }
    async function toggle() {
      if (isOn()) {
        const s = BK.loadSettings(); s.notif = false; BK.saveSettings(s);
        await cancelAll();
        await updateSwitch();
        showToast('Notifikasi dimatikan.');
        return;
      }
      if (!NATIVE && !('Notification' in window)) { showToast('Browser ini belum mendukung notifikasi. Pasang APK untuk notifikasi di HP.'); return; }
      const ok = await ensure();
      if (!ok) { showToast('Izin notifikasi tidak diberikan. Aktifkan lewat Izin aplikasi.'); return; }
      showToast('Notifikasi aktif. Pengingat masuk ke bilah notifikasi HP.');
      reschedule(true);
    }
    async function cancelAll() {
      if (!NATIVE) return;
      try {
        const p = await lnp().getPending();
        if (p && p.notifications && p.notifications.length) await lnp().cancel({ notifications: p.notifications.map((n) => ({ id: n.id })) });
      } catch (e) { /* abaikan */ }
      lastSig = '';
    }

    /* ---- susun daftar notifikasi terjadwal (7 hari ke depan) ---- */
    function build(now) {
      const list = [];
      const today = todayISODate();
      const todayD = parseISO(today);
      const at = (d, h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m || 0, 0, 0);
      const push = (when, kind, title, body, go, big) => {
        if (when.getTime() <= now.getTime() + 20000) return;
        list.push({ when, kind, title, body, go, big });
      };
      // 1) streak
      const cfg = streakCfg();
      if (cfg.remind && cfg.days.length) {
        const dep = depositDates();
        for (let i = 0; i < 7; i++) {
          const d = addDays(todayD, i);
          if (!cfg.days.includes(d.getDay())) continue;
          if (dep.has(isoOf(d))) continue; // sudah menabung hari itu
          const base = calcStreak(cfg.days, dep, today).streak;
          STREAK_HOURS.forEach((h) => {
            const c = STREAK_COPY[h](base);
            push(at(d, h, 0), 'streak', c[0], c[1], 'save');
          });
        }
      }
      // 2) tagihan
      (state.bills || []).filter((b) => !b.paid && b.dueDate).forEach((b) => {
        const due = parseISO(b.dueDate), days = Math.round((due - todayD) / 864e5);
        const amt = rp(b.amount);
        if (days < 0) {
          push(at(addDays(todayD, 0), 9, 0), 'bill', `${b.name} udah nunggak ${-days} hari 😬`, `${amt} belum dibayar. Buruan beresin biar nggak makin pusing.`, 'tagihan');
          push(at(addDays(todayD, 1), 9, 0), 'bill', `${b.name} masih nunggak 😬`, `${amt} belum lunas. Bayar sekarang yuk.`, 'tagihan');
        } else {
          if (days >= 1 && days <= 14) push(at(addDays(due, -1), 19, 0), 'bill', `Besok deadline ${b.name} ⏳`, `${amt}. Siapin duitnya dari sekarang, jangan sampai kena denda!`, 'tagihan');
          if (days <= 14) push(at(due, 9, 0), 'bill', `Hari H nih, ${b.name}! 😤`, `Tagihan ${amt} jatuh tempo hari ini. Bayar dulu biar hati tenang.`, 'tagihan');
        }
      });
      // 3) utang / piutang
      (state.debts || []).filter((d) => BK.debtRemaining(d) > 0 && d.dueDate).forEach((d) => {
        const due = parseISO(d.dueDate), days = Math.round((due - todayD) / 864e5);
        const amt = rp(BK.debtRemaining(d));
        const owe = d.type === 'owe';
        if (days < 0) {
          push(at(todayD, 9, 30), 'debt', owe ? `Utang ke ${d.person} udah lewat tempo 😅` : `${d.person} belum bayar nih 🧾`, `${amt} sudah lewat ${-days} hari. ${owe ? 'Segera dilunasin ya, jaga kepercayaan.' : 'Chat sopan aja, jangan galak-galak 😄'}`, 'hutang');
        } else if (days <= 14) {
          if (days >= 1) push(at(addDays(due, -1), 18, 30), 'debt', owe ? `Besok bayar utang ke ${d.person} 💳` : `Besok waktunya nagih ${d.person} 🧾`, `${amt}. ${owe ? 'Pastikan saldo cukup ya.' : 'Ingetin pelan-pelan biar tetap akrab.'}`, 'hutang');
          push(at(due, 9, 30), 'debt', owe ? `Hari ini jatuh tempo utang ke ${d.person} 💳` : `Hari ini ${d.person} harus bayar 🧾`, `${amt}. ${owe ? 'Bayar sekarang biar tidur nyenyak.' : 'Waktunya tagih dengan senyum.'}`, 'hutang');
        }
      });
      list.sort((a, b) => a.when - b.when);
      return list.slice(0, 55);
    }

    async function reschedule(force) {
      clearTimeout(timer);
      timer = setTimeout(() => run(force), force ? 150 : 1500);
    }
    async function run(force) {
      if (!enabledFlag()) return;
      if (NATIVE) {
        if (permCached === null) await refreshPerm();
        if (!permCached) return;
        const items = build(new Date());
        const sig = JSON.stringify(items.map((x) => [+x.when, x.title, x.body]));
        if (!force && sig === lastSig) return;
        try {
          await ensureChannels();
          await cancelAll();
          if (!items.length) { lastSig = sig; return; }
          const notifications = items.map((x, i) => ({
            id: i + 1,
            title: x.title,
            body: x.body,
            largeBody: x.body,
            summaryText: 'Buku Kas',
            schedule: { at: x.when, allowWhileIdle: true },
            channelId: CH[x.kind].id,
            smallIcon: 'ic_stat_bk',
            iconColor: CH[x.kind].color,
            extra: { go: x.go, kind: x.kind }
          }));
          await lnp().schedule({ notifications });
          lastSig = sig;
        } catch (e) { /* jangan ganggu aplikasi */ }
        return;
      }
      // browser: tampilkan yang jatuh tempo hari ini saat aplikasi terbuka
      if (!isOn()) return;
      let log = {};
      try { log = JSON.parse(localStorage.getItem('bukukas-notified')) || {}; } catch (e) { log = {}; }
      const today = todayISODate();
      BK.getReminders().forEach((r) => {
        if (log[r.d.id] === today) return;
        webShow('Buku Kas — ' + (r.d.type === 'owe' ? 'Bayar utang ke ' : 'Tagih piutang dari ') + r.d.person, `${rp(BK.debtRemaining(r.d))} · ${r.days < 0 ? 'terlambat ' + -r.days + ' hari' : r.days === 0 ? 'jatuh tempo hari ini' : r.days + ' hari lagi'}`, 'debt-' + r.d.id);
        log[r.d.id] = today;
      });
      try { localStorage.setItem('bukukas-notified', JSON.stringify(log)); } catch (e) { /* abaikan */ }
    }
    async function webShow(title, body, tag) {
      try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
        if (reg && reg.showNotification) { await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png' }); return; }
      } catch (e) { /* fallback */ }
      try { new Notification(title, { body, tag, icon: 'icons/icon-192.png' }); } catch (e) { /* abaikan */ }
    }
    /** notifikasi contoh (5 detik) untuk memastikan izin & tampilan bilah notifikasi */
    async function test() {
      if (!isOn()) { const ok = await ensure(); if (!ok) { showToast('Izin notifikasi belum diberikan.'); return false; } }
      if (NATIVE) {
        try {
          await ensureChannels();
          await lnp().schedule({ notifications: [{ id: 9001, title: 'Tes notifikasi Buku Kas 🔥', body: 'Kalau ini muncul di bilah notifikasi, pengingat nabung & tagihan udah siap jalan. Mantap!', largeBody: 'Kalau ini muncul di bilah notifikasi, pengingat nabung & tagihan udah siap jalan. Mantap!', summaryText: 'Buku Kas', schedule: { at: new Date(Date.now() + 4000), allowWhileIdle: true }, channelId: CH.streak.id, smallIcon: 'ic_stat_bk', iconColor: CH.streak.color, extra: { go: 'save', kind: 'streak' } }] });
          showToast('Notifikasi contoh muncul 4 detik lagi. Boleh tutup aplikasi.');
          return true;
        } catch (e) { showToast('Gagal mengirim notifikasi contoh.'); return false; }
      }
      webShow('Tes notifikasi Buku Kas', 'Notifikasi browser aktif.', 'test');
      return true;
    }
    async function init() {
      if (!NATIVE) { updateSwitch(); return; }
      await refreshPerm();
      updateSwitch();
      try {
        lnp().addListener('localNotificationReceived', (n) => {
          const x = (n && n.extra) || {};
          banner({ title: n.title, body: n.body, kind: x.kind || 'info', go: x.go });
        });
        lnp().addListener('localNotificationActionPerformed', (a) => {
          const x = (a && a.notification && a.notification.extra) || {};
          if (x.go) setTimeout(() => go(x.go), 400);
        });
      } catch (e) { /* abaikan */ }
      if (isOn()) { await ensureChannels(); reschedule(false); }
    }
    return { isOn, updateSwitch, toggle, ensure, reschedule, test, init, refreshPerm, requestPerm };
  })();
  BK.notif = notif;

  /* ======================= IZIN APLIKASI ======================= */
  async function permStatus() {
    const out = [];
    const mapState = (s) => (s === 'granted' || s === 'limited') ? 'granted' : s === 'denied' ? 'denied' : 'prompt';
    if (NATIVE) {
      let n = 'prompt', c = 'prompt', m = 'prompt';
      try { n = mapState((await BKNative.plugin('LocalNotifications').checkPermissions()).display); } catch (e) { /* abaikan */ }
      try { c = mapState((await BKNative.plugin('Camera').checkPermissions()).camera); } catch (e) { /* abaikan */ }
      try { m = mapState((await BKNative.plugin('SpeechRecognition').checkPermissions()).speechRecognition); } catch (e) { /* abaikan */ }
      out.push({ id: 'notif', name: 'Notifikasi', desc: 'Pengingat tagihan, utang & streak di bilah notifikasi', st: n });
      out.push({ id: 'camera', name: 'Kamera', desc: 'Foto struk & bukti transfer', st: c });
      out.push({ id: 'mic', name: 'Mikrofon', desc: 'Input transaksi dengan suara', st: m });
    } else {
      const q = async (name) => { try { return mapState((await navigator.permissions.query({ name })).state); } catch (e) { return 'prompt'; } };
      out.push({ id: 'notif', name: 'Notifikasi', desc: 'Pengingat saat aplikasi terbuka', st: 'Notification' in window ? mapState(Notification.permission) : 'na' });
      out.push({ id: 'camera', name: 'Kamera', desc: 'Dikelola browser saat dipakai', st: await q('camera') });
      out.push({ id: 'mic', name: 'Mikrofon', desc: 'Dikelola browser saat dipakai', st: await q('microphone') });
    }
    return out;
  }
  const PERM_LABEL = { granted: 'Diizinkan', denied: 'Ditolak', prompt: 'Belum diminta', na: 'Tidak tersedia' };
  async function renderPerms() {
    const body = $('perms-body');
    body.innerHTML = '<div class="dw-skel" style="height:60px"></div><div class="dw-skel" style="height:60px"></div>';
    const list = await permStatus();
    body.innerHTML = list.map((p) => `<div class="perm-row"><span class="perm-main"><b>${p.name}</b><small>${p.desc}</small></span>
      <span class="perm-st ${p.st}">${PERM_LABEL[p.st]}</span>
      ${p.st === 'prompt' ? `<button type="button" class="btn-outline-sm" data-perm="${p.id}">Izinkan</button>` : ''}</div>`).join('') +
      `<p class="field-hint">${NATIVE ? 'Kalau sebuah izin sudah Ditolak, Android tidak akan menanyakan lagi. Buka Pengaturan HP → Aplikasi → Buku Kas → Izin untuk mengubahnya.' : 'Izin di browser diatur lewat ikon gembok di address bar.'}</p>
      <button type="button" class="btn-secondary" id="perm-test" style="margin-top:12px">Kirim notifikasi contoh</button>`;
  }
  function bindPerms() {
    $('perms-body').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-perm]');
      if (b) {
        try {
          if (b.dataset.perm === 'notif') await notif.ensure();
          else if (NATIVE && b.dataset.perm === 'camera') await BKNative.plugin('Camera').requestPermissions({ permissions: ['camera'] });
          else if (NATIVE && b.dataset.perm === 'mic') await BKNative.plugin('SpeechRecognition').requestPermissions();
          else if (b.dataset.perm === 'camera' && navigator.mediaDevices) { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); }
          else if (b.dataset.perm === 'mic' && navigator.mediaDevices) { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); }
        } catch (err) { /* ditolak */ }
        renderPerms();
        return;
      }
      if (e.target.closest('#perm-test')) notif.test();
    });
  }
  function openPerms() { BK.openModal('modal-perms'); renderPerms(); }
  BK.openPerms = openPerms;

  /* ======================= DETAIL & ARSIP DOMPET ======================= */
  function walletMonthly(w) {
    const out = [];
    const base = parseISO(todayISODate());
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      out.push({ ym: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: MONTHS[d.getMonth()].slice(0, 3), inc: 0, exp: 0 });
    }
    state.transactions.forEach((t) => {
      if (t.walletId !== w.id && t.toWalletId !== w.id) return;
      const row = out.find((r) => r.ym === t.date.slice(0, 7));
      if (!row) return;
      if (t.type === 'income' && t.walletId === w.id) row.inc += t.amount;
      else if (t.type === 'expense' && t.walletId === w.id) row.exp += t.amount;
      else if (t.type === 'transfer') { if (t.walletId === w.id) row.exp += t.amount; else row.inc += t.amount; }
    });
    return out;
  }
  let detailId = null;
  function openWalletDetail(id) {
    const w = BK.walletById(id);
    if (!w) return;
    detailId = id;
    const bal = BK.walletBalance(w);
    const months = walletMonthly(w);
    const max = Math.max.apply(null, months.map((m) => Math.max(m.inc, m.exp)).concat([1]));
    const cur = months[months.length - 1];
    const txs = state.transactions.filter((t) => t.walletId === id || t.toWalletId === id).slice(0, 8);
    const label = (t) => t.type === 'transfer' ? (t.walletId === id ? 'Transfer keluar' : 'Transfer masuk') : t.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
    const plus = (t) => t.type === 'income' || (t.type === 'transfer' && t.toWalletId === id);
    $('wd-title').textContent = w.name;
    $('wd-body').innerHTML = `
      <div class="wd-hero"><span class="bk-stat-label">Saldo dompet${w.archived ? ' · diarsipkan' : ''}</span><div class="wd-bal">${formatRupiah(bal)}</div>
        <div class="wd-flow"><span class="in">Masuk bulan ini <b>${rp(cur.inc)}</b></span><span class="out">Keluar bulan ini <b>${rp(cur.exp)}</b></span></div></div>
      <div class="card wd-chart"><div class="card-header"><span class="card-title">6 bulan terakhir</span></div>
        <div class="wd-bars" aria-hidden="true">${months.map((m) => `<div class="wd-col"><div class="wd-pair"><i class="in" style="height:${Math.max(3, Math.round(m.inc / max * 100))}%"></i><i class="out" style="height:${Math.max(3, Math.round(m.exp / max * 100))}%"></i></div><b>${m.label}</b></div>`).join('')}</div>
        <div class="wd-legend"><span><i class="in"></i>Masuk</span><span><i class="out"></i>Keluar</span></div></div>
      <div class="card"><div class="card-header"><span class="card-title">Transaksi terbaru</span></div>
        ${txs.length ? txs.map((t) => `<div class="kv"><span>${escapeHtml(t.note || label(t))}<small class="wd-d"> · ${BK.formatDateShort(t.date)}</small></span><b class="${plus(t) ? '' : 'neg'}">${plus(t) ? '+' : '−'}${formatRupiah(t.amount)}</b></div>`).join('') : '<p class="empty-desc">Belum ada transaksi di dompet ini.</p>'}</div>
      <div class="wd-actions">
        <button type="button" class="btn-secondary" id="wd-edit">Edit dompet</button>
        ${BK.openReconcile ? '<button type="button" class="btn-secondary" id="wd-rec">Cocokkan saldo</button>' : ''}
        <button type="button" class="btn-secondary" id="wd-arch">${w.archived ? 'Aktifkan lagi' : 'Arsipkan'}</button>
      </div>
      <p class="field-hint">Dompet yang diarsipkan disembunyikan dari daftar dan pilihan transaksi, tapi riwayatnya tetap tersimpan. Hanya bisa diarsipkan saat saldo Rp0.</p>`;
    BK.openModal('modal-wallet-detail');
  }
  BK.openWalletDetail = openWalletDetail;
  async function setArchived(id, on) {
    const w = BK.walletById(id);
    if (!w) return;
    if (on && Math.round(BK.walletBalance(w)) !== 0) { showToast('Kosongkan dulu saldo dompet ini (pindahkan lewat Transfer) sebelum diarsipkan.'); return; }
    if (on && state.wallets.length <= 1) { showToast('Harus ada minimal satu dompet aktif.'); return; }
    const nw = Object.assign({}, w);
    if (on) nw.archived = true; else delete nw.archived;
    await BK.DB.atomic([{ s: 'wallets', put: nw }, BK.auditRec('ubah', 'dompet', w.id, (on ? 'Arsipkan dompet ' : 'Aktifkan dompet ') + w.name)]);
    await BK.reloadAll();
    BK.closeModal('modal-wallet-detail');
    BK.renderAll();
    showToast(on ? 'Dompet diarsipkan.' : 'Dompet aktif lagi.');
  }
  function renderArchived() {
    const host = $('wallet-archived');
    if (!host) return;
    const arch = (state.allWallets || []).filter((w) => w.archived);
    host.innerHTML = arch.length ? `<div class="wd-arch-head">Diarsipkan (${arch.length})</div>` + arch.map((w) => `<button type="button" class="bk-row wd-arch-row" data-arch="${w.id}"><span class="bk-main"><b>${escapeHtml(w.name)}</b><small>Ketuk untuk lihat / aktifkan lagi</small></span></button>`).join('') : '';
  }
  function bindWalletDetail() {
    $('wd-body').addEventListener('click', (e) => {
      if (e.target.closest('#wd-edit')) { BK.closeModal('modal-wallet-detail'); BK.openWalletModal(detailId); }
      else if (e.target.closest('#wd-arch')) { const w = BK.walletById(detailId); setArchived(detailId, !(w && w.archived)); }
      else if (e.target.closest('#wd-rec')) { BK.closeModal('modal-wallet-detail'); BK.openReconcile(detailId); }
    });
    const list = $('wallet-list');
    if (list && list.parentNode) {
      const host = document.createElement('div');
      host.id = 'wallet-archived';
      list.parentNode.insertBefore(host, list.nextSibling);
      host.addEventListener('click', (e) => { const b = e.target.closest('[data-arch]'); if (b) openWalletDetail(b.dataset.arch); });
    }
  }

  /* ======================= OFFLINE ======================= */
  function bindOffline() {
    const el = document.createElement('div');
    el.id = 'offline-bar'; el.className = 'offline-bar'; el.setAttribute('role', 'status'); el.hidden = true;
    document.body.appendChild(el);
    let t = null;
    const set = () => {
      clearTimeout(t);
      if (navigator.onLine === false) {
        el.className = 'offline-bar off'; el.hidden = false;
        el.textContent = 'Mode offline. Data tetap aman di HP, sinkron cloud ditunda.';
      } else if (!el.hidden) {
        el.className = 'offline-bar on';
        el.textContent = 'Online lagi. Mantap!';
        t = setTimeout(() => { el.hidden = true; }, 2200);
      }
    };
    window.addEventListener('online', () => { if (abDirty) scheduleAutoBackup(); });
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    set();
  }

  /* ======================= STREAK: perayaan & sinkron ======================= */
  let lastDone = null, dataSig = null;
  function onDataChange() {
    const info = streakInfo();
    if (info.streak > info.cfg.best) saveStreakCfg({ best: info.streak });
    const today = todayISODate();
    if (lastDone !== null && !lastDone && info.todayDone && info.todayScheduled && info.cfg.cel !== today) {
      saveStreakCfg({ cel: today });
      const n = info.streak;
      banner({ kind: 'win', title: n >= 2 ? `Streak ${n} hari! 🔥` : 'Api streak nyala! 🔥', body: n >= 7 ? `Level ${streakLevel(n)}. Konsisten banget, salut!` : 'Mantap, hari ini udah nabung. Besok lanjut ya!', go: null });
    }
    lastDone = info.todayDone;
    notif.reschedule(false);
    const sig = [state.transactions.length, state.transactions.reduce((s, t) => s + t.amount, 0), state.allWallets ? state.allWallets.length : 0, (state.goals || []).length, (state.goals || []).reduce((s, g) => s + g.currentAmount, 0), (state.bills || []).length, (state.debts || []).length, (state.budgets || []).length].join('|');
    if (dataSig !== null && sig !== dataSig) scheduleAutoBackup();
    dataSig = sig;
  }
  /** Pengingat dalam aplikasi: kalau app dibuka di jam 16–20 pada hari terjadwal & belum menabung */
  function inAppStreakNudge() {
    const info = streakInfo();
    const h = new Date().getHours();
    if (!info.cfg.remind || !info.todayScheduled || info.todayDone || h < 16 || h > 20) return;
    const key = todayISODate() + ':' + h;
    let seen = '';
    try { seen = sessionStorage.getItem('bk-nudge') || ''; } catch (e) { /* abaikan */ }
    if (seen === key) return;
    try { sessionStorage.setItem('bk-nudge', key); } catch (e) { /* abaikan */ }
    const c = STREAK_COPY[h](info.streak);
    banner({ kind: 'streak', title: c[0], body: c[1], go: 'save' });
  }

  /* ======================= PETA ONLINE / OFFLINE + CADANGAN OTOMATIS ======================= */
  const FEATS = {
    online: [
      ['Login Google & akun', 'Masuk, ganti perangkat'],
      ['Cadangan & sinkron cloud', 'Simpan/pulihkan data lewat akun'],
      ['Kasbot AI', 'Jawaban AI pintar (versi dasar tetap offline)'],
      ['Keluarga · kas bersama', 'Sinkron antar HP; cache offline tersedia']
    ],
    offline: [
      ['Transaksi, dompet, kategori, anggaran', ''], ['Target tabungan & streak', ''], ['Tagihan, utang & piutang, aset', ''],
      ['Analisa, laporan, kalender', ''], ['Pindai struk & bukti transfer (OCR)', ''], ['Impor CSV / Excel / PDF', ''],
      ['Input suara*', '*bergantung layanan suara HP'], ['Notifikasi pengingat', 'terjadwal di HP'], ['Kunci PIN & biometrik', ''],
      ['Widget Beranda, Kasbot versi dasar', ''], ['Ekspor Excel / PDF / cadangan file', '']
    ]
  };
  const abCfg = () => !!BK.loadSettings().autoBackup;
  let abTimer = null, abDirty = false, abWarned = false;
  function backupAllowed() { return abCfg() && navigator.onLine !== false && !!(window.CloudSync && CloudSync.isReady() && CloudSync.currentUser()); }
  function scheduleAutoBackup() {
    if (!abCfg()) return;
    abDirty = true;
    clearTimeout(abTimer);
    abTimer = setTimeout(runAutoBackup, 20000);
  }
  async function runAutoBackup() {
    if (!abDirty || !backupAllowed()) return;
    const last = Number(localStorage.getItem('bukukas-autobackup-at') || 0);
    if (Date.now() - last < 5 * 60 * 1000) { abTimer = setTimeout(runAutoBackup, 5 * 60 * 1000 - (Date.now() - last) + 1000); return; }
    try {
      const size = JSON.stringify(await BK.DB.exportAll()).length;
      if (size > 900000) { if (!abWarned) { abWarned = true; showToast('Data terlalu besar untuk cadangan cloud otomatis. Pakai ekspor file.'); } return; }
      await CloudSync.pushData();
      abDirty = false;
      try { localStorage.setItem('bukukas-autobackup-at', String(Date.now())); } catch (e) { /* abaikan */ }
    } catch (e) { /* coba lagi pada perubahan berikutnya */ }
  }
  function renderFeatMap() {
    const on = abCfg();
    const li = (a) => a.map((x) => `<li><b>${escapeHtml(x[0])}</b>${x[1] ? `<small>${escapeHtml(x[1])}</small>` : ''}</li>`).join('');
    $('featmap-body').innerHTML = `
      <div class="fm-grp on"><div class="fm-h">🌐 Butuh internet</div><ul>${li(FEATS.online)}</ul></div>
      <div class="fm-grp off"><div class="fm-h">📴 Jalan tanpa internet</div><ul>${li(FEATS.offline)}</ul></div>
      <div class="ws-block"><div class="ws-row"><span><b>Cadangan cloud otomatis</b><small>Saat online & sudah masuk akun, data dicadangkan sendiri (maks tiap 5 menit setelah ada perubahan)</small></span>
        <button class="switch" id="fm-auto" role="switch" aria-checked="${on}"><span class="switch-knob"></span></button></div></div>
      <p class="field-hint">Semua data tetap disimpan di HP dulu. Fitur online hanya tambahan, bukan syarat memakai aplikasi.</p>`;
  }
  function openFeatMap() { renderFeatMap(); BK.openModal('modal-featmap'); }

  /* ======================= PASANG ======================= */
  function injectSettingsCard() {
    const pin = $('btn-open-pin-config');
    const card = pin && pin.closest('.card');
    if (!card || $('btn-open-widget-settings')) return;
    card.insertAdjacentHTML('beforebegin', `<div class="card">
      <div class="card-header"><h2 class="card-title">Widget, Streak & Izin</h2></div>
      <p class="settings-row-desc">Atur widget di Beranda, hari menabung untuk streak, serta izin notifikasi, kamera, dan mikrofon.</p>
      <button class="btn-secondary" id="btn-open-widget-settings" style="margin-top:14px;" type="button">Atur widget & streak</button>
      <button class="btn-secondary" id="btn-open-perms" style="margin-top:8px;" type="button">Izin aplikasi</button>
      <button class="btn-secondary" id="btn-open-featmap" style="margin-top:8px;" type="button">Online & offline · cadangan otomatis</button>
    </div>`);
    $('btn-open-widget-settings').addEventListener('click', openWidgetSettings);
    $('btn-open-perms').addEventListener('click', openPerms);
    $('btn-open-featmap').addEventListener('click', openFeatMap);
    $('featmap-body').addEventListener('click', async (ev) => {
      if (!ev.target.closest('#fm-auto')) return;
      const s = BK.loadSettings(); const turnOn = !s.autoBackup;
      if (turnOn && !(window.CloudSync && CloudSync.isReady() && CloudSync.currentUser())) { showToast('Masuk akun dulu untuk cadangan cloud.'); return; }
      s.autoBackup = turnOn; BK.saveSettings(s);
      if (turnOn) scheduleAutoBackup();
      renderFeatMap();
    });
  }

  function init() {
    injectSettingsCard();
    bindWidgetSettings();
    bindPerms();
    bindWalletDetail();
    bindOffline();
    const host = $('dash-widget');
    if (host) {
      host.addEventListener('click', (e) => {
        if (e.target.closest('[data-dw-save]')) { e.stopPropagation(); goSave(); return; }
        if (e.target.closest('.dw-card')) openWidgetSettings();
      });
      host.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.dw-card')) { e.preventDefault(); openWidgetSettings(); } });
    }
    BK.views.dashWidget = () => { renderWidget(false); renderArchived(); };
    const baseBell = BK.updateBell;
    BK.updateBell = function () { if (baseBell) baseBell.apply(this, arguments); renderArchived(); onDataChange(); };
    setInterval(tickWidget, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickWidget(); inAppStreakNudge(); notif.reschedule(false); } });
    renderWidget(false);
    notif.init();
    setTimeout(inAppStreakNudge, 3500);
  }
  // script.js menjalankan init() pada DOMContentLoaded (data dimuat async); tunggu sebentar agar elemen & state siap
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  else setTimeout(init, 0);

  BK._engage = { calcStreak, streakInfo, build: () => null, renderWidget, WIDGET_IDS, RENDER, notif, STREAK_COPY };
})();
