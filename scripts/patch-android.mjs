// Dijalankan setelah `npx cap add android`: menyesuaikan proyek Android hasil generate.
// Aman dijalankan berulang (idempoten).
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'android';
const main = path.join(root, 'app/src/main');
const res = path.join(main, 'res');
const must = (p) => { if (!fs.existsSync(p)) { console.error('Tidak ditemukan:', p); process.exit(1); } };
must(main);

/* 1) Splash bawaan Android: polos (tanpa ikon Capacitor) lalu langsung animasi dompet milik aplikasi */
fs.writeFileSync(path.join(res, 'values/bk_colors.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="bk_splash_bg">#EAF9F2</color>\n</resources>\n');
fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
fs.writeFileSync(path.join(res, 'drawable/bk_splash_empty.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n    <solid android:color="#00000000" />\n    <size android:width="1dp" android:height="1dp" />\n</shape>\n');
const stylesP = path.join(res, 'values/styles.xml');
let styles = fs.readFileSync(stylesP, 'utf8');
const launch = `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/bk_splash_bg</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/bk_splash_empty</item>
        <item name="windowSplashScreenAnimationDuration">0</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:background">@color/bk_splash_bg</item>
    </style>`;
if (!/AppTheme\.NoActionBarLaunch/.test(styles)) { console.error('styles.xml tidak berisi tema Launch'); process.exit(1); }
styles = styles.replace(/<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/, launch);
fs.writeFileSync(stylesP, styles);

/* 2) Ikon kecil notifikasi (siluet putih) */
fs.writeFileSync(path.join(res, 'drawable/ic_stat_bk.xml'),
`<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M4,6.5C4,5.12 5.12,4 6.5,4H17.5C18.88,4 20,5.12 20,6.5V8H6.5C6.22,8 6,7.78 6,7.5C6,7.22 5.78,7 5.5,7H4V6.5ZM4,9H19.5C20.33,9 21,9.67 21,10.5V17.5C21,18.88 19.88,20 18.5,20H6.5C5.12,20 4,18.88 4,17.5V9ZM15.5,13.5C14.67,13.5 14,14.17 14,15C14,15.83 14.67,16.5 15.5,16.5C16.33,16.5 17,15.83 17,15C17,14.17 16.33,13.5 15.5,13.5Z"/>
</vector>
`);

/* 3) Izin di manifest */
const manP = path.join(main, 'AndroidManifest.xml');
let man = fs.readFileSync(manP, 'utf8');
const perms = ['CAMERA', 'POST_NOTIFICATIONS', 'VIBRATE', 'RECEIVE_BOOT_COMPLETED', 'USE_EXACT_ALARM'];
for (const p of perms) {
  const tag = `<uses-permission android:name="android.permission.${p}" />`;
  if (!man.includes(`android.permission.${p}"`)) man = man.replace('</manifest>', `    ${tag}\n</manifest>`);
}
if (!man.includes('android.hardware.camera')) man = man.replace('</manifest>', '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
fs.writeFileSync(manP, man);
console.log('patch-android: selesai');
