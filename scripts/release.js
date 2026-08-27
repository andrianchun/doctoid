// Script Rilis 1-Perintah untuk Doctoid:
// Bump versi -> build -> zip OTA -> deploy hosting -> commit -> push.
//
// Penggunaan:
//   npm run release                          -> bump patch (0.1.0 -> 0.1.1)
//   npm run release minor                    -> bump minor (0.1.0 -> 0.2.0)
//   npm run release major                    -> bump major (0.1.0 -> 1.0.0)
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
  console.error(`Catatan rilis "${notes}" cuma satu kata.\nPakai: npm run release [patch|minor|major] [force] ["kalimat catatan rilis"]`);
  process.exit(1);
}

if (apk && !fs.existsSync('public/apk/doctoid-latest.apk')) {
  console.error('Jalur APK dipilih tapi public/apk/doctoid-latest.apk tidak ditemukan.\n' +
    'Pastikan APK telah disalin ke public/apk/doctoid-latest.apk sebelum merilis jalur APK.');
  process.exit(1);
}

const from = readVersion();
run(`npm version ${bump} --no-git-tag-version`);
const version = readVersion();
console.log(`\n🚀 Memulai Rilis Doctoid v${from} -> v${version}${forced ? ' [WAJIB/FORCED]' : ''}${apk ? ' [JALUR APK]' : ''}\n`);

run('npm run build:ota', {
  OTA_FORCE: forced ? '1' : '0',
  OTA_NOTES: notes || '',
  OTA_APK: apk ? '1' : '0'
});

// Bersihkan cache unggahan Firebase agar manifest & ota zip terunggah segar
if (fs.existsSync('.firebase')) {
  fs.rmSync('.firebase', { recursive: true, force: true });
}

console.log('\n📡 Mengunggah ke Firebase Hosting...');
run('firebase deploy --only hosting');

console.log('\n🌿 Menyimpan perubahan ke Git...');
run('git add -A');
run(`git commit -m "release v${version}"`);
run('git push');

console.log(`\n🎉 Doctoid v${version} LIVE & Sukses dirilis!`);
