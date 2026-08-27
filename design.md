# Doctoid Design System & UI/UX Guidelines (`design.md`)

> **ATURAN MUTLAK**: Seluruh antarmuka, komponen, modal, dan pembaruan visual di **Doctoid** **WAJIB** mematuhi spesifikasi warna klinis, tipografi rasio emas (3 tingkat), tema *Modern Clinical Glassmorphism*, dan prinsip anti-bloat dalam dokumen ini.

---

## 1. Filosofi Desain & Karakter Visual

Doctoid dirancang khusus untuk dokter spesialis dengan tema **Modern Clinical Glassmorphism & Futurism**:
- **Permukaan Kaca Bersih (*Crystal Glass Surfaces*)**: Latar belakang tembus pandang dengan efek *blur* halus (`backdrop-blur-xl`), saturasi lembut, dan garis tepi berkilau (*subtle frosted borders*).
- **Aksen Biru Elektrik Klinis (*Electric Medical Blue & Deep Cobalt*)**: Memberi kesan presisi, higienis, berteknologi tinggi (*futuristic medical tech*), dan fokus tinggi dalam pengambilan keputusan klinis.
- **Ramah Jari (*Ergonomic Touch Targets*)**: Area sentuh minimal **44px – 48px** untuk tombol dan kontrol agar input cepat di bangsal rumah sakit bebas salah pencet.
- **Single-Surface Hierarchy**: Tidak ada "kotak di dalam kotak". Satu kartu utama dengan pembatas halus (*hairline dividers*) menjaga layar tetap luas dan bersih.

---

## 2. Palet Warna Resmi (*Color Palette*)

### A. Warna Utama & Aksen Brand
| Token | Hex / Kelas CSS | Penggunaan Baku |
| :--- | :--- | :--- |
| **Medical Blue (Primary)** | `#3B82F6` (`blue-500` / `primary`) | Warna aksen utama, tombol aksi primer, indikator klinis |
| **Cobalt Deep** | `#1D4ED8` (`blue-700` / `primary-deep`) | Gradien akhir tombol primer, header banner, bayangan glow |
| **Sky Bright** | `#38BDF8` (`sky-400` / `primary-soft`) | Aksen teks terang, highlight penunjang, border fokus input |
| **Primary Gradient** | `from-[#3B82F6] to-[#1D4ED8]` | Tombol Simpan SOAP, Tombol Kirim Micro-Update, Header Dasbor |

### B. Warna Latar Belakang (*Canvas*)
| Mode | Warna Dasar | Efek Ambient Radial Mesh |
| :--- | :--- | :--- |
| **Light Mode (`surface`)** | `#F4F5FB` (Soft Clinical Cloud) | `radial-gradient(ellipse at 15% -10%, rgba(59,130,246,0.12), transparent 60%)` |
| **Dark Mode (`surface-dark`)** | `#070B14` (Deep Medical Onyx) | `radial-gradient(ellipse at 15% -10%, rgba(59,130,246,0.22), transparent 60%)` |

### C. Permukaan Kaca (*Glassmorphism Surfaces*)
| Elemen | Tema Terang (*Light*) | Tema Gelap (*Dark*) | Border & Efek Blur |
| :--- | :--- | :--- | :--- |
| **Glass Card** | `bg-white/70` | `bg-[#0D1527]/80` | `border-white/20`, `backdrop-blur-xl`, `shadow-sm` |
| **Glass Nav (Floating Bar)** | `bg-white/80` | `bg-[#0D1527]/90` | `border-white/20`, `backdrop-blur-2xl`, `shadow-xl` |
| **Input / Search Bar** | `bg-white/90` | `bg-white/5` | `border-primary-soft/30`, `focus:ring-2 focus:ring-primary/40` |

### D. Warna Status Semantik Klinis
| Status / Fitur | Hex / Utility | Penerapan Klinis |
| :--- | :--- | :--- |
| **Emerald / Selesai / KRS** | `#10B981` (`emerald-500`) | Pasien KRS / Pulih, Terapi Baru Disetujui, Sinkronisasi Sukses |
| **Amber / Perhatian / Rawat Lama** | `#F59E0B` (`amber-500`) | Rawat H->7, Pasien Baru MRS, Peringatan Klinis / Dosis Obat |
| **Rose / Darurat / Stop** | `#F43F5E` (`rose-500`) | Terapi Dihentikan (Stop/Aff), Alergi Obat, Tombol Hapus Pasien |
| **Violet / AI Brainstorm** | `#8B5CF6` (`violet-500`) | Fitur AI Rapikan SOAP, Analisis Kasus, Ringkasan Klinis |

---

## 3. Standar Tipografi (3 Tingkat Ukuran Berbasis Golden Ratio)

Menggunakan **1 jenis font seragam untuk seluruh aplikasi: `Inter`** (`font-sans`) dengan sistem **3 Tingkat Ukuran Baku berbasis `rem`** agar otomatis beradaptasi dengan setelan aksesibilitas layar smartphone:

| Tingkat | Kelas Token | Ukuran REM (Default PX) | Bobot & Tracking | Penggunaan Wajib |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Display & Header Layar** | `.h1` (`text-2xl`) | **2.0625rem** (~33px) | `font-black tracking-tight leading-tight` | • Judul Halaman Utama (Dasbor, Rekap, Brainstorm) |
| **Tier 2: Judul Kartu, Nama & Metrik** | `.h2` (`text-md`) | **1.3125rem** (~21px) | `font-bold leading-snug` | • Nama Pasien, Judul Modal, Diagnosis Utama, Tombol Utama |
| **Tier 3: Teks Isi, Label & Badge** | `.h3`, `.body-md`, `.caption` | **1.0000rem** (~16px) | `font-medium / font-semibold leading-relaxed` | • Isi SOAP, No. RM, Dosis Terapi, Label Input, Chip Status |

### ⛔ DILARANG KERAS:
- **JANGAN PERNAH** menggunakan ukuran font arbitrer seperti `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`. Ukuran arbitrer mematikan penskalaan font sistem Android dan membuat teks kerdil tidak terbaca.
- Variasi hierarki teks kecil dibedakan melalui **warna** (`text-ink-muted`), **bobot** (`font-bold`), atau `uppercase tracking-wider` — **BUKAN** dengan mengecilkan ukuran font di bawah 16px.

---

## 4. Tata Letak & Komponen Baku

### A. Larangan "Kotak di dalam Kotak" (*No Nested Cards*)
- **Salah**: Menaruh kartu ber-border di dalam kartu ber-border lain untuk setiap butir data pasien.
- **Benar**: Gunakan **satu kartu berlatar kaca (*single surface*)** dengan garis pemisah halus (*divider line* `border-t border-primary-soft/20`).

### B. Bottom Navigation Bar & Badge Notifikasi
- Bilah navigasi bawah berbentuk **kapsul melayang (*floating glass bar*)** berisi icon murni tanpa teks label.
- **Badge Notifikasi**: Menggunakan titik putih bersih tanpa angka raksasa untuk menjaga estetika minimalis.

### C. Target Sentuh (*Touch Targets*) & Safe Area
- Tinggi tombol utama dan kotak input: minimal **44px – 48px** (`h-11` s/d `h-12`).
- Safe Area Notch / Navigation Bar:
  ```css
  padding-top: max(1rem, env(safe-area-inset-top, 20px));
  padding-bottom: max(1rem, env(safe-area-inset-bottom, 16px));
  ```

---

## 5. Animasi & Gestur Sentuh (*Horizontal Swipe Navigation*)

Untuk memberikan sensasi aplikasi native yang mulus (*high-performance 60fps*):
- **Gestur Swipe Tab**: Menggunakan `PointerEvents` (`onPointerDown`, `onPointerUp`) untuk berpindah antar tab (`/dasbor` ⇄ `/brainstorm` ⇄ `/rekap`) secara natural di HP, mouse desktop, maupun stylus tablet.
- **`user-select: none`**: Mencegah teks terpilih/terblokir secara tidak sengaja saat melakukan gestur geser pada elemen non-input.

---

## 6. Prinsip Anti-Bloat & Larangan Dekorasi Berlebihan (*Crucial*)

1. **Dilarang Menulis Penjelasan Panjang / Seabrek Teks**:
   - Dokter menggunakan aplikasi ini untuk efisiensi tinggi dan kecepatan di bangsal rumah sakit.
   - Dilarang membuat paragraf penjelasan bertele-tele, kalimat panduan yang tidak diminta, atau banner keterangan yang memakan ruang layar.
   - Gunakan label pendek dan jelas langsung ke intinya.

2. **Dilarang Spam Ikon / Emoji (*No Excessive Icons*)**:
   - Jangan menaruh ikon di setiap tombol, label input, judul section, atau badge.
   - Gunakan ikon HANYA jika benar-benar memiliki fungsi aksi langsung (seperti tombol Kembali, Kamera, Sensor Biometrik, Pengaturan, atau Keluar).
   - Jangan menyertakan emoji dekoratif di dalam UI maupun output respon percakapan.

3. **Pilihan Sederhana & Langsung**:
   - Untuk pilihan daftar (seperti spesialisasi / faskes / format), gunakan dropdown standar `<select>` atau input bersih, bukan tumpukan chip/banner yang berantakan.

---
*Dokumen ini merupakan panduan resmi UI/UX Doctoid App v0.1+.*
