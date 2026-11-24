# SCHEMA.md — DOCTO.ID (`docto.id`)

Kontrak data lokal Dexie dan Firestore untuk `docto.id`. Perbarui dokumen ini setiap kali mengubah tabel `src/db.ts` atau payload `src/sync.ts`.

## 1. Penyimpanan Lokal Offline-First (Dexie — [src/db.ts](file:///e:/CODING/docto.id/src/db.ts))
Entitas utama: `Hospital`, `Ward`, `RawatEpisode`, `Patient`.
Sepuluh tabel tersinkronisasi ([src/sync.ts](file:///e:/CODING/docto.id/src/sync.ts)):
- `patients`
- `progressNotes`
- `doctorPreferences`
- `hospitals`
- `wards`
- `templates`
- `regexRules`
- `therapyHistory`
- `penunjang`
- `poliLogs`

## 2. Koleksi Firestore (`docto-id` — [firestore.rules](file:///e:/CODING/docto.id/firestore.rules))
- `users/{userId}`: Profil dan metadata akun dokter terautentikasi.
- `doctoid/{syncId}`: Dokumen sinkronisasi terenkripsi E2E (hanya dapat dibaca/tulis oleh user login dengan `syncId` tervalidasi; `list` dan `delete` diblokir oleh rules).
