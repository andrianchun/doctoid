import { db } from '../db'

/**
 * Utility untuk membersihkan dan menstandarisasi nama & gelar pasien.
 * Mencegah duplikasi seperti "Ny. Ny. Sunarmi" atau "Tn. Tn. Bambang".
 */

export const KNOWN_TITLES = ['dr.', 'Tn.', 'Ny.', 'Sdr.', 'Sdri.', 'An.', 'By.'] as const

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
 * Bersihkan string nama_depan agar murni tanpa prefix gelar.
 */
export function cleanNamaDepan(nama?: string, title?: string): string {
  if (!nama) return ''
  let n = nama.trim()
  n = n.replace(/^(?:(?:dr\.|Tn\.|Ny\.|Sdr\.|Sdri\.|An\.|By\.)\s*)+/i, '').trim()
  if (title) {
    const esc = title.replace('.', '\\.')
    n = n.replace(new RegExp(`^(?:${esc}\\s*)+`, 'i'), '').trim()
  }
  return n
}

/**
 * Otomatis perbaiki seluruh data pasien yang sudah tersimpan di database Dexie lokal
 * (misal jika sebelumnya terlanjur tersimpan "Ny. Ny. Sunarmi").
 */
export async function sanitizeExistingPatientNamesInDb(): Promise<number> {
  try {
    const patients = await db.patients.toArray()
    let updatedCount = 0

    for (const p of patients) {
      if (!p.id) continue
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
      console.log(`✓ Sanitasi otomatis: ${updatedCount} nama pasien di Dexie dibersihkan dari gelar ganda.`)
    }
    return updatedCount
  } catch (err) {
    console.warn('Gagal menormalisasi nama pasien di Dexie:', err)
    return 0
  }
}
