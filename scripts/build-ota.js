import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';
import { buildManifest, zipNameFor } from './otaManifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, '../dist');
const otaPath = path.resolve(__dirname, '../dist/ota');
const archivePath = path.resolve(__dirname, '../.ota-archive');
const KEEP = 3;

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
const version = pkg.version;
const zipName = zipNameFor(version);
const outputPath = path.join(otaPath, zipName);

console.log(`\n📦 Membangun OTA ZIP: ${zipName} (v${version})`);

if (!fs.existsSync(distPath)) {
  console.error('❌ Folder dist/ tidak ditemukan! Jalankan build terlebih dahulu.');
  process.exit(1);
}

if (!fs.existsSync(otaPath)) {
  fs.mkdirSync(otaPath, { recursive: true });
}

const output = fs.createWriteStream(outputPath);
const archive = new ZipArchive({
  zlib: { level: 9 }
});

output.on('close', function() {
  console.log(`✓ Zip bundle selesai: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);

  // Simpan ke arsip, pertahankan KEEP versi terakhir di dist/ota
  fs.mkdirSync(archivePath, { recursive: true });
  fs.copyFileSync(outputPath, path.join(archivePath, zipName));

  const kept = fs.readdirSync(archivePath)
    .filter(f => f.endsWith('.zip'))
    .sort((a, b) => fs.statSync(path.join(archivePath, b)).mtimeMs - fs.statSync(path.join(archivePath, a)).mtimeMs);

  kept.slice(KEEP).forEach(f => fs.rmSync(path.join(archivePath, f)));
  kept.slice(0, KEEP).forEach(f => fs.copyFileSync(path.join(archivePath, f), path.join(otaPath, f)));

  const apk = process.env.OTA_APK === '1';
  const forced = process.env.OTA_FORCE === '1';
  const notes = process.env.OTA_NOTES || '';

  const manifest = buildManifest(version, { apk, forced, notes });
  fs.writeFileSync(path.join(otaPath, 'version.json'), JSON.stringify(manifest, null, 2));

  console.log(`✓ version.json dibuat (v${version})${apk ? ' [jalur APK]' : ''}${forced ? ' [FORCED]' : ''}`);
  console.log(`✓ Arsip aktif di hosting: ${kept.slice(0, KEEP).join(', ')}\n`);
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// Abaikan file OTA/APK, SW, dan manifest di dalam bundle zip native
archive.glob('**/*', {
  cwd: distPath,
  ignore: ['ota/**', 'apk/**', 'sw.js', 'workbox-*.js', 'registerSW.js', 'manifest.webmanifest']
});

archive.finalize();
