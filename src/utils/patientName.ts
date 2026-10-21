import { db } from '../db'

/**
 * Utility untuk membersihkan dan menstandarisasi nama & gelar pasien.
 * Mencegah duplikasi seperti "Ny. Ny. Sunarmi" atau "Tn. Tn. Bambang"
 * serta mencegah istilah medis/tanda vital (misal "Suhu(C) :") tertukar menjadi nama pasien.
 */

export const KNOWN_TITLES = ['dr.', 'Tn.', 'Ny.', 'Sdr.', 'Sdri.', 'An.', 'By.'] as const

/**
 * Deteksi token jenis kelamin (L/P/Laki-laki/Perempuan) agar tidak pernah salah dibaca sebagai nama pasien.
 */
export function isGenderToken(str: string): boolean {
  if (!str) return false
  const clean = str.trim().toLowerCase().replace(/^[*_~#/:,.\s]+|[*_~#/:,.\s]+$/g, '')
  return /^(?:l|p|lk|pr|laki|laki-laki|laki2|laki\s*-\s*laki|pria|perempuan|wanita|female|male)$/i.test(clean)
}

/**
 * Daftar kata kunci medis, tanda vital, dan header SIMRS yang terlarang
 * dijadikan nama pasien.
 */
export const INVALID_NAME_TERMS = [
  // Tanda Vital & TTV
  'suhu', 'suhu(c)', 'suhu(°c)', 'suhu(c) :', 'temp', 'temperature', 't',
  'nadi', 'hr', 'heart rate', 'pulse', 'denyut',
  'tensi', 'td', 'tekanan darah', 'bp',
  'rr', 'respirasi', 'pernafasan', 'nafas',
  'spo2', 'saturasi', 'sat', 'o2',
  'gcs', 'kesadaran', 'ku', 'keadaan umum',
  'gda', 'gds', 'gdp', 'gula darah',
  'bb', 'tb', 'imt', 'bmi', 'crt',
  // Komponen SOAP & Medis
  'subjektif', 'subjektive', 'objektif', 'objective', 'assesment', 'assessment', 'planning',
  'keluhan', 'keluhan utama', 'rps', 'rpd', 'rpo', 'rpk', 'alergi',
  'anamnesis', 'anamnesa', 'pemeriksaan', 'pemfis', 'penunjang',
  'laboratorium', 'lab', 'radiologi', 'rontgen', 'ct scan', 'ekg', 'ecg',
  'diagnosis', 'diagnosa', 'terapi', 'instruksi', 'advis',
  'catatan', 'resume', 'konsul', 'konsulan', 'rujukan',
  // Peran Medis
  'dokter', 'dr', 'perawat', 'bidan', 'dpjp', 'pemeriksa', 'ts', 'jaga',
  // Ruangan & Form
  'ruangan', 'bangsal', 'kamar', 'bed', 'kelas', 'igd', 'poli', 'rawat',
  'tanggal', 'tgl', 'jam', 'waktu', 'pagi', 'siang', 'sore', 'malam',
  'pasien', 'px', 'identitas', 'baru', 'lama', 'status', 'no rm', 'rekam medis',
  // Tombol & SIMRS UI
  'simpan', 'batal', 'cetak', 'hapus', 'cari', 'edit', 'tutup', 'kembali'
]

/**
 * Validasi ketat kelayakan nama orang/pasien.
 * Menolak string yang mengandung simbol non-nama (:, (), [], angka, dll)
 * atau kata-kata tanda vital & klinis.
 */
export function isValidPatientName(candidate?: string): boolean {
  if (!candidate) return false
  const clean = candidate.trim()
  if (clean.length < 2 || clean.length > 50) return false

  // Tolak jika mengandung karakter non-nama (seperti :, (), [], {}, =, <, >, +, *, angka, dsb)
  if (/[:()[\]{}=<>+*#_~0-9\/\\@$%^&|;]/.test(clean)) return false

  // Tolak jika merupakan token jenis kelamin murni
  if (isGenderToken(clean)) return false

  // Bersihkan tanda baca tepi untuk pengecekan kata
  const words = clean.toLowerCase().split(/[\s'.-]+/).filter(Boolean)
  if (words.length === 0) return false

  // Tolak jika seluruh frasa ada di daftar kata terlarang
  const cleanLower = clean.toLowerCase()
  if (INVALID_NAME_TERMS.includes(cleanLower)) return false

  // Tolak jika ada kata yang merupakan kata kunci vital sign / klinis terlarang
  const forbiddenKeywords = new Set([
    'suhu', 'temp', 'temperature', 'tensi', 'nadi', 'pulse', 'respirasi',
    'vital', 'spo2', 'gcs', 'gda', 'gds', 'gdp', 'pemfis', 'subjektif',
    'objektif', 'assessment', 'planning', 'diagnosa', 'diagnosis', 'terapi',
    'laboratorium', 'radiologi', 'dpjp', 'pasien', 'identitas', 'catatan'
  ])
  if (words.some((w) => forbiddenKeywords.has(w))) {
    return false
  }

  // Nama manusia harus mengandung minimal satu huruf alfabet
  if (!/[a-zA-Z]/.test(clean)) return false

  return true
}

/**
 * Memisahkan gelar dan nama pasien secara bersih.
 * @example
 * splitTitleAndName("Ny. Sunarmi") -> { title: "Ny.", nama_depan: "Sunarmi" }
 * splitTitleAndName("Ny. Ny. Sunarmi") -> { title: "Ny.", nama_depan: "Sunarmi" }
 * splitTitleAndName("Sunarmi", "Ny.") -> { title: "Ny.", nama_depan: "Sunarmi" }
 */
export function splitTitleAndName(rawName: string, defaultTitle = ''): { title: string; nama_depan: string } {
  if (!rawName) return { title: defaultTitle, nama_depan: '' }

  let clean = rawName.trim()
  let title = defaultTitle

  // Deteksi dan bersihkan semua prefix gelar berulang di awal nama (misal: "Ny. Ny. Sunarmi")
  const titleRegex = /^(?:(?:dr\.|Tn\.|Ny\.|Sdr\.|Sdri\.|An\.|By\.)\s*)+/i
  const match = clean.match(titleRegex)
  if (match) {
    const firstMatch = match[0].match(/(?:dr\.|Tn\.|Ny\.|Sdr\.|Sdri\.|An\.|By\.)/i)
    if (firstMatch) {
      const found = firstMatch[0].toLowerCase()
      const standardized = KNOWN_TITLES.find((t) => t.toLowerCase() === found) || firstMatch[0]
      title = standardized
    }
    clean = clean.replace(titleRegex, '').trim()
  }

  // Jika nama masih diawali title yang sudah terpilih
  if (title) {
    const esc = title.replace('.', '\\.')
    clean = clean.replace(new RegExp(`^(?:${esc}\\s*)+`, 'i'), '').trim()
  }

  // Validasi akhir: pastikan nama yang tersisa bukan tanda vital atau invalid
  if (!isValidPatientName(clean)) {
    clean = ''
  }

  return { title, nama_depan: clean }
}

/**
 * Format nama lengkap tampilan pasien yang aman dari duplikasi gelar.
 * @example
 * formatPatientDisplayName("Ny.", "Ny. Sunarmi") -> "Ny. Sunarmi"
 * formatPatientDisplayName("Ny.", "Sunarmi") -> "Ny. Sunarmi"
 * formatPatientDisplayName("Ny.", "Ny. Ny. Sunarmi") -> "Ny. Sunarmi"
 */
export function formatPatientDisplayName(title?: string, nama?: string): string {
  const t = (title || '').trim()
  let n = (nama || '').trim()

  // Hapus semua prefix gelar yang terlanjur tercatat di nama_depan
  n = n.replace(/^(?:(?:dr\.|Tn\.|Ny\.|Sdr\.|Sdri\.|An\.|By\.)\s*)+/i, '').trim()

  if (t) {
    const esc = t.replace('.', '\\.')
    n = n.replace(new RegExp(`^(?:${esc}\\s*)+`, 'i'), '').trim()
    return `${t} ${n}`.trim()
  }

  return n
}

/**
 * Bersihkan string nama_depan agar murni tanpa prefix gelar dan aman dari invalid keywords.
 */
export function cleanNamaDepan(nama?: string, title?: string): string {
  if (!nama) return ''
  let n = nama.trim()
  n = n.replace(/^(?:(?:dr\.|Tn\.|Ny\.|Sdr\.|Sdri\.|An\.|By\.)\s*)+/i, '').trim()
  if (title) {
    const esc = title.replace('.', '\\.')
    n = n.replace(new RegExp(`^(?:${esc}\\s*)+`, 'i'), '').trim()
  }
  if (!isValidPatientName(n)) return ''
  return n
}

/**
 * Otomatis perbaiki seluruh data pasien yang sudah tersimpan di database Dexie lokal
 * (misal jika sebelumnya terlanjur tersimpan "Ny. Ny. Sunarmi" atau "Suhu(C) :").
 */
export async function sanitizeExistingPatientNamesInDb(): Promise<number> {
  try {
    const patients = await db.patients.toArray()
    let updatedCount = 0

    for (const p of patients) {
      if (!p.id) continue

      // Jika nama_depan ternyata kata invalid/tanda vital seperti "Suhu(C) :"
      if (p.nama_depan && !isValidPatientName(p.nama_depan)) {
        await db.patients.update(p.id, {
          nama_depan: '',
        })
        updatedCount++
        continue
      }

      const { title, nama_depan } = splitTitleAndName(p.nama_depan, p.title)

      if (nama_depan !== p.nama_depan || (title && title !== p.title)) {
        await db.patients.update(p.id, {
          title: title || p.title,
          nama_depan: nama_depan,
        })
        updatedCount++
      }
    }

    if (updatedCount > 0) {
      console.log(`✓ Sanitasi otomatis: ${updatedCount} nama pasien di Dexie dibersihkan dari gelar ganda / nama invalid.`)
    }
    return updatedCount
  } catch (err) {
    console.warn('Gagal menormalisasi nama pasien di Dexie:', err)
    return 0
  }
}
