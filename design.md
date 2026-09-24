# Doctoid Design System & UI/UX Guidelines (`design.md`)

> **ATURAN MUTLAK & SAKLEK**: 
> Seluruh antarmuka, komponen, modal, dropdown, palet warna, tipografi, dan copywriting di **Doctoid** — baik yang sudah ada maupun yang akan digenerate nanti — **WAJIB 100% MENGACU PADA DOKUMEN INI**.
> Aturan ini bersifat **SAKLEK DAN TIDAK BOLEH DIUBAH-UBAH ATAU DIIMPROVISASI SENDIRI**.

---

## 1. Aturan Larangan Ikon (Strict No-Icon Policy)

> **"GA BOLEH ADA ICON! TITIK! AKU GA SUKA ADA ICON ANEH ANEH!"**

Pengguna sangat menentang dekorasi visual yang tidak perlu. Antarmuka Doctoid harus bersih, tenang, berwibawa, dan fokus pada data klinis pasien.

### ⛔ DILARANG KERAS:
- **DILARANG** menambahkan ikon dekoratif/pemanis di dalam opsi dropdown atau menu pilihan.
- **DILARANG** menaruh ikon penghias di form input, label kolom, atau placeholder (misal: ikon user di input nama, ikon stetoskop di anamnesis, ikon kalender di tanggal, ikon dokumen di RM).
- **DILARANG** menaruh ikon di header kartu (*card title*), kartu metrik dasbor, maupun judul section.
- **DILARANG** menambahkan ikon di tombol teks biasa (misal tombol "Batal", "Simpan", "ACC", "Terapkan").
- **DILARANG KERAS** menggunakan emoji di seluruh UI maupun teks copywriting / toast / pesan aplikasi.

### ✅ Pengecualian Ikon yang HANYA Diperbolehkan (Mutlak Fungsional Saja):
1. **4 Ikon Navigasi Utama** di bilah bawah: Dasbor (`LayoutDashboard`), Catat Pasien (`Sparkles`), Rekam Medis (`FolderOpen`), Template (`FileText`).
2. **Indikator Dropdown**: Panah chevron minimalis (`ChevronDown`) untuk menunjukkan elemen dapat dibuka.
3. **Tombol Aksi Media & Input**: Kamera, Galeri, Mikrofon pada *Attachment Menu* dan tombol Kirim (`Send`).
4. **Indikator Loading**: Spinner minimalis (`Loader2`) hanya saat proses latar belakang aktif.
5. **Aksi Destruktif/Tutup**: Ikon Hapus (`Trash2`) dan Tutup Modal (`X`) jika ruang tidak memungkinkan teks.

---

## 2. Standar Dropdown & Pemilihan (No Native `<select>`)

> **DILARANG KERAS menggunakan elemen native browser `<select>`**. Native dropdown menghasilkan tampilan kotak abu-abu kaku dengan highlight biru kuno era 90-an yang merusak estetika aplikasi.

### ✅ Standar Baku Dropdown: Komponen `CustomSelect`
Seluruh pilihan daftar (Gelar, Jaminan, Faskes, Ruangan, Template, GCS, dsb.) **WAJIB** menggunakan custom dropdown popover:
- **Trigger Input**:
  - Bentuk: `rounded-2xl border border-slate-300 bg-slate-100/90 px-3 py-3 text-xs font-bold text-slate-900`.
  - Fokus / Terbuka: `bg-white border-primary ring-2 ring-primary/20 shadow-xs`.
  - Indikator: Chevron kecil minimalis (`ChevronDown size={16}`) yang berputar halus 180° saat terbuka.
- **Floating Popover Panel**:
  - Kontainer: `bg-white rounded-2xl border border-slate-200/90 shadow-xl backdrop-blur-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100`.
  - Scroll: `max-h-60 overflow-y-auto hide-scrollbar`.
- **Item Opsi (List Item)**:
  - Gaya Normal: `rounded-xl px-3 py-2 text-xs font-bold text-slate-800 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer`.
  - Gaya Terpilih (*Active*): `bg-primary text-white shadow-xs font-bold`.
  - **MURNI TEKS BERSIH** tanpa ikon di samping teks pilihan!

---

## 3. Palet Warna Resmi (Strict Color Whitelist)

Hanya warna-warna berikut yang **DIIZINKAN** di dalam aplikasi. Dilarang memakai warna arbitrer di luar whitelist ini:

### A. Brand & Warna Utama
| Token | Hex / Utility Tailwind | Peran & Penggunaan |
| :--- | :--- | :--- |
| **Primary (Medical Blue)** | `#3B82F6` (`blue-500` / `primary`) | Aksen aktif utama, tombol aksi primer, tab terpilih, ring fokus |
| **Primary Deep (Cobalt)** | `#1D4ED8` (`blue-700` / `primary-deep`) | Gradien akhir tombol primer, header dasbor, aksen gelap |
| **Primary Soft (Sky)** | `#38BDF8` (`sky-400` / `primary-soft`) | Highlight halus, border fokus aktif |
| **Primary Gradient** | `bg-gradient-to-br from-primary to-primary-deep` | Tombol Kirim AI, Tombol Simpan SOAP, Tab Bar Navigasi |

### B. Warna Netral & Permukaan (*Canvas & Surfaces*)
| Token | Hex / Utility Tailwind | Penggunaan Wajib |
| :--- | :--- | :--- |
| **Pure White** | `#FFFFFF` (`bg-white`) | Kartu konten utama, modal popover, kotak input AI, panel dropdown |
| **Canvas Slate** | `#F8FAFC` s/d `#E5EBF4` (`slate-50` / `surface`) | Latar belakang dasar seluruh halaman |
| **Input Surface** | `bg-slate-100/90` atau `bg-slate-50` | Input form, textarea non-fokus, tombol netral |
| **Border Divider** | `border-slate-200` | Garis pemisah kartu, pembatas section, border popover |
| **Border Input** | `border-slate-300` | Border form input dan dropdown trigger saat idle |

### C. Tipografi & Kontras Teks (*Ink*)
| Token | Utility Tailwind | Penggunaan |
| :--- | :--- | :--- |
| **Ink Bold** | `text-slate-900` | Teks utama, judul, nilai data, input teks pengguna (kontras tinggi) |
| **Ink Muted** | `text-slate-500` / `text-slate-600` | Keterangan, label sekunder, tanggal, timestamp |
| **Placeholder** | `text-slate-400 font-normal` | Teks panduan saat input masih kosong |

### D. Warna Status Semantik Klinis (HANYA 3 WARNA INI)
| Kategori | Token / Utility | Penggunaan Klinis Spesifik |
| :--- | :--- | :--- |
| **Sukses / Selesai / KRS** | `#10B981` (`emerald-500`, `bg-emerald-50`, `border-emerald-200`) | Pasien KRS / Pulih, Terapi Baru Disetujui, Tombol ACC Form |
| **Perhatian / Rawat Lama** | `#F59E0B` (`amber-500`, `bg-amber-50`, `border-amber-200`) | Rawat H->7, Pasien Baru MRS, Peringatan Klinis / Dosis |
| **Darurat / Stop / Hapus** | `#F43F5E` (`rose-500`, `bg-rose-50`, `border-rose-200`) | Terapi Dihentikan (Stop/Aff), Alergi Obat, Dikte Aktif, Tombol Batal/Hapus |

> ⛔ **DILARANG**: Menggunakan warna ungu liar, oranye neon, pink cerah, kuning silau, atau variasi warna pelangi sembarangan.

---

## 4. Standar Tipografi (3 Tingkat Ukuran Berbasis Golden Ratio)

Menggunakan **1 jenis font seragam untuk seluruh aplikasi: `Inter`** (`font-sans`) dengan sistem **3 Tingkat Ukuran Baku**:

| Tingkat | Kelas Token | Ukuran REM (PX) | Bobot & Karakter | Penggunaan Wajib |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Display & Header Utama** | `.h1` (`text-2xl`) | **2.0625rem** (~33px) | `font-black tracking-tight leading-tight` | • Judul Halaman Utama (Dasbor, Rekap, Brainstorm) |
| **Tier 2: Judul Kartu & Nama Pasien** | `.h2` (`text-xl` / `text-md`) | **1.3125rem** (~21px) | `font-bold leading-snug` | • Nama Pasien, Judul Modal Dialog, Diagnosis Utama |
| **Tier 3: Teks Isi, Form & Label** | `.body-md` / `text-xs` | **1.0000rem** (~16px) / **0.75rem** (~12px) | `font-bold` / `font-semibold leading-relaxed` | • Isi SOAP, No. RM, Dosis Terapi, Label Input, Isi Dropdown |

### ⛔ DILARANG KERAS:
- Menggunakan ukuran font arbitrer seperti `text-[9px]`, `text-[10px]`, `text-[11px]`. Ukuran arbitrer merusak penskalaan aksesibilitas sistem operasi.
- Pembedaan hierarki dilakukan melalui **bobot** (`font-bold` vs `font-normal`) dan **warna** (`text-slate-900` vs `text-slate-500`), **BUKAN** dengan mengecilkan teks menjadi kerdil.

---

## 5. Bentuk & Geometri Baku (Shapes & Geometry)

- **`rounded-2xl` (16px)**: Standar mutlak untuk seluruh Kartu Utama, Form Input, Dropdown Popover, Modal Dialog, dan Tombol Persegi Panjang.
- **`rounded-3xl` (24px)**: Standar untuk Kontainer Navigasi Bawah (*Floating Unified Dock*) dan Wadah Kotak Input AI.
- **`rounded-full` (Lingkaran)**: HANYA untuk tombol aksi cepat melayang berukuran seragam (Kamera, Galeri, Mic, Send) dan Badge Status.
- **Single-Surface Hierarchy**: Dilarang membuat "kotak di dalam kotak". Satu permukaan putih bersih dengan garis pemisah tipis (`border-t border-slate-200`).
- **Elevasi & Shadow Halus**:
  - Kartu & Input: `shadow-xs` atau `shadow-sm`.
  - Dropdown Popover: `shadow-xl`.
  - Floating Bottom Dock: `shadow-[0_-12px_30px_-4px_rgba(15,23,42,0.16)]`.

---

## 6. Standar Copywriting & Komunikasi Manusiawi (Human & Effective)

> **"Manusia itu HARUS EFEKTIF DAN EFISIEN komunikasi harus bener!"**

Dokter spesialis bekerja dengan intensitas tinggi di bangsal rumah sakit dan poliklinik. Copywriting harus menghargai waktu dokter:

### A. Prinsip Komunikasi:
1. **Lugas & Langsung ke Intinya (*To-The-Point*)**: Hilangkan semua basa-basi, kalimat pengantar kosong, atau tutorial yang tidak diminta.
2. **Bahasa Indonesia Medis Profesional**: Gunakan istilah klinis baku yang lazim di rumah sakit Indonesia (misal: "No. RM", "Jaminan", "Keluhan Utama", "Pemeriksaan Fisik", "Usulan Terapi", "KRS", "Readmisi").
3. **Hindari Bahasa Robotik / AI Klise**: Jangan gunakan frasa seperti *"Sebagai asisten cerdas, saya telah merapikan..."* atau *"Halo Dok, silakan pilih..."*.

### B. Panduan Contoh Copywriting:
| Konteks | ❌ SALAH (Bertele-tele / Robotik) | ✅ BENAR (Lugas, Efektif & Manusiawi) |
| :--- | :--- | :--- |
| **Placeholder Input** | `"Ketik atau dikte konsultasi Anda di sini (tarik pojok untuk perbesar)"` | `"Masukkan laporan pasien..."` |
| **Dropdown Jaminan** | `"Silakan tentukan jenis pembayaran pasien untuk penagihan klaim"` | `"Pilih Jaminan"` |
| **Status Proses AI** | `"Harap tunggu sejenak, kecerdasan buatan kami sedang menganalisis SOAP..."` | `"AI sedang merapikan..."` / `"Menganalisis..."` |
| **Konfirmasi Hapus** | `"Apakah Anda benar-benar yakin ingin menghapus data rekam medis pasien ini?"` | `"Hapus pasien dari daftar?"` |
| **Notifikasi Sukses** | `"Berhasil! Data konsultasi Anda telah berhasil disimpan dengan sukses ke sistem"` | `"Laporan tersimpan"` |
| **Tombol Staging** | `"Klik di sini untuk menyetujui dan menerapkan hasil analisis ke formulir"` | `"ACC & Terapkan ke Form"` |

---

*Dokumen ini merupakan hukum baku UI/UX & Copywriting resmi Doctoid App.*
