# Doctoid App Release Protocol (`release.md`)

> Dokumen panduan rilis resmi lengkap ada di [releaseprotocol.md](./releaseprotocol.md).

---

## Ringkasan Perintah Rilis Cepat

### 1. Jalur A — Rilis OTA / Web (Default & Rutin)
Digunakan untuk perubahan React, TypeScript, CSS, UI, DB lokal, dan logic:
```bash
# Rilis patch santai
npm run release "Catatan rilis singkat"

# Rilis wajib (Forced Update - jika ada perbaikan bug/keamanan kritis)
npm run release force "Perbaikan bug kritis"

# Menaikkan minor / major
npm run release minor "Fitur baru"
npm run release major "Peluncuran v2.0"
```

### 2. Jalur B — Rilis APK (Hanya Jika Ada Perubahan Folder `android/`)
```bash
npm run sync:android
cd android && ./gradlew assembleRelease && cd ..
cp android/app/build/outputs/apk/release/app-release.apk public/apk/doctoid-latest.apk
npm run release force apk "Catatan rilis APK baru"
```

Untuk aturan teknis mendalam dan pantangan rilis, silakan baca [releaseprotocol.md](./releaseprotocol.md).
