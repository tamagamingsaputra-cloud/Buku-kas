// Menyalin Firebase SDK, font Inter, dan mesin OCR ke www/vendor agar APK jalan tanpa CDN.
import fs from 'node:fs';
import path from 'node:path';

const nm = 'node_modules';
const out = 'www/vendor';
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

for (const f of ['app', 'auth', 'firestore']) {
  cp(`${nm}/firebase/firebase-${f}-compat.js`, `${out}/firebase/firebase-${f}-compat.js`);
}

let css = '';
for (const w of [400, 500, 600, 700, 800]) {
  const file = `inter-latin-${w}-normal.woff2`;
  cp(`${nm}/@fontsource/inter/files/${file}`, `${out}/fonts/${file}`);
  css += `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;src:url(${file}) format('woff2');}\n`;
}
fs.writeFileSync(`${out}/fonts/inter.css`, css);

cp(`${nm}/tesseract.js/dist/tesseract.min.js`, `${out}/ocr/tesseract.min.js`);
cp(`${nm}/tesseract.js/dist/worker.min.js`, `${out}/ocr/worker.min.js`);
for (const f of fs.readdirSync(`${nm}/tesseract.js-core`).filter((n) => n.endsWith('.wasm.js'))) {
  cp(`${nm}/tesseract.js-core/${f}`, `${out}/ocr/core/${f}`);
}
for (const l of ['ind', 'eng']) {
  cp(`${nm}/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `${out}/ocr/lang/${l}.traineddata.gz`);
}
// pdf.js (build legacy, UMD) untuk impor mutasi PDF secara offline
cp(`${nm}/pdfjs-dist/legacy/build/pdf.min.js`, `${out}/pdfjs/pdf.min.js`);
cp(`${nm}/pdfjs-dist/legacy/build/pdf.worker.min.js`, `${out}/pdfjs/pdf.worker.min.js`);
console.log('vendor siap');

// Pustaka ekspor (dimuat hanya saat dipakai)
cp(`${nm}/xlsx/dist/xlsx.full.min.js`, `${out}/xlsx.full.min.js`);
cp(`${nm}/jspdf/dist/jspdf.umd.min.js`, `${out}/jspdf.umd.min.js`);
cp(`${nm}/jspdf-autotable/dist/jspdf.plugin.autotable.min.js`, `${out}/jspdf.plugin.autotable.min.js`);

// Inti Capacitor (menyediakan window.Capacitor.registerPlugin) — harus dimuat sebelum skrip aplikasi
cp(`${nm}/@capacitor/core/dist/capacitor.js`, `${out}/capacitor.js`);
