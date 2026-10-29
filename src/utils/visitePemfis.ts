export const THORAX_ZONES = [
  'Apex Kanan',
  'Apex Kiri',
  'Medial Kanan',
  'Medial Kiri',
  'Basal Kanan',
  'Basal Kiri',
] as const

export const ABDOMEN_QUADRANTS = [
  'Hipokondrium Kanan',
  'Epigastrium',
  'Hipokondrium Kiri',
  'Lumbal Kanan',
  'Umbilikal',
  'Lumbal Kiri',
  'Inguinal Kanan (McBurney)',
  'Suprapubik',
  'Inguinal Kiri',
] as const

export const EKSTREMITAS_AREAS = [
  'Superior Kanan',
  'Superior Kiri',
  'Inferior Kanan',
  'Inferior Kiri',
] as const

export interface VisitePemfisState {
  ku: string
  gcs_e: string
  gcs_v: string
  gcs_m: string
  td_sistol: string
  td_diastol: string
  hr: string
  rr: string
  suhu: string
  spo2: string
  motorik: string

  // Status Interna
  kl: string // Kep/Leher formatted string: e.g. "Anemis (-/-) / Ikterik (-/-) / Cyanosis (-/-)"
  kl_anemis?: [boolean, boolean] // [kanan, kiri]
  kl_ikterik?: [boolean, boolean]
  kl_cyanosis?: [boolean, boolean]
  kl_custom?: string // keterangan tambahan misal pembesaran KGB (-)
  cor: string
  thorax_vesikuler: [boolean, boolean, boolean, boolean, boolean, boolean]
  thorax_rhonki: [boolean, boolean, boolean, boolean, boolean, boolean]
  thorax_wheezing: [boolean, boolean, boolean, boolean, boolean, boolean]
  thorax_custom: string

  // Abdomen 9 Kuadran
  abdomen_supel: boolean
  abdomen_bu: string
  abdomen_nt: [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean]
  abdomen_custom: string

  // Ekstremitas 4 Ekstremitas
  ekstremitas_akral: string
  ekstremitas_edema: [boolean, boolean, boolean, boolean]
  ekstremitas_custom: string

  // Status Neurologis Standar 9 Poin
  ms: string // Meningeal Sign (Kaku kuduk, Brudzinski, Kernig)
  n_cranialis: string // N. I - XII (Pupil, N.II-III, N.VII, N.XII, dsb.)
  rfisio: string // Refleks Fisiologis (BPR, TPR, KPR, APR)
  rpato: string // Refleks Patologis (Babinski, Chaddock, dsb.)
  tonus: string // Tonus Otot
  mmt: string // Manual Muscle Testing (Kekuatan Otot)
  sensorik: string // Sensibilitas
  autonom: string // Fungsi Otonom (BAB/BAK)

  // Backward compatibility aliases
  pupil?: string
  meningeal?: string

  customRows: { id: string; label: string; value: string }[]
  activeKeys: string[]
}

export type PemfisCategory = 'ttv' | 'interna' | 'neurologis' | 'lokalis'

export interface PemfisParamDef {
  key: string
  label: string
  category: PemfisCategory
}

export const AVAILABLE_PEMFIS_PARAMS: PemfisParamDef[] = [
  // Tanda Vital & KU
  { key: 'ku', label: 'KU (Keadaan Umum)', category: 'ttv' },
  { key: 'td', label: 'Tekanan Darah (TD)', category: 'ttv' },
  { key: 'hr', label: 'Nadi (HR)', category: 'ttv' },
  { key: 'rr', label: 'Laju Nafas (RR)', category: 'ttv' },
  { key: 'suhu', label: 'Suhu Tubuh', category: 'ttv' },
  { key: 'spo2', label: 'SpO2 (Saturasi Oksigen)', category: 'ttv' },

  // Status Interna
  { key: 'kl', label: 'Kep/Leher', category: 'interna' },
  { key: 'cor', label: 'Cor (Jantung)', category: 'interna' },
  { key: 'thorax', label: 'Thorax (Pulmo)', category: 'interna' },
  { key: 'abdomen', label: 'Abdomen', category: 'interna' },
  { key: 'ekstremitas', label: 'Ekstremitas', category: 'interna' },

  // Status Neurologis (9 Poin Standar)
  { key: 'gcs', label: 'GCS (Kesadaran)', category: 'neurologis' },
  { key: 'ms', label: 'MS (Meningeal Sign)', category: 'neurologis' },
  { key: 'n_cranialis', label: 'N Cranialis (N. I - XII)', category: 'neurologis' },
  { key: 'rfisio', label: 'R. Fisio (Refleks Fisiologis)', category: 'neurologis' },
  { key: 'rpato', label: 'R. Pato (Refleks Patologis)', category: 'neurologis' },
  { key: 'tonus', label: 'Tonus (Tonus Otot)', category: 'neurologis' },
  { key: 'mmt', label: 'MMT (Kekuatan Motorik)', category: 'neurologis' },
  { key: 'sensorik', label: 'Sensorik (Sensibilitas)', category: 'neurologis' },
  { key: 'autonom', label: 'Autonom (Fungsi Otonom)', category: 'neurologis' },
]

export function formatKlString(
  anemis: [boolean, boolean] = [false, false],
  ikterik: [boolean, boolean] = [false, false],
  cyanosis: [boolean, boolean] = [false, false],
  custom = ''
): string {
  const aStr = `Anemis (${anemis[0] ? '+' : '-'}/${anemis[1] ? '+' : '-'})`
  const iStr = `Ikterik (${ikterik[0] ? '+' : '-'}/${ikterik[1] ? '+' : '-'})`
  const cStr = `Cyanosis (${cyanosis[0] ? '+' : '-'}/${cyanosis[1] ? '+' : '-'})`
  const base = `${aStr} / ${iStr} / ${cStr}`
  if (custom && custom.trim()) {
    return `${base}, ${custom.trim()}`
  }
  return base
}

export function parsePemfisFromString(raw: string): VisitePemfisState {
  const state: VisitePemfisState = {
    ku: 'cukup',
    gcs_e: '4',
    gcs_v: '5',
    gcs_m: '6',
    td_sistol: '',
    td_diastol: '',
    hr: '',
    rr: '',
    suhu: '',
    spo2: '',
    motorik: '',
    kl: formatKlString([false, false], [false, false], [false, false]),
    kl_anemis: [false, false],
    kl_ikterik: [false, false],
    kl_cyanosis: [false, false],
    kl_custom: '',
    cor: '',
    thorax_vesikuler: [true, true, true, true, true, true],
    thorax_rhonki: [false, false, false, false, false, false],
    thorax_wheezing: [false, false, false, false, false, false],
    thorax_custom: '',
    abdomen_supel: true,
    abdomen_bu: '(+) normal',
    abdomen_nt: [false, false, false, false, false, false, false, false, false],
    abdomen_custom: '',
    ekstremitas_akral: 'hangat',
    ekstremitas_edema: [false, false, false, false],
    ekstremitas_custom: '',
    ms: '',
    n_cranialis: '',
    rfisio: '',
    rpato: '',
    tonus: '',
    mmt: '',
    sensorik: '',
    autonom: '',
    pupil: '',
    meningeal: '',
    customRows: [],
    activeKeys: ['ku', 'td', 'hr', 'rr', 'suhu', 'gcs'],
  }

  if (!raw || !raw.trim()) {
    state.ku = 'cukup'
    return state
  }

  // 1. KU (Keadaan Umum)
  // Keadaan Umum memiliki derajat klinis standar: cukup, lemah, buruk (atau sedang / berat).
  // Catatan: Singkatan "KU:" pada konsulan WhatsApp sering kali berarti "Keluhan Utama" (misal: "KU: Penurunan Kesadaran").
  // Jangan masukkan keluhan / diagnosis panjang ke dalam Keadaan Umum!
  const kuMatch = raw.match(/\b(?:KU|Keadaan\s*Umum)\s*[:-]?\s*([a-zA-Z\s]+?)(?:[,;\n]|$)/i)
  if (kuMatch) {
    const val = kuMatch[1].trim().toLowerCase()
    if (val.includes('lemah') || val.includes('sedang')) {
      state.ku = 'lemah'
      if (!state.activeKeys.includes('ku')) state.activeKeys.push('ku')
    } else if (val.includes('buruk') || val.includes('jelek') || val.includes('berat')) {
      state.ku = 'buruk'
      if (!state.activeKeys.includes('ku')) state.activeKeys.push('ku')
    } else if (val.includes('cukup') || val.includes('baik') || val.includes('stabil')) {
      state.ku = 'cukup'
      if (!state.activeKeys.includes('ku')) state.activeKeys.push('ku')
    } else {
      // Jika teksnya bukan derajat klinis melainkan keluhan (misal "penurunan kesadaran"), KU tetap default 'cukup'
      state.ku = 'cukup'
    }
  }

  // 2. GCS
  const evmMatch = raw.match(/\b(?:GCS\s*[:-]?\s*)?E([1-4])\s*V([1-5X]|ett|afasia)?\s*M([1-6])\b/i)
  if (evmMatch) {
    state.gcs_e = evmMatch[1]
    state.gcs_v = evmMatch[2] || '5'
    state.gcs_m = evmMatch[3]
    if (!state.activeKeys.includes('gcs')) state.activeKeys.push('gcs')
  } else {
    const digitMatch = raw.match(/\bGCS\s*[:-]?\s*([1-4])\s*[-/]?\s*([1-5])\s*[-/]?\s*([1-6])\b/i)
    if (digitMatch) {
      state.gcs_e = digitMatch[1]
      state.gcs_v = digitMatch[2]
      state.gcs_m = digitMatch[3]
      if (!state.activeKeys.includes('gcs')) state.activeKeys.push('gcs')
    } else {
      const gcsTotalMatch = raw.match(/\bGCS\s*[:-]?\s*(1[0-5]|[3-9])\b/i)
      if (gcsTotalMatch) {
        const tot = parseInt(gcsTotalMatch[1], 10)
        if (tot === 15) {
          state.gcs_e = '4'
          state.gcs_v = '5'
          state.gcs_m = '6'
        }
        if (!state.activeKeys.includes('gcs')) state.activeKeys.push('gcs')
      }
    }
  }

  // 3. TD (Tekanan Darah)
  const tdMatch =
    raw.match(/\b(?:TD|BP|Tens[ie])\s*[:-]?\s*(\d{2,3})\s*[/x]\s*(\d{2,3})\b/i) ||
    raw.match(/\b(\d{2,3})\s*[/x]\s*(\d{2,3})\s*mmHg\b/i)
  if (tdMatch) {
    state.td_sistol = tdMatch[1]
    state.td_diastol = tdMatch[2]
    if (!state.activeKeys.includes('td')) state.activeKeys.push('td')
  }

  // 4. HR / Nadi
  const hrMatch = raw.match(/\b(?:HR|Nadi|Pulse|N)\s*[:-]?\s*(\d{2,3})\b/i)
  if (hrMatch) {
    state.hr = hrMatch[1]
    if (!state.activeKeys.includes('hr')) state.activeKeys.push('hr')
  }

  // 5. RR
  const rrMatch = raw.match(/\b(?:RR|Resp)\s*[:-]?\s*(\d{1,2})\b/i)
  if (rrMatch) {
    state.rr = rrMatch[1]
    if (!state.activeKeys.includes('rr')) state.activeKeys.push('rr')
  }

  // 6. Suhu
  const suhuMatch = raw.match(/\b(?:Suhu|Temp|T|S)\s*[:-]?\s*(\d{2}(?:[.,]\d+)?)\b/i)
  if (suhuMatch) {
    state.suhu = suhuMatch[1].replace(',', '.')
    if (!state.activeKeys.includes('suhu')) state.activeKeys.push('suhu')
  }

  // 7. SpO2
  const spo2Match = raw.match(/\b(?:SpO2|Sat(?:urasi)?)\s*[:-]?\s*(\d{2,3})\b/i)
  if (spo2Match) {
    state.spo2 = spo2Match[1]
    if (!state.activeKeys.includes('spo2')) state.activeKeys.push('spo2')
  }

  // 8. Kep/Leher (Anemis, Ikterik, Cyanosis)
  const hasKlHeader = /\b(?:Kep\/Leher|K\/L|Kepala(?:\s*\/\s*Leher)?)\b/i.test(raw)
  const hasAnemis = /anem(?:is|ia)/i.test(raw)
  const hasIkterik = /ikter(?:ik|us)|icter(?:ic|us)/i.test(raw)
  const hasCyanosis = /cyan(?:osis)?|sian(?:osis)?/i.test(raw)

  if (hasKlHeader || hasAnemis || hasIkterik || hasCyanosis || /a\/i\/c/i.test(raw)) {
    if (!state.activeKeys.includes('kl')) state.activeKeys.push('kl')

    let anemisPos: [boolean, boolean] = [false, false]
    let ikterikPos: [boolean, boolean] = [false, false]
    let cyanosisPos: [boolean, boolean] = [false, false]

    if (/anem(?:is|ia)\s*[:(]?\s*(?:\(\s*\+\s*[/|\\]?\s*\+\s*\)|\+\s*[/|\\]?\s*\+|\(\s*\+\s*\)|\bpositif\b)/i.test(raw)) {
      anemisPos = [true, true]
    } else if (/anem(?:is|ia)\s*[:(]?\s*(?:\(\s*\+\s*[/|\\]\s*-\s*\)|\+\s*[/|\\]\s*-)/i.test(raw)) {
      anemisPos = [true, false]
    }

    if (/(?:ikter(?:ik|us)|icter(?:ic|us))\s*[:(]?\s*(?:\(\s*\+\s*[/|\\]?\s*\+\s*\)|\+\s*[/|\\]?\s*\+|\(\s*\+\s*\)|\bpositif\b)/i.test(raw)) {
      ikterikPos = [true, true]
    } else if (/(?:ikter(?:ik|us)|icter(?:ic|us))\s*[:(]?\s*(?:\(\s*\+\s*[/|\\]\s*-\s*\)|\+\s*[/|\\]\s*-)/i.test(raw)) {
      ikterikPos = [true, false]
    }

    if (/(?:cyan(?:osis)?|sian(?:osis)?)\s*[:(]?\s*(?:\(\s*\+\s*[/|\\]?\s*\+\s*\)|\+\s*[/|\\]?\s*\+|\(\s*\+\s*\)|\bpositif\b)/i.test(raw)) {
      cyanosisPos = [true, true]
    }

    state.kl_anemis = anemisPos
    state.kl_ikterik = ikterikPos
    state.kl_cyanosis = cyanosisPos

    const extraMatch = raw.match(/(?:KGB|JVP|pembesaran(?:\s*kelenjar)?)[^\n;]*/i)
    if (extraMatch) {
      state.kl_custom = extraMatch[0].trim()
    }

    state.kl = formatKlString(state.kl_anemis, state.kl_ikterik, state.kl_cyanosis, state.kl_custom)
  }

  // 9. Cor
  const corMatch = raw.match(/\b(?:Cor|Jantung|Kardio)\s*[:-]?\s*([^\n;]+)/i)
  if (corMatch) {
    state.cor = corMatch[1].trim()
    if (!state.activeKeys.includes('cor')) state.activeKeys.push('cor')
  } else if (/S1\s*S2/i.test(raw)) {
    state.cor = 'S1 S2 tunggal reguler, murmur (-), gallop (-)'
    if (!state.activeKeys.includes('cor')) state.activeKeys.push('cor')
  }

  // 10. Thorax / Pulmo
  const thoraxMatch = raw.match(/\b(?:Thorax|Tho|Pulmo|Paru)\s*[:-]?\s*([^\n]+)/i)
  const hasVesPattern = /ves\s*[\/|]/i.test(raw) || /vesikuler/i.test(raw)
  const hasRhPattern = /rh\s*[\/|]/i.test(raw) || /rhonk?i/i.test(raw)
  const hasWhPattern = /wh\s*[\/|]/i.test(raw) || /wheezing/i.test(raw)
  if (thoraxMatch || hasVesPattern || hasRhPattern || hasWhPattern) {
    if (!state.activeKeys.includes('thorax')) state.activeKeys.push('thorax')
    if (thoraxMatch) {
      state.thorax_custom = thoraxMatch[1].trim()
    } else {
      state.thorax_custom = 'Pulmo: vesikuler (+/+), Rh (-/-), Wh (-/-)'
    }
  }

  // 11. Abdomen
  const abdMatch = raw.match(/\b(?:Abdomen|Abd|Perut)\s*[:-]?\s*([^\n]+)/i)
  const hasAbdPattern = /soep?el/i.test(raw) || /bising\s*usus|BU\s*\(/i.test(raw) || /nyeri\s*tekan|NT\s*[\(\-]/i.test(raw)
  if (abdMatch || hasAbdPattern) {
    if (!state.activeKeys.includes('abdomen')) state.activeKeys.push('abdomen')
    if (abdMatch) {
      state.abdomen_custom = abdMatch[1].trim()
    } else {
      state.abdomen_custom = 'Supel, BU (+) normal, NT (-)'
    }
  }

  // 12. Ekstremitas
  const extMatch = raw.match(/\b(?:Ekstremitas|Ext|Ekstr)\s*[:-]?\s*([^\n]+)/i)
  const hasExtPattern = /edema/i.test(raw) || /akral/i.test(raw) || /crt/i.test(raw)
  if (extMatch || hasExtPattern) {
    if (!state.activeKeys.includes('ekstremitas')) state.activeKeys.push('ekstremitas')
    if (extMatch) {
      state.ekstremitas_custom = extMatch[1].trim()
    } else {
      state.ekstremitas_custom = 'Akral hangat, CRT < 2s, Edema (-/-)'
    }
  }

  // 13. MS (Meningeal Sign / TRM)
  const msMatch = raw.match(/\b(?:MS|TRM|Meningeal(?:\s*Sign)?|Kaku\s*kuduk|Kaku\s*leher|Kernig|Brudzinski)\s*[:-]?\s*([^\n;]+)/i)
  if (msMatch) {
    state.ms = msMatch[1].trim()
    state.meningeal = state.ms
    if (!state.activeKeys.includes('ms')) state.activeKeys.push('ms')
  }

  // 14. N Cranialis (N. I - XII / Pupil / PBI / Paresis)
  const ncLines: string[] = []
  const ncRegex = /(?:^|\n)\s*(?:N(?:ervus)?\.?\s*(?:[IVX]+(?:\s*-\s*[IVX]+)?|[0-9]+(?:\s*-\s*[0-9]+)?|Cranialis)|Pupil(?:s)?|PBI)\s*[:-]?\s*([^\n]+)/gi
  let ncMatch: RegExpExecArray | null
  while ((ncMatch = ncRegex.exec(raw)) !== null) {
    const fullMatched = ncMatch[0].trim()
    ncLines.push(fullMatched)
  }
  if (ncLines.length === 0) {
    const pbiMatch = raw.match(/(?:^|\n)\s*(?:PBI|Pupil|Reflek\s*cahaya)\b[^\n]*/i)
    if (pbiMatch) {
      ncLines.push(pbiMatch[0].trim())
    }
  }
  if (ncLines.length > 0) {
    state.n_cranialis = ncLines.join('; ')
    state.pupil = state.n_cranialis
    if (!state.activeKeys.includes('n_cranialis')) state.activeKeys.push('n_cranialis')
  }

  // 15. Refleks Fisiologis (R. Fisio)
  const rfisioMatch =
    raw.match(/\b(?:R\.?\s*Fisio(?:logis)?|Refleks\s*Fisiologis|RF)\s*[:-]?\s*([^\n;]+)/i) ||
    raw.match(/\b(?:BPR|TPR|KPR|APR)\s*[:-]?\s*([^\n;]+)/i)
  if (rfisioMatch) {
    state.rfisio = rfisioMatch[1] ? (rfisioMatch[0].includes(':') ? rfisioMatch[0] : rfisioMatch[1]).trim() : rfisioMatch[0].trim()
    if (!state.activeKeys.includes('rfisio')) state.activeKeys.push('rfisio')
  }

  // 16. Refleks Patologis (R. Pato)
  const rpatoMatch =
    raw.match(/\b(?:R\.?\s*Pato(?:logis)?|Refleks\s*Patologis|RP|Babinski|Chaddock|Hoffman|Tromner)\s*[:-]?\s*([^\n;]+)/i)
  if (rpatoMatch) {
    state.rpato = rpatoMatch[1] ? (rpatoMatch[0].includes(':') ? rpatoMatch[0] : rpatoMatch[1]).trim() : rpatoMatch[0].trim()
    if (!state.activeKeys.includes('rpato')) state.activeKeys.push('rpato')
  }

  // 17. Tonus Otot
  const tonusMatch = raw.match(/\b(?:Tonus(?:\s*Otot)?)\s*[:-]?\s*([^\n;]+)/i)
  if (tonusMatch) {
    state.tonus = tonusMatch[1].trim()
    if (!state.activeKeys.includes('tonus')) state.activeKeys.push('tonus')
  }

  // 18. MMT / Motorik (Kekuatan Otot) & Lateralisasi
  const mmtMatch =
    raw.match(/\b(?:MMT|Motorik|Kekuatan(?:\s*Otot)?)\s*[:-]?\s*([^\n,;]+)/i) ||
    raw.match(/\b(?:MMT|Motorik)\s*[:-]?\s*([0-5]\s*[/|]\s*[0-5])/i)
  const latMatch = raw.match(/\b(?:Lateralisasi|Hemipares(?:e|is))\s*[:-]?\s*([^\n;]+)/i)

  const mmtFractions: string[] = []
  const rawLines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i]
    if (/^[0-5]\s*[/|\\]\s*[0-5]$/.test(l) || /^[0-5]{4}\s*[/|\\]\s*[0-5]{4}$/.test(l)) {
      mmtFractions.push(l)
    }
  }

  let combinedMmt = ''
  if (mmtMatch && mmtMatch[1] && mmtMatch[1].trim() && !/^(?:Temuan|Hasil)/i.test(mmtMatch[1].trim())) {
    combinedMmt = mmtMatch[1].trim()
  } else if (mmtFractions.length > 0) {
    combinedMmt = mmtFractions.join(' / ')
  }

  if (latMatch) {
    const latStr = latMatch[0].trim()
    combinedMmt = combinedMmt ? `${combinedMmt}, ${latStr}` : latStr
  }

  if (combinedMmt) {
    state.mmt = combinedMmt
    state.motorik = state.mmt
    if (!state.activeKeys.includes('mmt')) state.activeKeys.push('mmt')
  }

  // 19. Sensorik
  const sensorikMatch = raw.match(/\b(?:Sensorik|Sensibilitas|Hemihipestesi|Hemihipalgesia)\s*[:-]?\s*([^\n;]+)/i)
  if (sensorikMatch) {
    state.sensorik = sensorikMatch[1] ? (sensorikMatch[0].includes(':') ? sensorikMatch[0] : sensorikMatch[1]).trim() : sensorikMatch[0].trim()
    if (!state.activeKeys.includes('sensorik')) state.activeKeys.push('sensorik')
  }

  // 20. Autonom
  const autonomMatch = raw.match(/\b(?:Autonom|Otonom|Vegetatif)\s*[:-]?\s*([^\n;]+)/i)
  if (autonomMatch) {
    state.autonom = autonomMatch[1].trim()
    if (!state.activeKeys.includes('autonom')) state.activeKeys.push('autonom')
  }

  // Check baris tambahan (custom / temuan spesifik yang benar-benar independen untuk Status Lokalis)
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    // Filter header seksi pembatas
    if (
      /^(?:Status\s*Interna|Status\s*Neurologis|Status\s*Lokalis|Tanda\s*Vital|TTV|Pemeriksaan\s*Fisik)\s*[:-]?$/i.test(line)
    ) {
      continue
    }

    // Filter K/L, Kepala, Leher
    if (
      /^(?:K\/L|Kepala|Leher)\b/i.test(line) ||
      /(?:a\/i\/c\/d|anem(?:is|ia)|ikter(?:ik|us)|sianosis)/i.test(line)
    ) {
      continue
    }

    // Filter TTV, KU, Cor, Thorax/Tho, Pulmo, Abdomen, Ekstremitas
    if (
      /^(?:KU|GCS|TD|BP|Tens|N|HR|Nadi|RR|Resp|Suhu|Temp|T|S|SpO2)\b/i.test(line) ||
      /^(?:Cor|Jantung|Thorax|Tho|Pulmo|Paru|Abd|Abdomen|Ext|Ekstremitas)\b/i.test(line) ||
      /^(?:soepel|supel|edema|akral|s1\s*s2|bising\s*usus|nyeri\s*tekan|distend|\bNT\b)/i.test(line) ||
      /\b(?:nyeri\s*tekan|bising\s*usus)\b/i.test(line)
    ) {
      continue
    }

    // Filter Status Neurologis
    if (
      /^(?:MS|TRM|Meningeal|Kaku\s*kuduk|Kaku\s*leher|Kernig|Brudzinski)\b/i.test(line) ||
      /\b(?:kaku\s*kuduk|kaku\s*leher)\b/i.test(line) ||
      /^(?:N(?:ervus)?\.?\s*(?:[IVX]+(?:\s*-\s*[IVX]+)?|[0-9]+(?:\s*-\s*[0-9]+)?|Cranialis)|Pupil|PBI|RC)\b/i.test(line) ||
      /\b(?:reflek(?:s)?\s*cahaya|bulat\s*isokor)\b/i.test(line) ||
      /^(?:R\.?\s*Fisio|Refleks\s*Fisiologis|RF|BPR|TPR|KPR|APR)\b/i.test(line) ||
      /^(?:R\.?\s*Pato|Refleks\s*Patologis|RP|Babinski|Chaddock|Hoffman|Tromner)\b/i.test(line) ||
      /^(?:Tonus|MMT|Motorik|Kekuatan|Lateralisasi|Hemipares(?:e|is))\b/i.test(line) ||
      /^(?:Sensorik|Sensibilitas|Autonom|Otonom)\b/i.test(line) ||
      /^(?:ves|rh|wh|\+|-)\s*[/x]/i.test(line) ||
      /^[+\-\/|\s\d]+$/.test(line) ||
      /^[0-5]\s*[/|\\]\s*[0-5]$/.test(line)
    ) {
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx > 0 && colonIdx < 25) {
      const label = line.slice(0, colonIdx).trim()
      const val = line.slice(colonIdx + 1).trim()
      if (
        /^(?:K\/L|Tho|Thorax|Pulmo|Abd|Abdomen|Ext|Ekstremitas|MMT|MS|TRM|PBI|RC|N\.|Pupil)/i.test(label)
      ) {
        continue
      }
      state.customRows.push({
        id: Math.random().toString(36).substring(7),
        label,
        value: val,
      })
    } else if (line.length > 2 && !/^(?:ves|rh|wh|\+|-)/i.test(line)) {
      state.customRows.push({
        id: Math.random().toString(36).substring(7),
        label: 'Temuan',
        value: line,
      })
    }
  }

  return state
}

export function formatPemfisToString(state: VisitePemfisState): string {
  const sections: string[] = []

  // 1. Tanda Vital & KU
  const ttvLines: string[] = []
  if (state.activeKeys.includes('ku') && state.ku.trim()) {
    ttvLines.push(`KU: ${state.ku.trim()}`)
  }

  const ttvList: string[] = []
  if (state.activeKeys.includes('td')) {
    if (state.td_sistol && state.td_diastol) {
      ttvList.push(`TD: ${state.td_sistol}/${state.td_diastol} mmHg`)
    } else if (state.td_sistol) {
      ttvList.push(`TD: ${state.td_sistol}/- mmHg`)
    }
  }
  if (state.activeKeys.includes('hr') && state.hr) {
    ttvList.push(`N: ${state.hr} x/m`)
  }
  if (state.activeKeys.includes('rr') && state.rr) {
    ttvList.push(`RR: ${state.rr} x/m`)
  }
  if (state.activeKeys.includes('suhu') && state.suhu) {
    ttvList.push(`Suhu: ${state.suhu}°C`)
  }
  if (state.activeKeys.includes('spo2') && state.spo2) {
    ttvList.push(`SpO2: ${state.spo2}%`)
  }
  if (ttvList.length > 0) {
    ttvLines.push(ttvList.join(', '))
  }

  if (ttvLines.length > 0) {
    sections.push(ttvLines.join('\n'))
  }

  // 2. Status Interna
  const internaLines: string[] = []
  if (state.activeKeys.includes('kl') && state.kl.trim()) {
    internaLines.push(`Kep/Leher: ${state.kl.trim()}`)
  }
  if (state.activeKeys.includes('cor')) {
    internaLines.push(`Cor: ${state.cor.trim() || 'S1 S2 tunggal reguler, murmur (-), gallop (-)'}`)
  }
  if (state.activeKeys.includes('thorax')) {
    const val = state.thorax_custom.trim() || 'Pulmo: vesikuler (+/+), Rh (-/-), Wh (-/-)'
    internaLines.push(val.toLowerCase().startsWith('thorax:') ? val : `Thorax: ${val}`)
  }
  if (state.activeKeys.includes('abdomen')) {
    const val = state.abdomen_custom.trim() || 'Supel, BU (+) normal, NT (-)'
    internaLines.push(val.toLowerCase().startsWith('abdomen:') ? val : `Abdomen: ${val}`)
  }
  if (state.activeKeys.includes('ekstremitas')) {
    const val = state.ekstremitas_custom.trim() || 'Akral hangat, CRT < 2s, Edema (-/-)'
    internaLines.push(val.toLowerCase().startsWith('ekstremitas:') ? val : `Ekstremitas: ${val}`)
  }

  if (internaLines.length > 0) {
    sections.push(`Status Interna:\n${internaLines.join('\n')}`)
  }

  // 3. Status Neurologis (9 Poin Standar)
  const neuroLines: string[] = []
  if (state.activeKeys.includes('gcs') && state.gcs_e && state.gcs_v && state.gcs_m) {
    const e = parseInt(state.gcs_e, 10) || 4
    const v = parseInt(state.gcs_v, 10) || 5
    const m = parseInt(state.gcs_m, 10) || 6
    neuroLines.push(`GCS: E${e}V${v}M${m} (${e + v + m})`)
  }
  const msVal = state.ms || state.meningeal || ''
  if ((state.activeKeys.includes('ms') || state.activeKeys.includes('meningeal')) && msVal.trim()) {
    neuroLines.push(`MS: ${msVal.trim()}`)
  }
  const ncVal = state.n_cranialis || state.pupil || ''
  if ((state.activeKeys.includes('n_cranialis') || state.activeKeys.includes('pupil')) && ncVal.trim()) {
    neuroLines.push(`N Cranialis: ${ncVal.trim()}`)
  }
  if (state.activeKeys.includes('rfisio') && state.rfisio.trim()) {
    neuroLines.push(`R. Fisio: ${state.rfisio.trim()}`)
  }
  if (state.activeKeys.includes('rpato') && state.rpato.trim()) {
    neuroLines.push(`R. Pato: ${state.rpato.trim()}`)
  }
  if (state.activeKeys.includes('tonus') && state.tonus.trim()) {
    neuroLines.push(`Tonus: ${state.tonus.trim()}`)
  }
  const mmtVal = state.mmt || state.motorik || ''
  if ((state.activeKeys.includes('mmt') || state.activeKeys.includes('motorik')) && mmtVal.trim()) {
    neuroLines.push(`MMT: ${mmtVal.trim()}`)
  }
  if (state.activeKeys.includes('sensorik') && state.sensorik.trim()) {
    neuroLines.push(`Sensorik: ${state.sensorik.trim()}`)
  }
  if (state.activeKeys.includes('autonom') && state.autonom.trim()) {
    neuroLines.push(`Autonom: ${state.autonom.trim()}`)
  }

  if (neuroLines.length > 0) {
    sections.push(`Status Neurologis:\n${neuroLines.join('\n')}`)
  }

  // 4. Status Lokalis / Temuan Khusus
  const customLines = state.customRows.filter((c) => c.value.trim()).map((c) => `${c.label || 'Temuan'}: ${c.value.trim()}`)
  if (customLines.length > 0) {
    sections.push(`Status Lokalis:\n${customLines.join('\n')}`)
  }

  return sections.join('\n\n')
}

export interface VisitePenunjangItem {
  id: string
  name: string
  value: string
  isCustom?: boolean
}

export const COMMON_PENUNJANG_PRESETS = [
  'GDA',
  'Hb',
  'Leukosit',
  'Trombosit',
  'Ureum / Cr',
  'Elektrolit',
  'CT Scan',
  'Ro Thorax',
  'EKG',
  'Profil Lipid',
  'Asam Urat',
  'HbA1c',
  'SGOT / SGPT',
  'Albumin',
  'Urinalisis',
] as const

export function isPresetPenunjang(name: string): boolean {
  if (!name || !name.trim()) return false
  const trimmed = name.trim().toLowerCase()
  return (
    COMMON_PENUNJANG_PRESETS.some((p) => p.toLowerCase() === trimmed) ||
    /^(?:gda|gds|hb|leukosit|leu|trombosit|plt|ureum|kreatinin|cr|elektrolit|ct\s*scan|ro\s*thorax|foto\s*thorax|ekg|ecg|profil\s*lipid|asam\s*urat|hba1c|sgot|sgpt|albumin|bga|agd|urinalisis|dl|darah\s*lengkap)$/i.test(
      trimmed
    )
  )
}

export function parsePenunjangFromString(raw: string): VisitePenunjangItem[] {
  if (!raw || !raw.trim()) return []
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const items: VisitePenunjangItem[] = []

  for (const line of lines) {
    // Abaikan header kategori pembatas murni seperti [Laboratorium] atau [Radiologi] jika berdiri sendiri
    if (/^\[[^\]]+\]$/.test(line)) {
      continue
    }

    // Jika baris berisi beberapa hasil dipisah pipe `|`, misal: "Hb: 12.5 | Leu: 9800 | Plt: 250000"
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim()).filter(Boolean)
      for (const part of parts) {
        const colonIdx = part.indexOf(':')
        if (colonIdx > 0 && colonIdx < 30) {
          const name = part.slice(0, colonIdx).trim()
          items.push({
            id: Math.random().toString(36).substring(7),
            name,
            value: part.slice(colonIdx + 1).trim(),
            isCustom: !isPresetPenunjang(name),
          })
        } else {
          items.push({
            id: Math.random().toString(36).substring(7),
            name: '',
            value: part,
            isCustom: true,
          })
        }
      }
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx > 0 && colonIdx < 35) {
      const name = line.slice(0, colonIdx).trim()
      items.push({
        id: Math.random().toString(36).substring(7),
        name,
        value: line.slice(colonIdx + 1).trim(),
        isCustom: !isPresetPenunjang(name),
      })
    } else {
      items.push({
        id: Math.random().toString(36).substring(7),
        name: '',
        value: line,
        isCustom: true,
      })
    }
  }

  return items
}

export function formatPenunjangToString(items: VisitePenunjangItem[]): string {
  return items
    .filter((it) => it.name.trim() || it.value.trim())
    .map((it) => {
      const name = it.name.trim()
      const val = it.value.trim()
      if (!name || name.toLowerCase() === 'temuan') return val
      return `${name}: ${val}`
    })
    .join('\n')
}
