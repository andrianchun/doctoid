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
 * Mengekstrak keluhan positif (S) dari narasi subjektif, membuang basa-basi dan temuan negatif.
 */
export function extractSubjectivePositives(rawS?: string): string[] {
  if (!rawS || !rawS.trim()) return []

  const cleanRaw = rawS
    .replace(/^(?:s|subjektif|keluhan)\s*:\s*/i, '')
    .trim()

  const candidates: string[] = []

  // Pecah per baris, koma, titik koma, atau titik
  const lines = cleanRaw.split(/[\n;]+/)
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-•*•–—\d.)\]]+\s*/, '')
    if (!trimmed) continue

    // Jika baris berisi beberapa klausa yang dipisah koma
    const clauses = trimmed.split(/,\s*/)
    for (let clause of clauses) {
      clause = clause.trim()
      if (!clause) continue

      // Bersihkan awalan basa-basi
      for (const prefix of FILLER_PREFIXES) {
        clause = clause.replace(prefix, '').trim()
      }

      // Abaikan jika temuan negatif (cth: "muntah (-)", "kejang disangkal", "demam (-)")
      const isNegative = NEGATIVE_FINDINGS.some((neg) => neg.test(clause))
      if (isNegative) continue

      // Abaikan frasa waktu tanpa makna klinis mandiri (mis. "sejak kemarin malam", "kemarin sudah berobat")
      if (/^(?:sejak|kemarin|tadi|sudah|namun|tapi|pagi|malam|hari|jam)\b/i.test(clause) && !/\b(?:pusing|demam|sesak|lemas|nyeri|batuk|kejang|pelo|muntah|mual|mencong|bicara)\b/i.test(clause)) {
        continue
      }

      // Rapikan teks keluhan
      let cleanClause = clause
        .replace(/\(\s*\+\s*\)/g, '') // hilangkan (+)
        .replace(/^(?:adanya|terdapat|ada|mengeluh|keluhan)\s+/i, '')
        .trim()

      // Huruf pertama kapital
      if (cleanClause.length > 2) {
        cleanClause = cleanClause.charAt(0).toUpperCase() + cleanClause.slice(1)
        if (!candidates.some((c) => c.toLowerCase() === cleanClause.toLowerCase())) {
          candidates.push(cleanClause)
        }
      }
    }
  }

  // Jika setelah difilter tidak ada yang lolos (misal teks terlalu unik/padat),
  // ambil 1-2 klausa pertama yang bukan kalimat pembuka
  if (candidates.length === 0 && cleanRaw.length > 0) {
    const fallbackParts = cleanRaw.split(/[.\n]/).map((p) => p.trim()).filter(Boolean)
    for (let part of fallbackParts) {
      for (const prefix of FILLER_PREFIXES) {
        part = part.replace(prefix, '').trim()
      }
      if (part && !NEGATIVE_FINDINGS.some((n) => n.test(part))) {
        candidates.push(part.length > 50 ? part.substring(0, 50) + '...' : part)
        break
      }
    }
  }

  return candidates.slice(0, 4) // Maksimal 4 keluhan positif paling relevan
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
