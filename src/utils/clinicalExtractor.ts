import type { ProgressNote, ClinicalMetrics } from '../db'

/**
 * Pembersih dan ekstraktor temuan klinis positif (pertinent positives)
 * khusus bahasa & singkatan medis Indonesia (neurologi, penyakit dalam, ICU, dll).
 */

const FILLER_PREFIXES = [
  /^(?:pasien|os|psn)\s+(?:datang|masuk|mengeluh|diantar|rujukan|kiriman|ke\s*igd)\b/i,
  /^(?:pasien|os|psn)\s+(?:diantar\s*keluarga\s*(?:dengan)?|dengan\s*keluhan)\b/i,
  /^(?:keluhan\s*(?:utama|disertai|berupa)?|saat\s*ini\s*(?:keluhan)?)\s*[:-]?\s*/i,
  /^(?:dirasakan|terjadi|dialami)\s+(?:sejak|mendadak|tiba-tiba)\b/i,
  /^(?:keluarga\s*mengatakan|menurut\s*keluarga)\b/i,
  /^(?:riwayat|rwt)\s*(?:penyakit\s*dahulu|rpd|pengobatan)?\s*[:-]?\s*/i,
]

const NEGATIVE_FINDINGS = [
  /\b(?:tidak\s*ada|disangkal|dbn|dalam\s*batas\s*normal|normal|negatif)\b/i,
  /\(\s*-\s*\)/,
  /-\s*$/,
]

export interface ClinicalHighlights {
  sList: string[]
  oList: string[]
  hasAbnormal: boolean
}

/**
 * Memecah narasi klinis menjadi klausa-klausa terpisah berdasarkan tanda baca dan batas negasi.
 */
function segmentNarrative(raw: string): string[] {
  // Strip RPD, RPO, Alergi and leading bullet / slash markers
  const clean = raw
    .replace(/\b(?:RPD|RPO|Alergi|Riwayat\s*(?:Penyakit|Pengobatan))\s*[:-][\s\S]*$/i, '')
    .replace(/^(?:s|subjektif|keluhan)\s*:\s*/i, '')
    .replace(/^\s*[/\\-]\s*/gm, '')
    .trim()

  // Standardize boundaries before/after negation symbols & sentence periods
  const withBoundaries = clean
    .replace(/\.\s+/g, ' , ') // Split sentences on period
    .replace(/(\(\s*-\s*\))/g, ' $1 , ')
    .replace(/\b(disangkal|dbn|nihil)\b/gi, ' $1 , ')
    .replace(/\b(tidak\s*(?:ada|didapatkan|dirasakan|ditemukan|mengeluh)?|tanpa|bebas)\b/gi, ' , $1 ')
    .replace(/([A-Za-z0-9]+)\s+(disangkal|\(\s*-\s*\))/gi, ' , $1 $2 , ')

  return withBoundaries
    .split(/[,;\n•·]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c !== '.')
}

function isClauseNegated(c: string): boolean {
  return /\(\s*-\s*\)|\b(?:disangkal|tidak\s*(?:ada|didapatkan|dirasakan|ditemukan|mengeluh)?|dbn|dalam\s*batas\s*normal|nihil|negatif|tanpa|bebas)\b/i.test(c)
}

/**
 * Memformat evaluasi subjektif kunjungan harian (format baris per-keluhan dengan +/-/progres)
 * menjadi ringkasan yang rapi untuk kartu dasbor.
 * Contoh input:
 * mual + berkurang
 * muntah -
 * pusing -
 * lemah separuh badan kiri membaik
 *
 * Output:
 * ['Mual berkurang', 'Muntah (-)', 'Pusing (-)', 'Lemah separuh badan kiri membaik']
 */
export function formatVisiteSummaryForDashboard(rawS?: string): string[] | null {
  if (!rawS || !rawS.trim()) return null
  const lines = rawS.split('\n').map((l) => l.trim()).filter(Boolean)

  const isVisiteFormat =
    lines.length >= 2 &&
    lines.every((l) => l.length < 65 && !/\b(?:pasien\s*datang|ke\s*igd|rpd|rpo)\b/i.test(l)) &&
    lines.some((l) => /(?:[+-]|membaik|berkurang|perbaikan|memberat|hilang|sama|lancar|stabil)/i.test(l))

  if (!isVisiteFormat) return null

  return lines.map((line) => {
    let clean = line.replace(/^[-•*]\s*/, '').trim()
    clean = clean.replace(/\s*\+\s*berkurang\b/i, ' berkurang')
    clean = clean.replace(/\s*\+\s*membaik\b/i, ' membaik')
    clean = clean.replace(/\s*\+\s*perbaikan\b/i, ' membaik')
    clean = clean.replace(/\s*\+\s*sama\b/i, ' tetap')
    clean = clean.replace(/\s*\+\s*tetap\b/i, ' tetap')
    clean = clean.replace(/\s*\+\s*memberat\b/i, ' memberat')
    clean = clean.replace(/\s*-\s*$/i, ' (-)')
    clean = clean.replace(/\s*\+\s*$/i, ' (+)')
    return clean.charAt(0).toUpperCase() + clean.slice(1)
  })
}

/**
 * Mengekstrak keluhan positif pasien saat awal masuk RS (MRS) dari narasi IGD/admission.
 * Digunakan untuk membuat daftar evaluasi keluhan default per baris saat dokter visite.
 */
export function extractAdmissionComplaints(raw?: string): string[] {
  if (!raw || !raw.trim()) return []

  // Strip RPD, RPO, Alergi and headers
  const clean = raw
    .replace(/\b(?:RPD|RPO|Alergi|Riwayat\s*(?:Penyakit|Pengobatan))\s*[:-][\s\S]*$/i, '')
    .replace(/^(?:s|subjektif|keluhan)\s*:\s*/i, '')
    .trim()

  // Split into sentences / clauses
  const withBoundaries = clean
    .replace(/\.\s+/g, ' , ')
    .replace(/(\(\s*-\s*\))/g, ' $1 , ')
    .replace(/\b(disangkal|dbn|nihil)\b/gi, ' $1 , ')
    .replace(/\b(tidak\s*(?:ada|didapatkan|dirasakan|ditemukan|mengeluh)?|tanpa|bebas)\b/gi, ' , $1 ')
    .replace(/([A-Za-z0-9]+)\s+(disangkal|\(\s*-\s*\))/gi, ' , $1 $2 , ')

  const clauses = withBoundaries
    .split(/[,;\n•·]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c !== '.')

  const isNegated = (c: string) =>
    /\(\s*-\s*\)|\b(?:disangkal|tidak\s*(?:ada|didapatkan|dirasakan|ditemukan|mengeluh)?|dbn|dalam\s*batas\s*normal|nihil|negatif|tanpa|bebas)\b/i.test(
      c
    )
  const positiveClauses = clauses.filter((c) => !isNegated(c))
  const positiveText = positiveClauses.join(' , ').toLowerCase()

  const items: string[] = []
  const add = (label: string) => {
    if (label && !items.includes(label)) items.push(label)
  }

  // 1. Mual & Muntah
  if (/\bmual\b/i.test(positiveText)) add('mual')
  if (/\bmuntah\b/i.test(positiveText)) add('muntah')

  // 2. Pusing / Nyeri kepala
  if (/\b(?:pusing\s*berputar|vertigo)\b/i.test(positiveText)) add('pusing berputar')
  else if (/\b(?:pusing|kliyengan)\b/i.test(positiveText)) add('pusing')
  if (/\b(?:nyeri\s*kepala|sakit\s*kepala|cephalgia)\b/i.test(positiveText)) add('nyeri kepala')

  // 3. Motorik / Lemah
  const lemasMatch = positiveText.match(
    /\b(?:lemah|lemas|lumpuh|hemiparesis|hemiplegia)\s*(separuh\s*badan\s*(?:kiri|kanan)?|tangan\s*dan\s*kaki\s*(?:kiri|kanan)?|ekstr[ei]mitas\s*(?:kiri|kanan)?|sisi\s*(?:kiri|kanan)|kiri|kanan)?/i
  )
  if (lemasMatch) {
    const detail = (lemasMatch[1] || '').trim()
    add(`lemah ${detail || 'separuh badan'}`.trim())
  }

  // 4. Bicara
  if (/\b(?:pelo|disartria)\b/i.test(positiveText)) add('bicara pelo')
  else if (/\bafasia\b/i.test(positiveText)) add('afasia')
  else if (/\b(?:bicara\s*berat|sulit\s*bicara)\b/i.test(positiveText)) add('bicara berat')

  // 5. Menelan
  if (/\b(?:susah|sulit|gangguan)\s*menelan\b/i.test(positiveText)) add('susah menelan')
  else if (/\btersedak\b/i.test(positiveText)) add('tersedak')

  // 6. Mulut Mencong
  if (/\b(?:mencong|merot|wajah\s*asimetris|mulut\s*miring)\b/i.test(positiveText)) add('mulut mencong')

  // 7. Kesadaran & Kejang
  if (/\b(?:penurunan\s*kesadaran|tidak\s*sadar|pingsan|somnolen|mengantuk\s*terus)\b/i.test(positiveText))
    add('penurunan kesadaran')
  if (/\bkejang\b/i.test(positiveText)) add('kejang')

  // 8. Sesak & Nyeri Dada
  if (/\b(?:sesak\s*nafas|sesak|dispnea)\b/i.test(positiveText)) add('sesak')
  if (/\b(?:nyeri\s*dada|angina)\b/i.test(positiveText)) add('nyeri dada')

  // 9. Batuk
  if (/\b(?:batuk\s*darah|hemoptoe)\b/i.test(positiveText)) add('batuk darah')
  else if (/\bbatuk\b/i.test(positiveText)) add('batuk')

  // 10. Demam
  if (/\b(?:demam|meriang|panas\s*badan)\b/i.test(positiveText)) add('demam')

  // 11. Perut & Pencernaan
  if (/\b(?:melena|bab\s*hitam)\b/i.test(positiveText)) add('BAB hitam / melena')
  if (/\b(?:hematemesis|muntah\s*darah)\b/i.test(positiveText)) add('muntah darah')
  if (/\b(?:nyeri\s*perut|nyeri\s*ulu\s*hati|sakit\s*perut)\b/i.test(positiveText)) add('nyeri perut')
  if (/\b(?:diare|mencret)\b/i.test(positiveText)) add('diare')

  // 12. Sensorik
  if (/\b(?:kebas|baal|kesemutan)\b/i.test(positiveText)) {
    const sisi = positiveText.match(/\b(kanan|kiri|separuh)\b/i)
    add(`kebas/kesemutan${sisi ? ' ' + sisi[1] : ''}`)
  }

  // 13. Bengkak
  if (/\b(?:bengkak|edema)\b/i.test(positiveText)) {
    const loc = positiveText.match(/\b(kaki|tungkai|wajah|mata)\b/i)
    add(`bengkak${loc ? ' ' + loc[1] : ''}`)
  }

  return items
}

/**
 * Menghasilkan teks awal (pre-fill) untuk field S di VisiteModal.
 * Jika S catatan sebelumnya masih berupa narasi mentah panjang dari IGD/admission,
 * otomatis diekstrak menjadi daftar keluhan positif per baris:
 * mual +
 * muntah +
 * lemah separuh badan kiri +
 *
 * Jika sudah berupa format evaluasi kunjungan harian, dipertahankan agar dokter
 * bisa langsung melanjutkan update progres harian.
 */
export function getVisiteSubjectivePrefill(latestS?: string): string {
  if (!latestS || !latestS.trim()) return ''

  const trimmed = latestS.trim()

  // Jika sudah berformat evaluasi visite (beberapa baris dengan tanda +/- atau kata progres)
  const isAlreadyVisiteFormat =
    trimmed.includes('\n') &&
    /(?:[+-]|membaik|berkurang|perbaikan|memberat|hilang|sama)/i.test(trimmed) &&
    !/\b(?:pasien\s*datang|ke\s*igd|rpd|rpo|alergi)\b/i.test(trimmed)

  if (isAlreadyVisiteFormat) {
    return trimmed
  }

  // Ekstrak keluhan awal positif pasien saat masuk
  const complaints = extractAdmissionComplaints(trimmed)
  if (complaints.length > 0) {
    return complaints.map((c) => `${c} +`).join('\n')
  }

  // Fallback jika teksnya pendek dan bukan narasi panjang
  if (trimmed.length < 50 && !/\b(?:pasien\s*datang|ke\s*igd)\b/i.test(trimmed)) {
    return trimmed
  }

  return ''
}

/**
 * Mengekstrak keluhan positif (S) dari narasi subjektif secara cerdas
 * (Clinical Entity Recognition khusus bahasa medis Indonesia).
 */
export function extractSubjectivePositives(rawS?: string): string[] {
  if (!rawS || !rawS.trim()) return []

  // 0. Format evaluasi visite harian (per-baris keluhan dengan status +/-/progres)
  const visiteSummary = formatVisiteSummaryForDashboard(rawS)
  if (visiteSummary && visiteSummary.length > 0) {
    return visiteSummary
  }

  const clauses = segmentNarrative(rawS)
  // Filter out any clause that contains negative / disangkal / (-) markers
  const positiveClauses = clauses.filter((c) => !isClauseNegated(c))
  const positiveText = positiveClauses.join(' , ').toLowerCase()
  const entities: string[] = []

  const check = (regex: RegExp, labelFn: string | ((m: RegExpExecArray) => string)) => {
    const match = regex.exec(positiveText)
    if (!match) return false
    const label = typeof labelFn === 'function' ? labelFn(match) : labelFn
    if (label && !entities.includes(label)) {
      entities.push(label)
    }
    return true
  }

  // 1. Defisit Motorik Fokal (Paresis / Plegia / Lemas Ekstremitas)
  check(
    /\b(?:hemiparesis|hemiplegia|lemas\s*(?:ekstr[ei]mitas|anggota\s*gerak|separuh|tangan|kaki|badan)?|berat\s*(?:ekstr[ei]mitas|tangan|kaki)|lumpuh)\b/i,
    () => {
      const isMembaik = /\b(?:lemas|motorik|ekstr[ei]mitas|gerak)\s*(?:membaik|berkurang|perbaikan)\b|\b(?:membaik|berkurang)\b/i.test(positiveText)
      const prog = isMembaik ? ' (membaik)' : ''
      const sisiMatch = positiveText.match(/\b(dextra|sinistra|kanan|kiri)\b/i)
      const sisi = sisiMatch ? sisiMatch[1].toLowerCase() : ''
      const bagianMatch = positiveText.match(/\b(ekstr[ei]mitas|tangan\s*dan\s*kaki|tangan|kaki|separuh\s*badan)\b/i)
      const bagian = bagianMatch ? bagianMatch[1].replace('ekstrimitas', 'ekstremitas') : 'ekstremitas'

      if (/\bhemiparesis\b/i.test(positiveText)) {
        return `Hemiparesis${sisi ? ` (${sisi})` : ''}${prog}`
      }
      return `Lemas ${bagian}${sisi ? ` ${sisi}` : ''}${prog}`
    }
  )

  // 2. Gangguan Bicara (Pelo / Disartria / Afasia / Bicara Berat / Tidak Lancar)
  check(
    /\b(?:pelo|disartria|afasia|rero|bicara\s*(?:terasa\s*)?(?:berat|tidak\s*lancar|tidak\s*jelas|pelo|sulit|patah-patah)|sulit\s*bicara)\b/i,
    (m) => {
      const isMembaik = /\b(?:pelo|bicara|disartria)\s+(?:membaik|berkurang|perbaikan)\b|\b(?:membaik|berkurang|lebih\s*jelas)\b/i.test(positiveText)
      if (/\bpelo\b/i.test(m[0])) return isMembaik ? 'Pelo membaik' : 'Bicara pelo'
      if (/\bafasia\b/i.test(m[0])) return isMembaik ? 'Afasia (membaik)' : 'Afasia'
      if (/\bberat\b/i.test(m[0])) return isMembaik ? 'Bicara berat (membaik)' : 'Bicara berat'
      if (/\btidak\s*lancar\b/i.test(m[0])) return isMembaik ? 'Bicara lancar' : 'Bicara tidak lancar'
      return isMembaik ? 'Bicara membaik' : 'Bicara pelo'
    }
  )

  // 3. Inkontinensia Urin / Ngompol
  check(
    /\b(?:ngompol|inkontinensia|tidak\s*bisa\s*menahan\s*bak|bak\s*(?:di\s*)?celana)\b/i,
    'Sempat ngompol'
  )

  // 4. Mulut Mencong / Asimetris Wajah
  check(
    /\b(?:mencong|merot|wajah\s*asimetris|mulut\s*miring|asimetris\s*wajah)\b/i,
    'Mulut mencong'
  )

  // 5. Nyeri Kepala / Cephalgia
  check(
    /\b(?:nyeri\s*kepala|sakit\s*kepala|cephalgia|sefalgia|pusing\s*cekot)\b/i,
    () => {
      const isMembaik = /\b(?:nyeri|sakit|pusing)\s+(?:membaik|berkurang|mereda)\b/i.test(positiveText)
      const prog = isMembaik ? ' (berkurang)' : ''
      const vasMatch = rawS.match(/\bVAS\s*[:=-]?\s*(\d{1,2}(?:\s*-\s*\d{1,2})?)\b/i)
      const vas = vasMatch ? `VAS ${vasMatch[1]}` : ''
      const sifatMatch = rawS.match(/\b(?:cekot[\s-]*cekot|berdenyut|hebat|menusuk)\b/i)
      const sifat = sifatMatch ? sifatMatch[0] : ''
      const extra = [vas, sifat, prog ? 'berkurang' : ''].filter(Boolean).join(', ')
      return `Nyeri kepala${extra ? ` (${extra})` : ''}`
    }
  )

  // 6. Pusing Berputar / Vertigo
  check(
    /\b(?:vertigo|pusing\s*berputar|kliyengan|sempoyongan)\b/i,
    (m) => {
      const durMatch = rawS.match(/\b(?:sejak\s*)?(\d{1,2}\s*(?:hari|jam|mgg|minggu))\b/i)
      const vertText = /\bvertigo\b/i.test(m[0]) ? 'Vertigo' : 'Pusing berputar'
      return durMatch ? `${vertText} ${durMatch[1]}` : vertText
    }
  )

  // 7. Mual & Muntah (Hanya jika lolos clause positif)
  const hasMual = /\bmual\b/i.test(positiveText)
  const hasMuntah = /\bmuntah\b/i.test(positiveText)
  const isMualMembaik = /\b(?:mual|muntah)\s+(?:membaik|berkurang)\b/i.test(positiveText)
  const mualProg = isMualMembaik ? ' (berkurang)' : ''
  if (hasMual && hasMuntah) entities.push(`Mual & muntah${mualProg}`)
  else if (hasMuntah) entities.push(`Muntah${mualProg}`)
  else if (hasMual) entities.push(`Mual${mualProg}`)

  // 8. Demam / Meriang
  check(
    /\b(?:demam|meriang|panas\s*badan|febris)\b/i,
    (m) => {
      const dur = rawS.match(/\b(?:demam|meriang|panas\s*badan)\s*(?:sejak\s*)?(\d{1,2}\s*(?:hari|jam|mgg))\b/i)
      const label = /\bmeriang\b/i.test(m[0]) ? 'Meriang' : 'Demam'
      return dur ? `${label} ${dur[1]}` : label
    }
  )

  // 9. Kejang / Penurunan Kesadaran
  check(/\b(?:kejang|kelojotan)\b/i, 'Kejang')
  check(/\b(?:penurunan\s*kesadaran|tidak\s*sadar|pingsan|sinkop|somnolen|mengantuk\s*terus)\b/i, 'Penurunan kesadaran')

  // 10. Sesak & Nyeri Dada
  const sesakMembaik = /\bsesak\s+(?:membaik|berkurang|lega)\b/i.test(positiveText)
  check(/\b(?:sesak\s*nafas|sesak|dispnea)\b/i, sesakMembaik ? 'Sesak nafas (berkurang)' : 'Sesak nafas')
  check(/\b(?:nyeri\s*dada|angina)\b/i, 'Nyeri dada')

  // 11. Defisit Sensorik (Kesemutan / Baal / Hipoestesi)
  check(
    /\b(?:kebas|baal|kesemutan|hipo?estesi)\b/i,
    () => {
      const sisi = positiveText.match(/\b(kanan|kiri|separuh)\b/i)
      return `Kesemutan/baal${sisi ? ` ${sisi[1]}` : ''}`
    }
  )

  // 12. Diplopia / Pandangan Kabur
  check(/\b(?:diplopia|pandangan\s*(?:ganda|kabur|dobel)|mata\s*kabur)\b/i, (m) => /\bdiplopia\b/i.test(m[0]) ? 'Diplopia' : 'Pandangan kabur')

  // 13. Sulit Menelan / Tersedak
  check(
    /\b(?:disfagia|sulit\s*menelan|susah\s*menelan|gangguan\s*menelan|tersedak)\b/i,
    (m) => {
      const isMembaik = /\b(?:menelan|tersedak)\s+(?:membaik|berkurang)\b/i.test(positiveText)
      const prog = isMembaik ? ' (membaik)' : ''
      if (/\btersedak\b/i.test(m[0])) return `Tersedak${prog}`
      if (/\bsusah\b/i.test(m[0])) return `Susah menelan${prog}`
      return `Sulit menelan${prog}`
    }
  )

  // 14. Batuk / Batuk Darah
  check(/\b(?:batuk|cough|hemoptoe)\b/i, (m) => /\b(?:berdarah|hemoptoe)\b/i.test(m[0]) ? 'Batuk darah' : 'Batuk')

  // 15. Nyeri Perut / Melena
  check(
    /\b(?:nyeri\s*(?:perut|ulu\s*hati)|epigastrium|melena|bab\s*hitam)\b/i,
    () => (/\b(?:melena|bab\s*hitam)\b/i.test(positiveText) ? 'Melena' : 'Nyeri ulu hati/perut')
  )

  // 16. Edema / Bengkak
  check(
    /\b(?:bengkak|edema|sembab)\b/i,
    () => {
      const loc = positiveText.match(/\b(kaki|tungkai|wajah|mata|seluruh\s*tubuh)\b/i)
      return loc ? `Bengkak ${loc[1]}` : 'Bengkak'
    }
  )

  // Jika entitas klinis spesifik berhasil terdeteksi, kembalikan entitas ini!
  if (entities.length > 0) {
    return entities.slice(0, 4)
  }

  // 3. Fallback: Ekstraksi klausa ringkas jika narasi tidak cocok dengan kata kunci di atas
  const candidates: string[] = []
  for (let clause of positiveClauses) {
    clause = clause.trim()
    for (const prefix of FILLER_PREFIXES) {
      clause = clause.replace(prefix, '').trim()
    }
    // Strip konteks waktu/lokasi di awal (sejak, kemarin, tadi, dll)
    if (/^(?:sejak|kemarin|tadi|sudah|namun|tapi|pagi|malam|hari|jam)\b/i.test(clause)) continue

    let cleanClause = clause
      .replace(/\(\s*\+\s*\)/g, '')
      .replace(/^(?:adanya|terdapat|ada|mengeluh|keluhan|dengan\s*keluhan|ke\s*igd\s*(?:dengan\s*(?:keluhan)?)?)\s+/i, '')
      .trim()

    // Potong frase panjang di batas waktu/lokasi (sejak, kemudian, lalu, sebelum)
    if (cleanClause.length > 45) {
      const cutIdx = cleanClause.search(/\b(?:sejak|sebelum|kemudian|lalu|selama|sudah|yang|pagi|malam|saat|kurang\s*lebih)\b/i)
      if (cutIdx > 5) {
        cleanClause = cleanClause.substring(0, cutIdx).trim().replace(/\s+$/, '')
      }
    }

    if (cleanClause.length > 2 && cleanClause.length <= 60) {
      cleanClause = cleanClause.charAt(0).toUpperCase() + cleanClause.slice(1)
      if (!candidates.some((c) => c.toLowerCase() === cleanClause.toLowerCase())) {
        candidates.push(cleanClause)
      }
    }
  }

  return candidates.slice(0, 3)
}

interface PrioritizedFinding {
  text: string
  priority: number
}

/**
 * Mengekstrak temuan objektif positif & abnormal dari Pemeriksaan Fisik & Penunjang (O)
 * dengan sistem pemeringkatan urgensi klinis (GCS/koma, lateralisasi, NIHSS, pupil, tanda vital kritis).
 */
export function extractObjectivePositives(rawPemfis?: string, rawPenunjang?: string): string[] {
  const items: PrioritizedFinding[] = []
  const text = `${rawPemfis || ''}\n${rawPenunjang || ''}`
  if (!text.trim()) return []

  const add = (findingText: string, priority: number) => {
    if (!findingText || !findingText.trim()) return
    const clean = findingText.trim()
    const exists = items.some(
      (it) => it.text.toLowerCase() === clean.toLowerCase() ||
              (it.text.toLowerCase().includes(clean.toLowerCase()) && Math.abs(it.text.length - clean.length) < 5)
    )
    if (!exists) {
      items.push({ text: clean, priority })
    }
  }

  // 1. GCS (Glasgow Coma Scale) & Penurunan Kesadaran
  // Format EVM: GCS E1V1M1, E2V2M4, dll.
  const evmMatch = text.match(/\b(?:GCS\s*[:-]?\s*)?E([1-4])\s*V([1-5X]|ett|afasia)?\s*M([1-6])\b/i)
  if (evmMatch) {
    const e = parseInt(evmMatch[1], 10)
    const vStr = evmMatch[2] || '1'
    const v = parseInt(vStr, 10) || 1
    const m = parseInt(evmMatch[3], 10)
    const total = e + v + m
    if (total < 15) {
      add(`GCS ${total} (E${evmMatch[1]}V${vStr}M${evmMatch[3]})`, 1)
    }
  } else {
    // Format 3 digit: GCS : 111, GCS 111, GCS 235, GCS 1-1-1, GCS 1/1/1
    const threeDigitMatch = text.match(/\bGCS\s*[:-]?\s*([1-4])\s*[-/]?\s*([1-5])\s*[-/]?\s*([1-6])\b/i)
    if (threeDigitMatch) {
      const e = parseInt(threeDigitMatch[1], 10)
      const v = parseInt(threeDigitMatch[2], 10)
      const m = parseInt(threeDigitMatch[3], 10)
      const total = e + v + m
      if (total < 15) {
        add(`GCS ${total} (${e}${v}${m})`, 1)
      }
    } else {
      // Format total score: GCS : 3, GCS 8, GCS 10
      const totalMatch = text.match(/\bGCS\s*[:-]?\s*(\d{1,2})\b/i)
      if (totalMatch) {
        const total = parseInt(totalMatch[1], 10)
        if (total >= 3 && total < 15) {
          add(`GCS ${total}`, 1)
        }
      }
    }
  }

  // Penurunan kesadaran / status mental
  if (/\b(?:KU\s*[:-]?\s*)?(penurunan\s*kesadaran|tidak\s*sadar(?:kan\s*diri)?|hilang\s*kesadaran)\b/i.test(text)) {
    add('Penurunan kesadaran', 2)
  }
  const comaMatch = text.match(/\b(koma|sopor\s*koma|sopor|somnolen|stupor|delirium|apatis)\b/i)
  if (comaMatch && !isClauseNegated(comaMatch[0])) {
    const term = comaMatch[1].charAt(0).toUpperCase() + comaMatch[1].slice(1).toLowerCase()
    add(term, 2)
  }

  // 2. Status Neurologis: Pupil, Lateralisasi, NIHSS
  // Pupil Anisokor & Refleks Cahaya
  if (/\banisokor\b/i.test(text) && !/\bisokor\b(?!\s*anisokor)/i.test(text.replace(/anisokor/gi, ''))) {
    const diamMatch = text.match(/(?:(?:N\.?\s*(?:II|III)\s*[:-]?\s*|pupil\s*[:-]?\s*)?(\d(?:\.\d)?\s*mm\s*[/x]\s*\d(?:\.\d)?\s*mm|\d\s*[/x]\s*\d\s*mm))/i)
    if (diamMatch) {
      add(`Pupil anisokor (${diamMatch[1].replace(/\s+/g, '')})`, 3)
    } else {
      add('Pupil anisokor', 3)
    }
  } else if (/\b(pin-?point|midriasis\s*maksimal)\b/i.test(text)) {
    const pMatch = text.match(/\b(pin-?point|midriasis\s*maksimal)\b/i)
    if (pMatch) add(`Pupil ${pMatch[1]}`, 3)
  }
  if (/\bRC\s*(?:-\/-|\(-\/-\)|negatif(?:\s*bilateral)?)\b/i.test(text)) {
    add('RC (-/-)', 3)
  }

  // Kesan Lateralisasi (Dextra / Sinistra)
  const latMatch = text.match(/\b(?:kesan\s+)?lateralisasi\s+(?:ke\s+)?(dextra|sinistra|kanan|kiri)\b/i)
  if (latMatch && !/\b(?:tidak\s*ada|disangkal|dbn|nihil)\b/i.test(latMatch[0])) {
    const rawSide = latMatch[1].toLowerCase()
    const side = rawSide === 'kanan' ? 'Dextra' : rawSide === 'kiri' ? 'Sinistra' : (rawSide.charAt(0).toUpperCase() + rawSide.slice(1))
    add(`Lateralisasi ${side}`, 4)
  }

  // NIHSS (Stroke Scale Score)
  const nihssMatch = text.match(/\bNIHSS\s*[:-]?\s*(\d{1,2})\b/i)
  if (nihssMatch) {
    const score = parseInt(nihssMatch[1], 10)
    if (score > 0) {
      add(`NIHSS ${score}`, 5)
    }
  }

  // 3. Status Neurologis: Defisit Motorik, Paresis, Plegia
  const motorikMatch = text.match(/\b(?:motorik|kekuatan|extremitas|ekstremitas)\s*[:-]?\s*([0-5]{1,4}\s*[/x]\s*[0-5]{1,4}|[0-5]\s*[/x]\s*[0-5])/i)
  if (motorikMatch) {
    const cleanMot = motorikMatch[1].replace(/\s+/g, '')
    if (!/^(?:5555[/x]5555|5[/x]5)$/.test(cleanMot)) {
      add(`Motorik ${cleanMot}`, 10)
    }
  }

  const paresisMatch = text.match(/\b(hemiparesis|hemiplegia|tetraparesis|tetraplegia|monoparesis|paraparesis)\s*(dextra|sinistra|bilateral|kiri|kanan)?\b/i)
  if (paresisMatch && !/\b(?:tidak\s*ada|disangkal|dbn|nihil)\b/i.test(paresisMatch[0])) {
    const term = paresisMatch[1].charAt(0).toUpperCase() + paresisMatch[1].slice(1).toLowerCase()
    const side = paresisMatch[2] ? ` ${paresisMatch[2]}` : ''
    add(`${term}${side}`.trim(), 10)
  }

  // Nervus Cranialis & Gejala Fokal (Abaikan jika 'sde' / sulit dievaluasi)
  const nCranialMatch = text.match(/\b(?:parese|paresis|palsy)\s*(?:N\.?\s*(?:VII|XII|III|IV|VI)|nervus\s*\w+|facial|lingual)\s*(?:dextra|sinistra|kiri|kanan)?\s*(?:sentral|perifer)?\b/i)
  if (nCranialMatch) {
    const idx = text.indexOf(nCranialMatch[0])
    const afterMatch = text.slice(idx + nCranialMatch[0].length, idx + nCranialMatch[0].length + 15)
    if (!/\bsde\b|sulit\s*d/i.test(afterMatch)) {
      add(nCranialMatch[0].trim(), 13)
    }
  } else {
    const mencong = text.match(/\b(mulut\s*mencong|asimetris\s*wajah|lagof?talmus|disartria|bicara\s*pelo|afasia)\b/i)
    if (mencong) {
      const idx = text.indexOf(mencong[0])
      const afterMatch = text.slice(idx + mencong[0].length, idx + mencong[0].length + 15)
      if (!/\bsde\b|sulit\s*d/i.test(afterMatch)) {
        add(mencong[1].charAt(0).toUpperCase() + mencong[1].slice(1), 13)
      }
    }
  }

  // Refleks Patologis Positif
  if (/\b(?:babinski|chaddock|oppenheim|gordon|hoffman|tromner)\s*[:-]?\s*(?:(?:\+|-\/\+|\+\/-|\+\/\+)|(?:\(\s*\+\s*\)))/i.test(text)) {
    const refMatch = text.match(/\b(babinski|chaddock|hoffman)\b/i)
    const name = refMatch ? (refMatch[1].charAt(0).toUpperCase() + refMatch[1].slice(1)) : 'Refleks patologis'
    add(`${name} (+)`, 14)
  }

  // Kaku Kuduk / Meningeal Signs Positif (pastikan bukan tanda minus)
  if (/\b(?:kaku\s*kuduk|meningeal\s*sign|brudzinski|kernig)\s*(?:\(\s*\+\s*\)|\+)\b/i.test(text) && !/\bkaku\s*(?:kuduk|leher)\s*\(\s*-\s*\)/i.test(text)) {
    add('Kaku kuduk (+)', 15)
  }

  // Kejang Aktif / Status Epileptikus
  const seizureMatch = text.match(/\b(status\s*epileptikus|kejang\s*(?:berulang|tonik|klonik|umum)?(?:\s*\(\+\))?)\b/i)
  if (seizureMatch && !isClauseNegated(seizureMatch[0])) {
    add('Kejang (+)', 9)
  }

  // 4. Oksigenasi & Tanda-Tanda Vital Kritis
  const spo2Match = text.match(/\b(?:SpO2|Sat(?:urasi)?)\s*[:-]?\s*(\d{1,3})\s*%(?:\s*(RA|room\s*air))?/i)
  if (spo2Match) {
    const spo2 = parseInt(spo2Match[1], 10)
    if (spo2 < 95) {
      const isRa = !!spo2Match[2]
      add(`SpO2 ${spo2}%${isRa ? ' (RA)' : ''}`, spo2 < 90 ? 6 : 10)
    }
  }

  // Dyspneu / Tanda Distres Pernapasan
  if (/\b(?:dyspne[au]|sesak(?:\s*napas|\s*nafas)?|napas\s*cuping\s*hidung|retraksi\s*dada)\s*(?:\(\s*\+\s*\)|\+)\b/i.test(text) ||
      (/\b(?:dyspne[au]|sesak)\b/i.test(text) && !isClauseNegated(text.match(/\b(?:dyspne[au]|sesak)[^\n,;]*/i)?.[0] || ''))) {
    const dMatch = text.match(/\b(?:dyspne[au]|sesak)[^\n,;]*/i)?.[0] || ''
    if (!isClauseNegated(dMatch)) {
      add('Dyspneu (+)', 11)
    }
  }

  // Auskultasi Paru: Rhonki & Wheezing
  if (/\b(?:Rh|Ronkhi|Rhonki)\s*[:-]?\s*(?:(?:\+|-\/\+|\+\/-|\+\/\+)|(?:\(\s*\+\s*\)))/i.test(text)) {
    add('Rhonki (+)', 12)
  }
  if (/\b(?:Wh|Wheezing)\s*[:-]?\s*(?:(?:\+|-\/\+|\+\/-|\+\/\+)|(?:\(\s*\+\s*\)))/i.test(text)) {
    add('Wheezing (+)', 12)
  }

  // Tekanan Darah (TD)
  const tdMatch = text.match(/\b(?:TD|BP|Tens[ie])\s*[:-]?\s*(\d{2,3})\s*[/x]\s*(\d{2,3})\b/i)
  if (tdMatch) {
    const sys = parseInt(tdMatch[1], 10)
    const dia = parseInt(tdMatch[2], 10)
    if (sys >= 180 || dia >= 110) {
      add(`TD ${sys}/${dia} (Krisis HT)`, 7)
    } else if (sys <= 90 || dia <= 60) {
      add(`TD ${sys}/${dia} (Hipotensi/Syok)`, 7)
    } else if (sys >= 140 || dia >= 90) {
      add(`TD ${sys}/${dia}`, 20)
    }
  }

  // Laju Nadi (HR)
  const hrMatch = text.match(/\b(?:HR|Nadi|Pulse)\s*[:-]?\s*(\d{2,3})\s*(?:x\/m|bpm|x|kali\/mnt)?\b/i)
  if (hrMatch) {
    const hr = parseInt(hrMatch[1], 10)
    if (hr >= 120 || hr <= 50) {
      add(`HR ${hr}x/m`, 8)
    } else if (hr > 100 || hr < 60) {
      add(`HR ${hr}x/m`, 18)
    }
  }

  // Laju Nafas (RR)
  const rrMatch = text.match(/\b(?:RR|Resp)\s*[:-]?\s*(\d{1,2})\s*(?:x\/m|kali\/mnt)?\b/i)
  if (rrMatch) {
    const rr = parseInt(rrMatch[1], 10)
    if (rr >= 24 || rr <= 10) {
      add(`RR ${rr}x/m`, 11)
    }
  }

  // Suhu Febris / Hipotermia
  const suhuMatch = text.match(/\b(?:Suhu|Temp|T|S)\s*[:-]?\s*(\d{2}(?:[.,]\d+)?)\s*(?:°?C|c)?\b/i)
  if (suhuMatch) {
    const s = parseFloat(suhuMatch[1].replace(',', '.'))
    if (s >= 37.8) {
      add(`Suhu ${s}°C`, 16)
    } else if (s <= 35.5) {
      add(`Suhu ${s}°C (Hipotermia)`, 16)
    }
  }

  // 5. Laboratorium Abnormal Kunci
  const gdsMatch = text.match(/\b(?:GDS|GDA|Gula\s*Darah)\s*[:-]?\s*(\d{2,3})\b/i)
  if (gdsMatch) {
    const val = parseInt(gdsMatch[1], 10)
    if (val <= 70) {
      add(`GDS ${val} (Hipoglikemia)`, 5)
    } else if (val >= 180) {
      add(`GDS ${val}`, 17)
    }
  }

  const leukoMatch = text.match(/\b(?:Leuko(?:sit)?|WBC)\s*[:-]?\s*(\d{1,2}(?:[.,]\d{3})?|\d{4,5})\b/i)
  if (leukoMatch) {
    const rawVal = leukoMatch[1].replace(/[.,]/g, '')
    const val = parseInt(rawVal, 10)
    if (val > 11000 || val < 4000) add(`Leuko ${leukoMatch[1]}`, 22)
  }

  const hbMatch = text.match(/\b(?:Hb|Hgb|Hemoglobin)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)\b/i)
  if (hbMatch) {
    const val = parseFloat(hbMatch[1].replace(',', '.'))
    if (val < 10.0 || val > 17.5) add(`Hb ${val}`, 22)
  }

  const tromboMatch = text.match(/\b(?:Trombo(?:sit)?|PLT)\s*[:-]?\s*(\d{1,3}(?:[.,]\d{3})?|\d{4,6})\b/i)
  if (tromboMatch) {
    const rawVal = tromboMatch[1].replace(/[.,]/g, '')
    const val = parseInt(rawVal, 10)
    if (val < 100000) add(`Trombo ${tromboMatch[1]}`, 22)
  }

  const crMatch = text.match(/\b(?:Kreatinin|Creatinine|Cr)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)\b/i)
  if (crMatch) {
    const val = parseFloat(crMatch[1].replace(',', '.'))
    if (val >= 1.4) add(`Cr ${val}`, 23)
  }

  const urMatch = text.match(/\b(?:Ureum|Ur)\s*[:-]?\s*(\d{2,3}(?:[.,]\d+)?)\b/i)
  if (urMatch) {
    const val = parseFloat(urMatch[1].replace(',', '.'))
    if (val >= 50) add(`Ur ${val}`, 23)
  }

  const naMatch = text.match(/\b(?:Natrium|Na)\s*[:-]?\s*(\d{2,3}(?:[.,]\d+)?)\b/i)
  if (naMatch) {
    const val = parseFloat(naMatch[1].replace(',', '.'))
    if (val < 135 || val > 145) add(`Na ${val}`, 23)
  }
  const kMatch = text.match(/\b(?:Kalium|K)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)\b/i)
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(',', '.'))
    if (val < 3.5 || val > 5.1) add(`K ${val}`, 23)
  }

  // 6. Radiologi Kunci
  const ctMatch = text.match(/\b(?:CT[\s-]?Scan(?:\s*kepala)?|MSCT)\s*[:-]?\s*([^.\n;]+)/i)
  if (ctMatch) {
    let ctRes = ctMatch[1].trim()
    ctRes = ctRes.replace(/^(?:tampak|kesan|didapatkan|hasil)\s*[:-]?\s*/i, '').trim()
    if (ctRes && !NEGATIVE_FINDINGS.some((n) => n.test(ctRes))) {
      add(ctRes.length > 35 ? `CT: ${ctRes.substring(0, 35)}...` : `CT: ${ctRes}`, 5)
    }
  } else {
    const radKey = text.match(/\b(infark\s*(?:luas|cerebri|lacunar|cerebel)|ICH\s*(?:vol\s*\d+cc)?|EDH|SDH|SAH|edema\s*serebri|midline\s*shift)\b/i)
    if (radKey && !NEGATIVE_FINDINGS.some((n) => n.test(radKey[0]))) {
      add(radKey[0].trim(), 5)
    }
  }

  const thMatch = text.match(/\b(kardiomegali|cardiomegaly|infiltrat\s*(?:paru)?|bronkopneumonia|edema\s*paru|efusi\s*pleura)\b/i)
  if (thMatch && !NEGATIVE_FINDINGS.some((n) => n.test(thMatch[0]))) {
    add(thMatch[1].charAt(0).toUpperCase() + thMatch[1].slice(1), 24)
  }

  // Sort findings by priority ascending (most urgent first)
  items.sort((a, b) => a.priority - b.priority)

  // Return up to 7 most critical findings
  return items.map((it) => it.text).slice(0, 7)
}

/**
 * Mengambil ringkasan klinis terpadu (S & O) untuk kartu pasien
 */
export function extractClinicalHighlights(note?: ProgressNote | null, noteWithS?: ProgressNote | null): ClinicalHighlights {
  if (!note && !noteWithS) {
    return { sList: [], oList: [], hasAbnormal: false }
  }

  const sText = note?.S?.trim() || noteWithS?.S?.trim() || ''
  const sList = extractSubjectivePositives(sText)
  const oList = extractObjectivePositives(note?.O_pemfis, note?.O_penunjang)

  return {
    sList,
    oList,
    hasAbnormal: sList.length > 0 || oList.length > 0,
  }
}

/**
 * Ekstraktor metrik klinis diskrit terstruktur (GCS, TTV, Motorik, Gejala +/-)
 * dari catatan perkembangan pasien (SOAP) untuk visualisasi tren klinis dan audit.
 */
export function extractClinicalMetrics(
  note?: { S?: string; O_pemfis?: string; O_penunjang?: string } | ProgressNote | null
): ClinicalMetrics {
  const result: ClinicalMetrics = {}
  if (!note) return result

  const rawS = note.S || ''
  const rawPemfis = note.O_pemfis || ''
  const rawPenunjang = note.O_penunjang || ''
  const combinedO = `${rawPemfis}\n${rawPenunjang}`.trim()

  // 1. Ekstraksi GCS
  // Format EVM: GCS E4V5M6, E1V1M1, E1VettM1, dst.
  const evmMatch = combinedO.match(/\b(?:GCS\s*[:-]?\s*)?E([1-4])\s*V([1-5X]|ett|afasia)?\s*M([1-6])\b/i)
  if (evmMatch) {
    const e = parseInt(evmMatch[1], 10)
    const vRaw = evmMatch[2] || '1'
    const vNum = parseInt(vRaw, 10)
    const v = isNaN(vNum) ? vRaw.toLowerCase() : vNum
    const m = parseInt(evmMatch[3], 10)
    const total = e + (typeof v === 'number' ? v : 1) + m
    result.gcs = {
      e,
      v,
      m,
      total,
      raw: `E${evmMatch[1]}V${vRaw}M${evmMatch[3]}`,
    }
  } else {
    // Format 3 Digit: GCS 456, GCS: 111, GCS 315, GCS 1-1-1, GCS 1/1/1
    const threeDigitMatch = combinedO.match(/\bGCS\s*[:-]?\s*([1-4])\s*[-/]?\s*([1-5])\s*[-/]?\s*([1-6])\b/i)
      || combinedO.match(/\b(?:kesadaran|sensorium)\s*[:-]?\s*(?:compos mentis|somnolen|apatis|sopor|koma)?\s*\(?([1-4])([1-5])([1-6])\)?/i)
    if (threeDigitMatch) {
      const e = parseInt(threeDigitMatch[1], 10)
      const v = parseInt(threeDigitMatch[2], 10)
      const m = parseInt(threeDigitMatch[3], 10)
      result.gcs = {
        e,
        v,
        m,
        total: e + v + m,
        raw: `${e}${v}${m}`,
      }
    } else {
      // Format total score: GCS 15, GCS: 8
      const totalMatch = combinedO.match(/\bGCS\s*[:-]?\s*(\d{1,2})\b/i)
      if (totalMatch) {
        const total = parseInt(totalMatch[1], 10)
        if (total >= 3 && total <= 15) {
          result.gcs = {
            total,
            raw: `GCS ${total}`,
          }
        }
      }
    }
  }

  // 2. Ekstraksi TTV (Tanda-Tanda Vital)
  const ttv: NonNullable<ClinicalMetrics['ttv']> = {}

  // Tekanan Darah (TD)
  const tdMatch = combinedO.match(/\b(?:TD|BP|Tens[ie])\s*[:-]?\s*(\d{2,3})\s*[/x]\s*(\d{2,3})\b/i)
    || combinedO.match(/\b(\d{2,3})\s*[/x]\s*(\d{2,3})\s*mmHg\b/i)
  if (tdMatch) {
    ttv.td_systolic = parseInt(tdMatch[1], 10)
    ttv.td_diastolic = parseInt(tdMatch[2], 10)
    ttv.td_raw = `${ttv.td_systolic}/${ttv.td_diastolic}`
  }

  // Laju Nadi (HR)
  const hrMatch = combinedO.match(/\b(?:HR|Nadi|Pulse)\s*[:-]?\s*(\d{2,3})\s*(?:x\/m|bpm|x|kali\/mnt)?\b/i)
  if (hrMatch) {
    ttv.hr = parseInt(hrMatch[1], 10)
  }

  // Laju Nafas (RR)
  const rrMatch = combinedO.match(/\b(?:RR|Resp)\s*[:-]?\s*(\d{1,2})\s*(?:x\/m|kali\/mnt)?\b/i)
  if (rrMatch) {
    ttv.rr = parseInt(rrMatch[1], 10)
  }

  // Saturasi Oksigen (SpO2)
  const spo2Match = combinedO.match(/\b(?:SpO2|Sat(?:urasi)?)\s*[:-]?\s*(\d{1,3})\s*%?\b/i)
  if (spo2Match) {
    const sVal = parseInt(spo2Match[1], 10)
    if (sVal >= 50 && sVal <= 100) {
      ttv.spo2 = sVal
    }
  }

  // Suhu (°C)
  const suhuMatch = combinedO.match(/\b(?:Suhu|Temp|T|S)\s*[:-]?\s*(\d{2}(?:[.,]\d+)?)\s*(?:°?C|c)?\b/i)
  if (suhuMatch) {
    const sVal = parseFloat(suhuMatch[1].replace(',', '.'))
    if (sVal >= 30 && sVal <= 45) {
      ttv.suhu = sVal
    }
  }

  if (Object.keys(ttv).length > 0) {
    result.ttv = ttv
  }

  // 3. Ekstraksi Kekuatan Motorik
  // Cari pola motorik 4 ekstremitas
  const motorikQuadMatch = combinedO.match(
    /\b(?:motorik|kekuatan|extremitas|ekstremitas)\s*[:-]?\s*([0-5]{1,4})\s*[/x]\s*([0-5]{1,4})\s*(?:[\n//,;|-]+|\s+)\s*([0-5]{1,4})\s*[/x]\s*([0-5]{1,4})/i
  )

  if (motorikQuadMatch) {
    result.motorik = {
      superior_kanan: motorikQuadMatch[1],
      superior_kiri: motorikQuadMatch[2],
      inferior_kanan: motorikQuadMatch[3],
      inferior_kiri: motorikQuadMatch[4],
      raw: `${motorikQuadMatch[1]}/${motorikQuadMatch[2]} // ${motorikQuadMatch[3]}/${motorikQuadMatch[4]}`,
    }
  } else {
    const motorikPairMatch = combinedO.match(
      /\b(?:motorik|kekuatan|extremitas|ekstremitas)\s*[:-]?\s*([0-5]{1,4})\s*[/x]\s*([0-5]{1,4})/i
    )
    if (motorikPairMatch) {
      const v1 = motorikPairMatch[1]
      const v2 = motorikPairMatch[2]
      result.motorik = {
        superior_kanan: v1,
        superior_kiri: v2,
        inferior_kanan: v1,
        inferior_kiri: v2,
        raw: `${v1}/${v2}`,
      }
    }
  }

  // 4. Ekstraksi Gejala & Keluhan (Subjective Tracking)
  const symptomKeywords = [
    { key: 'mual', name: 'Mual' },
    { key: 'muntah', name: 'Muntah' },
    { key: 'nyeri\\s*kepala|sakit\\s*kepala|cephalgia|sefalgia', name: 'Nyeri Kepala' },
    { key: 'pusing|vertigo|kliyengan', name: 'Pusing / Vertigo' },
    { key: 'lemah|lemas|hemiparesis|lumpuh', name: 'Lemah Separuh Badan' },
    { key: 'pelo|disartria|bicara\\s*berat|afasia', name: 'Bicara Pelo / Afasia' },
    { key: 'mencong|merot|asimetris', name: 'Mulut Mencong' },
    { key: 'kejang', name: 'Kejang' },
    { key: 'sesak|dyspnea', name: 'Sesak Nafas' },
    { key: 'demam|meriang|panas', name: 'Demam' },
    { key: 'tersedak|sulit\\s*menelan|susah\\s*menelan|disfagia', name: 'Sulit Menelan' },
    { key: 'kebas|kesemutan|baal', name: 'Kebas / Kesemutan' },
    { key: 'nyeri\\s*dada|angina', name: 'Nyeri Dada' },
    { key: 'nyeri\\s*perut|nyeri\\s*ulu\\s*hati|epigastrium', name: 'Nyeri Perut' },
  ]

  const symptomsFound: { nama: string; status: '+' | '-'; keterangan?: string }[] = []
  const clauses = segmentNarrative(rawS)

  for (const sym of symptomKeywords) {
    const reg = new RegExp(`\\b(?:${sym.key})\\b`, 'i')
    const matchedClause = clauses.find((c) => reg.test(c))
    if (matchedClause) {
      const isNeg = isClauseNegated(matchedClause) || /\(\s*-\s*\)|-\s*$/.test(matchedClause)
      const isMembaik = /\b(?:membaik|berkurang|perbaikan|mereda)\b/i.test(matchedClause)
      const isMemberat = /\b(?:memberat|bertambah)\b/i.test(matchedClause)

      symptomsFound.push({
        nama: sym.name,
        status: isNeg ? '-' : '+',
        keterangan: isMembaik ? 'Membaik' : isMemberat ? 'Memberat' : isNeg ? 'Nihil (-)' : 'Ada (+)',
      })
    }
  }

  if (symptomsFound.length > 0) {
    result.gejala = symptomsFound
  }

  return result
}
