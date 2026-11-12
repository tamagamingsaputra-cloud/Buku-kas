/* Endpoint Vercel: POST /api/pin-otp  { action: 'send' } atau { action: 'verify', code }
   Header: Authorization: Bearer <Firebase ID token>
   Variabel lingkungan (Vercel -> Settings -> Environment Variables):
     FIREBASE_SERVICE_ACCOUNT  isi file JSON service account (satu baris)
     GMAIL_USER                alamat Gmail pengirim
     GMAIL_APP_PASSWORD        App Password Gmail (16 huruf)
     OTP_PEPPER                string acak panjang (rahasia)
   Lihat README-FIREBASE.md bagian "Kode OTP ke email". */
'use strict';
const { createOtpService } = require('../lib/otp-core');

let service = null;
function build() {
  const missing = ['FIREBASE_SERVICE_ACCOUNT', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'OTP_PEPPER'].filter((k) => !process.env[k]);
  if (missing.length) return { error: 'Server belum dikonfigurasi (' + missing.join(', ') + ').' };
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const col = db.collection('pinOtp'); // hanya bisa diakses server (rules klien menolak path ini)
  const nodemailer = require('nodemailer');
  const mailer = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  return {
    service: createOtpService({
      pepper: process.env.OTP_PEPPER,
      verifyIdToken: (t) => admin.auth().verifyIdToken(t),
      store: {
        get: async (uid) => { const s = await col.doc(uid).get(); return s.exists ? s.data() : null; },
        set: (uid, doc) => col.doc(uid).set(doc),
        del: (uid) => col.doc(uid).delete()
      },
      sendMail: ({ to, code }) => mailer.sendMail({
        from: '"Buku Kas" <' + process.env.GMAIL_USER + '>',
        to,
        subject: 'Kode pemulihan PIN Buku Kas: ' + code,
        text: 'Kode pemulihan PIN Buku Kas kamu: ' + code + '\n\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun.\nJika bukan kamu yang meminta, abaikan email ini.',
        html: '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e3ede8;border-radius:16px">' +
          '<h2 style="margin:0 0 8px;color:#16243B">Pemulihan PIN Buku Kas</h2>' +
          '<p style="color:#4a5b73;margin:0 0 16px">Masukkan kode ini di aplikasi:</p>' +
          '<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:0 0 16px;color:#14805C">' + code + '</p>' +
          '<p style="color:#6b7c93;font-size:13px;margin:0">Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun. Jika bukan kamu yang meminta, abaikan email ini.</p></div>'
      })
    })
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!service) service = build();
    if (service.error) return res.status(503).json({ error: service.error, code: 'not_configured' });
    const out = await service.service.handle({ method: req.method, headers: req.headers, body: req.body, host: req.headers.host });
    return res.status(out.status).json(out.body);
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  }
};
