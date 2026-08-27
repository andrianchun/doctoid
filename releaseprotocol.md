# Doctoid App Release Protocol (`releaseprotocol.md`)

Panduan ini ditujukan untuk AI Assistant (seperti Cursor, Claude Code, atau Antigravity) dan Developer saat pengguna meminta untuk merilis (*release*) atau memperbarui versi aplikasi **Doctoid** (`docto.id`).

---

## 1. Pilih Jalur Rilis Terlebih Dahulu

Ada dua jalur rilis di Doctoid. **Hampir selalu Jalur A yang benar.**
Tanyakan satu hal: *Apakah ada perubahan native di folder `android/` (plugin native baru, permission, icon launcher, SDK gradle)?*

| Parameter | Jalur A — OTA / Web Bundle (Default) | Jalur B — APK Native |
|---|---|---|
| **Kapan Dipakai** | Perubahan React, TypeScript, CSS, AI Prompt, DB lokal | Ada perubahan native di `android/` atau izin OS baru |
| **Perintah Utama** | `npm run release` | Build APK → Salin ke hosting → `npm run release apk` |
| **Yang Diterima User** | Bundle web ±2–5 MB, di dalam aplikasi secara otomatis | APK ±20–30 MB, diunduh langsung dari hosting |
| **Pengalaman User** | **Seamless**: Notifikasi update muncul, 1 klik langsung update | Browser mengunduh APK, Android memicu dialog install |

---

## 2. Aturan Mutlak Rilis (*Strict Invariants*)

1. **`dist/ota/version.json` hanya boleh dihasilkan oleh `npm run build:ota` atau `scripts/build-ota.js`.**
   Jangan pernah membuat file manual `public/ota/version.json` — Vite akan menyalin `public/` ke `dist/`, sehingga menimpa manifest asli dengan konfigurasi kosong/basi.
2. **Deploy hosting selalu lewat `npm run build:ota`, jangan `npm run build` polos.**
   `npm run build` biasa tidak membuat bundle zip dan tidak menulis manifest `version.json`.
3. **Naikkan versi `package.json` SEBELUM proses build dijalankan.**
   Konstanta `__APP_VERSION__` di-bake oleh Vite saat build. Jika build jalan duluan, aplikasi melaporkan versi lama dan terus-menerus memicu loop pembaruan.
4. **Jangan pernah memakai link Google Drive untuk unduhan APK.**
   Google Drive selalu menyajikan halaman interstitial HTML peringatan virus (bukan file binary APK), yang menyebabkan instalasi gagal. File APK disajikan langsung dari domain hosting: `https://docto-id.web.app/apk/doctoid-latest.apk`.
5. **Bersihkan cache `.firebase` sebelum deploy.**
   Cache Firebase CLI terkadang melewatkan file yang dikira sudah terunggah, menyebabkan `version.json` atau ZIP hilang dan terkena rewrite SPA `index.html`. Script `release.js` sudah otomatis menghapus cache ini.

---

## 3. Jalur A — Rilis OTA / Web (Satu Perintah Otomatis)

### Rilis Normal (Pembaruan Santai)
```bash
npm run release "Deskripsi pembaruan singkat"
```
*Atau untuk menaikkan minor/major:*
```bash
npm run release minor "Pembaruan modul klinis baru"
npm run release major "Peluncuran Doctoid v2.0"
```

### Rilis Wajib / Kritis (*Forced Update*)
Gunakan kata kunci `force` jika ada perbaikan bug kritis atau perubahan skema database penting sehingga pengguna wajib segera memperbarui:
```bash
npm run release force "Perbaikan kritis sinkronisasi rekam medis"
```

### Verifikasi Setelah Rilis
```bash
curl -s https://docto-id.web.app/ota/version.json
```
Manifest harus menampilkan `ota_version` terbaru dan URL bundle zip yang valid.

---

## 4. Jalur B — Rilis APK (Hanya Jika Ada Perubahan Native)

Jalankan tahapan berikut secara berurutan:

### Langkah 1: Update Versi di Web & Gradle
1. Naikkan `version` di `package.json` (misalnya dari `0.1.0` ke `0.1.1`).
2. Jika ada `android/app/build.gradle`:
   - Naikkan `versionCode` (+1).
   - Samakan `versionName` dengan `package.json`.

### Langkah 2: Build & Salin APK ke Hosting
```bash
npm run sync:android
cd android && ./gradlew assembleRelease && cd ..
cp android/app/build/outputs/apk/release/app-release.apk public/apk/doctoid-latest.apk
```

### Langkah 3: Rilis Jalur APK
```bash
npm run release force apk "Menambah integrasi sensor biometrik baru"
```
Kata `apk` akan otomatis menyetel `"is_apk": true` pada manifest, sehingga tombol Update di aplikasi langsung mengunduh APK resmi.

### Verifikasi Jalur APK
```bash
curl -s https://docto-id.web.app/ota/version.json
curl -sIL https://docto-id.web.app/apk/doctoid-latest.apk | grep -i "content-type"
```
Header harus bertipe `application/vnd.android.package-archive` (bukan `text/html`).

---

## 5. Ringkasan Siklus Rilis Otomatis

Script `npm run release` secara otomatis melakukan rangkaian:
1. Validasi argumen & kelengkapan file APK (jika jalur APK).
2. Bump versi semver (`patch` / `minor` / `major`).
3. Build TypeScript & Vite bundle.
4. Kompresi OTA ZIP level 9 dengan retensi 3 versi terakhir.
5. Pembersihan cache `.firebase`.
6. Deploy hosting Firebase (`firebase deploy --only hosting`).
7. Git auto-commit (`release vX.Y.Z`) & Git push ke repository.

---
*Dokumen ini merupakan panduan rilis resmi Doctoid v0.1+.*
