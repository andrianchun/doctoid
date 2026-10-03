import type { Patient, Hospital, Ward, ProgressNote } from '../db'

/**
 * In-memory cache across route navigations.
 * Holds active data in memory so transitions between Dasbor, Rekam Medis,
 * and Patient Profile render instantly on frame 0 without layout flicker or blank flashes.
 */
export const appCache = {
  hospitals: undefined as Hospital[] | undefined,
  wards: undefined as Ward[] | undefined,
  aktifPatients: undefined as Patient[] | undefined,
  allPatients: undefined as Patient[] | undefined,
  allNotes: undefined as ProgressNote[] | undefined,
  patientsMap: new Map<number, Patient>(),
  notesMap: new Map<number, ProgressNote[]>(),
  latestNoteMap: new Map<number, ProgressNote>(),
  wardsMap: new Map<number, Ward>(),
  hospitalsMap: new Map<number, Hospital>(),
}

export function cacheHospitals(list: Hospital[]) {
  appCache.hospitals = list
  for (const h of list) {
    if (h.id) appCache.hospitalsMap.set(h.id, h)
  }
}

export function cacheWards(list: Ward[]) {
  appCache.wards = list
  for (const w of list) {
    if (w.id) appCache.wardsMap.set(w.id, w)
  }
}

export function cachePatients(list: Patient[]) {
  appCache.aktifPatients = list
  for (const p of list) {
    if (p.id) appCache.patientsMap.set(p.id, p)
  }
}

export function cacheAllPatients(list: Patient[]) {
  appCache.allPatients = list
  for (const p of list) {
    if (p.id) appCache.patientsMap.set(p.id, p)
  }
}

export function cachePatient(p: Patient) {
  if (!p.id) return
  appCache.patientsMap.set(p.id, p)
  if (appCache.aktifPatients) {
    if (p.status_rawat === 'aktif') {
      const idx = appCache.aktifPatients.findIndex((item) => item.id === p.id)
      if (idx >= 0) {
        const next = [...appCache.aktifPatients]
        next[idx] = p
        appCache.aktifPatients = next
      } else {
        appCache.aktifPatients = [...appCache.aktifPatients, p]
      }
    } else {
      // Hapus pasien dari cache rawat aktif jika sudah KRS/Meninggal/Alih Rawat/Rujuk
      appCache.aktifPatients = appCache.aktifPatients.filter((item) => item.id !== p.id)
    }
  }
  if (appCache.allPatients) {
    const idx = appCache.allPatients.findIndex((item) => item.id === p.id)
    if (idx >= 0) {
      const next = [...appCache.allPatients]
      next[idx] = p
      appCache.allPatients = next
    } else {
      appCache.allPatients = [...appCache.allPatients, p]
    }
  }
}

export function cacheNotes(list: ProgressNote[]) {
  appCache.allNotes = list
  const grouped = new Map<number, ProgressNote[]>()
  for (const n of list) {
    if (!n.patient_id) continue
    const arr = grouped.get(n.patient_id) || []
    arr.push(n)
    grouped.set(n.patient_id, arr)
  }
  for (const [pid, arr] of grouped.entries()) {
    arr.sort((a, b) => {
      const tA = a.tanggal ? new Date(a.tanggal).getTime() : 0
      const tB = b.tanggal ? new Date(b.tanggal).getTime() : 0
      if (tA !== tB) return tA - tB
      return (a.id ?? 0) - (b.id ?? 0)
    })
    appCache.notesMap.set(pid, arr)
    if (arr.length > 0) {
      appCache.latestNoteMap.set(pid, arr[arr.length - 1])
    }
  }
}
