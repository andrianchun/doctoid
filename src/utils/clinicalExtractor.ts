import type { ProgressNote } from '../db'

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
    .replace(/^\s*[\/\\-]\s*/gm, '')
    .trim()

  // Standardize boundaries before/after negation symbols
  const withBoundaries = clean
    .replace(/(\(\s*-\s*\))([A-Za-z])/g, '$1 , $2')
    .replace(/\b(disangkal|dbn|nihil)\b/gi, '$1 , ')
    .replace(/(\(\s*-\s*\))/g, ' $1 , ')

  return withBoundaries
    .split(/[,;\n•·]+/)
    .map((c) => c.trim())
    .filter(Boolean)
}

function isClauseNegated(c: string): boolean {
  return /\(\s*-\s*\)|\b(?:disangkal|tidak\s*(?:ada|didapatkan|dirasakan|ditemukan|mengeluh)|dbn|dalam\s*batas\s*normal|nihil|negatif|tanpa|bebas)\b/i.test(c)
}

/**
 * Mengekstrak keluhan positif (S) dari narasi subjektif secara cerdas
 * (Clinical Entity Recognition khusus bahasa medis Indonesia).
 */
export function extractSubjectivePositives(rawS?: string): string[] {
  if (!rawS || !rawS.trim()) return []

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
      const sisiMatch = positiveText.match(/\b(dextra|sinistra|kanan|kiri)\b/i)
      const sisi = sisiMatch ? sisiMatch[1].toLowerCase() : ''
      const bagianMatch = positiveText.match(/\b(ekstr[ei]mitas|tangan\s*dan\s*kaki|tangan|kaki|separuh\s*badan)\b/i)
      const bagian = bagianMatch ? bagianMatch[1].replace('ekstrimitas', 'ekstremitas') : 'ekstremitas'

      if (/\bhemiparesis\b/i.test(positiveText)) {
        return `Hemiparesis${sisi ? ` (${sisi})` : ''}`
      }
      return `Lemas ${bagian}${sisi ? ` ${sisi}` : ''}`
    }
  )

  // 2. Gangguan Bicara (Pelo / Disartria / Afasia / Bicara Berat / Tidak Lancar)
  check(
    /\b(?:pelo|disartria|afasia|rero|bicara\s*(?:terasa\s*)?(?:berat|tidak\s*lancar|tidak\s*jelas|pelo|sulit|patah-patah)|sulit\s*bicara)\b/i,
    (m) => {
      if (/\bafasia\b/i.test(m[0])) return 'Afasia'
      if (/\bberat\b/i.test(m[0])) return 'Bicara berat'
      if (/\btidak\s*lancar\b/i.test(m[0])) return 'Bicara tidak lancar'
      return 'Bicara pelo'
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
      const vasMatch = rawS.match(/\bVAS\s*[:=-]?\s*(\d{1,2}(?:\s*-\s*\d{1,2})?)\b/i)
      const vas = vasMatch ? `VAS ${vasMatch[1]}` : ''
      const sifatMatch = rawS.match(/\b(?:cekot[\s-]*cekot|berdenyut|hebat|menusuk)\b/i)
      const sifat = sifatMatch ? sifatMatch[0] : ''
      const extra = [vas, sifat].filter(Boolean).join(', ')
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
  if (hasMual && hasMuntah) entities.push('Mual & muntah')
  else if (hasMuntah) entities.push('Muntah')
  else if (hasMual) entities.push('Mual')

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
  check(/\b(?:sesak\s*nafas|sesak|dispnea)\b/i, 'Sesak nafas')
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
  check(/\b(?:disfagia|sulit\s*menelan|tersedak)\b/i, (m) => /\btersedak\b/i.test(m[0]) ? 'Tersedak' : 'Sulit menelan')

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
    if (/^(?:sejak|kemarin|tadi|sudah|namun|tapi|pagi|malam|hari|jam)\b/i.test(clause)) continue

    let cleanClause = clause
      .replace(/\(\s*\+\s*\)/g, '')
      .replace(/^(?:adanya|terdapat|ada|mengeluh|keluhan)\s+/i, '')
      .trim()

    if (cleanClause.length > 2 && cleanClause.length <= 40) {
      cleanClause = cleanClause.charAt(0).toUpperCase() + cleanClause.slice(1)
      if (!candidates.some((c) => c.toLowerCase() === cleanClause.toLowerCase())) {
        candidates.push(cleanClause)
      }
    }
  }

  return candidates.slice(0, 3)
}

/**
 * Mengekstrak temuan objektif positif & abnormal dari Pemeriksaan Fisik & Penunjang (O).
 */
export function extractObjectivePositives(rawPemfis?: string, rawPenunjang?: string): string[] {
  const findings: string[] = []
  const text = `${rawPemfis || ''}\n${rawPenunjang || ''}`
  if (!text.trim()) return []

  // 1. Tanda Vital Abnormal
  // Tekanan Darah (TD / BP)
  const tdMatch = text.match(/\b(?:TD|BP|Tens[ie])\s*[:-]?\s*(\d{2,3})\s*[\/x]\s*(\d{2,3})\b/i)
  if (tdMatch) {
    const sys = parseInt(tdMatch[1], 10)
    const dia = parseInt(tdMatch[2], 10)
    if (sys >= 140 || sys <= 95 || dia >= 90 || dia <= 60) {
      findings.push(`TD ${sys}/${dia}`)
    }
  }

  // Laju Nadi (HR / Nadi) abnormal
  const hrMatch = text.match(/\b(?:HR|Nadi|Pulse)\s*[:-]?\s*(\d{2,3})\s*(?:x\/m|bpm|x)?\b/i)
  if (hrMatch) {
    const hr = parseInt(hrMatch[1], 10)
    if (hr > 100 || hr < 60) {
      findings.push(`HR ${hr}x/m`)
    }
  }

  // Laju Nafas (RR) abnormal
  const rrMatch = text.match(/\b(?:RR|Resp)\s*[:-]?\s*(\d{1,2})\b/i)
  if (rrMatch) {
    const rr = parseInt(rrMatch[1], 10)
    if (rr > 20 || rr < 12) {
      findings.push(`RR ${rr}x/m`)
    }
  }

  // Saturasi Oksigen (SpO2) abnormal
  const spo2Match = text.match(/\b(?:SpO2|Sat(?:urasi)?)\s*[:-]?\s*(\d{1,3})\s*%?\b/i)
  if (spo2Match) {
    const spo2 = parseInt(spo2Match[1], 10)
    if (spo2 < 95) {
      findings.push(`SpO2 ${spo2}%`)
    }
  }

  // Suhu Febris
  const suhuMatch = text.match(/\b(?:Suhu|Temp|T|S)\s*[:-]?\s*(\d{2}(?:[.,]\d+)?)\s*(?:°?C|c)?\b/i)
  if (suhuMatch) {
    const s = parseFloat(suhuMatch[1].replace(',', '.'))
    if (s >= 37.8) {
      findings.push(`Suhu ${s}°C`)
    }
  }

  // 2. Kesadaran / GCS
  const gcsMatch = text.match(/\b(GCS\s*(?:E\d+V\d+M\d+|\d{1,2}))\b/i)
  if (gcsMatch) {
    const gcsStr = gcsMatch[1]
    const gcsNum = gcsStr.match(/\b(\d{1,2})\b/)?.[1]
    if (gcsNum && parseInt(gcsNum, 10) < 15) {
      findings.push(gcsStr.toUpperCase())
    } else if (/E[1-3]V[1-4]M[1-5]/i.test(gcsStr)) {
      findings.push(gcsStr.toUpperCase())
    }
  }

  // Kesadaran non-compos mentis
  const kesadaranMatch = text.match(/\b(somnolen|sopor|apatis|delirium|stupor|koma)\b/i)
  if (kesadaranMatch && !findings.some(f => f.toLowerCase().includes(kesadaranMatch[1].toLowerCase()))) {
    findings.push(kesadaranMatch[1].charAt(0).toUpperCase() + kesadaranMatch[1].slice(1))
  }

  // 3. Status Neurologis / Defisit Motorik
  // Kekuatan Motorik (misal 2222/5555, 2/5, 3333/5555)
  const motorikMatch = text.match(/\b(?:motorik|kekuatan|extremitas|ekstremitas)\s*[:-]?\s*([0-5]\s*[0-5]?\s*[0-5]?\s*[0-5]?\s*[\/x]\s*[0-5]\s*[0-5]?\s*[0-5]?\s*[0-5]?|[0-5]\/[0-5])/i)
  if (motorikMatch) {
    const cleanMot = motorikMatch[1].replace(/\s+/g, '')
    findings.push(`Motorik ${cleanMot}`)
  } else {
    // Cari paresis / plegia
    const paresisMatch = text.match(/\b(hemiparesis|hemiplegia|tetraparesis|tetraplegia|monoparesis|paraparesis)\s*(dextra|sinistra|bilateral|kiri|kanan)?\b/i)
    if (paresisMatch) {
      findings.push(paresisMatch[0].trim())
    }
  }

  // Paresis Nervus Cranialis (N.VII, N.XII sentral/perifer)
  const pareseNervus = text.match(/\b(?:parese|paresis)\s*(N\.?\s*(?:VII|XII|III|IV|VI)|nervus\s*\w+)\s*(?:dextra|sinistra|kiri|kanan)?\s*(?:sentral|perifer)?\b/i)
  if (pareseNervus) {
    findings.push(pareseNervus[0].trim())
  } else {
    const mencong = text.match(/\b(mulut\s*mencong|asimetris\s*wajah|lagof?talmus)\b/i)
    if (mencong) findings.push(mencong[1])
  }

  // Refleks Patologis Positif
  if (/\b(?:babinski|chaddock|oppenheim|gordon|hoffman|tromner)\s*(?:\(\s*\+\s*\)|\+)\b/i.test(text)) {
    const refMatch = text.match(/\b(babinski|chaddock|hoffman)\s*(?:\(\s*\+\s*\)|\+)/i)
    findings.push(`${refMatch ? refMatch[1] : 'Refleks patologis'} (+)`)
  }

  // Kaku Kuduk / Meningeal Signs
  if (/\b(?:kaku\s*kuduk|meningeal\s*sign|brudzinski|kernig)\s*(?:\(\s*\+\s*\)|\+)\b/i.test(text)) {
    findings.push('Kaku kuduk (+)')
  }

  // Pupil Anisokor
  if (/\b(?:pupil\s*anisokor|anisokor)\b/i.test(text)) {
    findings.push('Pupil anisokor')
  }

  // 4. Laboratorium Abnormal Kunci
  // GDS / GDA (Gula Darah Sewaktu)
  const gdsMatch = text.match(/\b(?:GDS|GDA|Gula\s*Darah)\s*[:-]?\s*(\d{2,3})\b/i)
  if (gdsMatch) {
    const val = parseInt(gdsMatch[1], 10)
    if (val >= 180 || val <= 70) findings.push(`GDS ${val}`)
  }

  // Leukosit
  const leukoMatch = text.match(/\b(?:Leuko(?:sit)?|WBC)\s*[:-]?\s*(\d{1,2}(?:[.,]\d{3})?|\d{4,5})\b/i)
  if (leukoMatch) {
    const rawVal = leukoMatch[1].replace(/[.,]/g, '')
    const val = parseInt(rawVal, 10)
    if (val > 11000 || val < 4000) findings.push(`Leuko ${leukoMatch[1]}`)
  }

  // Hemoglobin (Hb)
  const hbMatch = text.match(/\b(?:Hb|Hgb|Hemoglobin)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)\b/i)
  if (hbMatch) {
    const val = parseFloat(hbMatch[1].replace(',', '.'))
    if (val < 10.0 || val > 17.5) findings.push(`Hb ${val}`)
  }

  // Kreatinin
  const crMatch = text.match(/\b(?:Kreatinin|Creatinine|Cr)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)\b/i)
  if (crMatch) {
    const val = parseFloat(crMatch[1].replace(',', '.'))
    if (val >= 1.4) findings.push(`Cr ${val}`)
  }

  // Ureum
  const urMatch = text.match(/\b(?:Ureum|Ur)\s*[:-]?\s*(\d{2,3}(?:[.,]\d+)?)\b/i)
  if (urMatch) {
    const val = parseFloat(urMatch[1].replace(',', '.'))
    if (val >= 50) findings.push(`Ur ${val}`)
  }

  // Natrium (Na)
  const naMatch = text.match(/\b(?:Natrium|Na)\s*[:-]?\s*(\d{2,3}(?:[.,]\d+)?)\b/i)
  if (naMatch) {
    const val = parseFloat(naMatch[1].replace(',', '.'))
    if (val < 135 || val > 145) findings.push(`Na ${val}`)
  }

  // Kalium (K)
  const kMatch = text.match(/\b(?:Kalium|K)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)\b/i)
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(',', '.'))
    if (val < 3.5 || val > 5.1) findings.push(`K ${val}`)
  }

  // 5. Radiologi / Penunjang Positif Kunci
  // CT Scan Kepala
  const ctMatch = text.match(/\b(?:CT[\s-]?Scan(?:\s*kepala)?|MSCT)\s*[:-]?\s*([^.\n;]+)/i)
  if (ctMatch) {
    let ctRes = ctMatch[1].trim()
    ctRes = ctRes.replace(/^(?:tampak|kesan|didapatkan|hasil)\s*[:-]?\s*/i, '').trim()
    if (ctRes && !NEGATIVE_FINDINGS.some(n => n.test(ctRes))) {
      findings.push(ctRes.length > 35 ? `CT: ${ctRes.substring(0, 35)}...` : `CT: ${ctRes}`)
    }
  } else {
    // Deteksi cepat jika ada infark / perdarahan / edema
    const radKey = text.match(/\b(infark\s*(?:luas|cerebri|lacunar|cerebel)|ICH\s*(?:vol\s*\d+cc)?|EDH|SDH|SAH|edema\s*serebri|midline\s*shift)\b/i)
    if (radKey && !findings.some(f => f.toLowerCase().includes(radKey[1].toLowerCase()))) {
      findings.push(radKey[0].trim())
    }
  }

  // Rontgen Thorax
  if (/\b(?:kardiomegali|cardiomegaly|infiltrat|bronkopneumonia|edema\s*paru|efusi\s*pleura)\b/i.test(text)) {
    const thMatch = text.match(/\b(kardiomegali|infiltrat\s*(?:paru)?|bronkopneumonia|edema\s*paru|efusi\s*pleura)\b/i)
    if (thMatch) findings.push(thMatch[1].charAt(0).toUpperCase() + thMatch[1].slice(1))
  }

  return findings.slice(0, 5) // Maksimal 5 temuan objektif kunci
}

/**
 * Mengambil ringkasan klinis terpadu (S & O) untuk kartu pasien
 */
export function extractClinicalHighlights(note?: ProgressNote | null): ClinicalHighlights {
  if (!note) {
    return { sList: [], oList: [], hasAbnormal: false }
  }

  const sList = extractSubjectivePositives(note.S)
  const oList = extractObjectivePositives(note.O_pemfis, note.O_penunjang)

  return {
    sList,
    oList,
    hasAbnormal: sList.length > 0 || oList.length > 0,
  }
}
