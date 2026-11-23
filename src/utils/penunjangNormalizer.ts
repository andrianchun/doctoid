/**
 * Normalizer tunggal untuk menyeragamkan format penunjang (Lab, EKG, Radiologi)
 * baik untuk data baru (parser, AI, Vision) maupun data lama yang sudah tersimpan.
 *
 * Contoh transformasi:
 * - "[Laboratorium]:" -> "Lab:"
 * - "[Radiologi]: - CT Scan Kepala menunjukkan lesi hiperdens/perdarahan intraventrikular. Rontgen Thorax menunjukkan kardiomegali."
 *   ->
 *   "Radiologi:\n- CT Scan Kepala: Perdarahan intraventrikular\n- Xray Thorax: Kardiomegali"
 * - "CT Scan Kepala menunjukkan adanya perdarahan intraserebral di lobus frontal kiri dengan volume ± 18 cc"
 *   -> "CT Scan Kepala: Perdarahan frontal S (± 18 cc)"
 * - "Foto Thorax tampak curiga pneumonia kanan"
 *   -> "Xray Thorax: Kesan Pneumonia D"
 */

function normalizeSideAndLocation(text: string): string {
  let s = text

  // Ringkas "perdarahan intraserebral di lobus frontal kiri" -> "Perdarahan frontal S"
  s = s.replace(
    /\bperdarahan\s+intraserebral\s+(?:(?:di|pada)\s+)?(?:lobus\s+|regio\s+|daerah\s+)?(?=(?:frontal|parietal|temporal|oksipital|occipital|basal\s*ganglia|thalamus|talamus|pons|serebelum|cerebellum|hemisfer|hemisphere|kapsula|korona))/gi,
    'Perdarahan '
  )

  // Hapus preposisi lokasi bertele-tele tepat sebelum lokasi anatomi otak
  s = s.replace(
    /\b(?:di|pada)\s+(?:(?:daerah|area|regio|lobus)\s+)?(?=(?:frontal|parietal|temporal|oksipital|occipital|basal\s*ganglia|thalamus|talamus|pons|serebelum|cerebellum|hemisfer|hemisphere|kapsula|korona|ventrikel|intraventrikul))/gi,
    ''
  )
  s = s.replace(/\blobus\s+(?=(?:frontal|parietal|temporal|oksipital|occipital))/gi, '')

  // Standarisasi sisi anatomi kiri -> S, kanan -> D (kecuali bila "kiri dan kanan")
  const anatomyRe =
    '(frontal|parietal|temporal|oksipital|occipital|basal\\s*ganglia|thalamus|talamus|pons|serebelum|cerebellum|hemisfer|hemisphere|kapsula\\s*interna|korona\\s*radiata|ventrikel|paru|pleura|pulmo|lobaris|hemithorax|pneumonia|infiltrat|efusi|hematom(?:a)?|perdarahan|infark)'
  s = s.replace(
    new RegExp(`${anatomyRe}\\s+(?:kiri|sinistra)\\b(?!\\s+(?:dan|atau|maupun|&)\\s+(?:kanan|dextra))`, 'gi'),
    '$1 S'
  )
  s = s.replace(
    new RegExp(`${anatomyRe}\\s+(?:kanan|dextra)\\b(?!\\s+(?:dan|atau|maupun|&)\\s+(?:kiri|sinistra))`, 'gi'),
    '$1 D'
  )

  // Ringkaskan penulisan volume: "dengan volume ± 18 cc" -> "(± 18 cc)"
  s = s.replace(
    /\s*(?:,|dengan)?\s*(?:estimasi\s+)?volume\s*(?:sekitar\s*)?(±?\s*\d+(?:[.,]\d+)?\s*(?:cc|ml))\b/gi,
    (_, v: string) => ` (${v.trim()})`
  )

  return s.replace(/\s{2,}/g, ' ').trim()
}

const MODALITY_SPLIT_RE =
  /(?:\.\s+|;\s+)(?=(?:Hasil\s+|Bacaan\s+)?(?:CT[\s-]?Scan|MSCT|CT\s*Kepala|MRI|Rontgen|Röntgen|Rontgent|Foto\s*(?:Ro\.?|Rontgen|Thorax|Thoraks|Toraks|Torax|Dada)|Ro\.?\s*(?:Thorax|Thoraks|Toraks|Torax)|X[-\s]?Ray|Xray|CXR|Chest\s*X[-\s]?Ray|USG)\b)/gi

const CT_LINE_RE =
  /^(?:(?:Hasil|Bacaan)\s+(?:pemeriksaan\s+)?)?(?:(?:CT[\s-]?Scan|MSCT)\s*(?:Kepala|Brain|Otak)?(?:\s*(?:tanpa|non[\s-]?)\s*kontras|\s*polos)?|CT\s*Kepala(?:\s*polos)?)\b(\s+dengan\s+kontras)?\s*:?\s*(.*)$/i

const XRAY_LINE_RE =
  /^(?:(?:Hasil|Bacaan)\s+(?:pemeriksaan\s+)?)?(?:Foto\s*Rontgen\s*(?:Thorax|Thoraks|Toraks|Torax|Dada)?|Rontgen\s*(?:Thorax|Thoraks|Toraks|Torax|Dada)|Foto\s*(?:Ro\.?\s*)?(?:Thorax|Thoraks|Toraks|Torax|Dada)|Ro\.?\s*(?:Thorax|Thoraks|Toraks|Torax|Dada)|X[-\s]?Ray(?:\s*(?:Thorax|Thoraks|Toraks|Torax|Dada))?|Xray\s*(?:Thorax|Thoraks|Toraks|Torax|Dada)|Chest\s*X[-\s]?Ray|CXR)\b\s*:?\s*(.*)$/i

const MRI_LINE_RE =
  /^(?:(?:Hasil|Bacaan)\s+(?:pemeriksaan\s+)?)?(MRI(?:\s*(?:Kepala|Brain|Otak))?)\b\s*:?\s*(.*)$/i

function normalizeSinglePenunjangLine(rawLine: string): string {
  const trimmed = rawLine.trim()
  if (!trimmed) return ''

  // Pertahankan bullet jika ada ("- " atau "• ")
  const bulletMatch = trimmed.match(/^([-•]\s+)(.*)$/)
  const bullet = bulletMatch ? bulletMatch[1] : ''
  const body = bulletMatch ? bulletMatch[2].trim() : trimmed

  // Pisahkan beberapa modalitas radiologi yang tergabung dalam 1 baris
  const segments = body.split(MODALITY_SPLIT_RE).map((s) => s.trim()).filter(Boolean)
  if (segments.length > 1) {
    return segments
      .map((seg) => normalizeSinglePenunjangLine(`${bullet}${seg}`))
      .filter(Boolean)
      .join('\n')
  }

  // Standarisasi header kategori kurung siku [...]
  const bracketMatch = body.match(/^\[([^\]]+)\]\s*:?\s*(.*)$/)
  if (bracketMatch) {
    const label = bracketMatch[1].trim().replace(/\bLaboratorium\b/gi, 'Lab')
    const rest = bracketMatch[2].trim()
    if (!rest) return `${bullet}${label}:`
    const normalizedRest = normalizeSinglePenunjangLine(rest)
    return `${bullet}${label}: ${normalizedRest}`
  }

  // Standarisasi label "Laboratorium:" -> "Lab:"
  if (/^Laboratorium\s*:/i.test(body)) {
    return `${bullet}${body.replace(/^Laboratorium\s*:/i, 'Lab:')}`
  }

  let modalityLabel = ''
  let finding = ''

  const ctMatch = body.match(CT_LINE_RE)
  const xrayMatch = !ctMatch ? body.match(XRAY_LINE_RE) : null
  const mriMatch = !ctMatch && !xrayMatch ? body.match(MRI_LINE_RE) : null

  if (ctMatch) {
    const prefixEnd = body.length - ctMatch[2].length
    const isHead = /\b(kepala|brain|otak)\b/i.test(body.slice(0, prefixEnd))
    const hasContrast = !!ctMatch[1]
    modalityLabel = (isHead ? 'CT Scan Kepala' : 'CT Scan') + (hasContrast ? ' (Kontras)' : '')
    finding = ctMatch[2].trim()
  } else if (xrayMatch) {
    modalityLabel = 'Xray Thorax'
    finding = xrayMatch[1].trim()
  } else if (mriMatch) {
    modalityLabel = /\b(kepala|brain|otak)\b/i.test(mriMatch[1]) ? 'MRI Kepala' : 'MRI'
    finding = mriMatch[2].trim()
  } else {
    return trimmed
  }

  if (!finding) {
    return `${bullet}${modalityLabel}:`
  }

  // Hilangkan kata kerja/penghubung bertele-tele di awal (tetap jaga negasi "tidak tampak" / "tak tampak")
  const verboseLeadRe =
    /^(?:yang\s+)?(?:menunjukkan|menunjukan|memperlihatkan|menggambarkan|tampak(?:nya)?|terlihat|didapatkan(?:\s+(?:adanya|hasil|gambaran))?|ditemukan(?:\s+(?:adanya|gambaran))?|dengan\s+hasil|hasil(?:nya)?(?:\s+menunjukkan)?)\s+/i

  let prev = ''
  while (prev !== finding) {
    prev = finding
    finding = finding.replace(verboseLeadRe, '').trim()
    finding = finding.replace(/^(?:adanya\s+gambaran\s+|adanya\s+|gambaran\s+)/i, '').trim()
  }

  // Sederhanakan "lesi hiperdens/perdarahan" -> "perdarahan", "lesi hipodens/infark" -> "infark"
  finding = finding
    .replace(/\blesi\s+hiperdens\s*[/,]?\s*(?:atau\s*)?(perdarahan|ich|hematom(?:a)?|hemoragik|ivh|sah|sdh|edh)\b/gi, '$1')
    .replace(/\blesi\s+hipodens\s*[/,]?\s*(?:atau\s*)?(infark|iskemik|stroke\s*infark)\b/gi, '$1')
    .replace(/^(?:curiga|mengarah\s+(?:pada|ke)|suspect|susp\.?|kemungkinan)\s+/i, 'Kesan ')
    .replace(/^kesan\s*:\s*/i, 'Kesan ')
    .replace(/\.+$/, '')
    .trim()

  finding = normalizeSideAndLocation(finding)

  if (/^Kesan\s+[a-z]/i.test(finding)) {
    finding = finding.replace(/^kesan\s+([a-z])/i, (_, ch: string) => `Kesan ${ch.toUpperCase()}`)
  } else if (finding && /^[a-z]/.test(finding)) {
    finding = finding.charAt(0).toUpperCase() + finding.slice(1)
  }

  return `${bullet}${modalityLabel}: ${finding}`
}

export function normalizePenunjangText(raw?: string): string {
  if (!raw || !raw.trim()) return ''
  return raw
    .split('\n')
    .map((line) => normalizeSinglePenunjangLine(line))
    .join('\n')
    .trim()
}

/**
 * Mengembalikan nama baku modalitas penunjang yang ringkas dan seragam.
 */
export function resolvePenunjangModalityName(
  kategori: 'Radiologi' | 'Laboratorium' | 'Lainnya',
  text: string
): string {
  if (kategori === 'Radiologi') {
    if (/ct[\s-]?scan|msct/i.test(text)) return 'CT Scan Kepala'
    if (/thorax|thoraks|toraks|xray|x-ray|rontgen|ro\b|cxr/i.test(text)) return 'Xray Thorax'
    return 'Radiologi'
  }
  if (kategori === 'Laboratorium') return 'Lab'
  if (/ekg|ecg/i.test(text)) return 'EKG'
  return 'Penunjang'
}
