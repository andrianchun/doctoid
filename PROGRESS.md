# PROGRESS.md — DOCTO.ID (`docto.id`)

**Versi Saat Ini:** `0.1.93`
**Firebase Project:** `docto-id` (Blaze Plan — Hosting, Firestore, Auth, Storage)

## Ringkasan Audit & Pengerasan Enterprise
- [x] `firestore.rules` diperketat: koleksi `doctoid/{syncId}` wajib terautentikasi (`request.auth != null`) dengan `allow list, delete: if false`.
- [x] `storage.rules` diperketat: celah `|| true` dihapus; unggahan dibatasi hanya user login untuk `image/* <= 5MB`.
- [x] `ErrorBoundary` dipasang pada `src/main.tsx` untuk menangkap error runtime React tanpa layar putih.
- [x] File bloat APK (`public/doctoid.apk`, `android/.../assets/doctoid.apk`, `temp_apk/`) dibersihkan dan `package.json` `sync:android` diperbaiki.
- [x] Standarisasi `tokens.css` (floor `16px`), komponen `src/components/ui/Button.tsx` & `Dialog.tsx`, serta pembaruan `AGENTS.md`, `design.md`, `releaseprotocol.md`, `SCHEMA.md`.

## Catatan Terbuka / Action Items
- **Firebase Storage Belum Diaktifkan di Console (`docto-id`):** Deploy `storage:rules` dilewati otomatis; file [storage.rules](file:///e:/CODING/docto.id/storage.rules) tetap disimpan di repo dan siap dideploy begitu Storage diinisialisasi via Firebase Console. `scripts/release.js` menargetkan `--only hosting,firestore:rules`.
- Pastikan uji `localhost` pada mode gelap/terang, alur input pasien/SOAP, serta `CustomSelect` di Mobile & Desktop.
