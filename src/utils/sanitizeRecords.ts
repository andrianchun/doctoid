import { db, type TerapiItem } from '../db'

/**
 * Utility untuk membersihkan data rekam medis yang sudah tersimpan di database lokal Dexie.
 * Menghilangkan:
 * 1. Judul file gambar teknis ('Foto_*.webp') dari tabel penunjang dan memadukan lampiran ke nama baku medis.
 * 2. Entri 'Foto_*.webp', tanda baca '/', diagnosis nyasar, dan terapi duplikat dari array P (Planning) di progress notes.
 */

const isTechnicalFilename = (str?: string) => {
  if (!str) return false
  const t = str.trim()
  return (
    /\b(?:Foto_\d+|image_\d+|img_\d+|\d{12,}\.(?:webp|jpg|jpeg|png))\b/i.test(t) ||
    /\.(?:webp|jpg|jpeg|png)$/i.test(t)
  )
}

const isGarbageToken = (s?: string) => {
  if (!s) return true
  const t = s.trim()
  if (!t) return true
  if (/^[/\\*_\-~#.,;:\s]+$/.test(t)) return true
  return false
}

const isLikelyDiagnosis = (s?: string) => {
  if (!s) return false
  return (
    /\b(?:fraktur|infark|cva\b|stroke|hemipares|spondil|hnp\b|gbs\b|meningitis|encephalitis|sol\b|tumor|vertigo|bppv|seizure|epilep|febris|syok|edema\s*paru|kardiomegali|hipertensi|dm\b|diabetes|lapsus)\b/i.test(s) &&
    !/\b(?:inj|inf|ivfd|po|drip|tab|kapsul|mg|amp|vial)\b/i.test(s)
  )
}

export async function sanitizeMedicalRecordsInDb(): Promise<{ penunjangCleaned: number; notesCleaned: number }> {
  let penunjangCleaned = 0
  let notesCleaned = 0

  try {
    // 1. Sanitasi tabel db.penunjang
    const allPenunjang = await db.penunjang.toArray()
    
    // Kelompokkan per patient_id + tanggal + kategori untuk konsolidasi duplikat Foto_
    const patientMap = new Map<string, typeof allPenunjang>()
    for (const p of allPenunjang) {
      const key = `${p.patient_id}_${p.tanggal}`
      if (!patientMap.has(key)) patientMap.set(key, [])
      patientMap.get(key)!.push(p)
    }

    for (const [, records] of patientMap.entries()) {
      const techRecords = records.filter((r) => isTechnicalFilename(r.nama_pemeriksaan))
      if (techRecords.length === 0) continue

      // Kelompokkan file teknis berdasarkan modalitas
      const byKat: Record<string, typeof techRecords> = {
        Radiologi: [],
        Laboratorium: [],
        Lainnya: [],
      }

      for (const rec of techRecords) {
        const text = `${rec.kategori} ${rec.hasil || ''}`.toLowerCase()
        if (/ct|mri|rontgen|foto|thorax|radiologi/i.test(text)) {
          byKat.Radiologi.push(rec)
        } else if (/lab|darah|gda|gds|urine|urin|elektrolit/i.test(text)) {
          byKat.Laboratorium.push(rec)
        } else {
          byKat.Lainnya.push(rec)
        }
      }

      for (const [katKey, group] of Object.entries(byKat)) {
        if (group.length === 0) continue

        // Ambil record pertama sebagai master
        const master = group[0]
        if (!master.id) continue

        let namaBaku = 'Pemeriksaan Penunjang'
        const lowerHasil = (master.hasil || '').toLowerCase()
        if (katKey === 'Radiologi') {
          namaBaku = /ct[\s-]?scan|msct/i.test(lowerHasil) ? 'CT Scan Kepala' : 'Pemeriksaan Radiologi'
        } else if (katKey === 'Laboratorium') {
          namaBaku = 'Pemeriksaan Laboratorium'
        } else if (/ekg/i.test(lowerHasil)) {
          namaBaku = 'EKG 12-Lead'
        }

        // Kumpulkan seluruh lampiran dari seluruh file teknis dalam kelompok
        const allAtts = group.flatMap((g) => g.attachments || [])
        const seenUrls = new Set<string>()
        const uniqueAtts = allAtts.filter((a) => {
          if (!a.dataUrl || seenUrls.has(a.dataUrl)) return false
          seenUrls.add(a.dataUrl)
          return true
        })

        // Update master record
        await db.penunjang.update(master.id, {
          nama_pemeriksaan: namaBaku,
          attachments: uniqueAtts,
        })
        penunjangCleaned++

        // Hapus record duplikat sisanya
        for (let i = 1; i < group.length; i++) {
          const dup = group[i]
          if (dup.id) {
            await db.penunjang.delete(dup.id)
            penunjangCleaned++
          }
        }
      }
    }

    // 2. Sanitasi tabel db.progressNotes
    const allNotes = await db.progressNotes.toArray()
    for (const note of allNotes) {
      if (!note.id) continue
      let hasChanges = false

      // Bersihkan array P
      let cleanedP: TerapiItem[] = []
      if (Array.isArray(note.P)) {
        const rawP = note.P.filter((item) => {
          if (isTechnicalFilename(item.nama_item)) {
            hasChanges = true
            return false
          }
          if (isGarbageToken(item.nama_item)) {
            hasChanges = true
            return false
          }
          if (isLikelyDiagnosis(item.nama_item)) {
            hasChanges = true
            return false
          }
          return true
        })

        // Deduplikasi terapi
        const seenMedKeys = new Map<string, number>()
        for (const item of rawP) {
          const coreKey = item.nama_item
            .toLowerCase()
            .replace(/\b(?:inj\.?|injeksi|inf\.?|infus|ivfd|po|oral|tab|kapsul|drip|syrup|sirup|fls|vial|amp)\b/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim()

          if (!coreKey) {
            cleanedP.push(item)
            continue
          }

          if (seenMedKeys.has(coreKey)) {
            hasChanges = true
            const idx = seenMedKeys.get(coreKey)!
            const existing = cleanedP[idx]
            if ((item.dosis_keterangan?.length || 0) > (existing.dosis_keterangan?.length || 0)) {
              cleanedP[idx] = item
            }
          } else {
            seenMedKeys.set(coreKey, cleanedP.length)
            cleanedP.push(item)
          }
        }

        if (cleanedP.length !== note.P.length) {
          hasChanges = true
        }
      } else {
        cleanedP = note.P
      }

      // Bersihkan O_penunjang jika ada nama file teknis
      let cleanedOPenunjang = note.O_penunjang || ''
      if (cleanedOPenunjang && isTechnicalFilename(cleanedOPenunjang)) {
        const lines = cleanedOPenunjang.split('\n').filter((l) => !isTechnicalFilename(l))
        cleanedOPenunjang = lines.join('\n').trim()
        if (cleanedOPenunjang !== note.O_penunjang) {
          hasChanges = true
        }
      }

      if (hasChanges) {
        await db.progressNotes.update(note.id, {
          P: cleanedP,
          O_penunjang: cleanedOPenunjang,
        })
        notesCleaned++
      }
    }
  } catch (err) {
    console.warn('Sanitize medical records error:', err)
  }

  return { penunjangCleaned, notesCleaned }
}
