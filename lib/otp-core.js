/* ============================================================
   otp-core.js — Logika kode OTP 6 digit untuk pemulihan PIN (jalan di SERVER)
   Dipisah dari api/pin-otp.js supaya bisa diuji tanpa Firebase/SMTP asli.
   Aturan:
   - Penerima = email di token Firebase pengguna (bukan dari input klien).
   - Kode 6 digit acak (crypto), berlaku 10 menit, hanya disimpan sebagai HMAC.
   - Kirim: maks 3 kali / 15 menit, jeda 60 detik. Cek: maks 5 salah lalu kode hangus.
   - Kode sekali pakai (dihapus setelah benar).
   ============================================================ */
'use strict';
const crypto = require('crypto');

const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS = 3;
const MAX_TRIES = 5;

function hmac(pepper, uid, code) {
  return crypto.createHmac('sha256', pepper).update(uid + ':' + code).digest('hex');
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * deps: { verifyIdToken(token)->claims, store:{get(uid),set(uid,doc),del(uid)}, sendMail({to,code}), pepper, now()?, randomCode()? }
 * Mengembalikan { status, body }.
 */
function createOtpService(deps) {
  const now = deps.now || (() => Date.now());
  const randomCode = deps.randomCode || (() => String(crypto.randomInt(0, 1000000)).padStart(6, '0'));

  async function authenticate(token) {
    if (!token) return null;
    try {
      const c = await deps.verifyIdToken(token);
      if (!c || !c.uid || !c.email || c.email_verified !== true) return null;
      return c;
    } catch (e) { return null; }
  }

  async function send(claims) {
    const t = now();
    const doc = (await deps.store.get(claims.uid)) || {};
    const sends = (doc.sends || []).filter((s) => t - s < WINDOW_MS);
    if (sends.length && t - sends[sends.length - 1] < COOLDOWN_MS) {
      return { status: 429, body: { error: 'Tunggu sebentar sebelum meminta kode lagi.' } };
    }
    if (sends.length >= MAX_SENDS) {
      return { status: 429, body: { error: 'Terlalu banyak permintaan kode. Coba lagi sekitar 15 menit lagi.' } };
    }
    const code = randomCode();
    await deps.store.set(claims.uid, { hash: hmac(deps.pepper, claims.uid, code), exp: t + TTL_MS, tries: 0, sends: sends.concat([t]) });
    try {
      await deps.sendMail({ to: claims.email, code });
    } catch (e) {
      await deps.store.set(claims.uid, { sends, hash: null, exp: 0, tries: 0 });
      return { status: 502, body: { error: 'Email gagal dikirim. Coba lagi sebentar lagi.' } };
    }
    return { status: 200, body: { ok: true, ttl: TTL_MS / 1000 } };
  }

  async function verify(claims, code) {
    if (!/^\d{6}$/.test(String(code || ''))) return { status: 400, body: { error: 'Kode harus 6 digit angka.' } };
    const t = now();
    const doc = await deps.store.get(claims.uid);
    if (!doc || !doc.hash || t > doc.exp) return { status: 400, body: { error: 'Kode kedaluwarsa atau belum diminta. Kirim kode baru.' } };
    if (doc.tries >= MAX_TRIES) return { status: 429, body: { error: 'Terlalu banyak salah. Kirim kode baru.' } };
    if (!safeEqual(hmac(deps.pepper, claims.uid, code), doc.hash)) {
      const tries = doc.tries + 1;
      await deps.store.set(claims.uid, Object.assign({}, doc, { tries, hash: tries >= MAX_TRIES ? null : doc.hash }));
      return { status: 400, body: { error: tries >= MAX_TRIES ? 'Terlalu banyak salah. Kirim kode baru.' : 'Kode salah. Sisa percobaan: ' + (MAX_TRIES - tries) + '.' } };
    }
    await deps.store.set(claims.uid, { hash: null, exp: 0, tries: 0, sends: doc.sends || [] });
    return { status: 200, body: { ok: true } };
  }

  /** req: { method, headers, body, host } */
  async function handle(req) {
    if (req.method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } };
    const origin = req.headers.origin;
    if (origin) {
      let oh = ''; try { oh = new URL(origin).host; } catch (e) { /* kosong */ }
      if (oh !== req.host) return { status: 403, body: { error: 'Asal permintaan ditolak.' } };
    }
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const claims = await authenticate(m && m[1]);
    if (!claims) return { status: 401, body: { error: 'Sesi akun tidak valid. Masuk ulang ke akunmu.' } };
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.action === 'send') return send(claims);
    if (body.action === 'verify') return verify(claims, body.code);
    return { status: 400, body: { error: 'Permintaan tidak dikenal.' } };
  }

  return { handle };
}

module.exports = { createOtpService, TTL_MS, MAX_TRIES };
