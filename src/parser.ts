import type { TerapiItem, DiagnosisItem, Jaminan, RegexRule } from './db'
import { getLocalDateString } from './utils/dateFormat'

/* Parser lokal non-AI (hemat token): mendeteksi format konsultasi medis Indonesia secara komprehensif */

const NON_FARMAKO_REGEX =
  /\b(?:head\s*(?:trunk\s*)?up|posisi|semifowler|fowler|tirah\s*baring|bed\s*rest|bedrest|diet|o2|oksigen|nasal\s*c(?:anul|anula)?|masker|nrm|fisioterapi|mobilisasi|edukasi|rehabilitasi|infus\s*stop|puasa|pasang\s*ngt|pasang\s*kateter|rawat\s*luka|alih\s*baring|suction)\b/i

export const WA_HEADER_REGEX =
  /(?:^|\r?\n)(?:\[\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?,?\s*\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*[AP]M)?\]|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?,?\s*\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*[AP]M)?\s*[-–—])\s*([^:\n]+):\s*/gi

const IS_TEMPERATURE_LINE =
  /^\s*(?:[*_~#]*\s*)?S\s*[:=\t\-–—]\s*(?:\d{1,2}(?:[.,]\d+)?\s*(?:°?C|c|celcius)?\b|febris|afebris)/i

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
  const dmy2Match = str.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2})\b/)
  if (dmy2Match) {
    const [, d, m, yy] = dmy2Match
    const fullYear = parseInt(yy, 10) < 50 ? `20${yy}` : `19${yy}`
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const BULAN: Record<string, string> = {
    jan: '01', januari: '01', feb: '02', februari: '02', mar: '03', maret: '03',
    apr: '04', april: '04', mei: '05', jun: '06', juni: '06', jul: '07', juli: '07',
    agu: '08', agt: '08', agustus: '08', sep: '09', september: '09', okt: '10', oktober: '10',
    nov: '11', november: '11', des: '12', desember: '12'
  }
  const textDateMatch = str.match(/\b(\d{1,2})\s+([A-Za-z]{3,10})\s+(\d{2,4})\b/)
  if (textDateMatch) {
    const d = textDateMatch[1].padStart(2, '0')
    const b = BULAN[textDateMatch[2].toLowerCase()]
    let y = textDateMatch[3]
    if (y.length === 2) y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`
    if (b) return `${y}-${b}-${d}`
  }

  return null
}

function parseIsoDateToLocal(isoStr: string): Date {
  const [y, m, d] = isoStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function formatDateToIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDaysToIso(isoStr: string, days: number): string {
  const d = parseIsoDateToLocal(isoStr)
  d.setDate(d.getDate() + days)
  return formatDateToIso(d)
}

function extractDates(raw: string): { tgl_mrs: string; tgl_onset: string } {
  const now = new Date()
  const todayIso = formatDateToIso(now)
  let tgl_mrs = todayIso
  let tgl_onset = ''

  // A. Cari Tgl MRS eksplisit
  const mrsMatch = raw.match(/(?:tgl\s*mrs|mrs|tgl\s*masuk|masuk\s*rs)\s*[:-]?\s*([^\n,]+)/i) ||
                   raw.match(/masuk\s*(?:rs|rumah\s*sakit)?\s*(?:pada\s*tanggal|tgl)?\s*[:-]?\s*([^\n,]+)/i)
  if (mrsMatch) {
    const parsed = parseIndoDate(mrsMatch[1])
    if (parsed) {
      tgl_mrs = parsed
    } else if (/kemarin/i.test(mrsMatch[1])) {
      tgl_mrs = addDaysToIso(todayIso, -1)
    }
  }

  // B. Cari Tgl Onset eksplisit
  const onsetExplicit = raw.match(/(?:tgl\s*onset|onset|awitan|kejadian)\s*[:-]?\s*([^\n,]+)/i)
  if (onsetExplicit) {
    const content = onsetExplicit[1].trim()
    const parsed = parseIndoDate(content)
    if (parsed) {
      tgl_onset = parsed
    } else if (/kemarin/i.test(content)) {
      tgl_onset = addDaysToIso(tgl_mrs, -1)
    } else {
      // 1. Cek jam / menit / waktu akut di onset eksplisit (misal: "3 jam SMRS", "3 jam sebelum MRS", "tadi pagi")
      const hoursMatch = content.match(/(\d+(?:[.,]\d+)?)\s*(?:jam|jm)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)?/i) ||
                         content.match(/^(\d+(?:[.,]\d+)?)\s*(?:jam|jm)$/i)
      const minutesMatch = content.match(/(\d+)\s*(?:menit|mnt)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)?/i) ||
                           content.match(/^(\d+)\s*(?:menit|mnt)$/i)
      const tadiMatch = /hari\s*ini|tadi\s*pagi|tadi\s*malam|tadi\s*siang|tadi\s*sore|beberapa\s*jam/i.test(content)

      if (hoursMatch) {
        const hours = parseFloat(hoursMatch[1].replace(',', '.'))
        tgl_onset = hours >= 24 ? addDaysToIso(tgl_mrs, -Math.round(hours / 24)) : tgl_mrs
      } else if (minutesMatch || tadiMatch) {
        tgl_onset = tgl_mrs
      } else {
        // 2. Cek hari (misal: "3 hari yang lalu", "3 hari SMRS", "3 hari sebelum MRS")
        const daysMatch = content.match(/(\d+)\s*(?:hari|hr)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)?/i) ||
                          content.match(/^(\d+)\s*(?:hari|hr)$/i)
        // 3. Cek minggu
        const weeksMatch = content.match(/(\d+)\s*(?:minggu|mgg)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)?/i)
        // 4. Cek bulan
        const monthsMatch = content.match(/(\d+)\s*(?:bulan|bln)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)?/i)

        if (daysMatch) {
          tgl_onset = addDaysToIso(tgl_mrs, -parseInt(daysMatch[1], 10))
        } else if (weeksMatch) {
          tgl_onset = addDaysToIso(tgl_mrs, -parseInt(weeksMatch[1], 10) * 7)
        } else if (monthsMatch) {
          tgl_onset = addDaysToIso(tgl_mrs, -parseInt(monthsMatch[1], 10) * 30)
        }
      }
    }
  }

  // C. Jika belum ketemu onset eksplisit, deteksi dari narasi di Subjektif / RPS
  if (!tgl_onset) {
    // 1. Durasi jam atau menit (misal: "3 jam sebelum MRS", "3 jam SMRS", "bicara pelo sejak 2 jam yll", "onset 4.5 jam")
    const narrativeHours = raw.match(/(?:sejak|\b)(\d+(?:[.,]\d+)?)\s*(?:jam|jm)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)/i) ||
                           raw.match(/\bonset\s*[:<>=~]?\s*(\d+(?:[.,]\d+)?)\s*(?:jam|jm)\b/i) ||
                           raw.match(/(?:tiba-tiba|mendadak).*?(\d+(?:[.,]\d+)?)\s*(?:jam|jm)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)/i)

    const narrativeMinutes = raw.match(/(?:sejak|\b)(\d+)\s*(?:menit|mnt)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)/i)

    const narrativeTadi = /\b(?:sejak\s*tadi\s*(?:pagi|siang|sore|malam)|tadi\s*pagi|tadi\s*siang|tadi\s*sore|tadi\s*malam|beberapa\s*jam\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?))\b/i.test(raw)

    if (narrativeHours) {
      const hours = parseFloat(narrativeHours[1].replace(',', '.'))
      tgl_onset = hours >= 24 ? addDaysToIso(tgl_mrs, -Math.round(hours / 24)) : tgl_mrs
    } else if (narrativeMinutes || narrativeTadi) {
      tgl_onset = tgl_mrs
    } else {
      // 2. Durasi hari (misal: "sejak 3 hari yang lalu", "3 hari SMRS", "3 hari sebelum MRS", "H-3 SMRS")
      const daysNarrative = raw.match(/(?:sejak|\b)(\d+)\s*(?:hari|hr)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)/i) ||
                            raw.match(/sejak\s*(\d+)\s*(?:hari|hr)\b/i) ||
                            raw.match(/\bH[-+]?(\d+)\s*(?:smrs|mrs|sebelum\s*mrs)\b/i)

      // 3. Durasi minggu
      const weeksNarrative = raw.match(/(?:sejak|\b)(\d+)\s*(?:minggu|mgg)\s*(?:yang\s*lalu|yll|smrs|lalu|sebelum(?:\s*mrs|\s*masuk\s*rs)?)/i) ||
                             raw.match(/sejak\s*(\d+)\s*(?:minggu|mgg)\b/i)

      // 4. Kemarin
      const kemarinNarrative = /\b(?:sejak\s*kemarin|kemarin\s*(?:pagi|siang|sore|malam|jam|\d|sekitar|smrs)|1\s*hari\s*(?:smrs|sebelum\s*mrs))\b/i.test(raw)

      if (daysNarrative) {
        tgl_onset = addDaysToIso(tgl_mrs, -parseInt(daysNarrative[1], 10))
      } else if (weeksNarrative) {
        tgl_onset = addDaysToIso(tgl_mrs, -parseInt(weeksNarrative[1], 10) * 7)
      } else if (kemarinNarrative) {
        tgl_onset = addDaysToIso(tgl_mrs, -1)
      }
    }
  }

  // D. Fallback: jika terpaksa tidak ada keterangan onset sama sekali -> tgl_onset = tgl_mrs
  if (!tgl_onset) {
    tgl_onset = tgl_mrs
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
  let usia = ''
  let no_rm = ''
  let jaminan: Jaminan | '' = ''

  // 1. Prioritas Utama: Format garis miring khas konsul pasien Indonesia:
  // misal: "*Sdri.Santi/20 tahun/P/BPJS Ketenagakerjaan*"
  // atau "Tn. Budi / 47 th / L / BPJS PBI"
  // atau "*By. Ny. Siti / 3 hari / P / Umum*"
  // atau "*dr. Handoko, Sp.S / 45 th / BPJS*"
  const slashLineMatch = raw.match(
    /[*_~#]*\s*(?:(dr|dok|dokter|Tn|Ny|Sdri|Sdr|An|By)\.?\s*)?([A-Za-z',.-]+(?:\s+[A-Za-z',.-]+)*)\s*\/\s*(\d{1,3}(?:\s*(?:th|thn|tahun|bln|bulan|hari|yo))?)\s*(?:\/\s*([LP]|Laki(?:-laki)?|Perempuan)\s*)?(?:\/\s*([^/\n*]+))?\*?/i
  )

  if (slashLineMatch) {
    const rawGelar = slashLineMatch[1]
    const rawNama = slashLineMatch[2]?.trim()
    const rawUsia = slashLineMatch[3]?.trim()
    const rawJaminan = slashLineMatch[5]?.trim()

    // Validasi bahwa rawNama bukan kata kunci medis/header seperti "SUBJEKTIF" / "DOKTER JAGA"
    if (rawNama && !/^(?:dokter|perawat|bidan|subjektif|subjektive|objektif|assesment|assessment|planning|konsul|pemeriksa|rujukan)$/i.test(rawNama)) {
      if (rawGelar) {
        const lower = rawGelar.toLowerCase()
        title = (lower === 'dr' || lower === 'dok' || lower === 'dokter') ? 'dr.' : lower.charAt(0).toUpperCase() + lower.slice(1) + (rawGelar.endsWith('.') ? '' : '.')
      }
      nama_depan = rawNama.replace(/[/,*_–—|]/g, '').trim()
      if (rawUsia) {
        const numOnly = rawUsia.match(/\d+/)
        usia = numOnly ? `${numOnly[0]} th` : rawUsia
      }
      if (rawJaminan) {
        const jm = rawJaminan.toUpperCase()
        if (jm.includes('BPJS') || jm.includes('JKN') || jm.includes('KIS')) jaminan = 'BPJS'
        else if (jm.includes('UMUM')) jaminan = 'Umum'
        else if (jm.includes('ASURANSI')) jaminan = 'Asuransi'
      }
    }
  }

  // 2. Coba cari label nama eksplisit: "Nama: ...", "Pasien: ...", "Identitas: ..."
  if (!nama_depan) {
    const labelMatch = raw.match(/(?:nama(?:\s*pasien)?|identitas|pasien)\s*[:-]\s*([A-Za-z][A-Za-z'.\s]{1,40}?)(?=\s*(?:,|\n|usia|umur|rm|\/|$))/i)
    if (labelMatch) {
      const candidate = labelMatch[1].trim()
      const titleCheck = candidate.match(/^(dr|dok|dokter|Tn|Ny|Sdri|Sdr|An|By)\.?\s*(.+)$/i)
      if (titleCheck) {
        const lower = titleCheck[1].toLowerCase()
        title = (lower === 'dr' || lower === 'dok' || lower === 'dokter') ? 'dr.' : lower.charAt(0).toUpperCase() + lower.slice(1) + (titleCheck[1].endsWith('.') ? '' : '.')
        nama_depan = titleCheck[2].trim()
      } else {
        nama_depan = candidate
      }
    }
  }

  // 3. Fallback nama dengan gelar di baris mandiri (cegah mencocokkan WhatsApp sender / dokter jaga / DPJP)
  if (!nama_depan) {
    const lines = raw.split(/\r?\n/)
    for (const line of lines) {
      if (/dokter\s*(?:jaga|spesialis|ruangan|igd|konsulen|dpjp)|pemeriksa\s*:|asal\s*rujukan|mohon\s*ijin|mohon\s*izin/i.test(line)) continue
      if (/(?:^|\s)\[\d{1,2}[/-]\d{1,2}/.test(line)) continue // skip timestamp lines

      const titleMatch = line.match(/[*_~#]*\s*\b(dr|dok|dokter|Tn|Ny|Sdri|Sdr|An|By)\.?\s*([A-Za-z'.-]+(?:[ \t]+[A-Za-z'.-]+){0,3})/i)
      if (titleMatch) {
        const rawGelar = titleMatch[1].toLowerCase()
        const candidateName = titleMatch[2].replace(/[/,*_–—|]/g, '').trim()
        if (!/^(?:jaga|spesialis|ruangan|pemeriksa|bella|konsul|igd|rawat|bangsal|dokter)/i.test(candidateName)) {
          title = (rawGelar === 'dr' || rawGelar === 'dok' || rawGelar === 'dokter') ? 'dr.' : rawGelar.charAt(0).toUpperCase() + rawGelar.slice(1) + (titleMatch[1].endsWith('.') ? '' : '.')
          nama_depan = candidateName
          break
        }
      }
    }
  }

  // Fallback aturan regex AI jika belum ditemukan
  if (!nama_depan) {
    nama_depan = applyLearnedScalar(raw, 'nama_depan', learnedRules)
  }

  // Usia fallback
  if (!usia) {
    const usiaMatch = raw.match(/\b(?:usia|umur)?\s*(\d{1,3})\s*(?:th|thn|tahun|yo)\b/i) || raw.match(/\b(?:usia|umur)\s*[:-]?\s*(\d{1,3})\b/i)
    usia = usiaMatch && usiaMatch[1] ? `${usiaMatch[1]} th` : applyLearnedScalar(raw, 'usia', learnedRules)
  }

  // No RM
  const rmMatch = raw.match(/(?:no\.?\s*rm|no\.?\s*rekam\s*medis|rm)\s*[:-]?\s*([\d-/]{4,20})/i)
  if (rmMatch) {
    no_rm = rmMatch[1].trim()
  } else {
    no_rm = applyLearnedScalar(raw, 'no_rm', learnedRules)
  }

  // Jaminan fallback
  if (!jaminan) {
    const jaminanMatch = raw.match(/\b(BPJS(?:[\s\w]*)|JKN|KIS|Umum|Asuransi)\b/i)
    if (jaminanMatch) {
      const jm = jaminanMatch[1].toUpperCase()
      if (jm.includes('BPJS') || jm.includes('JKN') || jm.includes('KIS')) jaminan = 'BPJS'
      else if (jm.includes('UMUM')) jaminan = 'Umum'
      else if (jm.includes('ASURANSI')) jaminan = 'Asuransi'
    }
    if (!jaminan) {
      jaminan = (applyLearnedScalar(raw, 'jaminan', learnedRules) as Jaminan | '') || ''
    }
  }

  // Tanggal MRS & Tanggal Onset
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
  // S (Subjektif) - mendukung Subjektif, Subjektive, Subyektif, Subyektive, Subjective, Subjectif, RPS, Anamnesis
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:S|Subjektif|Subjektive|Subyektif|Subyektive|Subjective|Subjectif|Anamnesis|Keluhan|Keluhan\s*Utama|RPS)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'S',
  },
  // O - Penunjang Khusus
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:Penunjang|Pemeriksaan\s*Penunjang|Hasil\s*Penunjang|Hasil\s*Lab|Laboratorium|Radiologi|CT[\s-]?Scan|Foto\s*Rontgen|EKG)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'O_penunjang',
  },
  // O - Pemfis / Objektif Umum
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:O|Objektif|Objektive|Obyektif|Obyektive|Objective|Pemeriksaan\s*Fisik|Pemfis|Status\s*Generalis|Status\s*Neurologi|Status\s*Neurologis|Pemeriksaan)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'O_pemfis',
  },
  // A (Assessment)
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:A|Assessment|Assesment|Asesmen|Diagnosis|Diagnosa|Dx|WD\/?|DD\/?|Impresi\s*Klinis)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'A',
  },
  // P (Planning / Advis) - mendukung PDx, PTx, PMx, PEx, Advis, Rekomendasi
  {
    regex: /^\s*(?:[*_~#]*\s*)?(?:P|Plan|Planning|PDx|PTx|PMx|PEx|Tatalaksana|Penatalaksanaan|Terapi|Tx|Rencana|Advis|Rekomendasi)\b\s*[:\-–—]?\s*(.*)$/i,
    section: 'P',
  },
]

function sectionize(raw: string): RawSections {
  // Bersihkan header chat WhatsApp (misal "[9/23, 15:03] Andrian: A:" -> "\nA:")
  const cleanRaw = raw.replace(WA_HEADER_REGEX, '\n')

  const sections: RawSections = { S: [], O_pemfis: [], O_penunjang: [], A: [], P: [] }
  let current: keyof RawSections | null = null
  let hasEncounteredPlanning = false

  const lines = cleanRaw.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Abaikan kalimat basa-basi konsultasi di awal/akhir
    if (NOISE_PHRASES.test(line) && !current) continue
    if (/^mohon\s*(?:advis|tatalaksana|petunjuk|arahan)/i.test(line)) continue

    // Cek apakah baris ini adalah Suhu (Temperatur) di tanda vital, bukan seksi S
    const isTemp = IS_TEMPERATURE_LINE.test(line)

    // Cek apakah baris ini adalah header seksi SOAP
    let matchedSection: keyof RawSections | null = null
    let inlineContent = ''
    let headerLabel = ''

    if (!isTemp) {
      for (const { regex, section } of SECTION_HEADER_PATTERNS) {
        const match = line.match(regex)
        if (match) {
          // Guard ekstra: huruf tunggal "S" tidak boleh mencocokkan temperatur
          if (section === 'S') {
            const afterHeader = match[1]?.trim() || ''
            if (/^\d{1,2}(?:[.,]\d+)?\s*(?:°?C|c|celcius)?\b/i.test(afterHeader) || /^(?:febris|afebris)\b/i.test(afterHeader)) {
              continue
            }
          }
          matchedSection = section
          inlineContent = match[1] ? match[1].trim() : ''
          headerLabel = line.replace(/[:\-–—].*$/, '').trim()
          break
        }
      }
    }

    if (matchedSection) {
      // PRIORITAS REVISI / ADVIS DOKTER SPESIALIS:
      // Jika seksi Planning (P) sudah pernah terisi sebelumnya, dan kemudian muncul
      // Assessment (A) atau Planning (P) baru: ini adalah balasan/advis konsultan spesialis.
      // Kosongkan draft awal IGD dan prioritaskan advis definitif spesialis!
      if (hasEncounteredPlanning && (matchedSection === 'A' || matchedSection === 'P')) {
        if (matchedSection === 'A') {
          sections.A = []
          sections.P = []
        }
      }

      current = matchedSection
      if (current === 'P') {
        hasEncounteredPlanning = true
        // Jika header berupa sub-header khusus (misal "PDx:" atau "PTx:"), masukkan barisnya
        // ke sections.P agar dikenali oleh parsePlanningLines
        if (/^(?:PDx|PTx|PMx|PEx)/i.test(headerLabel)) {
          sections.P.push(line)
          continue
        }
      }

      if (inlineContent) {
        sections[current].push(inlineContent)
      }
    } else if (current) {
      // Jika baris temperatur berada di seksi O_pemfis atau sebelumnya, simpan di O_pemfis
      if (isTemp) {
        sections.O_pemfis.push(line)
        continue
      }

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
    // Jangan pecah angka desimal berkoma seperti "Hipokalemia 3,25" (koma diikuti digit)
    const parts = clean.split(/,(?!\d)\s*|;\s*/).map((p) => p.trim()).filter(Boolean)
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
    if (/^mohon\s*(?:arahan|advis|petunjuk|tatalaksana)/i.test(rawLine)) continue

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
  const today = getLocalDateString()

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
