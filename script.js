/* ============================================================
   script.js — Logika aplikasi Buku Kas
   LocalStorage HANYA dipakai untuk pengaturan aplikasi (tema).
   Semua data keuangan tersimpan di IndexedDB lewat database.js
   ============================================================ */

(function () {
  'use strict';

  const SETTINGS_KEY = 'bukukas-settings';

  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */
  const state = {
    wallets: [],
    categories: [],
    transactions: [],
    goals: [],
    budgets: [],
    currentView: 'dashboard',
    txFilter: 'all',
    catTypeFilter: 'expense',
    confirmCallback: null
  };

  const CHART_PALETTE = ['#D9AE60', '#57B589', '#6E8FE2', '#E2685B', '#B37FE0', '#4FC1C7', '#E0A03F', '#9AA3B2'];

  /* ---------------------------------------------------------
     IKON KATEGORI — set ikon & warna custom per kategori,
     menggantikan badge inisial huruf generik.
  --------------------------------------------------------- */
  const ICON_PATHS = {
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    car: '<path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
    film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 16.5h4M17 7.5h4M17 16.5h4"/>',
    piggy: '<path d="M19 5.5c-1.4 0-2.6 1-3 2-3.4-1.3-10-.2-10 4.7 0 1.7.3 2.8 2 4V20h4v-2h3v2h4v-3.8c.9-.5 1.6-1.1 2-2.2h2v-4h-2c-.2-.9-.6-1.5-1-2V5.5Z"/><circle cx="16" cy="11" r=".6" fill="currentColor" stroke="none"/><path d="M2 10v1.2c0 1 .8 1.8 1.8 1.8H5"/>',
    briefcase: '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    dots: '<circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="12" r="1.2"/>',
    tag: '<path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7" cy="7" r="1"/>'
  };
  const CATEGORY_VISUALS = {
    'Makan': { color: '#F2994A', icon: 'utensils' },
    'Transportasi': { color: '#56B4F2', icon: 'car' },
    'Belanja': { color: '#BB6BD9', icon: 'bag' },
    'Pendidikan': { color: '#5B8DEF', icon: 'cap' },
    'Kesehatan': { color: '#EB5757', icon: 'heart' },
    'Hiburan': { color: '#E85C8A', icon: 'film' },
    'Tabungan': { color: '#D9AE60', icon: 'piggy' },
    'Gaji': { color: '#27AE60', icon: 'briefcase' },
    'Bonus': { color: '#2DD4BF', icon: 'gift' },
    'Lainnya': { color: '#9AA3B2', icon: 'dots' }
  };
  function getCategoryVisual(name) {
    if (name && CATEGORY_VISUALS[name]) return CATEGORY_VISUALS[name];
    let hash = 0;
    const str = name || '?';
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const color = CHART_PALETTE[Math.abs(hash) % CHART_PALETTE.length];
    return { color, icon: 'tag' };
  }
  function categoryIconHTML(category, size) {
    size = size || 38;
    const visual = category ? getCategoryVisual(category.name) : { color: '#9AA3B2', icon: 'tag' };
    const path = ICON_PATHS[visual.icon] || ICON_PATHS.tag;
    return `<span class="cat-icon-badge" style="width:${size}px;height:${size}px;background:${visual.color}24;color:${visual.color}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>
    </span>`;
  }

  /* ---------------------------------------------------------
     UTIL
  --------------------------------------------------------- */
  function formatRupiah(n) {
    const num = Math.round(Number(n) || 0);
    const sign = num < 0 ? '-' : '';
    return sign + 'Rp' + Math.abs(num).toLocaleString('id-ID');
  }

  function parseAmount(str) {
    if (!str) return 0;
    const digits = String(str).replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  function formatAmountInputLive(input) {
    input.addEventListener('input', () => {
      const val = parseAmount(input.value);
      input.value = val ? val.toLocaleString('id-ID') : '';
    });
  }

  function todayISODate() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function formatDateLabel(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatDateShort(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function isSameMonth(isoDate, ref) {
    const d = new Date(isoDate + 'T00:00:00');
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  }

  function monthLabel(ref) {
    return ref.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }

  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  /* ---------------------------------------------------------
     THEME (LocalStorage — hanya pengaturan aplikasi)
  --------------------------------------------------------- */
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const switchEl = document.getElementById('settings-theme-switch');
    if (switchEl) switchEl.setAttribute('aria-checked', theme === 'dark' ? 'true' : 'false');
  }
  function initTheme() {
    const settings = loadSettings();
    const theme = settings.theme || 'dark';
    applyTheme(theme);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    const settings = loadSettings();
    settings.theme = next;
    saveSettings(settings);
  }

  /* ---------------------------------------------------------
     KUNCI APLIKASI (PIN) — sepenuhnya lokal, tanpa server.
     Hash PIN & jawaban keamanan disimpan di LocalStorage
     (bagian dari pengaturan aplikasi), bukan PIN mentahnya.
  --------------------------------------------------------- */
  let sessionUnlocked = false;
  const lockCtx = { purpose: null, step: null, pendingPin: null };
  let lockBuffer = '';

  async function hashText(text, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(salt + ':' + text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function randomSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function getSecurity() {
    const settings = loadSettings();
    return settings.security || { enabled: false };
  }
  function saveSecurity(security) {
    const settings = loadSettings();
    settings.security = security;
    saveSettings(settings);
  }

  function updateSettingsLockUI() {
    const security = getSecurity();
    const switchEl = document.getElementById('settings-lock-switch');
    const actions = document.getElementById('lock-manage-actions');
    if (!switchEl) return;
    switchEl.setAttribute('aria-checked', security.enabled ? 'true' : 'false');
    actions.hidden = !security.enabled;
  }

  function renderPinDots() {
    const dots = document.getElementById('pin-dots');
    dots.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const span = document.createElement('span');
      span.className = 'pin-dot' + (i < lockBuffer.length ? ' filled' : '');
      dots.appendChild(span);
    }
  }

  function setLockText(title, subtitle) {
    document.getElementById('lock-title').textContent = title;
    document.getElementById('lock-subtitle').textContent = subtitle;
    document.getElementById('lock-error').textContent = '';
  }

  function renderLockScreenForContext() {
    document.getElementById('lock-forgot-btn').hidden = !(lockCtx.purpose === 'unlock' && lockCtx.step === 'verify');
    document.getElementById('lock-cancel-btn').hidden = (lockCtx.purpose === 'unlock');

    if (lockCtx.step === 'verify') {
      const labels = {
        unlock: ['Masukkan PIN', 'Masukkan PIN untuk membuka Buku Kas'],
        disable: ['Konfirmasi PIN', 'Masukkan PIN saat ini untuk menonaktifkan kunci'],
        change: ['Konfirmasi PIN', 'Masukkan PIN saat ini']
      };
      const [t, s] = labels[lockCtx.purpose] || labels.unlock;
      setLockText(t, s);
    } else if (lockCtx.step === 'new1') {
      setLockText('Buat PIN Baru', 'Buat 6 digit PIN untuk mengunci aplikasi');
    } else if (lockCtx.step === 'new2') {
      setLockText('Konfirmasi PIN', 'Masukkan ulang PIN baru');
    }
    renderPinDots();
  }

  function openLock(ctx) {
    lockCtx.purpose = ctx.purpose;
    lockCtx.step = ctx.step;
    lockCtx.pendingPin = ctx.pendingPin || null;
    lockBuffer = '';
    renderLockScreenForContext();
    document.getElementById('lock-screen').classList.add('open');
  }
  function closeLockScreen() {
    document.getElementById('lock-screen').classList.remove('open');
    lockBuffer = '';
  }

  function shakeLock(message) {
    const content = document.querySelector('.lock-content');
    document.getElementById('lock-error').textContent = message;
    content.classList.remove('shake');
    void content.offsetWidth;
    content.classList.add('shake');
    lockBuffer = '';
    renderPinDots();
  }

  async function handleLockKey(key) {
    if (key === 'back') {
      lockBuffer = lockBuffer.slice(0, -1);
      renderPinDots();
      return;
    }
    if (lockBuffer.length >= 6) return;
    lockBuffer += key;
    renderPinDots();
    if (lockBuffer.length === 6) {
      await handleLockSubmit();
    }
  }

  async function handleLockSubmit() {
    const security = getSecurity();
    const enteredPin = lockBuffer;

    if (lockCtx.step === 'verify') {
      const hash = await hashText(enteredPin, security.salt || '');
      if (hash !== security.pinHash) {
        shakeLock('PIN salah, coba lagi.');
        return;
      }
      if (lockCtx.purpose === 'unlock') {
        sessionUnlocked = true;
        closeLockScreen();
      } else if (lockCtx.purpose === 'disable') {
        saveSecurity({ enabled: false });
        closeLockScreen();
        updateSettingsLockUI();
        showToast('Kunci aplikasi dinonaktifkan.');
      } else if (lockCtx.purpose === 'change') {
        openLock({ purpose: 'change', step: 'new1' });
      }
      return;
    }

    if (lockCtx.step === 'new1') {
      openLock({ purpose: lockCtx.purpose, step: 'new2', pendingPin: enteredPin });
      return;
    }

    if (lockCtx.step === 'new2') {
      if (enteredPin !== lockCtx.pendingPin) {
        shakeLock('PIN tidak cocok, ulangi dari awal.');
        openLock({ purpose: lockCtx.purpose, step: 'new1' });
        return;
      }
      if (lockCtx.purpose === 'enable') {
        const finalPin = enteredPin;
        closeLockScreen();
        openSecurityQuestionModal('set', async (question, answer) => {
          const salt = randomSalt();
          const answerSalt = randomSalt();
          const pinHash = await hashText(finalPin, salt);
          const answerHash = await hashText(answer.trim().toLowerCase(), answerSalt);
          saveSecurity({ enabled: true, salt, pinHash, question, answerSalt, answerHash });
          updateSettingsLockUI();
          showToast('Kunci aplikasi diaktifkan.');
        });
      } else if (lockCtx.purpose === 'change') {
        const salt = randomSalt();
        const pinHash = await hashText(enteredPin, salt);
        const security2 = getSecurity();
        saveSecurity(Object.assign({}, security2, { salt, pinHash }));
        closeLockScreen();
        showToast('PIN berhasil diperbarui.');
      } else if (lockCtx.purpose === 'forgot') {
        const salt = randomSalt();
        const pinHash = await hashText(enteredPin, salt);
        const security2 = getSecurity();
        saveSecurity(Object.assign({}, security2, { salt, pinHash }));
        sessionUnlocked = true;
        closeLockScreen();
        showToast('PIN baru berhasil dibuat.');
      }
    }
  }

  function startUnlockFlow() { openLock({ purpose: 'unlock', step: 'verify' }); }
  function startEnableFlow() { openLock({ purpose: 'enable', step: 'new1' }); }
  function startChangeFlow() { openLock({ purpose: 'change', step: 'verify' }); }
  function startDisableFlow() { openLock({ purpose: 'disable', step: 'verify' }); }

  function cancelLockFlow() {
    if (lockCtx.purpose === 'enable') updateSettingsLockUI();
    closeLockScreen();
  }

  /* ---- Modal pertanyaan keamanan (dipakai saat setup & saat lupa PIN) ---- */
  let sqCallback = null;
  function openSecurityQuestionModal(mode, onSubmit) {
    sqCallback = onSubmit;
    const security = getSecurity();
    document.getElementById('form-security-question').reset();
    if (mode === 'set') {
      document.getElementById('sq-modal-title').textContent = 'Buat Pertanyaan Keamanan';
      document.getElementById('sq-intro').textContent = 'Digunakan untuk memulihkan akses jika kamu lupa PIN.';
      document.getElementById('sq-select-wrap').hidden = false;
      document.getElementById('sq-fixed-question').hidden = true;
      document.getElementById('sq-answer-label').textContent = 'Jawaban';
      document.getElementById('sq-submit-btn').textContent = 'Simpan & Aktifkan';
    } else {
      document.getElementById('sq-modal-title').textContent = 'Lupa PIN';
      document.getElementById('sq-intro').textContent = 'Jawab pertanyaan keamananmu untuk membuat PIN baru.';
      document.getElementById('sq-select-wrap').hidden = true;
      document.getElementById('sq-fixed-question').hidden = false;
      document.getElementById('sq-fixed-question').textContent = security.question || '';
      document.getElementById('sq-answer-label').textContent = 'Jawabanmu';
      document.getElementById('sq-submit-btn').textContent = 'Verifikasi';
    }
    openModal('modal-security-question');
    document.getElementById('form-security-question').dataset.mode = mode;
  }

  async function handleSecurityQuestionSubmit(e) {
    e.preventDefault();
    const mode = e.target.dataset.mode;
    const answer = document.getElementById('sq-answer').value.trim();
    if (!answer) return;

    if (mode === 'set') {
      const question = document.getElementById('sq-select').value;
      closeModal('modal-security-question');
      if (sqCallback) await sqCallback(question, answer);
      sqCallback = null;
    } else {
      const security = getSecurity();
      const hash = await hashText(answer.trim().toLowerCase(), security.answerSalt || '');
      if (hash !== security.answerHash) {
        showToast('Jawaban tidak sesuai.');
        return;
      }
      closeModal('modal-security-question');
      openLock({ purpose: 'forgot', step: 'new1' });
    }
  }

  function bindLockScreen() {
    document.getElementById('keypad').addEventListener('click', (e) => {
      const btn = e.target.closest('.key');
      if (!btn || !btn.dataset.key) return;
      handleLockKey(btn.dataset.key);
    });
    document.getElementById('lock-forgot-btn').addEventListener('click', () => {
      openSecurityQuestionModal('verify', null);
    });
    document.getElementById('lock-cancel-btn').addEventListener('click', cancelLockFlow);
    document.getElementById('form-security-question').addEventListener('submit', handleSecurityQuestionSubmit);
  }

  function bindSecuritySettings() {
    document.getElementById('settings-lock-switch').addEventListener('click', () => {
      const security = getSecurity();
      if (security.enabled) {
        startDisableFlow();
      } else {
        startEnableFlow();
      }
    });
    document.getElementById('btn-change-pin').addEventListener('click', startChangeFlow);
  }

  /* ---------------------------------------------------------
     SFX — efek suara sederhana via Web Audio (tanpa file audio).
     Browser baru mengizinkan suara setelah pengguna menyentuh layar,
     jadi suara splash bisa saja senyap; suara login tetap jalan.
  --------------------------------------------------------- */
  let audioCtx = null;
  function getAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx.state === 'running' ? audioCtx : null;
    } catch (e) { return null; }
  }
  ['pointerdown', 'keydown'].forEach((ev) => {
    document.addEventListener(ev, function unlock() {
      getAudio();
      document.removeEventListener(ev, unlock);
    }, { passive: true });
  });

  function sfxTone(ctx, t0, f0, f1, dur, vol, type) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function sfxNoise(ctx, t0, dur, vol, f0, f1) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(f0, t0);
    filter.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(g); g.connect(ctx.destination);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }
  function sfx(name) {
    const ctx = getAudio();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + 0.01;
      if (name === 'click') sfxTone(ctx, t, 900, 520, 0.09, 0.14, 'triangle');
      else if (name === 'paper') sfxNoise(ctx, t, 0.28, 0.1, 2400, 5200);
      else if (name === 'ching') { sfxTone(ctx, t, 1318, 1318, 0.22, 0.12); sfxTone(ctx, t + 0.09, 1760, 1760, 0.3, 0.1); }
      else if (name === 'whoosh') sfxNoise(ctx, t, 0.45, 0.12, 400, 2600);
      else if (name === 'thump') { sfxTone(ctx, t, 150, 55, 0.35, 0.4); sfxTone(ctx, t + 0.12, 1318, 1318, 0.25, 0.08); }
    } catch (e) { /* suara hanya pemanis */ }
  }

  /* ---------------------------------------------------------
     SPLASH (2 detik) + GERBANG LOGIN
     Alur: splash -> (belum login) halaman login yang beranimasi
     terus -> berhasil masuk -> layar hitam + riak -> dashboard.
     Sudah login / mode tanpa akun -> splash langsung ke dashboard.
  --------------------------------------------------------- */
  const GUEST_KEY = 'bukukas-guest';
  let authResolved = false;
  let currentAuthUser = null;
  let splashLeaveReady = false;
  let splashGone = false;
  let appEntered = false;
  let entering = false;

  function isGuest() {
    try { return localStorage.getItem(GUEST_KEY) === '1'; } catch (e) { return false; }
  }
  function setGuest(on) {
    try { if (on) localStorage.setItem(GUEST_KEY, '1'); else localStorage.removeItem(GUEST_KEY); } catch (e) { /* abaikan */ }
  }

  function setAppVisible(visible) {
    ['.app-header', '#app-main', '.bottom-nav'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.style.display = visible ? '' : 'none';
    });
  }

  function showLoginScreen() {
    appEntered = false;
    entering = false;
    setAppVisible(false);
    document.getElementById('login-screen').classList.remove('hidden');
  }

  function enterApp(animated) {
    if (entering) return;
    const login = document.getElementById('login-screen');
    const go = () => {
      login.classList.add('hidden');
      setAppVisible(true);
      appEntered = true;
      entering = false;
      switchView('dashboard');
    };
    entering = true;
    if (!animated) { go(); return; }
    const overlay = document.getElementById('login-success');
    overlay.classList.remove('out');
    overlay.classList.add('show');
    sfx('thump');
    setTimeout(() => sfx('whoosh'), 450);
    setTimeout(() => {
      go();
      overlay.classList.add('out');
      setTimeout(() => overlay.classList.remove('show', 'out'), 360);
    }, 1000);
  }

  function tryLeaveSplash() {
    if (splashGone || !splashLeaveReady || !authResolved) return;
    splashGone = true;
    const splash = document.getElementById('splash-overlay');
    // siapkan layar di bawah splash, lalu splash memudar sambil zoom
    if (currentAuthUser || isGuest()) enterApp(false); else showLoginScreen();
    sfx('whoosh');
    if (splash) {
      splash.classList.add('leaving');
      setTimeout(() => splash.classList.add('hidden'), 460);
    }
  }
  // Timeline splash: total 2.0 dtk (animasi 0–1.55 dtk, zoom keluar 1.55–2.0 dtk)
  setTimeout(() => sfx('click'), 80);
  setTimeout(() => sfx('paper'), 640);
  setTimeout(() => { splashLeaveReady = true; tryLeaveSplash(); }, 1550);

  function handleAuthState(user) {
    currentAuthUser = user;
    updateAkunUI(user);
    if (!authResolved) {
      authResolved = true;
      tryLeaveSplash();
      return;
    }
    if (user) {
      if (!appEntered) enterApp(true);
    } else {
      setGuest(false);
      setAuthModeLogin('login');
      showLoginScreen();
    }
  }

  /* Animasi koin & uang kertas jatuh ke dompet — berulang tanpa henti
     (murni CSS infinite) selama halaman login tampil. */
  function buildLoginRain() {
    const drop = document.getElementById('lg-drop');
    const amb = document.getElementById('lg-ambient');
    if (!drop || !amb || drop.childElementCount) return;
    const COIN = '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="url(#gCoin)" stroke="#B9801A" stroke-width="1.6"/><circle cx="14" cy="14" r="10.6" fill="none" stroke="#FFF1B8" stroke-width="1.2" stroke-dasharray="1.3 1.7" opacity=".85"/><circle cx="14" cy="14" r="8" fill="none" stroke="#C98A16" stroke-width="1.1"/><text x="14.6" y="19.1" text-anchor="middle" font-family="Fraunces, serif" font-weight="700" font-size="12" fill="#fff" opacity=".55">$</text><text x="14" y="18.5" text-anchor="middle" font-family="Fraunces, serif" font-weight="700" font-size="12" fill="#8A5F0A">$</text><path d="M7.4 9.6a8 8 0 0 1 5-3.1" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></svg>';
    const BILL = '<svg viewBox="0 0 40 24"><rect x="1" y="1" width="38" height="22" rx="4" fill="url(#gBill)" stroke="#16243B" stroke-width="2"/><rect x="4" y="4" width="32" height="16" rx="2" fill="none" stroke="#3FBF93" stroke-width=".9" opacity=".8"/><path d="M7 12h6M27 12h6" stroke="#3FBF93" stroke-width="1.4" stroke-linecap="round"/><circle cx="20" cy="12" r="6.2" fill="url(#gMint)" stroke="#16243B" stroke-width="1.6"/><text x="20" y="15.2" text-anchor="middle" font-family="Fraunces, serif" font-weight="700" font-size="8.5" fill="#16243B">$</text></svg>';

    // Aliran masuk ke dompet: 9 jalur sejajar, simetris kiri-kanan dari tengah.
    // Jalur & jeda dibuat deterministik (bukan acak) supaya tidak ada sisi yang kosong.
    const STREAM = 9;
    for (let i = 0; i < STREAM; i++) {
      const bill = i % 3 === 1;
      const dur = 2.0 + ((i * 5) % 7) * 0.12;
      const el = document.createElement('span');
      el.className = 'lg-item' + (bill ? ' bill' : '');
      el.innerHTML = bill ? BILL : COIN;
      el.style.setProperty('--x', ((i - (STREAM - 1) / 2) * 19).toFixed(0) + 'px');
      el.style.setProperty('--d', dur.toFixed(2) + 's');
      el.style.setProperty('--delay', (-((i * 0.83) % dur)).toFixed(2) + 's');
      el.style.setProperty('--r', ((i % 2 ? 1 : -1) * (15 + ((i * 7) % 25))) + 'deg');
      drop.appendChild(el);
    }

    // Latar: 8 jalur merata di seluruh lebar layar (kiri sampai kanan).
    const SIZES = [34, 26, 40, 28, 36, 24, 38, 30];
    for (let i = 0; i < SIZES.length; i++) {
      const dur = 8 + ((i * 17) % 60) / 10;
      const el = document.createElement('span');
      el.className = 'lg-amb';
      el.innerHTML = i % 2 ? BILL : COIN;
      el.style.setProperty('--x', (6 + i * 12.6).toFixed(1) + '%');
      el.style.setProperty('--s', SIZES[i] + 'px');
      el.style.setProperty('--d', dur.toFixed(1) + 's');
      el.style.setProperty('--delay', (-((i * 1.9) % dur)).toFixed(1) + 's');
      el.style.setProperty('--r', ((i % 2 ? -1 : 1) * (140 + i * 10)) + 'deg');
      amb.appendChild(el);
    }
  }

  /* ---------------------------------------------------------
     AKUN — login/daftar (email+password), Google sign-in, dan
     sinkronisasi cadangan ke cloud lewat cloud-sync.js.
     Seluruhnya OPSIONAL: jika firebase-config.js belum diisi,
     CloudSync akan menolak dengan pesan yang jelas.
  --------------------------------------------------------- */
  let authMode = 'login';
  let authModeLogin = 'login'; // Untuk login screen (halaman pertama)

  function setAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll('#auth-mode-segmented .segment').forEach((seg) => {
      seg.classList.toggle('active', seg.dataset.authMode === mode);
    });
    document.getElementById('auth-username-wrap').hidden = mode !== 'register';
    document.getElementById('auth-submit-btn').textContent = mode === 'register' ? 'Daftar' : 'Masuk';
    document.getElementById('auth-error').textContent = '';
  }

  function setAuthModeLogin(mode) {
    authModeLogin = mode;
    document.querySelectorAll('#auth-mode-segmented-login .segment').forEach((seg) => {
      seg.classList.toggle('active', seg.dataset.authMode === mode);
    });
    const isRegister = mode === 'register';
    document.getElementById('auth-username-wrap-login').hidden = !isRegister;
    document.querySelector('#auth-submit-btn-login .lg-btn-label').textContent = isRegister ? 'Daftar' : 'Masuk';
    document.getElementById('lg-card-title').textContent = isRegister ? 'Buat Akun Baru' : 'Masuk ke Akun Anda';
    document.getElementById('lg-card-sub').textContent = isRegister
      ? 'Daftar gratis, lalu datamu bisa dipulihkan di HP mana pun.'
      : 'Data keuanganmu bisa dipulihkan di HP mana pun.';
    document.getElementById('auth-password-login').autocomplete = isRegister ? 'new-password' : 'current-password';
    document.getElementById('auth-error-login').textContent = '';
  }

  function updateAkunUI(user) {
    const authCard = document.getElementById('akun-auth-card');
    const profileCard = document.getElementById('akun-profile-card');
    const menuDesc = document.getElementById('akun-menu-desc');
    if (user) {
      authCard.hidden = true;
      profileCard.hidden = false;
      const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Pengguna');
      document.getElementById('akun-profile-name').textContent = name;
      document.getElementById('akun-profile-email').textContent = user.email || '';
      document.getElementById('akun-avatar').textContent = name.charAt(0).toUpperCase();
      if (menuDesc) menuDesc.textContent = `Masuk sebagai ${name}`;
    } else {
      authCard.hidden = false;
      profileCard.hidden = true;
      if (menuDesc) menuDesc.textContent = 'Masuk untuk menyimpan data ke cloud';
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const username = document.getElementById('auth-username').value.trim();
    const submitBtn = document.getElementById('auth-submit-btn');
    submitBtn.disabled = true;
    try {
      if (authMode === 'register') {
        await CloudSync.register(username, email, password);
        showToast('Akun berhasil dibuat.');
      } else {
        await CloudSync.login(email, password);
        showToast('Berhasil masuk.');
      }
      document.getElementById('form-auth').reset();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function handleAuthSubmitLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('auth-error-login');
    errorEl.textContent = '';
    const email = document.getElementById('auth-email-login').value.trim();
    const password = document.getElementById('auth-password-login').value;
    const username = document.getElementById('auth-username-login').value.trim();
    const submitBtn = document.getElementById('auth-submit-btn-login');
    const label = submitBtn.querySelector('.lg-btn-label');
    const idleText = authModeLogin === 'register' ? 'Daftar' : 'Masuk';
    submitBtn.disabled = true;
    label.textContent = 'Memproses...';
    try {
      if (authModeLogin === 'register') {
        await CloudSync.register(username, email, password);
      } else {
        await CloudSync.login(email, password);
      }
      document.getElementById('form-auth-login').reset();
      // Berhasil: onAuthChange -> handleAuthState memutar transisi layar hitam
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      label.textContent = idleText;
    }
  }

  async function handleGoogleSignIn() {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';
    try {
      await CloudSync.loginWithGoogle();
      showToast('Berhasil masuk dengan Google.');
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  async function handleGoogleSignInLogin() {
    const errorEl = document.getElementById('auth-error-login');
    errorEl.textContent = '';
    try {
      await CloudSync.loginWithGoogle();
      showToast('Berhasil masuk dengan Google.');
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  async function handleSyncPush() {
    const statusEl = document.getElementById('akun-sync-status');
    statusEl.textContent = 'Menyinkronkan...';
    try {
      await CloudSync.pushData();
      statusEl.textContent = 'Berhasil disinkronkan ke cloud barusan.';
      showToast('Data berhasil disinkronkan ke cloud.');
    } catch (err) {
      statusEl.textContent = '';
      showToast(err.message);
    }
  }

  async function handleSyncPull() {
    askConfirm('Data di perangkat ini akan ditimpa dengan cadangan dari cloud. Lanjutkan?', async () => {
      const statusEl = document.getElementById('akun-sync-status');
      statusEl.textContent = 'Memulihkan...';
      try {
        await CloudSync.pullData();
        await reloadAll();
        renderAll();
        statusEl.textContent = 'Berhasil dipulihkan dari cloud barusan.';
        showToast('Data berhasil dipulihkan dari cloud.');
      } catch (err) {
        statusEl.textContent = '';
        showToast(err.message);
      }
    });
  }

  function bindAkun() {
    // Binding untuk login screen (halaman pertama)
    document.querySelectorAll('#auth-mode-segmented-login .segment').forEach((seg) => {
      seg.addEventListener('click', () => setAuthModeLogin(seg.dataset.authMode));
    });
    document.getElementById('form-auth-login').addEventListener('submit', handleAuthSubmitLogin);
    document.getElementById('btn-google-signin-login').addEventListener('click', handleGoogleSignInLogin);
    document.getElementById('lg-guest-btn').addEventListener('click', () => {
      setGuest(true);
      enterApp(true);
    });
    document.getElementById('lg-toggle-pass').addEventListener('click', () => {
      const input = document.getElementById('auth-password-login');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      document.getElementById('lg-toggle-pass').setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
    });
    buildLoginRain();

    // Binding untuk Akun view (dalam app)
    document.querySelectorAll('#auth-mode-segmented .segment').forEach((seg) => {
      seg.addEventListener('click', () => setAuthMode(seg.dataset.authMode));
    });
    document.getElementById('form-auth').addEventListener('submit', handleAuthSubmit);
    document.getElementById('btn-google-signin').addEventListener('click', handleGoogleSignIn);
    document.getElementById('btn-sync-push').addEventListener('click', handleSyncPush);
    document.getElementById('btn-sync-pull').addEventListener('click', handleSyncPull);
    document.getElementById('btn-akun-logout').addEventListener('click', async () => {
      askConfirm('Keluar dari akun ini?', async () => {
        await CloudSync.logout();
        showToast('Berhasil keluar.');
      });
    });
    document.getElementById('btn-open-pin-config').addEventListener('click', () => openModal('modal-pin-config'));

    if (window.CloudSync && CloudSync.isReady()) {
      CloudSync.onAuthChange(handleAuthState);
      // Jaga-jaga jika Firebase lambat merespons: jangan tahan splash selamanya
      setTimeout(() => { if (!authResolved) handleAuthState(null); }, 3500);
    } else {
      document.getElementById('lg-config-note').hidden = false;
      handleAuthState(null);
    }
  }

  /* ---------------------------------------------------------
     DATA LOADING
  --------------------------------------------------------- */
  async function reloadAll() {
    const [wallets, categories, transactions, goals, budgets] = await Promise.all([
      DB.getWallets(), DB.getCategories(), DB.getTransactions(), DB.getGoals(), DB.getBudgets()
    ]);
    state.wallets = wallets;
    state.categories = categories;
    state.transactions = transactions.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    state.goals = goals;
    state.budgets = budgets;
  }

  function categoryById(id) { return state.categories.find((c) => c.id === id); }
  function walletById(id) { return state.wallets.find((w) => w.id === id); }

  function walletBalance(wallet) {
    const initial = Number(wallet.initialBalance) || 0;
    const delta = state.transactions
      .filter((t) => t.walletId === wallet.id)
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
    return initial + delta;
  }

  function totalBalance() {
    return state.wallets.reduce((sum, w) => sum + walletBalance(w), 0);
  }

  function monthTransactions(ref) {
    return state.transactions.filter((t) => isSameMonth(t.date, ref));
  }

  function monthIncome(ref) {
    return monthTransactions(ref).filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  }
  function monthExpense(ref) {
    return monthTransactions(ref).filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  }

  function expenseByCategory(ref) {
    const map = {};
    monthTransactions(ref).filter((t) => t.type === 'expense').forEach((t) => {
      map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([categoryId, value]) => ({ categoryId, value, category: categoryById(categoryId) }))
      .filter((x) => x.category)
      .sort((a, b) => b.value - a.value);
  }

  function totalSavings() {
    return state.goals.reduce((s, g) => s + (g.currentAmount || 0), 0);
  }

  function budgetByCategory(categoryId) {
    return state.budgets.find((b) => b.categoryId === categoryId);
  }

  function categorySpent(categoryId, ref) {
    return monthTransactions(ref)
      .filter((t) => t.type === 'expense' && t.categoryId === categoryId)
      .reduce((s, t) => s + t.amount, 0);
  }

  function budgetOverviewRows(ref) {
    return state.budgets
      .map((b) => {
        const category = categoryById(b.categoryId);
        if (!category) return null;
        const spent = categorySpent(b.categoryId, ref);
        const pct = b.monthlyLimit > 0 ? Math.round((spent / b.monthlyLimit) * 100) : 0;
        return { budget: b, category, spent, pct };
      })
      .filter(Boolean)
      .sort((a, b) => b.pct - a.pct);
  }

  /* ---------------------------------------------------------
     NAVIGATION
  --------------------------------------------------------- */
  function switchView(name) {
    state.currentView = name;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
    // Tabungan dibuka dari Dasbor, jadi tab Dasbor tetap menyala di halaman itu
    const navName = name === 'target' ? 'dashboard' : name;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === navName));
    document.getElementById('app-main').scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    renderView(name);
  }

  function renderView(name) {
    if (name === 'dashboard') renderDashboard();
    else if (name === 'transaksi') renderTransaksi();
    else if (name === 'dompet') renderDompet();
    else if (name === 'target') renderTarget();
    else if (name === 'kategori') renderKategori();
    else if (name === 'anggaran') renderAnggaran();
    else if (name === 'analisa') renderAnalisa();
  }

  function renderAll() {
    renderView(state.currentView);
  }

  /* ---------------------------------------------------------
     DASHBOARD
  --------------------------------------------------------- */
  function renderDashboard() {
    const now = new Date();
    document.getElementById('dash-balance').textContent = formatRupiah(totalBalance());
    document.getElementById('dash-income').textContent = formatRupiah(monthIncome(now));
    document.getElementById('dash-expense').textContent = formatRupiah(monthExpense(now));
    document.getElementById('dash-saving').textContent = formatRupiah(totalSavings());
    document.getElementById('dash-chart-month').textContent = monthLabel(now);
    document.getElementById('dash-trend-month').textContent = monthLabel(now);

    // Anggaran terpakai (agregat seluruh kategori yang punya anggaran)
    const budgetRows = budgetOverviewRows(now);
    const totalLimit = budgetRows.reduce((s, r) => s + r.budget.monthlyLimit, 0);
    const totalSpent = budgetRows.reduce((s, r) => s + r.spent, 0);
    const budgetPct = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
    document.getElementById('dash-budget-pct').textContent = budgetPct + '%';
    document.getElementById('dash-budget-bar').style.width = Math.min(100, budgetPct) + '%';
    document.getElementById('dash-budget-sub').textContent = `${formatRupiah(totalSpent)} dari ${formatRupiah(totalLimit)}`;
    const budgetBar = document.getElementById('dash-budget-bar');
    budgetBar.style.background = budgetPct >= 100 ? 'var(--danger)' : budgetPct >= 80 ? 'var(--gold)' : 'var(--success)';

    // Insight / pemberitahuan ringkas
    const banner = document.getElementById('dash-insight-banner');
    const bannerText = document.getElementById('dash-insight-text');
    const overBudget = budgetRows.find((r) => r.pct >= 100);
    const nearBudget = budgetRows.find((r) => r.pct >= 80 && r.pct < 100);
    const income = monthIncome(now);
    const expense = monthExpense(now);
    banner.classList.remove('warn');
    if (overBudget) {
      banner.classList.add('warn');
      bannerText.textContent = `Anggaran ${overBudget.category.name} sudah melebihi batas bulanan (${overBudget.pct}%).`;
    } else if (nearBudget) {
      banner.classList.add('warn');
      bannerText.textContent = `Anggaran ${nearBudget.category.name} sudah mencapai ${nearBudget.pct}% dari batas bulanan.`;
    } else if (expense > income && income + expense > 0) {
      banner.classList.add('warn');
      bannerText.textContent = 'Pengeluaran bulan ini lebih besar daripada pemasukan.';
    } else if (income === 0 && expense === 0) {
      bannerText.textContent = 'Belum ada transaksi bulan ini. Yuk mulai mencatat!';
    } else {
      bannerText.textContent = 'Keuangan bulan ini terlihat sehat. Pertahankan ya!';
    }

    const byCat = expenseByCategory(now);
    const chartWrap = document.getElementById('dash-chart-wrap');
    const chartEmpty = document.getElementById('dash-chart-empty');
    if (byCat.length === 0) {
      chartWrap.style.display = 'none';
      chartEmpty.style.display = 'block';
    } else {
      chartWrap.style.display = 'flex';
      chartEmpty.style.display = 'none';
      drawDonutChart(byCat);
    }

    drawTrendChart();

    // Anggaran Overview (ringkas, maksimal 4 kategori)
    const dashBudgetList = document.getElementById('dash-budget-list');
    const dashBudgetEmpty = document.getElementById('dash-budget-empty');
    if (budgetRows.length === 0) {
      dashBudgetList.innerHTML = '';
      dashBudgetEmpty.style.display = 'block';
    } else {
      dashBudgetEmpty.style.display = 'none';
      dashBudgetList.innerHTML = budgetRows.slice(0, 4).map((r) => {
        const status = r.pct >= 100 ? 'over' : r.pct >= 80 ? 'warn' : 'ok';
        return `<div class="budget-row">
          ${categoryIconHTML(r.category, 34)}
          <span class="budget-row-info">
            <span class="budget-row-top">
              <span class="budget-row-name">${escapeHtml(r.category.name)}</span>
              <span class="budget-row-pct ${status}">${r.pct}%</span>
            </span>
            <div class="budget-row-bar-track"><div class="budget-row-bar-fill ${status}" style="width:${Math.min(100, r.pct)}%"></div></div>
            <div class="budget-row-sub">${formatRupiah(r.spent)} dari ${formatRupiah(r.budget.monthlyLimit)}</div>
          </span>
        </div>`;
      }).join('');
    }

    const recent = state.transactions.slice(0, 5);
    const list = document.getElementById('dash-recent-list');
    const empty = document.getElementById('dash-recent-empty');
    if (recent.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      list.innerHTML = recent.map(renderTxRow).join('');
      bindTxRowClicks(list);
    }
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  let donutAnimId = null;
  function drawDonutChart(byCat) {
    const canvas = document.getElementById('dash-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const total = byCat.reduce((s, x) => s + x.value, 0);
    const cx = size / 2, cy = size / 2, rOuter = 92, rInner = 58;
    const top = byCat.slice(0, 8);
    const cardBg = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#1B212B';
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#F3EFE6';

    function paint(progress) {
      ctx.clearRect(0, 0, size, size);
      let start = -Math.PI / 2;
      top.forEach((item, i) => {
        const frac = item.value / total;
        const sweep = frac * Math.PI * 2 * progress;
        const end = start + sweep;
        if (sweep > 0.001) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, rOuter, start, end);
          ctx.closePath();
          ctx.fillStyle = getCategoryVisual(item.category.name).color;
          ctx.fill();
        }
        start += frac * Math.PI * 2;
      });

      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.fillStyle = cardBg;
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = '600 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Pengeluaran', cx, cy - 8);
      ctx.font = '700 12px Fraunces, serif';
      ctx.fillText(formatRupiah(Math.round(total * progress)), cx, cy + 10);
    }

    if (donutAnimId) cancelAnimationFrame(donutAnimId);
    const duration = 700;
    const startTime = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - startTime) / duration);
      paint(easeOutCubic(t));
      if (t < 1) {
        donutAnimId = requestAnimationFrame(frame);
      } else {
        donutAnimId = null;
      }
    }
    donutAnimId = requestAnimationFrame(frame);

    const legend = document.getElementById('dash-chart-legend');
    legend.innerHTML = top.map((item, i) => {
      const pct = Math.round((item.value / total) * 100);
      return `<div class="legend-row">
        <span class="legend-dot" style="background:${getCategoryVisual(item.category.name).color}"></span>
        <span class="legend-name">${escapeHtml(item.category.name)}</span>
        <span class="legend-pct">${pct}%</span>
      </div>`;
    }).join('');
  }

  let trendAnimId = null;
  function drawTrendChart() {
    const canvas = document.getElementById('dash-trend-chart');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = wrap.clientWidth;
    const cssHeight = wrap.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Total pengeluaran kumulatif per hari sepanjang bulan berjalan,
    // sampai hari ini saja (hari-hari mendatang tidak digambar).
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = now.getDate();

    const dailyExpense = new Array(daysInMonth + 1).fill(0);
    state.transactions.forEach((t) => {
      if (t.type !== 'expense') return;
      const d = new Date(t.date + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === month) {
        dailyExpense[d.getDate()] += t.amount;
      }
    });
    const points = [];
    let running = 0;
    for (let day = 1; day <= today; day++) {
      running += dailyExpense[day];
      points.push(running);
    }
    if (points.length < 2) points.unshift(0);
    const maxVal = Math.max(1, ...points);

    const goldColor = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#D9AE60';
    const faintColor = getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim() || '#6E7688';
    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-soft').trim() || '#232a35';

    const padLeft = 4, padRight = 4, padTop = 14, padBottom = 20;
    const chartW = cssWidth - padLeft - padRight;
    const chartH = cssHeight - padTop - padBottom;
    const stepX = points.length > 1 ? chartW / (points.length - 1) : 0;

    function xAt(i) { return padLeft + stepX * i; }
    function yAt(v, progress) { return padTop + chartH - (v / maxVal) * chartH * progress; }

    function paint(progress) {
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, padTop + chartH + 0.5);
      ctx.lineTo(cssWidth, padTop + chartH + 0.5);
      ctx.stroke();

      if (points.every((v) => v === 0)) {
        ctx.fillStyle = faintColor;
        ctx.font = '600 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Belum ada pengeluaran bulan ini', cssWidth / 2, padTop + chartH / 2);
        return;
      }

      // area di bawah garis
      ctx.beginPath();
      ctx.moveTo(xAt(0), padTop + chartH);
      points.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v, progress)));
      ctx.lineTo(xAt(points.length - 1), padTop + chartH);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      gradient.addColorStop(0, goldColor + '55');
      gradient.addColorStop(1, goldColor + '02');
      ctx.fillStyle = gradient;
      ctx.fill();

      // garis utama
      ctx.beginPath();
      points.forEach((v, i) => {
        const x = xAt(i), y = yAt(v, progress);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = goldColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // titik akhir
      const lastX = xAt(points.length - 1);
      const lastY = yAt(points[points.length - 1], progress);
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = goldColor;
      ctx.fill();

      // label sumbu: tanggal 1 dan hari ini
      ctx.fillStyle = faintColor;
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('1', xAt(0), padTop + chartH + 5);
      ctx.textAlign = 'right';
      ctx.fillText(String(today), xAt(points.length - 1), padTop + chartH + 5);
    }

    if (trendAnimId) cancelAnimationFrame(trendAnimId);
    const duration = 700;
    const startTime = performance.now();
    function frame(nowTs) {
      const t = Math.min(1, (nowTs - startTime) / duration);
      paint(easeOutCubic(t));
      if (t < 1) {
        trendAnimId = requestAnimationFrame(frame);
      } else {
        trendAnimId = null;
      }
    }
    trendAnimId = requestAnimationFrame(frame);
  }

  function renderTxRow(t) {
    const cat = categoryById(t.categoryId);
    const wallet = walletById(t.walletId);
    const label = cat ? cat.name : 'Tanpa kategori';
    const walletName = wallet ? wallet.name : '—';
    const description = t.note ? t.note : label;
    const metaParts = [formatDateShort(t.date)];
    if (t.note) metaParts.push(label);
    metaParts.push(walletName);
    return `<li class="tx-row" data-tx-id="${t.id}">
      ${categoryIconHTML(cat, 40)}
      <span class="tx-info">
        <span class="tx-cat">${escapeHtml(description)}</span>
        <span class="tx-meta">${metaParts.map(escapeHtml).join(' · ')}</span>
      </span>
      <span class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatRupiah(t.amount)}</span>
    </li>`;
  }

  function bindTxRowClicks(container) {
    container.querySelectorAll('.tx-row').forEach((row) => {
      row.addEventListener('click', () => openTxModal(row.dataset.txId));
    });
  }

  /* ---------------------------------------------------------
     TRANSAKSI
  --------------------------------------------------------- */
  function renderTransaksi() {
    let list = state.transactions;
    if (state.txFilter !== 'all') list = list.filter((t) => t.type === state.txFilter);

    const groupsEl = document.getElementById('tx-groups');
    const emptyEl = document.getElementById('tx-empty');

    if (list.length === 0) {
      groupsEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';

    const groups = {};
    list.forEach((t) => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    groupsEl.innerHTML = dates.map((date) => `
      <div class="tx-group-label">${formatDateLabel(date)}</div>
      <div class="tx-group-card">
        <ul class="tx-list">${groups[date].map(renderTxRow).join('')}</ul>
      </div>
    `).join('');

    bindTxRowClicks(groupsEl);
  }

  /* ---------------------------------------------------------
     DOMPET
  --------------------------------------------------------- */
  function renderDompet() {
    const list = document.getElementById('wallet-list');
    const empty = document.getElementById('wallet-empty');
    if (state.wallets.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = state.wallets.map((w) => `
      <div class="wallet-card" data-wallet-id="${w.id}">
        <div class="wallet-card-top">
          <span class="wallet-name">${escapeHtml(w.name)}</span>
          <span class="wallet-dot">${escapeHtml(initials(w.name))}</span>
        </div>
        <span class="wallet-balance">${formatRupiah(walletBalance(w))}</span>
      </div>
    `).join('');
    list.querySelectorAll('.wallet-card').forEach((card) => {
      card.addEventListener('click', () => openWalletModal(card.dataset.walletId));
    });
  }

  /* ---------------------------------------------------------
     TARGET MENABUNG
  --------------------------------------------------------- */
  function savingTransactions() {
    return state.transactions.filter((t) => t.goalId);
  }

  function renderSavingSummary() {
    document.getElementById('saving-total-amount').textContent = formatRupiah(totalSavings());

    // Recap Tabungan (hari ke hari) — seluruh transaksi setor/tarik, terbaru dulu
    const savingTx = savingTransactions();
    const recapList = document.getElementById('saving-recap-list');
    const recapEmpty = document.getElementById('saving-recap-empty');
    if (savingTx.length === 0) {
      recapList.innerHTML = '';
      recapEmpty.style.display = 'block';
    } else {
      recapEmpty.style.display = 'none';
      recapList.innerHTML = savingTx.slice(0, 20).map((t) => {
        const goal = state.goals.find((g) => g.id === t.goalId);
        const goalName = goal ? goal.name : 'Target';
        const title = t.type === 'expense' ? `Setoran — ${goalName}` : `Tarik — ${goalName}`;
        return `<li class="tx-row">
          <span class="tx-icon ${t.type}" style="background:${t.type === 'expense' ? 'var(--success-bg)' : 'var(--danger-bg)'};color:${t.type === 'expense' ? 'var(--success)' : 'var(--danger)'};display:flex;align-items:center;justify-content:center;border-radius:12px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">${t.type === 'expense' ? '<path d="M12 5v14M5 12h14"/>' : '<path d="M5 12h14"/>'}</svg>
          </span>
          <span class="tx-info">
            <span class="tx-cat">${escapeHtml(title)}</span>
            <span class="tx-meta">${formatDateShort(t.date)}${t.note ? ' · ' + escapeHtml(t.note) : ''}</span>
          </span>
          <span class="tx-amount ${t.type === 'expense' ? 'income' : 'expense'}">${t.type === 'expense' ? '+' : '-'}${formatRupiah(t.amount)}</span>
        </li>`;
      }).join('');
    }

    // Total setoran / penarikan bulan ini
    const now = new Date();
    const monthSavingTx = savingTx.filter((t) => isSameMonth(t.date, now));
    const monthIn = monthSavingTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const monthOut = monthSavingTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    document.getElementById('saving-month-in').textContent = formatRupiah(monthIn);
    document.getElementById('saving-month-out').textContent = formatRupiah(monthOut);

    drawSavingStatChart();
  }

  let savingChartAnimId = null;
  function drawSavingStatChart() {
    const canvas = document.getElementById('saving-stat-chart');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = wrap.clientWidth;
    const cssHeight = wrap.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Agregat 6 bulan terakhir: setoran, penarikan, & saldo kumulatif tabungan
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('id-ID', { month: 'short' }) });
    }
    const savingTx = savingTransactions();
    let runningBalance = 0;
    // Hitung saldo awal sebelum rentang 6 bulan (agar garis "Total Saldo" akurat)
    const rangeStart = new Date(months[0].year, months[0].month, 1);
    savingTx.forEach((t) => {
      const d = new Date(t.date + 'T00:00:00');
      if (d < rangeStart) runningBalance += (t.type === 'expense' ? t.amount : -t.amount);
    });

    const series = months.map((m) => {
      const txThisMonth = savingTx.filter((t) => {
        const d = new Date(t.date + 'T00:00:00');
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      });
      const setoran = txThisMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const penarikan = txThisMonth.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      runningBalance += setoran - penarikan;
      return { label: m.label, setoran, penarikan, saldo: runningBalance };
    });

    const maxVal = Math.max(1, ...series.map((s) => Math.max(s.setoran, s.penarikan, s.saldo)));
    const successColor = getComputedStyle(document.documentElement).getPropertyValue('--success').trim() || '#57B589';
    const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() || '#E2685B';
    const goldColor = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#D9AE60';
    const faintColor = getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim() || '#6E7688';
    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-soft').trim() || '#232a35';

    const padLeft = 4, padRight = 4, padTop = 10, padBottom = 20;
    const chartW = cssWidth - padLeft - padRight;
    const chartH = cssHeight - padTop - padBottom;
    const stepX = chartW / (series.length - 1);
    function xAt(i) { return padLeft + stepX * i; }
    function yAt(v, progress) { return padTop + chartH - (v / maxVal) * chartH * progress; }

    function drawLine(key, color, progress) {
      ctx.beginPath();
      series.forEach((s, i) => {
        const x = xAt(i), y = yAt(s[key], progress);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      series.forEach((s, i) => {
        ctx.beginPath();
        ctx.arc(xAt(i), yAt(s[key], progress), 2.6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    }

    function paint(progress) {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, padTop + chartH + 0.5);
      ctx.lineTo(cssWidth, padTop + chartH + 0.5);
      ctx.stroke();

      drawLine('penarikan', dangerColor, progress);
      drawLine('setoran', successColor, progress);
      drawLine('saldo', goldColor, progress);

      ctx.fillStyle = faintColor;
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textBaseline = 'top';
      series.forEach((s, i) => {
        ctx.textAlign = i === 0 ? 'left' : i === series.length - 1 ? 'right' : 'center';
        ctx.fillText(s.label, xAt(i), padTop + chartH + 5);
      });
    }

    if (savingChartAnimId) cancelAnimationFrame(savingChartAnimId);
    const duration = 700;
    const startTime = performance.now();
    function frame(nowTs) {
      const t = Math.min(1, (nowTs - startTime) / duration);
      paint(easeOutCubic(t));
      if (t < 1) {
        savingChartAnimId = requestAnimationFrame(frame);
      } else {
        savingChartAnimId = null;
      }
    }
    savingChartAnimId = requestAnimationFrame(frame);
  }

  function renderTarget() {
    renderSavingSummary();

    const list = document.getElementById('goal-list');
    const empty = document.getElementById('goal-empty');
    if (state.goals.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = state.goals.map((g) => {
      const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
      return `<div class="goal-card" data-goal-id="${g.id}">
        <div class="goal-card-top">
          <div>
            <div class="goal-name">${escapeHtml(g.name)}</div>
            <div class="goal-sub">Target ${formatRupiah(g.targetAmount)}</div>
          </div>
          <span class="goal-pct">${pct}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="goal-amounts">
          <span>${formatRupiah(g.currentAmount)} terkumpul</span>
          <span>${formatRupiah(Math.max(0, g.targetAmount - g.currentAmount))} lagi</span>
        </div>
        <div class="goal-card-actions">
          <button type="button" class="goal-quick-btn goal-quick-deposit" data-goal-id="${g.id}" data-quick="deposit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
            Menabung
          </button>
          <button type="button" class="goal-quick-btn goal-quick-withdraw" data-goal-id="${g.id}" data-quick="withdraw">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14"/></svg>
            Tarik
          </button>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('.goal-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.goal-quick-btn')) return;
        openGoalModal(card.dataset.goalId);
      });
    });
    list.querySelectorAll('.goal-quick-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openGoalTransferModal(btn.dataset.goalId, btn.dataset.quick);
      });
    });
  }

  /* ---------------------------------------------------------
     KATEGORI
  --------------------------------------------------------- */
  function renderKategori() {
    const list = document.getElementById('cat-list');
    const items = state.categories.filter((c) => c.type === state.catTypeFilter);
    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state"><p class="empty-title">Belum ada kategori</p><p class="empty-desc">Tambahkan kategori baru dengan tombol di atas.</p></div>';
      return;
    }
    list.innerHTML = items.map((c) => `
      <li class="cat-row" data-cat-id="${c.id}">
        ${categoryIconHTML(c, 34)}
        <span class="cat-row-name">${escapeHtml(c.name)}</span>
        <button class="cat-row-edit" data-action="edit" aria-label="Edit kategori">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button class="cat-row-del" data-action="delete" aria-label="Hapus kategori">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </li>
    `).join('');

    list.querySelectorAll('.cat-row').forEach((row) => {
      const id = row.dataset.catId;
      row.querySelector('[data-action="edit"]').addEventListener('click', () => openCategoryModal(id));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => requestDeleteCategory(id));
    });
  }

  /* ---------------------------------------------------------
     ANGGARAN (budget bulanan per kategori pengeluaran)
  --------------------------------------------------------- */
  function renderAnggaran() {
    const list = document.getElementById('budget-cat-list');
    const now = new Date();
    const expenseCats = state.categories.filter((c) => c.type === 'expense');
    if (expenseCats.length === 0) {
      list.innerHTML = '<div class="empty-state"><p class="empty-title">Belum ada kategori pengeluaran</p><p class="empty-desc">Tambahkan kategori pengeluaran dulu di menu Kategori.</p></div>';
      return;
    }
    list.innerHTML = expenseCats.map((c) => {
      const budget = budgetByCategory(c.id);
      const spent = categorySpent(c.id, now);
      if (!budget) {
        return `<li class="cat-row budget-set-row" data-cat-id="${c.id}">
          ${categoryIconHTML(c, 34)}
          <span class="cat-row-name">${escapeHtml(c.name)}</span>
          <span class="budget-row-pct" style="color:var(--text-faint);font-weight:600;font-size:11.5px;">Belum diatur</span>
        </li>`;
      }
      const pct = budget.monthlyLimit > 0 ? Math.round((spent / budget.monthlyLimit) * 100) : 0;
      const status = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
      return `<li class="cat-row budget-set-row" data-cat-id="${c.id}" style="align-items:flex-start;flex-wrap:wrap;">
        ${categoryIconHTML(c, 34)}
        <span class="budget-row-info">
          <span class="budget-row-top">
            <span class="budget-row-name">${escapeHtml(c.name)}</span>
            <span class="budget-row-pct ${status}">${pct}%</span>
          </span>
          <div class="budget-row-bar-track"><div class="budget-row-bar-fill ${status}" style="width:${Math.min(100, pct)}%"></div></div>
          <div class="budget-row-sub">${formatRupiah(spent)} dari ${formatRupiah(budget.monthlyLimit)}</div>
        </span>
      </li>`;
    }).join('');

    list.querySelectorAll('.budget-set-row').forEach((row) => {
      row.addEventListener('click', () => openBudgetModal(row.dataset.catId));
    });
  }

  function openBudgetModal(categoryId) {
    const category = categoryById(categoryId);
    if (!category) return;
    const budget = budgetByCategory(categoryId);
    document.getElementById('form-budget').reset();
    document.getElementById('budget-category-id').value = categoryId;
    document.getElementById('budget-id').value = budget ? budget.id : '';
    document.getElementById('budget-modal-title').textContent = `Anggaran ${category.name}`;
    document.getElementById('budget-amount').value = budget ? budget.monthlyLimit.toLocaleString('id-ID') : '';
    document.getElementById('budget-delete-btn').hidden = !budget;
    openModal('modal-budget');
  }

  async function handleBudgetSubmit(e) {
    e.preventDefault();
    const categoryId = document.getElementById('budget-category-id').value;
    const id = document.getElementById('budget-id').value || null;
    const amount = parseAmount(document.getElementById('budget-amount').value);

    if (amount <= 0) {
      if (id) await DB.deleteBudget(id);
      await reloadAll();
      closeModal('modal-budget');
      renderAll();
      showToast('Anggaran dihapus.');
      return;
    }

    await DB.saveBudget({ id: id || undefined, categoryId, monthlyLimit: amount });
    await reloadAll();
    closeModal('modal-budget');
    renderAll();
    showToast('Anggaran disimpan.');
  }

  function requestDeleteBudget() {
    const id = document.getElementById('budget-id').value;
    if (!id) return;
    askConfirm('Hapus anggaran kategori ini?', async () => {
      await DB.deleteBudget(id);
      await reloadAll();
      closeModal('modal-budget');
      renderAll();
      showToast('Anggaran dihapus.');
    });
  }

  /* ---------------------------------------------------------
     ANALISA
  --------------------------------------------------------- */
  function renderAnalisa() {
    const now = new Date();
    const income = monthIncome(now);
    const expense = monthExpense(now);
    const selisih = income - expense;
    const savingsPct = income > 0 ? Math.round((selisih / income) * 100) : 0;

    document.getElementById('an-income').textContent = formatRupiah(income);
    document.getElementById('an-expense').textContent = formatRupiah(expense);
    const selisihEl = document.getElementById('an-selisih');
    selisihEl.textContent = formatRupiah(selisih);
    selisihEl.className = 'stat-box-value ' + (selisih >= 0 ? 'income' : 'expense');
    document.getElementById('an-savings-pct').textContent = (savingsPct > 0 ? savingsPct : 0) + '%';

    const byCat = expenseByCategory(now);
    const topEl = document.getElementById('an-top-category');
    if (byCat.length === 0) {
      topEl.innerHTML = '<p class="empty-desc">Belum ada pengeluaran bulan ini.</p>';
    } else {
      const top = byCat[0];
      const pct = expense > 0 ? Math.round((top.value / expense) * 100) : 0;
      topEl.innerHTML = `
        ${categoryIconHTML(top.category, 44)}
        <div>
          <div class="top-category-name">${escapeHtml(top.category.name)}</div>
          <div class="top-category-amount">${formatRupiah(top.value)} · ${pct}% dari total pengeluaran</div>
        </div>`;
    }

    const insights = [];
    if (byCat.length > 0) {
      insights.push(`Pengeluaran ${byCat[0].category.name.toLowerCase()} paling besar bulan ini, mencapai ${formatRupiah(byCat[0].value)}.`);
    }
    if (income === 0 && expense === 0) {
      insights.push('Belum ada transaksi bulan ini. Mulai catat pemasukan dan pengeluaranmu.');
    } else if (expense > income) {
      insights.push('Pengeluaran lebih besar daripada pemasukan bulan ini. Coba tinjau kembali pos pengeluaran terbesar.');
    } else if (income > 0 && savingsPct >= 20) {
      insights.push(`Keuangan bulan ini masih sehat — kamu berhasil menyisihkan sekitar ${savingsPct}% dari pemasukan.`);
    } else {
      insights.push('Keuangan bulan ini masih sehat, tapi coba tingkatkan porsi tabungan bulan depan.');
    }
    if (state.goals.length > 0) {
      const totalTarget = state.goals.reduce((s, g) => s + (g.targetAmount || 0), 0);
      const totalCurrent = state.goals.reduce((s, g) => s + (g.currentAmount || 0), 0);
      const goalPct = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
      insights.push(`Progres seluruh target tabungan sudah mencapai ${goalPct}% (${formatRupiah(totalCurrent)} dari ${formatRupiah(totalTarget)}).`);
    }

    document.getElementById('an-insights').innerHTML = insights.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
  }

  /* ---------------------------------------------------------
     MODAL HELPERS
  --------------------------------------------------------- */
  function openModal(id) {
    document.getElementById(id).classList.add('open');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
  }
  function bindModalDismiss() {
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
  }

  function askConfirm(text, onConfirm) {
    document.getElementById('confirm-text').textContent = text;
    state.confirmCallback = onConfirm;
    openModal('modal-confirm');
  }

  /* ---------------------------------------------------------
     MODAL: TRANSAKSI
  --------------------------------------------------------- */
  function populateTxCategorySelect(type) {
    const select = document.getElementById('tx-category');
    const opts = state.categories.filter((c) => c.type === type);
    select.innerHTML = opts.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }
  function populateTxWalletSelect() {
    const select = document.getElementById('tx-wallet');
    select.innerHTML = state.wallets.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
  }

  function setTxTypeSegment(type) {
    document.querySelectorAll('#tx-type-segmented .segment').forEach((seg) => {
      seg.classList.toggle('active', seg.dataset.txType === type);
    });
    populateTxCategorySelect(type);
  }

  function openTxModal(id) {
    if (state.wallets.length === 0) {
      showToast('Tambahkan dompet terlebih dahulu sebelum mencatat transaksi.');
      switchView('dompet');
      return;
    }
    if (state.categories.length === 0) {
      showToast('Belum ada kategori tersedia.');
      return;
    }
    const form = document.getElementById('form-tx');
    form.reset();
    populateTxWalletSelect();

    const editing = id ? state.transactions.find((t) => t.id === id) : null;
    document.getElementById('tx-id').value = editing ? editing.id : '';
    document.getElementById('tx-modal-title').textContent = editing ? 'Edit Transaksi' : 'Tambah Transaksi';
    document.getElementById('tx-delete-btn').hidden = !editing;

    const type = editing ? editing.type : 'expense';
    setTxTypeSegment(type);

    document.getElementById('tx-amount').value = editing ? editing.amount.toLocaleString('id-ID') : '';
    document.getElementById('tx-date').value = editing ? editing.date : todayISODate();
    document.getElementById('tx-note').value = editing ? (editing.note || '') : '';

    if (editing) {
      document.getElementById('tx-category').value = editing.categoryId;
      document.getElementById('tx-wallet').value = editing.walletId;
    }

    openModal('modal-tx');
  }

  async function handleTxSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('tx-id').value || null;
    const type = document.querySelector('#tx-type-segmented .segment.active').dataset.txType;
    const amount = parseAmount(document.getElementById('tx-amount').value);

    if (amount <= 0) { showToast('Nominal harus lebih dari 0.'); return; }

    const trx = {
      id: id || undefined,
      type,
      amount,
      categoryId: document.getElementById('tx-category').value,
      walletId: document.getElementById('tx-wallet').value,
      date: document.getElementById('tx-date').value || todayISODate(),
      note: document.getElementById('tx-note').value.trim()
    };
    if (id) {
      const existing = state.transactions.find((t) => t.id === id);
      trx.createdAt = existing ? existing.createdAt : new Date().toISOString();
    }

    await DB.saveTransaction(trx);
    await reloadAll();
    closeModal('modal-tx');
    renderAll();
    showToast(id ? 'Transaksi diperbarui.' : 'Transaksi ditambahkan.');
  }

  function requestDeleteTx() {
    const id = document.getElementById('tx-id').value;
    if (!id) return;
    askConfirm('Hapus transaksi ini? Tindakan ini tidak bisa dibatalkan.', async () => {
      await DB.deleteTransaction(id);
      await reloadAll();
      closeModal('modal-tx');
      renderAll();
      showToast('Transaksi dihapus.');
    });
  }

  /* ---------------------------------------------------------
     MODAL: DOMPET
  --------------------------------------------------------- */
  function openWalletModal(id) {
    const form = document.getElementById('form-wallet');
    form.reset();
    const editing = id ? state.wallets.find((w) => w.id === id) : null;
    document.getElementById('wallet-id').value = editing ? editing.id : '';
    document.getElementById('wallet-modal-title').textContent = editing ? 'Edit Dompet' : 'Tambah Dompet';
    document.getElementById('wallet-delete-btn').hidden = !editing;
    document.getElementById('wallet-name').value = editing ? editing.name : '';
    document.getElementById('wallet-initial').value = editing ? (editing.initialBalance || 0).toLocaleString('id-ID') : '';
    document.getElementById('wallet-initial-hint').textContent = editing
      ? 'Mengubah saldo awal akan memengaruhi perhitungan saldo dompet ini.'
      : 'Saldo awal dicatat sekali saat dompet dibuat.';
    openModal('modal-wallet');
  }

  async function handleWalletSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('wallet-id').value || null;
    const name = document.getElementById('wallet-name').value.trim();
    if (!name) return;
    const wallet = {
      id: id || undefined,
      name,
      initialBalance: parseAmount(document.getElementById('wallet-initial').value)
    };
    if (id) {
      const existing = state.wallets.find((w) => w.id === id);
      wallet.createdAt = existing ? existing.createdAt : new Date().toISOString();
    }
    await DB.saveWallet(wallet);
    await reloadAll();
    closeModal('modal-wallet');
    renderAll();
    showToast(id ? 'Dompet diperbarui.' : 'Dompet ditambahkan.');
  }

  function requestDeleteWallet() {
    const id = document.getElementById('wallet-id').value;
    if (!id) return;
    const used = state.transactions.some((t) => t.walletId === id);
    if (used) {
      showToast('Dompet tidak bisa dihapus karena masih memiliki transaksi.');
      return;
    }
    askConfirm('Hapus dompet ini?', async () => {
      await DB.deleteWallet(id);
      await reloadAll();
      closeModal('modal-wallet');
      renderAll();
      showToast('Dompet dihapus.');
    });
  }

  /* ---------------------------------------------------------
     MODAL: KATEGORI
  --------------------------------------------------------- */
  function setCategoryFormType(type) {
    document.querySelectorAll('#category-type-segmented .segment').forEach((seg) => {
      seg.classList.toggle('active', seg.dataset.catFormType === type);
    });
  }

  function openCategoryModal(id) {
    const form = document.getElementById('form-category');
    form.reset();
    const editing = id ? state.categories.find((c) => c.id === id) : null;
    document.getElementById('category-id').value = editing ? editing.id : '';
    document.getElementById('category-modal-title').textContent = editing ? 'Edit Kategori' : 'Tambah Kategori';
    document.getElementById('category-delete-btn').hidden = !editing;
    document.getElementById('category-name').value = editing ? editing.name : '';
    setCategoryFormType(editing ? editing.type : state.catTypeFilter);
    openModal('modal-category');
  }

  async function handleCategorySubmit(e) {
    e.preventDefault();
    const id = document.getElementById('category-id').value || null;
    const name = document.getElementById('category-name').value.trim();
    if (!name) return;
    const type = document.querySelector('#category-type-segmented .segment.active').dataset.catFormType;
    const cat = { id: id || undefined, name, type };
    if (id) {
      const existing = state.categories.find((c) => c.id === id);
      cat.isDefault = existing ? existing.isDefault : false;
    }
    await DB.saveCategory(cat);
    await reloadAll();
    state.catTypeFilter = type;
    closeModal('modal-category');
    renderAll();
    showToast(id ? 'Kategori diperbarui.' : 'Kategori ditambahkan.');
  }

  function requestDeleteCategory(id) {
    const used = state.transactions.some((t) => t.categoryId === id);
    if (used) {
      showToast('Kategori tidak bisa dihapus karena masih dipakai transaksi.');
      return;
    }
    askConfirm('Hapus kategori ini?', async () => {
      await DB.deleteCategory(id);
      const budget = budgetByCategory(id);
      if (budget) await DB.deleteBudget(budget.id);
      await reloadAll();
      closeModal('modal-category');
      renderAll();
      showToast('Kategori dihapus.');
    });
  }

  function requestDeleteCategoryFromModal() {
    const id = document.getElementById('category-id').value;
    if (id) requestDeleteCategory(id);
  }

  /* ---------------------------------------------------------
     MODAL: TARGET MENABUNG
  --------------------------------------------------------- */
  function openGoalModal(id) {
    const form = document.getElementById('form-goal');
    form.reset();
    const editing = id ? state.goals.find((g) => g.id === id) : null;
    document.getElementById('goal-id').value = editing ? editing.id : '';
    document.getElementById('goal-modal-title').textContent = editing ? 'Edit Target' : 'Tambah Target';
    document.getElementById('goal-delete-btn').hidden = !editing;
    document.getElementById('goal-name').value = editing ? editing.name : '';
    document.getElementById('goal-target').value = editing ? (editing.targetAmount || 0).toLocaleString('id-ID') : '';
    document.getElementById('goal-current').value = editing ? (editing.currentAmount || 0).toLocaleString('id-ID') : '';

    const currentFieldWrap = document.getElementById('goal-current-field-wrap');
    const summaryWrap = document.getElementById('goal-progress-summary');
    if (editing) {
      currentFieldWrap.hidden = true;
      summaryWrap.hidden = false;
      document.getElementById('goal-summary-amount').textContent = formatRupiah(editing.currentAmount || 0);
    } else {
      currentFieldWrap.hidden = false;
      summaryWrap.hidden = true;
    }
    openModal('modal-goal');
  }

  async function handleGoalSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('goal-id').value || null;
    const name = document.getElementById('goal-name').value.trim();
    const targetAmount = parseAmount(document.getElementById('goal-target').value);
    const currentAmount = parseAmount(document.getElementById('goal-current').value);
    if (!name || targetAmount <= 0) { showToast('Lengkapi nama dan nominal target.'); return; }
    const goal = { id: id || undefined, name, targetAmount, currentAmount };
    if (id) {
      const existing = state.goals.find((g) => g.id === id);
      goal.createdAt = existing ? existing.createdAt : new Date().toISOString();
    }
    await DB.saveGoal(goal);
    await reloadAll();
    closeModal('modal-goal');
    renderAll();
    showToast(id ? 'Target diperbarui.' : 'Target ditambahkan.');
  }

  function requestDeleteGoal() {
    const id = document.getElementById('goal-id').value;
    if (!id) return;
    askConfirm('Hapus target tabungan ini?', async () => {
      await DB.deleteGoal(id);
      await reloadAll();
      closeModal('modal-goal');
      renderAll();
      showToast('Target dihapus.');
    });
  }

  /* ---------------------------------------------------------
     MENABUNG: Setor / Tarik target tabungan
     Setor  = uang keluar dari dompet -> masuk ke target (tercatat
              sebagai transaksi pengeluaran kategori "Tabungan").
     Tarik  = uang dari target -> kembali ke dompet (tercatat
              sebagai transaksi pemasukan kategori "Tabungan").
  --------------------------------------------------------- */
  function findSavingCategoryId(type) {
    const cat = state.categories.find((c) => c.type === type && c.name === 'Tabungan');
    return cat ? cat.id : null;
  }

  function openGoalTransferModal(goalId, mode) {
    if (state.wallets.length === 0) {
      showToast('Tambahkan dompet terlebih dahulu.');
      return;
    }
    if (state.goals.length === 0) {
      showToast('Buat target tabungan terlebih dahulu.');
      return;
    }
    const goalSelectWrap = document.getElementById('gt-goal-select-wrap');
    const goalSelect = document.getElementById('gt-goal-select');

    document.getElementById('form-goal-transfer').reset();
    document.getElementById('gt-mode').value = mode;

    let goal;
    if (goalId) {
      goal = state.goals.find((g) => g.id === goalId);
      if (!goal) return;
      document.getElementById('gt-goal-id').value = goalId;
      goalSelectWrap.hidden = true;
    } else {
      // Dibuka dari tombol "+ Setor Dana" global — biarkan pengguna memilih targetnya
      goalSelectWrap.hidden = false;
      goalSelect.innerHTML = state.goals.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
      goal = state.goals[0];
      document.getElementById('gt-goal-id').value = '';
    }

    const walletSelect = document.getElementById('gt-wallet');
    walletSelect.innerHTML = state.wallets.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');

    const sourceWrap = document.getElementById('gt-source-wrap');
    if (mode === 'deposit') {
      const sources = state.categories.filter((c) => c.type === 'income');
      document.getElementById('gt-source').innerHTML = sources.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
      sourceWrap.hidden = false;
      document.getElementById('gt-modal-title').textContent = goalId ? `Setor ke "${goal.name}"` : 'Setor Dana';
      document.getElementById('gt-desc').textContent = 'Dana akan dipindahkan dari dompet ke target tabungan ini.';
      document.getElementById('gt-wallet-label').textContent = 'Dari Dompet';
      document.getElementById('gt-submit-btn').textContent = 'Setor Sekarang';
    } else {
      sourceWrap.hidden = true;
      document.getElementById('gt-modal-title').textContent = goalId ? `Tarik dari "${goal.name}"` : 'Tarik Tabungan';
      document.getElementById('gt-desc').textContent = goalId
        ? `Dana akan dipindahkan dari target tabungan kembali ke dompet. Maksimal ${formatRupiah(goal.currentAmount)}.`
        : 'Dana akan dipindahkan dari target tabungan kembali ke dompet.';
      document.getElementById('gt-wallet-label').textContent = 'Ke Dompet';
      document.getElementById('gt-submit-btn').textContent = 'Tarik Sekarang';
    }
    openModal('modal-goal-transfer');
  }

  async function handleGoalTransferSubmit(e) {
    e.preventDefault();
    const mode = document.getElementById('gt-mode').value;
    const goalId = document.getElementById('gt-goal-id').value || document.getElementById('gt-goal-select').value;
    const walletId = document.getElementById('gt-wallet').value;
    const amount = parseAmount(document.getElementById('gt-amount').value);
    const goal = state.goals.find((g) => g.id === goalId);
    const wallet = walletById(walletId);
    if (!goal || !wallet || amount <= 0) { showToast('Lengkapi nominal terlebih dahulu.'); return; }

    if (mode === 'deposit') {
      if (walletBalance(wallet) < amount) { showToast('Saldo dompet tidak cukup.'); return; }
      const catId = findSavingCategoryId('expense');
      const source = document.getElementById('gt-source').value;
      const note = `Setor ke target: ${goal.name}` + (source ? ` (dari ${source})` : '');
      await DB.saveTransaction({
        type: 'expense', amount, categoryId: catId, walletId,
        date: todayISODate(), note, goalId: goal.id
      });
      await DB.saveGoal({ id: goal.id, name: goal.name, targetAmount: goal.targetAmount, currentAmount: goal.currentAmount + amount, createdAt: goal.createdAt });
      await reloadAll();
      closeModal('modal-goal-transfer');
      closeModal('modal-goal');
      renderAll();
      showToast('Berhasil menabung ke target.');
    } else {
      if (amount > goal.currentAmount) { showToast('Nominal melebihi tabungan yang terkumpul.'); return; }
      const catId = findSavingCategoryId('income');
      await DB.saveTransaction({
        type: 'income', amount, categoryId: catId, walletId,
        date: todayISODate(), note: `Tarik dari target: ${goal.name}`, goalId: goal.id
      });
      await DB.saveGoal({ id: goal.id, name: goal.name, targetAmount: goal.targetAmount, currentAmount: goal.currentAmount - amount, createdAt: goal.createdAt });
      await reloadAll();
      closeModal('modal-goal-transfer');
      closeModal('modal-goal');
      renderAll();
      showToast('Dana berhasil ditarik ke dompet.');
    }
  }

  /* ---------------------------------------------------------
     PENGATURAN: EXPORT / IMPORT / RESET
  --------------------------------------------------------- */
  async function handleExport() {
    const payload = await DB.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bukukas-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup berhasil diunduh.');
  }

  function handleImportClick() {
    document.getElementById('import-file-input').click();
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        askConfirm('Mengimpor backup akan mengganti seluruh data saat ini. Lanjutkan?', async () => {
          await DB.importAll(payload);
          await reloadAll();
          renderAll();
          showToast('Data berhasil diimpor.');
        });
      } catch (err) {
        showToast('File backup tidak valid.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  function handleReset() {
    askConfirm('Semua dompet, transaksi, kategori, dan target akan dihapus permanen. Lanjutkan?', async () => {
      await DB.resetAll();
      await reloadAll();
      renderAll();
      showToast('Semua data telah direset.');
    });
  }

  /* ---------------------------------------------------------
     BIND EVENTS
  --------------------------------------------------------- */
  /* Animasi tekan navigasi: tiap tombol punya gerakan sendiri
     (kotak berputar, panah bertukar, tutup dompet terbuka, titik bergelombang,
     tanda + berputar). Kelas .pop dipasang saat ditekan lalu dilepas otomatis. */
  function bindNavFx() {
    document.querySelectorAll('.bottom-nav .nav-item, .bottom-nav .nav-fab').forEach((btn) => {
      btn.addEventListener('pointerdown', () => {
        btn.classList.remove('pop');
        void btn.offsetWidth; // mulai ulang animasi jika ditekan berulang
        btn.classList.add('pop');
        clearTimeout(btn._popTimer);
        btn._popTimer = setTimeout(() => btn.classList.remove('pop'), 750);
      }, { passive: true });
    });
  }

  function bindNav() {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => switchView(el.dataset.nav));
    });
  }

  function bindDashboard() {
    document.getElementById('btn-open-add-tx').addEventListener('click', () => openTxModal(null));
  }

  function bindTransaksi() {
    document.getElementById('tx-filter').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.txFilter = chip.dataset.filter;
      document.querySelectorAll('#tx-filter .chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderTransaksi();
    });
  }

  function bindTxForm() {
    document.getElementById('form-tx').addEventListener('submit', handleTxSubmit);
    document.getElementById('tx-delete-btn').addEventListener('click', requestDeleteTx);
    document.querySelectorAll('#tx-type-segmented .segment').forEach((seg) => {
      seg.addEventListener('click', () => setTxTypeSegment(seg.dataset.txType));
    });
    formatAmountInputLive(document.getElementById('tx-amount'));
  }

  function bindWallet() {
    document.getElementById('btn-add-wallet').addEventListener('click', () => openWalletModal(null));
    document.getElementById('form-wallet').addEventListener('submit', handleWalletSubmit);
    document.getElementById('wallet-delete-btn').addEventListener('click', requestDeleteWallet);
    formatAmountInputLive(document.getElementById('wallet-initial'));
  }

  function bindGoal() {
    document.getElementById('btn-add-goal').addEventListener('click', () => openGoalModal(null));
    document.getElementById('form-goal').addEventListener('submit', handleGoalSubmit);
    document.getElementById('goal-delete-btn').addEventListener('click', requestDeleteGoal);
    formatAmountInputLive(document.getElementById('goal-target'));
    formatAmountInputLive(document.getElementById('goal-current'));

    document.getElementById('btn-goal-deposit').addEventListener('click', () => {
      const goalId = document.getElementById('goal-id').value;
      if (goalId) openGoalTransferModal(goalId, 'deposit');
    });
    document.getElementById('btn-goal-withdraw').addEventListener('click', () => {
      const goalId = document.getElementById('goal-id').value;
      if (goalId) openGoalTransferModal(goalId, 'withdraw');
    });
    document.getElementById('form-goal-transfer').addEventListener('submit', handleGoalTransferSubmit);
    formatAmountInputLive(document.getElementById('gt-amount'));

    document.getElementById('btn-saving-setor-dana').addEventListener('click', () => openGoalTransferModal(null, 'deposit'));
  }

  function bindKategori() {
    document.getElementById('btn-add-category').addEventListener('click', () => openCategoryModal(null));
    document.getElementById('form-category').addEventListener('submit', handleCategorySubmit);
    document.getElementById('category-delete-btn').addEventListener('click', requestDeleteCategoryFromModal);
    document.querySelectorAll('#category-type-segmented .segment').forEach((seg) => {
      seg.addEventListener('click', () => setCategoryFormType(seg.dataset.catFormType));
    });
    document.getElementById('cat-segmented').addEventListener('click', (e) => {
      const seg = e.target.closest('.segment');
      if (!seg) return;
      state.catTypeFilter = seg.dataset.catType;
      document.querySelectorAll('#cat-segmented .segment').forEach((s) => s.classList.toggle('active', s === seg));
      renderKategori();
    });
  }

  function bindAnggaran() {
    document.getElementById('form-budget').addEventListener('submit', handleBudgetSubmit);
    document.getElementById('budget-delete-btn').addEventListener('click', requestDeleteBudget);
    formatAmountInputLive(document.getElementById('budget-amount'));
  }

  function bindPengaturan() {
    document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('settings-theme-switch').addEventListener('click', toggleTheme);
    document.getElementById('btn-export').addEventListener('click', handleExport);
    document.getElementById('btn-import').addEventListener('click', handleImportClick);
    document.getElementById('import-file-input').addEventListener('change', handleImportFile);
    document.getElementById('btn-reset').addEventListener('click', handleReset);
  }

  function bindConfirmModal() {
    document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('modal-confirm'));
    document.getElementById('confirm-ok').addEventListener('click', async () => {
      const cb = state.confirmCallback;
      state.confirmCallback = null;
      closeModal('modal-confirm');
      if (cb) await cb();
    });
  }

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  async function init() {
    initTheme();
    await DB.init();
    await reloadAll();

    bindNav();
    bindNavFx();
    bindDashboard();
    bindTransaksi();
    bindTxForm();
    bindWallet();
    bindGoal();
    bindKategori();
    bindAnggaran();
    bindAkun(); // pasang listener auth + gerbang login
    bindPengaturan();
    bindModalDismiss();
    bindConfirmModal();
    bindLockScreen();
    bindSecuritySettings();
    updateSettingsLockUI();

    // Layar awal ditentukan oleh handleAuthState (splash -> login / dashboard)

    const security = getSecurity();
    if (security.enabled) {
      startUnlockFlow();
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
