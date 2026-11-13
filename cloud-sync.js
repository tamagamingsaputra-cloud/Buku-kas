/* ============================================================
   cloud-sync.js — Akun & Sinkronisasi Cloud (OPSIONAL)
   Dibangun di atas Firebase Authentication + Firestore.
   Tidak aktif sama sekali jika firebase-config.js belum diisi —
   aplikasi tetap berjalan normal 100% offline tanpa file ini.

   Cadangan cloud memakai DB.exportAll() / DB.importAll() yang
   sudah ada (sama seperti fitur Export/Import JSON lokal), supaya
   tidak perlu mengubah cara kerja database IndexedDB sama sekali.
   ============================================================ */

(function () {
  'use strict';

  function ready() {
    return window.BUKUKAS_FIREBASE_READY === true && typeof firebase !== 'undefined';
  }

  function friendlyAuthError(err) {
    const code = err && err.code ? err.code : '';
    const map = {
      'auth/email-already-in-use': 'Email ini sudah terdaftar. Coba menu Masuk.',
      'auth/invalid-email': 'Format email tidak valid.',
      'auth/weak-password': 'Password terlalu lemah, minimal 6 karakter.',
      'auth/user-not-found': 'Akun dengan email ini tidak ditemukan.',
      'auth/wrong-password': 'Password salah.',
      'auth/invalid-credential': 'Email atau password salah.',
      'auth/popup-closed-by-user': 'Login Google dibatalkan.',
      'auth/password-does-not-meet-requirements': 'Password belum memenuhi syarat keamanan. Pakai minimal 8 karakter dengan huruf dan angka.',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
      'auth/popup-blocked': 'Popup diblokir browser. Izinkan popup lalu coba lagi.',
      'auth/requires-recent-login': 'Verifikasi ulang diperlukan, coba lagi.',
      'auth/operation-not-allowed': 'Metode ini belum diaktifkan di Firebase (Email link). Lihat README-FIREBASE.md.',
      'auth/unauthorized-continue-uri': 'Domain website belum didaftarkan di Firebase (Authorized domains).',
      'auth/invalid-action-code': 'Tautan sudah kedaluwarsa atau sudah dipakai. Kirim ulang tautan.',
      'auth/network-request-failed': 'Gagal terhubung — periksa koneksi internet.',
      'auth/configuration-not-found': 'Firebase belum dikonfigurasi dengan benar. Lihat README-FIREBASE.md.'
    };
    return map[code] || (err && err.message) || 'Terjadi kesalahan, coba lagi.';
  }

  /* Login Google DI DALAM halaman (Google Identity Services): pemilih akun muncul
     sebagai panel/bottom-sheet tanpa berpindah tab. Butuh BUKUKAS_GOOGLE_CLIENT_ID
     di firebase-config.js. Jika tidak tersedia/ditolak, otomatis pakai popup biasa. */
  function gisAvailable() {
    return !!(window.BUKUKAS_GOOGLE_CLIENT_ID && window.google && google.accounts && google.accounts.id);
  }

  function googleCredentialPrompt() {
    return new Promise((resolve, reject) => {
      let settled = false, displayed = false;
      const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };
      try {
        google.accounts.id.initialize({
          client_id: window.BUKUKAS_GOOGLE_CLIENT_ID,
          callback: (r) => done(resolve, r.credential),
          auto_select: false,
          cancel_on_tap_outside: false,
          use_fedcm_for_prompt: true
        });
        google.accounts.id.prompt((n) => {
          if (n.isDisplayMoment && n.isDisplayMoment()) {
            if (n.isDisplayed && n.isDisplayed()) displayed = true; else done(reject, { fallback: true });
          } else if (n.isSkippedMoment && n.isSkippedMoment()) {
            done(reject, { fallback: true });
          } else if (n.isDismissedMoment && n.isDismissedMoment()) {
            if (n.getDismissedReason && n.getDismissedReason() !== 'credential_returned') done(reject, { cancelled: true });
          }
        });
        // jaga-jaga: jika panel tidak pernah tampil, jangan menggantung
        setTimeout(() => { if (!displayed) done(reject, { fallback: true }); }, 3500);
      } catch (e) {
        done(reject, { fallback: true });
      }
    });
  }

  /* ---------- Validasi & verifikasi (sisi aplikasi) ----------
     PENTING: pemeriksaan di browser bisa dilewati siapa pun yang mengutak-atik
     kode. Penjaga sebenarnya adalah verifikasi email (Firebase) dan Firestore
     Rules yang mewajibkan email_verified. Lihat README-FIREBASE.md. */
  const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'emailondeck.com', 'mailnesia.com', 'tempail.com'];
  const TYPOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com' };
  const COMMON_PW = ['12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', '11111111', 'abc12345', 'abcd1234', 'iloveyou1', 'admin123', 'welcome1', 'letmein1', 'bukukas1', 'bukukas123'];

  function validateEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 254) throw new Error('Format email tidak valid.');
    const [local, domain] = e.split('@');
    if (TYPOS[domain]) throw new Error('Mungkin salah ketik. Maksudmu ' + local + '@' + TYPOS[domain] + '?');
    if (DISPOSABLE.includes(domain)) throw new Error('Email sementara tidak diperbolehkan. Pakai email aslimu.');
    return e;
  }

  function validatePassword(pw, email, username) {
    const p = String(pw || '');
    if (p.length < 8) throw new Error('Password minimal 8 karakter.');
    if (p.length > 128) throw new Error('Password terlalu panjang (maksimal 128 karakter).');
    if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw new Error('Password harus berisi huruf dan angka.');
    const low = p.toLowerCase();
    if (COMMON_PW.includes(low) || low.includes('password') || /^(.)\1+$/.test(p)) throw new Error('Password terlalu mudah ditebak. Pakai kombinasi yang unik.');
    const local = String(email || '').split('@')[0].toLowerCase();
    if (local.length >= 4 && low.includes(local)) throw new Error('Password tidak boleh memuat bagian dari emailmu.');
    const uname = String(username || '').trim().toLowerCase();
    if (uname.length >= 3 && low.includes(uname)) throw new Error('Password tidak boleh memuat username-mu.');
    return true;
  }

  /* Akun email/password baru dianggap sah hanya setelah emailnya diverifikasi. */
  function isVerified(u) {
    if (!u) return false;
    const ids = (u.providerData || []).map((p) => p.providerId);
    if (ids.includes('password') && !ids.includes('google.com')) return !!u.emailVerified;
    return true;
  }

  async function sendVerification(user) {
    const opts = { url: location.origin + location.pathname };
    try { await user.sendEmailVerification(opts); }
    catch (e) {
      if (e && e.code === 'auth/unauthorized-continue-uri') await user.sendEmailVerification();
      else throw e;
    }
  }

  const CloudSync = {
    isReady: ready,

    validateEmail: validateEmail,
    validatePassword: validatePassword,

    currentUser: function () {
      if (!ready()) return null;
      const u = firebase.auth().currentUser;
      return isVerified(u) ? u : null;
    },

    /* Pengguna yang belum verifikasi email dianggap belum masuk; callback hanya
       dipanggil saat status masuk/keluar benar-benar berubah. */
    onAuthChange: function (callback) {
      if (!ready()) return;
      let last;
      firebase.auth().onAuthStateChanged((u) => {
        const eff = isVerified(u) ? u : null;
        const key = eff ? eff.uid : null;
        if (key === last) return;
        last = key;
        callback(eff);
      });
    },

    register: async function (username, email, password) {
      if (!ready()) throw new Error('Firebase belum dikonfigurasi. Lihat README-FIREBASE.md.');
      const mail = validateEmail(email);
      validatePassword(password, mail, username);
      let cred;
      try {
        cred = await firebase.auth().createUserWithEmailAndPassword(mail, password);
      } catch (err) {
        throw new Error(friendlyAuthError(err));
      }
      let sendFailed = false;
      try {
        if (username) await cred.user.updateProfile({ displayName: username });
        await sendVerification(cred.user);
      } catch (e) {
        sendFailed = true;
      }
      await firebase.auth().signOut();   // belum boleh masuk sebelum email diverifikasi
      if (sendFailed) throw new Error('Akun dibuat, tetapi tautan verifikasi gagal dikirim. Coba menu Masuk untuk mengirim ulang.');
      return { verifyEmail: mail };
    },

    login: async function (email, password) {
      if (!ready()) throw new Error('Firebase belum dikonfigurasi. Lihat README-FIREBASE.md.');
      const mail = String(email || '').trim().toLowerCase();
      let cred;
      try {
        cred = await firebase.auth().signInWithEmailAndPassword(mail, password);
      } catch (err) {
        throw new Error(friendlyAuthError(err));
      }
      if (!isVerified(cred.user)) {
        let sent = true;
        try { await sendVerification(cred.user); } catch (e) { sent = false; }
        await firebase.auth().signOut();
        throw new Error(sent
          ? 'Email belum diverifikasi. Kami kirim ulang tautan ke ' + mail + '. Buka emailnya (cek juga Spam), ketuk tautannya, lalu masuk lagi.'
          : 'Email belum diverifikasi. Cek emailmu (termasuk Spam) dan ketuk tautan verifikasinya, lalu masuk lagi.');
      }
      return cred.user;
    },

    loginWithGoogle: async function () {
      if (!ready()) throw new Error('Firebase belum dikonfigurasi. Lihat README-FIREBASE.md.');
      try {
        let user = null;
        if (gisAvailable()) {
          try {
            const idToken = await googleCredentialPrompt();
            const cred = await firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(idToken));
            user = cred.user;
          } catch (e) {
            if (e && e.cancelled) throw new Error('Login Google dibatalkan.');
            if (e && e.code) throw e;   // error Firebase asli (bukan sekadar panel tak tampil)
            // selain itu: lanjut ke popup
          }
        }
        if (!user) {
          const provider = new firebase.auth.GoogleAuthProvider();
          const cred = await firebase.auth().signInWithPopup(provider);
          user = cred.user;
        }
        await firebase.firestore().collection('users').doc(user.uid).set({
          email: user.email || '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return user;
      } catch (err) {
        throw new Error(err && err.code ? friendlyAuthError(err) : (err && err.message) || 'Terjadi kesalahan, coba lagi.');
      }
    },

    /** Simpan username ke profil Auth + Firestore supaya ikut ke perangkat lain. */
    setUsername: async function (name) {
      if (!ready()) return;
      const user = firebase.auth().currentUser;
      if (!user) return;
      await user.updateProfile({ displayName: name });
      await firebase.firestore().collection('users').doc(user.uid).set({
        username: name,
        usernameSet: true
      }, { merge: true });
    },

    /** Ambil username yang pernah disimpan pengguna (null jika belum pernah). */
    getUsername: async function () {
      if (!ready()) return null;
      const user = firebase.auth().currentUser;
      if (!user) return null;
      const doc = await firebase.firestore().collection('users').doc(user.uid).get();
      const data = doc.exists ? doc.data() : null;
      return data && data.usernameSet && data.username ? data.username : null;
    },

    /** Cara verifikasi ulang yang tersedia untuk akun yang sedang masuk: 'google' | 'password' | 'none' */
    authMethod: function () {
      if (!ready()) return 'none';
      const u = firebase.auth().currentUser;
      if (!u) return 'none';
      const ids = (u.providerData || []).map((p) => p.providerId);
      if (ids.includes('google.com')) return 'google';
      if (ids.includes('password')) return 'password';
      return 'none';
    },

    /** Verifikasi ulang pemilik akun (untuk pemulihan PIN). password hanya untuk akun email. */
    reauth: async function (password) {
      if (!ready()) throw new Error('Fitur akun belum aktif di versi ini.');
      const u = firebase.auth().currentUser;
      if (!u) throw new Error('Belum ada akun yang masuk di perangkat ini.');
      const ids = (u.providerData || []).map((p) => p.providerId);
      try {
        if (ids.includes('password') && password) {
          await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, password));
        } else if (ids.includes('google.com')) {
          await u.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
        } else {
          throw new Error('Masukkan password akunmu.');
        }
        return true;
      } catch (err) {
        throw new Error(err && err.code ? friendlyAuthError(err) : (err && err.message) || 'Verifikasi gagal.');
      }
    },

    logout: async function () {
      if (!ready()) return;
      await firebase.auth().signOut();
    },

    /** Kirim seluruh data lokal (dompet, transaksi, kategori, target, anggaran) ke cloud. */
    pushData: async function () {
      if (!ready()) throw new Error('Firebase belum dikonfigurasi.');
      const user = firebase.auth().currentUser;
      if (!user) throw new Error('Kamu belum masuk.');
      const snapshot = await DB.exportAll();
      await firebase.firestore().collection('users').doc(user.uid).set({
        backup: snapshot,
        backupUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    },

    /** Tarik data dari cloud dan timpa data lokal di perangkat ini. */
    pullData: async function () {
      if (!ready()) throw new Error('Firebase belum dikonfigurasi.');
      const user = firebase.auth().currentUser;
      if (!user) throw new Error('Kamu belum masuk.');
      const doc = await firebase.firestore().collection('users').doc(user.uid).get();
      if (!doc.exists || !doc.data().backup) {
        throw new Error('Belum ada cadangan di cloud untuk akun ini.');
      }
      await DB.importAll(doc.data().backup);
      return true;
    }
  };

  window.CloudSync = CloudSync;
})();
