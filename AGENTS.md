# AGENTS.md — DOCTO.ID (`docto.id`)

Aturan induk global mengacu penuh pada [`E:\CODING\AGENTS.md`](file:///e:/CODING/AGENTS.md) dan [`E:\CODING\DESIGN.md`](file:///e:/CODING/DESIGN.md). Dokumen pendamping proyek: [design.md](file:///e:/CODING/docto.id/design.md), [releaseprotocol.md](file:///e:/CODING/docto.id/releaseprotocol.md), [PROGRESS.md](file:///e:/CODING/docto.id/PROGRESS.md), dan [SCHEMA.md](file:///e:/CODING/docto.id/SCHEMA.md).

## 1. Tech Stack & Proyek Firebase
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + Dexie IndexedDB + Capacitor Android.
- **Backend:** 100% Firebase Blaze Plan — project ID **`docto-id`** (Hosting, Firestore, Auth, Storage, Cloud Functions / WhatsApp & AI SOAP backend).
- **Localhost Preview:** Jalankan `npm run dev` dan pastikan bebas error sebelum meminta ACC user. Dilarang bump versi atau `release` sebelum disetujui di `localhost`.

## 2. Trigger Perintah Singkat
- **`"audit"`** -> Jalankan `pre-flight-audit`: cek keamanan E2E/rules, root-cause bug hunt, dan layout audit (Dark/Light Mode, Mobile/PC, Bahasa Indonesia medis seragam).
- **`"release"` / `"rilis"`** -> Jalankan [releaseprotocol.md](file:///e:/CODING/docto.id/releaseprotocol.md).
- **`"new app [nama]"`** -> Scaffold app baru dari `E:\CODING\_starter-template`.

## 3. Domain Klinis, Privasi E2E & Invarian Teknis
- **AI Clinical & WhatsApp Bot Domain Lock:** Parser laporan pasien, generator SOAP, dan respons bot klinis hanya memproses konteks klinis medis, wajib bebas *zombie intent* (tidak memicu ulang aksi lama/duplikat saat offline-replay), dan tidak boleh mengarang dosis obat atau fakta pasien. Seluruh Cloud Functions wajib memiliki `maxInstances`.
- **Privasi Data Rekam Medis & Rules:** Sinkronisasi lintas perangkat memakai enkripsi E2E ke `doctoid/{syncId}`. Aturan Firestore mengunci `allow read, write: if request.auth != null;` dan memblokir `allow list, delete: if false;` pada `doctoid/{syncId}`. `storage.rules` hanya mengizinkan `request.auth != null` dengan unggahan `image/* <= 5MB`.
- **Crash Safety & Offline Sync:** `ErrorBoundary` terpasang di root `src/main.tsx`. Seluruh tabel lokal dikelola melalui Dexie (`src/db.ts`, `src/sync.ts`) agar aman offline di bangsal RS tanpa jaringan stabil.
- **OTA & Anti-Bloat APK:** Manifest `dist/ota/version.json` hanya digenerate oleh `build:ota` (dilarang membuat `public/ota/version.json`). `sync:android` dilarang menyalin file `.apk` ke `android/.../assets/`. UI updater mengikuti pola Solid Bottom Sheet referensi `logym.app` dalam palet klinis Doctoid.
