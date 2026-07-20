import { db, type TerapiItem } from './db'
import { lineToTerapi } from './parser'

/* Micro-Update: parse perintah singkat ("Stop Ceftriaxone, tambah Valsartan 1x80"),
   duplikasi ProgressNote terakhir sebagai note hari ini, lalu terapkan ke daftar P. */
export interface MicroResult {
  applied: string[]
  ignored: string[]
}

export async function applyMicroUpdate(patientId: number, command: string): Promise<MicroResult> {
  const today = new Date().toISOString().slice(0, 10)
  const notes = await db.progressNotes.where('patient_id').equals(patientId).sortBy('tanggal')
  const last = notes[notes.length - 1]
  const P: TerapiItem[] = last ? structuredClone(last.P) : []
  const applied: string[] = []
  const ignored: string[] = []

  for (const seg of command.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
    let m: RegExpMatchArray | null
    if ((m = seg.match(/^(?:stop|hentikan|aff)\s+(.+)$/i))) {
      const q = m[1].toLowerCase()
      const target = P.find((p) => p.status === 'aktif' && p.nama_item.toLowerCase().includes(q))
      if (target) {
        target.status = 'stop'
        target.tgl_stop = today
        applied.push(`stop ${target.nama_item}`)
      } else ignored.push(seg)
    } else if ((m = seg.match(/^(?:tambah|tambahkan|add|\+|mulai|start)\s+(.+)$/i))) {
      P.push(lineToTerapi(m[1], today))
      applied.push(`+ ${m[1]}`)
    } else ignored.push(seg)
  }

  if (last && last.tanggal === today) {
    await db.progressNotes.update(last.id!, { P })
  } else {
    await db.progressNotes.add({
      patient_id: patientId,
      tanggal: today,
      S: last?.S ?? '',
      O_pemfis: (last as any)?.O_pemfis ?? '',
      O_penunjang: (last as any)?.O_penunjang ?? '',
      A: last?.A ?? [],
      P,
      icd9_code: last?.icd9_code ?? '',
    })
  }
  return { applied, ignored }
}
