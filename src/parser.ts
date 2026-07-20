import type { TerapiItem } from './db'

/* Parser lokal non-AI (hemat token): pecah teks bebas jadi SOAP via label baris */
const LABELS: Record<string, 'S' | 'O' | 'A' | 'P'> = {
  s: 'S', subjektif: 'S', subjective: 'S', keluhan: 'S',
  o: 'O', objektif: 'O', objective: 'O', pemeriksaan: 'O',
  a: 'A', asesmen: 'A', assessment: 'A', diagnosis: 'A', dx: 'A',
  p: 'P', plan: 'P', planning: 'P', terapi: 'P', tx: 'P',
}

const NON_FARMAKO = /diet|o2|oksigen|nasal|fisioterapi|posisi|head\s*up|mobilisasi|edukasi|rehabilitasi|infus\s*stop|puasa|ngt|kateter/i

export interface ParsedSoap {
  S: string
  O: string
  A: string
  P: TerapiItem[]
}

export function lineToTerapi(line: string, today: string): TerapiItem {
  const clean = line.replace(/^[-•*•]\s*/, '').trim()
  const m = clean.match(/^(.+?)\s+(\d.*)$/) // "Citicoline 2x500 mg" → nama | dosis
  return {
    nama_item: m ? m[1] : clean,
    dosis_keterangan: m ? m[2] : '',
    tgl_mulai: today,
    tgl_stop: null,
    status: 'aktif',
    kategori: NON_FARMAKO.test(clean) ? 'Non-Farmakologi' : 'Farmakologi',
  }
}

export function parseSoap(raw: string): ParsedSoap {
  const sections: Record<'S' | 'O' | 'A' | 'P', string[]> = { S: [], O: [], A: [], P: [] }
  let current: 'S' | 'O' | 'A' | 'P' | null = null
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z]{1,12})\s*[:\-–]\s*(.*)$/)
    const key = m ? LABELS[m[1].toLowerCase()] : undefined
    if (key) {
      current = key
      if (m![2].trim()) sections[key].push(m![2].trim())
    } else if (current && line.trim()) {
      sections[current].push(line.trim())
    }
  }
  const today = new Date().toISOString().slice(0, 10)
  return {
    S: sections.S.join('\n'),
    O: sections.O.join('\n'),
    A: sections.A.join('\n'),
    P: sections.P.map((l) => lineToTerapi(l, today)),
  }
}
