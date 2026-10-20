# Docto.id — AI Agent & Design Guidelines

Panduan dan kaidah perancangan UI/UX serta arsitektur kode untuk asisten AI pada proyek **Docto.id**.

---

## 1. Kaidah Desain Antarmuka (UI/UX) Medis

### A. Minimalis & Anti Clutter ("Jangan Kotak di Dalam Kotak")
- **Hindari *nested containers***: Jangan menumpuk card di dalam card dengan border, background, dan shadow yang berlapis-lapis.
- Gunakan pemisah rambut (*hairline dividers*, misal: `divide-y divide-slate-100` atau `border-slate-200`) atau spasi konsisten daripada membungkus setiap item dalam kotak berbingkai baru.
- Jaga kontras teks medis tetap tajam dan nyaman dibaca dokter di bawah pencahayaan ruangan atau bangsal RS.

### B. Bersih dari Emoji Dekoratif & Ikon Berlebihan
- **Tanpa emoji dekoratif**: Hindari penggunaan emoji seperti 📥, ⚡, 📎, 🚀, dsb. pada tombol kerja atau label status.
- **Tanpa ikon dekoratif pada daftar / baris**: Jangan meletakkan ikon-ikon kecil (seperti ikon pil, kaca pembesar, orang, checklist, dsb.) di setiap baris daftar planning, alert, atau item catatan. Cukup gunakan teks yang jelas, badge status minimalis, atau penanda fungsional murni (seperti lingkaran checklist sederhana).
- Gunakan ikon SVG fungsional yang ramping (**Lucide icons**) hanya jika memang menambah kejelasan fungsi tombol navigasi/aksi utama.
- Tombol aksi harus memiliki teks yang jelas, standar, dan tegas (misal: `Gunakan di Rekam Medis`, `Abaikan`, `Batal`).

### C. Keterbacaan Teks Klinis (SOAP & Konsulan)
- **Jangan memotong teks klinis secara agresif**: Dokter membutuhkan konteks lengkap (anamnesis, tanda vital, lab, terapi).
- Teks konsulan dari WhatsApp atau resume tidak boleh dipotong sepihak menjadi 40–50 karakter (`truncate`). Berikan area baca multi-baris yang lapang (`whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto`).

### D. Titik Masuk Tidak Mengganggu Form Utama
- Jangan memasang banner besar yang memakan ruang pandang kerja dokter di formulir utama Catat Pasien.
- Gunakan ikon notifikasi (**Lonceng / Bell**) di header atas dengan *badge count* jumlah pesan belum diproses.
- Saat ikon ditekan atau saat notifikasi Android diklik, buka dalam bentuk modal / dialog lembar tinjau (*sheet*) yang rapi dan terisolasi.

---

## 2. Integrasi Notifikasi & WhatsApp Konsultasi

1. **Android Native Push / Local Notifications**:
   - Konsulan baru dari gateway WhatsApp (Google Cloud VM) disinkronkan ke Dexie lokal dan memicu notifikasi native status bar Android via `@capacitor/local-notifications`.
   - Gunakan notification channel prioritas tinggi (`importance: 5`) agar muncul sebagai notifikasi pop-up heads-up.
   - Mengklik notifikasi pada status bar ponsel harus langsung mengarahkan dokter ke tab `Catat Pasien` dan memunculkan modal rujukan konsul WhatsApp tersebut.

2. **Pembersihan Intent Berbagi (Anti-Zombie Intent)**:
   - Setiap intent berbagi (Share / View) dari Android harus dibersihkan segera setelah diproses (`setIntent(new Intent())` dan `intent.removeExtra(...)`) agar tidak memunculkan data lama berulang kali saat aplikasi kembali dibuka.
