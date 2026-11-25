/* ============================================================
   native.js — jembatan ke plugin Capacitor (hanya aktif di APK).
   Semua akses plugin lewat BKNative.plugin(nama) supaya satu pintu
   dan aman bila inti Capacitor tidak ada (browser biasa).
   ============================================================ */
(function () {
  'use strict';
  const cap = () => window.Capacitor;
  const BKNative = {
    isNative() {
      const c = cap();
      try { return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()); } catch (e) { return false; }
    },
    ready() { const c = cap(); return !!(c && typeof c.registerPlugin === 'function'); },
    plugin(name) {
      const c = cap();
      if (!c || typeof c.registerPlugin !== 'function') throw new Error('Inti Capacitor belum dimuat');
      return c.registerPlugin(name);
    },
    /** true jika izin berstatus 'granted' (nilai bisa string atau objek per-kunci) */
    granted(res, key) {
      if (!res) return false;
      const v = key ? res[key] : null;
      if (typeof v === 'string') return v === 'granted' || v === 'limited';
      return Object.values(res).some((x) => x === 'granted');
    }
  };
  /** Foto dari kamera (plugin @capacitor/camera) -> File JPEG */
  BKNative.takePhoto = async function () {
    const Cam = BKNative.plugin('Camera');
    let p = await Cam.checkPermissions();
    if (!p || p.camera !== 'granted') p = await Cam.requestPermissions({ permissions: ['camera'] });
    if (!p || p.camera !== 'granted') throw new Error('izin kamera ditolak');
    const ph = await Cam.getPhoto({ quality: 85, resultType: 'base64', source: 'CAMERA', direction: 'REAR', correctOrientation: true, width: 1800, saveToGallery: false });
    const bin = atob(ph.base64String);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], 'foto-' + Date.now() + '.jpg', { type: 'image/' + (ph.format || 'jpeg') });
  };
  /** Biometrik (sidik jari / wajah). Mengembalikan {ok, type} ; hanya di APK. */
  BKNative.biometry = async function () {
    try {
      const r = await BKNative.plugin('BiometricAuthNative').checkBiometry();
      return { ok: !!(r && r.isAvailable), type: r && r.biometryType, reason: (r && r.reason) || '' };
    } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
  };
  /** true jika berhasil; melempar Error dengan .code jika gagal/dibatalkan. */
  BKNative.biometricAuth = async function (reason) {
    try {
      await BKNative.plugin('BiometricAuthNative').internalAuthenticate({
        reason: reason || 'Buka Buku Kas', cancelTitle: 'Pakai PIN', allowDeviceCredential: false,
        androidTitle: 'Buku Kas', androidSubtitle: reason || 'Buka Buku Kas', androidConfirmationRequired: false
      });
      return true;
    } catch (e) { const err = new Error(String(e && e.message || 'gagal')); err.code = e && e.code; throw err; }
  };
  window.BKNative = BKNative;
})();
