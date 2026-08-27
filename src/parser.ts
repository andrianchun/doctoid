import type { TerapiItem, DiagnosisItem, Jaminan, RegexRule } from './db'

/* Parser lokal non-AI (hemat token): mendeteksi format konsultasi medis Indonesia secara komprehensif */

const NON_FARMAKO_REGEX =
  /\b(?:head\s*(?:trunk\s*)?up|posisi|semifowler|fowler|tirah\s*baring|bedrest|diet|o2|oksigen|nasal\s*c(?:anul|anula)?|masker|nrm|fisioterapi|mobilisasi|edukasi|rehabilitasi|infus\s*stop|puasa|pasang\s*ngt|pasang\s*kateter|rawat\s*luka|alih\s*baring|suction)\b/i

const DRUG_INDICATORS =
  /\b(?:ivfd|infus|injeksi|inj|drip|bolus|tab|tablet|kapsul|caps|kaplet|amp|ampul|vial|syrup|sirup|supp|suppositoria|mg|mcg|gr|gram|ml|cc|tpm|gtt|iu|ui|po|iv|im|sc|prn|flash|paracetamol|citicolin|citicoline|piracetam|mecobalamin|santagesik|ketorolac|ondansetron|omeprazole|ranitidine|ceftriaxone|ceftri|cefixime|asering|rl|ns|nacl|d5|d10|manitol|mannitol|aspilet|clopidogrel|atorvastatin|amlodipine|candesartan|furosemide|phenytoin|valproat|diazepam|asam\s*folat|beneuron|neurobion|b\s*complex)\b/i

const NOISE_PHRASES =
  /^(?:selamat\s*(?:pagi|siang|sore|malam)|assalamu['a-z]*|halo|mohon\s*(?:izin|advis|arahan|bimbingan|tatalaksana|petunjuk)|terima\s*kasih|matur\s*nuwun|ts\s*dr|dokter\s*jaga|ttd|asal\s*pasien)/i

export interface ParsedSoap {
  S: string
  O: string
  A: string
  P: TerapiItem[]
}

export function lineToTerapi(line: string, today: string, defaultKategori?: TerapiItem['kategori']): TerapiItem {
  const clean = line.replace(/^[-•*•–—\d.)\]]+\s*/, '').trim()
  
  // Deteksi nama dan dosis: mis. "Citicolin 500mg" -> "Citicolin" | "500mg"
  // atau "IVFD NS 0,9% 15 tpm" -> "IVFD NS 0,9%" | "15 tpm"
  let nama_item = clean
  let dosis_keterangan = ''

  const matchDosis = clean.match(/^(.+?)\s+((?:\d+[.,]?\d*|\b(?:satu|dua|tiga)\b|\b(?:tab|kapsul|amp|vial|fls|tpm|gtt|mg|mcg|gr|ml|cc|x)\b).*)$/i)
  if (matchDosis && matchDosis[1].length >= 2) {
    nama_item = matchDosis[1].trim()
    dosis_keterangan = matchDosis[2].trim()
  }

  let kategori: TerapiItem['kategori'] = defaultKategori || 'Farmakologi'
  if (!defaultKategori) {
    if (NON_FARMAKO_REGEX.test(clean) && !DRUG_INDICATORS.test(clean)) {
      kategori = 'Non-Farmakologi'
    } else {
      kategori = 'Farmakologi'
    }
  }

  return {
    nama_item,
    dosis_keterangan,
    tgl_mulai: today,
    tgl_stop: null,
    status: 'aktif',
    kategori,
  }
}

export function parseSoap(raw: string): ParsedSoap {
  const parsed = localParse(raw)
  return {
    S: parsed.data.S,
    O: [parsed.data.O_pemfis, parsed.data.O_penunjang].filter(Boolean).join('\n\n'),
    A: parsed.data.A.map((d) => d.nama_diagnosis).join('\n'),
    P: parsed.data.P,
  }
}

/* Klasifikasi fragmen pendek tanpa label (mis. "Ureum 100" saat menambah ke draft yang sudah ada) */
export function classifyFragment(text: string): 'terapi' | 'penunjang' | 'catatan' {
  const t = text.trim()
  if (!t) return 'catatan'
  if (DRUG_INDICATORS.test(t)) return 'terapi'
  if (/\b(?:hb|leuko|tromb|eritro|gda|gds|gdp|hba1c|ureum|ur|kreatinin|cr|sgot|sgpt|ot|pt|elektrolit|se|na|k|cl|ct|rontgen|ekg)\b/i.test(t) || /\d/.test(t)) {
    return 'penunjang'
  }
  return 'catatan'
}

/* Terapkan aturan regex yang dipelajari AI untuk satu field skalar; group 1 = value */
function applyLearnedScalar(raw: string, field: RegexRule['field'], rules: RegexRule[]): string {
  for (const r of rules) {
    if (r.field !== field) continue
    try {
      const m = raw.match(new RegExp(r.pattern, r.flags))
      if (m?.[1]) return m[1].trim()
    } catch {
      // pattern rusak, abaikan
    }
  }
  return ''
}

function parseIndoDate(str: string): string | null {
  if (!str) return null
  const isoMatch = str.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const dmyMatch = str.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const BULAN: Record<string, string> = {
    jan: '01', januari: '01', feb: '02', februari: '02', mar: '03', maret: '03',
    apr: '04', april: '04', mei: '05', jun: '06', juni: '06', jul: '07', juli: '07',
    agu: '08', agt: '08', agustus: '08', sep: '09', september: '09', okt: '10', oktober: '10',
    nov: '11', november: '11', des: '12', desember: '12'
  }
  const textDateMatch = str.match(/\b(\d{1,2})\s+([A-Za-z]{3,10})\s+(\d{4})\b/)
  if (textDateMatch) {
    const d = textDateMatch[1].padStart(2, '0')
    const b = BULAN[textDateMatch[2].toLowerCase()]
    const y = textDateMatch[3]
    if (b) return `${y}-${b}-${d}`
  }

  return null
}

function extractDates(raw: string): { tgl_mrs: string; tgl_onset: string } {
  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)
  let tgl_mrs = todayIso
  let tgl_onset = ''

  // A. Cari Tgl MRS eksplisit
  const mrsMatch = raw.match(/(?:tgl\s*mrs|mrs|tgl\s*masuk|masuk\s*rs)\s*[:-]?\s*([^\n,]+)/i)
  if (mrsMatch) {
    const parsed = parseIndoDate(mrsMatch[1])
    if (parsed) tgl_mrs = parsed
    else if (/kemarin/i.test(mrsMatch[1])) {
      const d = new Date(now)
      d.setDate(d.getDate() - 1)
      tgl_mrs = d.toISOString().slice(0, 10)
    }
  }

  // B. Cari Tgl Onset eksplisit
  const onsetExplicit = raw.match(/(?:tgl\s*onset|onset|awitan|kejadian)\s*[:-]?\s*([^\n,]+)/i)
  if (onsetExplicit) {
    const parsed = parseIndoDate(onsetExplicit[1])
    if (parsed) tgl_onset = parsed
    else if (/kemarin/i.test(onsetExplicit[1])) {
      const d = new Date(now)
      d.setDate(d.getDate() - 1)
      tgl_onset = d.toISOString().slice(0, 10)
    } else if (/hari\s*ini|tadi\s*pagi|tadi\s*malam|tadi\s*siang/i.test(onsetExplicit[1])) {
      tgl_onset = todayIso
    } else {
      const daysMatch = onsetExplicit[1].match(/(\d+)\s*(?:hari|hr)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum)?/i)
      if (daysMatch) {
        const d = new Date(now)
        d.setDate(d.getDate() - parseInt(daysMatch[1], 10))
        tgl_onset = d.toISOString().slice(0, 10)
      }
    }
  }

  // C. Jika belum ketemu onset eksplisit, deteksi dari narasi di Subjektif / RPS
  if (!tgl_onset) {
    if (/\b(?:sejak\s*kemarin|kemarin\s*(?:pagi|siang|sore|malam|jam|\d|sekitar))\b/i.test(raw)) {
      const d = new Date(now)
      d.setDate(d.getDate() - 1)
      tgl_onset = d.toISOString().slice(0, 10)
    } else if (/\b(?:sejak\s*tadi\s*(?:pagi|siang|sore|malam)|tadi\s*pagi|beberapa\s*jam\s*(?:lalu|smrs))\b/i.test(raw)) {
      tgl_onset = todayIso
    } else {
      const daysNarrative = raw.match(/(?:sejak|\b)(\d+)\s*(?:hari|hr)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum)/i) || raw.match(/sejak\s*(\d+)\s*(?:hari|hr)\b/i)
      if (daysNarrative) {
        const d = new Date(now)
        d.setDate(d.getDate() - parseInt(daysNarrative[1], 10))
        tgl_onset = d.toISOString().slice(0, 10)
      }
    }
  }

  return { tgl_mrs, tgl_onset }
}

export function extractDemografi(
  raw: string,
  learnedRules: RegexRule[] = [],
): {
  title: string
  nama_depan: string
  usia: string
  no_rm: string
  jaminan: Jaminan | ''
  tgl_mrs: string
  tgl_onset: string
} {
  let title = ''
  let nama_depan = ''

  // 1. Tangkap format nama dengan gelar: "*Tn. Farid/ 47 th/ BPJS 3*", "Tn. Farid, 47 th", "Nama: Tn. Farid"
  const nameWithTitle = raw.match(/[*_~#]*[ \t]*\b(Tn|Ny|Sdr|Sdri|An|By)\.?[ \t]+([A-Za-z'.-]+(?:[ \t]+[A-Za-z'.-]+){0,3})/i)
  if (nameWithTitle) {
    const rawTitle = nameWithTitle[1].charAt(0).toUpperCase() + nameWithTitle[1].slice(1).toLowerCase()
    title = rawTitle.endsWith('.') ? rawTitle : rawTitle + '.'
    nama_depan = nameWithTitle[2].replace(/[/,*_–—|]/g, '').trim()
  } else {
    const labelNama = raw.match(/(?:nama(?:\s*pasien)?|identitas|pasien)\s*[:-]\s*([A-Za-z][A-Za-z'.\s]{1,40}?)(?=\s*(?:,|\n|usia|umur|rm|\/|$))/i)
    if (labelNama) {
      nama_depan = labelNama[1].trim()
      const checkTitle = nama_depan.match(/^(Tn|Ny|Sdr|Sdri|An|By)\.?\s+(.+)$/i)
      if (checkTitle) {
        const rawTitle = checkTitle[1].charAt(0).toUpperCase() + checkTitle[1].slice(1).toLowerCase()
        title = rawTitle.endsWith('.') ? rawTitle : rawTitle + '.'
        nama_depan = checkTitle[2].trim()
      }
    } else {
      nama_depan = applyLearnedScalar(raw, 'nama_depan', learnedRules)
    }
  }

  // 2. Tangkap usia: "47 th", "47th", "47 tahun", "47 thn", "Usia 47"
  const usiaMatch = raw.match(/\b(?:usia|umur)?\s*(\d{1,3})\s*(?:th|thn|tahun|yo)\b/i) || raw.match(/\b(?:usia|umur)\s*[:-]?\s*(\d{1,3})\b/i)
  const usia = usiaMatch && usiaMatch[1] ? `${usiaMatch[1]} th` : applyLearnedScalar(raw, 'usia', learnedRules)

  // 3. Tangkap No. RM
  const rmMatch = raw.match(/(?:no\.?\s*rm|no\.?\s*rekam\s*medis|rm)\s*[:-]?\s*([\d-/]{4,20})/i)
  const no_rm = rmMatch ? rmMatch[1].trim() : applyLearnedScalar(raw, 'no_rm', learnedRules)

  // 4. Tangkap Jaminan: BPJS (BPJS 1, BPJS 2, BPJS 3, BPJS Non PBI), JKN, KIS, Umum, Asuransi
  const jaminanMatch = raw.match(/\b(BPJS(?:\s*\d)?|JKN|KIS|Umum|Asuransi)\b/i)
  let jaminan: Jaminan | '' = ''
  if (jaminanMatch) {
    const jm = jaminanMatch[1].toUpperCase()
    if (jm.startsWith('BPJS') || jm === 'JKN' || jm === 'KIS') jaminan = 'BPJS'
    else if (jm.startsWith('UMUM')) jaminan = 'Umum'
    else if (jm.startsWith('ASURANSI')) jaminan = 'Asuransi'
  }
  if (!jaminan) {
    jaminan = (applyLearnedScalar(raw, 'jaminan', learnedRules) as Jaminan | '') || ''
  }

  // 5. Tanggal MRS & Tanggal Onset
  const { tgl_mrs, tgl_onset } = extractDates(raw)

  return { title, nama_depan, usia, no_rm, jaminan, tgl_mrs, tgl_onset }
}

interface RawSections {
  S: string[]
  O_pemfis: string[]
  O_penunjang: string[]
  A: string[]
  P: string[]
}

const SECTION_HEADER_PATTERNS: { regex: RegExp; section: keyof RawSections }[] = [
  // S (Subjektif)
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:S|Subjektif|Subyektif|Subjective|Anamnesis|Keluhan|Keluhan\s*Utama|RPS)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'S',
  },
  // O - Penunjang Khusus
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:Penunjang|Pemeriksaan\s*Penunjang|Hasil\s*Penunjang|Hasil\s*Lab|Laboratorium|Radiologi|CT[\s-]?Scan|Foto\s*Rontgen|EKG)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'O_penunjang',
  },
  // O - Pemfis / Objektif Umum
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:O|Objektif|Obyektif|Objective|Pemeriksaan\s*Fisik|Pemfis|Status\s*Generalis|Status\s*Neurologi|Status\s*Neurologis|Pemeriksaan)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'O_pemfis',
  },
  // A (Assessment)
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:A|Assessment|Assesment|Asesmen|Diagnosis|Diagnosa|Dx|WD\/?|DD\/?|Impresi\s*Klinis)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'A',
  },
  // P (Planning)
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:P|Plan|Planning|Tatalaksana|Penatalaksanaan|Terapi|Tx|Rencana|Advis)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'P',
  },
]

function sectionize(raw: string): RawSections {
  const sections: RawSections = { S: [], O_pemfis: [], O_penunjang: [], A: [], P: [] }
  let current: keyof RawSections | null = null

  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Abaikan kalimat basa-basi konsultasi di awal/akhir
    if (NOISE_PHRASES.test(line) && !current) continue
    if (/^mohon\s*(?:advis|tatalaksana|petunjuk)/i.test(line)) continue

    // Cek apakah baris ini adalah header seksi SOAP
    let matchedSection: keyof RawSections | null = null
    let inlineContent = ''

    for (const { regex, section } of SECTION_HEADER_PATTERNS) {
      const match = line.match(regex)
      if (match) {
        matchedSection = section
        inlineContent = match[1] ? match[1].trim() : ''
        break
      }
    }

    if (matchedSection) {
      current = matchedSection
      if (inlineContent) {
        sections[current].push(inlineContent)
      }
    } else if (current) {
      // Deteksi penunjang yang terselip di dalam O (misal: "GDA 186 mg/dl" atau "CT Scan Kepala:")
      if (current === 'O_pemfis' && /^(?:GDA|GDS|GDP|HbA1c|Hasil\s*Lab|Lab:|Radiologi:|CT[\s-]?Scan)\b/i.test(line)) {
        sections.O_penunjang.push(line)
      } else {
        sections[current].push(line)
      }
    }
  }

  return sections
}

function parseDiagnosisLines(lines: string[]): DiagnosisItem[] {
  const results: DiagnosisItem[] = []
  for (const line of lines) {
    const clean = line.replace(/^[-•*•–—\d.)\]]+\s*/, '').trim()
    if (!clean) continue
    if (NOISE_PHRASES.test(clean)) continue

    // Pisahkan jika ada koma di baris yang sama (mis. "CVA Infark, HT, DM")
    const parts = clean.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean)
    for (const part of parts) {
      if (part.length >= 2) {
        results.push({
          kategori: results.length === 0 ? 'Utama' : 'Sekunder',
          nama_diagnosis: part,
          icd10: '',
        })
      }
    }
  }
  return results
}

function parsePlanningLines(lines: string[], today: string): TerapiItem[] {
  const items: TerapiItem[] = []
  let currentSubCat: 'Diagnostik' | 'Farmakologi' | 'Non-Farmakologi' | 'Monitoring' | 'Edukasi' = 'Farmakologi'
  let activeRoute = '' // e.g. 'PO', 'IV'

  for (const line of lines) {
    const rawLine = line.trim()
    if (!rawLine) continue
    if (NOISE_PHRASES.test(rawLine)) continue

    // 1. Deteksi Sub-Header PDX (Plan Diagnostik)
    const pdxMatch = rawLine.match(/^(?:[*_~#]*\s*)?(?:Pdx|Plan\s*Diagnostik|Diagnostik|Usulan\s*Lab|Pemeriksaan\s*Penunjang)\b\s*[:\-–—]?\s*(.*)$/i)
    if (pdxMatch) {
      currentSubCat = 'Diagnostik'
      activeRoute = ''
      const rest = pdxMatch[1].trim()
      if (rest) {
        const pdxParts = rest.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean)
        for (const p of pdxParts) {
          items.push({
            nama_item: p,
            dosis_keterangan: '',
            tgl_mulai: today,
            tgl_stop: null,
            status: 'aktif',
            kategori: 'Diagnostik',
          })
        }
      }
      continue
    }

    // 2. Deteksi Sub-Header PTX (Plan Terapi)
    const ptxMatch = rawLine.match(/^(?:[*_~#]*\s*)?(?:Ptx|Plan\s*Terapi|Terapi|Tx|Medikamentosa)\b\s*[:\-–—]?\s*(.*)$/i)
    if (ptxMatch) {
      currentSubCat = 'Farmakologi'
      activeRoute = ''
      const rest = ptxMatch[1].trim()
      if (rest) {
        items.push(lineToTerapi(rest, today, undefined))
      }
      continue
    }

    // 3. Deteksi Sub-Header PMX (Plan Monitoring)
    const pmxMatch = rawLine.match(/^(?:[*_~#]*\s*)?(?:Pmx|Plan\s*Monitoring|Monitoring|Observasi)\b\s*[:\-–—]?\s*(.*)$/i)
    if (pmxMatch) {
      currentSubCat = 'Monitoring'
      activeRoute = ''
      const rest = pmxMatch[1].trim()
      if (rest) {
        items.push({
          nama_item: rest,
          dosis_keterangan: '',
          tgl_mulai: today,
          tgl_stop: null,
          status: 'aktif',
          kategori: 'Monitoring',
        })
      }
      continue
    }

    // 4. Deteksi Sub-Header PEX (Plan Edukasi)
    const pexMatch = rawLine.match(/^(?:[*_~#]*\s*)?(?:Pex|Plan\s*Edukasi|Edukasi)\b\s*[:\-–—]?\s*(.*)$/i)
    if (pexMatch) {
      currentSubCat = 'Edukasi'
      activeRoute = ''
      const rest = pexMatch[1].trim()
      if (rest) {
        items.push({
          nama_item: rest,
          dosis_keterangan: '',
          tgl_mulai: today,
          tgl_stop: null,
          status: 'aktif',
          kategori: 'Edukasi',
        })
      }
      continue
    }

    // 5. Deteksi Baris Rute Mandiri (mis. "PO", "IV", "Injeksi:", "Oral:")
    const routeOnlyMatch = rawLine.match(/^(?:[*_~#]*\s*)?(PO|IV|IM|SC|Oral|Injeksi|Drip|Topikal|Inhalasi)\s*[:\-–—]?\s*$/i)
    if (routeOnlyMatch) {
      activeRoute = routeOnlyMatch[1].toUpperCase()
      continue
    }

    // 6. Parsing Item Terapi Biasa
    const cleanItem = rawLine.replace(/^[-•*•–—\d.)\]]+\s*/, '').trim()
    if (!cleanItem) continue

    if (currentSubCat === 'Diagnostik') {
      const parts = cleanItem.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean)
      for (const p of parts) {
        items.push({
          nama_item: p,
          dosis_keterangan: '',
          tgl_mulai: today,
          tgl_stop: null,
          status: 'aktif',
          kategori: 'Diagnostik',
        })
      }
    } else if (currentSubCat === 'Monitoring') {
      items.push({
        nama_item: cleanItem,
        dosis_keterangan: '',
        tgl_mulai: today,
        tgl_stop: null,
        status: 'aktif',
        kategori: 'Monitoring',
      })
    } else if (currentSubCat === 'Edukasi') {
      items.push({
        nama_item: cleanItem,
        dosis_keterangan: '',
        tgl_mulai: today,
        tgl_stop: null,
        status: 'aktif',
        kategori: 'Edukasi',
      })
    } else {
      // Terapi (Farmakologi / Non-Farmakologi)
      const parsed = lineToTerapi(cleanItem, today)
      if (activeRoute && !new RegExp(`\\b${activeRoute}\\b`, 'i').test(parsed.nama_item) && !new RegExp(`\\b${activeRoute}\\b`, 'i').test(parsed.dosis_keterangan)) {
        parsed.dosis_keterangan = parsed.dosis_keterangan ? `${parsed.dosis_keterangan} ${activeRoute}` : activeRoute
      }
      items.push(parsed)
    }
  }

  return items
}

export interface LocalParseResult {
  title: string
  nama_depan: string
  usia: string
  no_rm: string
  jaminan: Jaminan | ''
  tgl_mrs: string
  tgl_onset: string
  S: string
  O_pemfis: string
  O_penunjang: string
  A: DiagnosisItem[]
  P: TerapiItem[]
}

export function localParse(raw: string, learnedRules: RegexRule[] = []): { data: LocalParseResult; success: boolean } {
  const demo = extractDemografi(raw, learnedRules)
  const sec = sectionize(raw)
  const today = new Date().toISOString().slice(0, 10)

  const S = sec.S.join('\n').trim()
  const O_pemfis = sec.O_pemfis.join('\n').trim()
  const O_penunjang = sec.O_penunjang.join('\n').trim()
  const A = parseDiagnosisLines(sec.A)
  const P = parsePlanningLines(sec.P, today)

  const data: LocalParseResult = {
    ...demo,
    S,
    O_pemfis,
    O_penunjang,
    A,
    P,
  }

  // Sukses jika minimal nama atau (S/O) dan A/P terdeteksi
  const success = (!!data.nama_depan || !!data.S || !!data.O_pemfis) && (data.A.length > 0 || data.P.length > 0)
  return { data, success }
}
