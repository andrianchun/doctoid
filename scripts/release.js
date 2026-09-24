// Script Rilis 1-Perintah untuk Doctoid:
// Bump versi -> build -> zip OTA -> deploy hosting -> verifikasi ganda -> commit -> push.
// Mengadopsi standar rilis otomatis teruji dari logym, lomeal, dan darka.
//
//   npm run release                          -> bump patch (0.1.15 -> 0.1.16)
//   npm run release minor                    -> bump minor (0.1.15 -> 0.2.0)
//   npm run release major                    -> bump major (0.1.15 -> 1.0.0)
//   npm run release force "Perbaikan kritis" -> update WAJIB (modal memblokir di app)
//   npm run release apk "Versi APK baru"     -> update jalur APK di hosting
//
import { execSync } from 'child_process';
import fs from 'fs';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const readVersion = () => JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

const BUMPS = ['patch', 'minor', 'major'];
const args = process.argv.slice(2);
const forced = args.includes('force');
const apk = args.includes('apk');
const bump = args.find(a => BUMPS.includes(a)) || 'patch';

const rest = args.filter(a => a !== 'force' && a !== 'apk' && !BUMPS.includes(a));
if (rest.length > 1) {
  console.error(`Catatan rilis harus satu argumen (pakai tanda kutip): ${rest.join(' | ')}`);
  process.exit(1);
}
const notes = rest[0];
if (notes && !/\s/.test(notes)) {
  console.error(`Catatan rilis "${notes}" cuma satu kata — gunakan kalimat lengkap.\nPakai: npm run release [patch|minor|major] [force] [apk] ["kalimat catatan rilis"]`);
  process.exit(1);
}

// Pastikan public/apk ada dan salin APK rilis jika tersedia di build lokal
if (!fs.existsSync('public/apk')) {
  fs.mkdirSync('public/apk', { recursive: true });
}
if (fs.existsSync('android/app/build/outputs/apk/release/app-release.apk')) {
  fs.copyFileSync('android/app/build/outputs/apk/release/app-release.apk', 'public/apk/doctoid-latest.apk');
}

if (apk && !fs.existsSync('public/apk/doctoid-latest.apk')) {
  console.error('Jalur APK dipilih tapi public/apk/doctoid-latest.apk tidak ada.\n' +
    'Build dulu APK-nya lalu salin:\n' +
    '  cp android/app/build/outputs/apk/release/app-release.apk public/apk/doctoid-latest.apk');
  process.exit(1);
}

const from = readVersion();
run(`npm version ${bump} --no-git-tag-version`);
const version = readVersion();
console.log(`\n🚀 Memulai Rilis Doctoid v${from} -> v${version}${forced ? '  [WAJIB / FORCED]' : ''}${apk ? '  [JALUR APK]' : ''}\n`);

run('npm run build:ota', {
  OTA_FORCE: forced ? '1' : '0',
  OTA_NOTES: notes || '',
  OTA_APK: apk ? '1' : '0'
});

const deployHosting = () => {
  // Bersihkan cache unggahan Firebase agar manifest & ota zip terunggah segar (standar logym/lomeal/darka)
  fs.rmSync('.firebase', { recursive: true, force: true });
  run('npx firebase deploy --only hosting,firestore:rules');
};

/**
 * Verifikasi hasil deploy langsung ke server hosting (diadopsi dari logym, lomeal, darka).
 * Mencegah file /ota/ hilang akibat rewrite SPA atau cache Firebase.
 */
const BASE = 'https://docto-id.web.app/ota';
const zipName = (v) => `update_${v.replace(/\./g, '')}.zip`;

const verifyDeploy = async (v) => {
  const problems = [];
  const localZipPath = `dist/ota/${zipName(v)}`;
  const localZipSize = fs.existsSync(localZipPath) ? fs.statSync(localZipPath).size : 0;

  try {
    const versionRes = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    const versionType = versionRes.headers.get('content-type') || '';
    if (!versionType.includes('application/json')) {
      problems.push(`version.json balik ${versionType || 'tanpa content-type'} (harusnya application/json) — folder /ota/ tidak sampai ke hosting`);
    } else {
      const data = await versionRes.json();
      if (data.ota_version !== v) {
        problems.push(`version.json masih v${data.ota_version}, harusnya v${v}`);
      }
    }

    if (versionRes.headers.get('access-control-allow-origin') !== '*') {
      problems.push('version.json tidak punya header Access-Control-Allow-Origin: * — WebView APK bakal terblokir CORS');
    }

    const zipRes = await fetch(`${BASE}/${zipName(v)}?t=${Date.now()}`, { cache: 'no-store' });
    const zipType = zipRes.headers.get('content-type') || '';
    const zipSize = (await zipRes.arrayBuffer()).byteLength;
    if (!zipType.includes('zip') && !zipType.includes('octet-stream')) {
      problems.push(`${zipName(v)} balik ${zipType || 'tanpa content-type'} (harusnya zip)`);
    } else if (localZipSize > 0 && zipSize !== localZipSize) {
      problems.push(`${zipName(v)} di hosting ${zipSize} byte, lokal ${localZipSize} byte`);
    }

    if (apk) {
      const apkRes = await fetch(`https://docto-id.web.app/apk/doctoid-latest.apk?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
      const apkType = apkRes.headers.get('content-type') || '';
      if (!apkType.includes('package-archive') && !apkType.includes('octet-stream')) {
        problems.push(`doctoid-latest.apk balik ${apkType || 'tanpa content-type'} (harusnya application/vnd.android.package-archive)`);
      }
    }
  } catch (err) {
    problems.push(`Gagal menghubungi server hosting: ${err.message}`);
  }

  return problems;
};

const JEDA_CEK_ULANG_MS = 20_000;
const jeda = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const periksaDuaKali = async () => {
  const pertama = await verifyDeploy(version);
  if (pertama.length) return pertama;
  console.log(`\n✓ Cek pertama lolos. Memverifikasi ulang dalam ${JEDA_CEK_ULANG_MS / 1000} detik (memastikan tidak terkena rewrite SPA)...`);
  await jeda(JEDA_CEK_ULANG_MS);
  return verifyDeploy(version);
};

console.log('\n📡 Mengunggah ke Firebase Hosting & Firestore Rules...');
deployHosting();

console.log('\n🔍 Menjalankan verifikasi deploy otomatis ke hosting...');
let problems = await periksaDuaKali();
if (problems.length) {
  console.warn(`\n⚠️ Hasil deploy bermasalah:\n${problems.map((p) => `  - ${p}`).join('\n')}\n\nDeploy ulang sekali...\n`);
  deployHosting();
  problems = await periksaDuaKali();
}

if (problems.length) {
  console.error(`\n❌ RILIS GAGAL — Berkas OTA tidak valid di hosting:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  console.error(`\nVersi sudah di-bump ke v${version} tetapi BELUM di-commit ke Git. Periksa konfigurasi hosting lalu jalankan:`);
  console.error('  npx firebase deploy --only hosting');
  process.exit(1);
}

console.log(`\n✓ OTA terverifikasi di hosting: version.json v${version} + zip valid\n`);

console.log('🌿 Menyimpan perubahan ke Git...');
run('git add -A');
run(`git commit -m "release v${version}"`);
run('git push');

console.log(`\n🎉 Doctoid v${version} LIVE! Web/PWA dapat pembaruan dan APK menerima paket OTA.`);
