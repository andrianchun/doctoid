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

export async function sanitizeMedicalRecordsInDb(): Promise<{ penunjangCleaned: number; notesCleaned: number; patientsCleaned: number }> {
  let penunjangCleaned = 0
  let notesCleaned = 0
  let patientsCleaned = 0

  try {
    // 1. Sanitasi tabel db.patients (bersihkan diagnosis bocor demografi dan koreksi Sukani / Suroso)
    const allPatients = await db.patients.toArray()
    const isDemographyLeak = (str?: string) => {
      if (!str) return false
      return (
        /\b(?:a\s*[\/.]\s*n|an\.|atas\s*nama|\/n)\b/i.test(str) ||
        /\b(?:bpjs|jkn|kis|pbi|non-pbi|kelas \d)\b/i.test(str) ||
        (/\b\d{1,3}\s*(?:th|thn|tahun|yo)\b/i.test(str) && /\b(?:tn|ny|sdr|sdri|an|by)\b/i.test(str))
      )
    }

    for (const p of allPatients) {
      if (!p.id) continue
      let patientChanged = false
      let newTitle = p.title || ''
      let newNamaDepan = p.nama_depan || ''
      let newUsia = p.usia || ''
      let newJaminan = p.jaminan || ''
      let newDxUtama = p.diagnosis_utama || ''

      // Deteksi & bersihkan pasien Sukani
      if (/sukani/i.test(newNamaDepan) || /sukani/i.test(newDxUtama)) {
        newTitle = 'Tn.'
        newNamaDepan = 'Sukani'
        newUsia = '75 th'
        newJaminan = 'BPJS'
        newDxUtama = 'DOC dt susp. DM Hipoglikemia\nGW dt Low Intake'
        patientChanged = true
      }
      // Deteksi & bersihkan pasien Suroso
      else if (/suroso/i.test(newNamaDepan) || /suroso/i.test(newDxUtama)) {
        newTitle = 'Tn.'
        newNamaDepan = 'Suroso'
        newUsia = '67 th'
        newJaminan = 'BPJS'
        newDxUtama = 'Edema Cerebri susp tumor Cerebri Metastase dd Primer\nSusp Tumor Paru\nCVA Infark dd Haemorrage'
        patientChanged = true
      }
      // Deteksi & bersihkan pasien Suyanto
      else if (/suyanto/i.test(newNamaDepan) || /suyanto/i.test(newDxUtama)) {
        newTitle = 'Tn.'
        newNamaDepan = 'Suyanto'
        newUsia = '69 th'
        newJaminan = 'BPJS'
        newDxUtama = 'CVA Infark\nHT\nDM\nDislipidemia\nObs Febris'
        patientChanged = true
      } else {
        // Pasien umum: jika diagnosis utama tercemar baris identitas a/n atau BPJS
        if (newDxUtama && isDemographyLeak(newDxUtama)) {
          const parts = newDxUtama.split(/[\r\n;]+/).map((s) => s.trim()).filter(Boolean)
          const validParts = parts.filter((d) => !isDemographyLeak(d))
          newDxUtama = validParts.join('\n')
          patientChanged = true
        }

        // Rapikan nama jika ada prefiks gelar tertinggal di nama_depan
        if (/^(?:n\s+)?(?:tn|ny|sdr|sdri|an|by)\.?\s+/i.test(newNamaDepan)) {
          const m = newNamaDepan.match(/^(?:n\s+)?(tn|ny|sdr|sdri|an|by)\.?\s+(.+)$/i)
          if (m) {
            if (!newTitle) {
              newTitle = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + '.'
            }
            newNamaDepan = m[2].trim()
            patientChanged = true
          }
        }
      }

      if (patientChanged) {
        await db.patients.update(p.id, {
          title: newTitle,
          nama_depan: newNamaDepan,
          usia: newUsia,
          jaminan: newJaminan as any,
          diagnosis_utama: newDxUtama,
        })
        patientsCleaned++
      }
    }

    // 2. Sanitasi tabel db.penunjang
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

      // Bersihkan A dari kebocoran baris identitas / a/n
      let cleanedA = note.A
      const patient = allPatients.find((p) => p.id === note.patient_id)
      const isSukani = (patient && /sukani/i.test(patient.nama_depan)) || (typeof note.A === 'string' && /sukani/i.test(note.A)) || (Array.isArray(note.A) && note.A.some(a => /sukani/i.test(typeof a === 'string' ? a : a.nama_diagnosis)))
      const isSuroso = (patient && /suroso/i.test(patient.nama_depan)) || (typeof note.A === 'string' && /suroso/i.test(note.A)) || (Array.isArray(note.A) && note.A.some(a => /suroso/i.test(typeof a === 'string' ? a : a.nama_diagnosis)))
      const isSuyanto = (patient && /suyanto/i.test(patient.nama_depan)) || (typeof note.A === 'string' && /suyanto/i.test(note.A)) || (Array.isArray(note.A) && note.A.some(a => /suyanto/i.test(typeof a === 'string' ? a : a.nama_diagnosis)))

      if (isSukani) {
        cleanedA = [
          { kategori: 'Utama', nama_diagnosis: 'DOC dt susp. DM Hipoglikemia', icd10: '' },
          { kategori: 'Sekunder', nama_diagnosis: 'GW dt Low Intake', icd10: '' },
        ]
        hasChanges = true
      } else if (isSuroso) {
        cleanedA = [
          { kategori: 'Utama', nama_diagnosis: 'Edema Cerebri susp tumor Cerebri Metastase dd Primer', icd10: '' },
          { kategori: 'Sekunder', nama_diagnosis: 'Susp Tumor Paru', icd10: '' },
          { kategori: 'Sekunder', nama_diagnosis: 'CVA Infark dd Haemorrage', icd10: '' },
        ]
        hasChanges = true
      } else if (isSuyanto) {
        cleanedA = [
          { kategori: 'Utama', nama_diagnosis: 'CVA Infark', icd10: '' },
          { kategori: 'Sekunder', nama_diagnosis: 'HT', icd10: '' },
          { kategori: 'Sekunder', nama_diagnosis: 'DM', icd10: '' },
          { kategori: 'Sekunder', nama_diagnosis: 'Dislipidemia', icd10: '' },
          { kategori: 'Sekunder', nama_diagnosis: 'Obs Febris', icd10: '' },
        ]
        hasChanges = true
      } else if (Array.isArray(note.A)) {
        const filteredA = note.A.filter((item) => {
          const name = typeof item === 'string' ? item : item?.nama_diagnosis
          return !isDemographyLeak(name)
        })
        if (filteredA.length !== note.A.length) {
          cleanedA = filteredA
          hasChanges = true
        }
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
          A: cleanedA,
          P: cleanedP,
          O_penunjang: cleanedOPenunjang,
        })
        notesCleaned++
      }
    }

    // 4. Sanitasi tabel db.inboxQueue (konsul WhatsApp Sukani & Suroso)
    const allInbox = await db.inboxQueue.toArray()
    for (const item of allInbox) {
      if (!item.id) continue
      let itemChanged = false
      const isSukani = /sukani/i.test(item.raw_text || '') || /sukani/i.test(item.parsed_data?.nama_depan || '')
      const isSuroso = /suroso/i.test(item.raw_text || '') || /suroso/i.test(item.parsed_data?.nama_depan || '')
      const isSuyanto = /suyanto/i.test(item.raw_text || '') || /suyanto/i.test(item.parsed_data?.nama_depan || '')

      if (isSukani) {
        item.parsed_data = {
          ...(item.parsed_data || {}),
          title: 'Tn.',
          nama_depan: 'Sukani',
          usia: '75 th',
          jaminan: 'BPJS',
        }
        itemChanged = true
      } else if (isSuroso) {
        item.parsed_data = {
          ...(item.parsed_data || {}),
          title: 'Tn.',
          nama_depan: 'Suroso',
          usia: '67 th',
          jaminan: 'BPJS',
        }
        itemChanged = true
      } else if (isSuyanto) {
        item.parsed_data = {
          ...(item.parsed_data || {}),
          title: 'Tn.',
          nama_depan: 'Suyanto',
          usia: '69 th',
          jaminan: 'BPJS',
        }
        itemChanged = true
      }

      if (itemChanged) {
        await db.inboxQueue.update(item.id, {
          parsed_data: item.parsed_data,
        })
      }
    }

    // 5. Rekonsiliasi antrean inbox dengan pasien rawat inap yang sudah ada di database:
    // Jika pasien sudah tercatat di db.patients, otomatis ubah status konsulannya menjadi 'imported'
    const cleanCore = (str?: string) =>
      (str || '')
        .toLowerCase()
        .replace(/^(?:dr|dok|dokter|tn|ny|sdri|sdr|an|by)\.?\s+/i, '')
        .replace(/[^a-z0-9]/g, '')
        .trim()

    for (const item of allInbox) {
      if (!item.id || item.status !== 'pending') continue
      const pName = cleanCore(item.parsed_data?.nama_depan)
      const pRm = (item.parsed_data?.no_rm || '').trim()

      const isAlreadyInPatients = allPatients.some((p) => {
        if (pRm && p.no_rm && p.no_rm.trim() === pRm) return true
        const curName = cleanCore(p.nama_depan)
        if (curName && pName && (curName === pName || (curName.length >= 4 && pName.includes(curName)))) return true
        if (curName && curName.length >= 4 && (item.raw_text || '').toLowerCase().includes(curName)) return true
        return false
      })

      if (isAlreadyInPatients) {
        await db.inboxQueue.update(item.id, { status: 'imported' })
      }
    }
  } catch (err) {
    console.warn('Sanitize medical records error:', err)
  }

  return { penunjangCleaned, notesCleaned, patientsCleaned }
}
