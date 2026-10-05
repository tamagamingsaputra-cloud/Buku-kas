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
      'auth/network-request-failed': 'Gagal terhubung — periksa koneksi internet.',
      'auth/configuration-not-found': 'Firebase belum dikonfigurasi dengan benar. Lihat README-FIREBASE.md.'
    };
    return map[code] || (err && err.message) || 'Terjadi kesalahan, coba lagi.';
  }

  const CloudSync = {
    isReady: ready,

    currentUser: function () {
      if (!ready()) return null;
      return firebase.auth().currentUser;
    },

    onAuthChange: function (callback) {
      if (!ready()) return;
      firebase.auth().onAuthStateChanged(callback);
    },

    register: async function (username, email, password) {
      if (!ready()) throw new Error('Firebase belum dikonfigurasi. Lihat README-FIREBASE.md.');
      try {
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        if (username) {
          await cred.user.updateProfile({ displayName: username });
        }
        await firebase.firestore().collection('users').doc(cred.user.uid).set({
          username: username || '',
          email: email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return cred.user;
      } catch (err) {
        throw new Error(friendlyAuthError(err));
      }
    },

    login: async function (email, password) {
      if (!ready()) throw new Error('Firebase belum dikonfigurasi. Lihat README-FIREBASE.md.');
      try {
        const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
        return cred.user;
      } catch (err) {
        throw new Error(friendlyAuthError(err));
      }
    },

    loginWithGoogle: async function () {
      if (!ready()) throw new Error('Firebase belum dikonfigurasi. Lihat README-FIREBASE.md.');
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const cred = await firebase.auth().signInWithPopup(provider);
        await firebase.firestore().collection('users').doc(cred.user.uid).set({
          username: cred.user.displayName || '',
          email: cred.user.email || '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return cred.user;
      } catch (err) {
        throw new Error(friendlyAuthError(err));
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
