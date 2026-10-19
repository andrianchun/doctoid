export interface LokalisMarker {
  id: string
  view: 'anterior' | 'posterior'
  x: number // percentage 0-100
  y: number // percentage 0-100
  region: string
  jenis: 'luka' | 'nyeri' | 'fraktur' | 'benjolan' | 'ruam' | 'edema' | 'lainnya'
  catatan: string
}

export interface PemfisState {
  // 1. TTV & GCS
  gcs_e: number
  gcs_v: number | string
  gcs_m: number
  td_systolic: string
  td_diastolic: string
  hr: string
  rr: string
  suhu: string
  spo2: string

  // 2. Status Interna
  ca: boolean // Conjungtiva Anemis
  si: boolean // Sklera Ikterik
  sianosis: boolean
  kgb: boolean // Pembesaran KGB
  jvp: string // mis. "5+2"

  cor_reguler: boolean
  cor_murmur: boolean
  cor_gallop: boolean

  pulmo_vesikuler: boolean
  pulmo_rhonki: boolean
  pulmo_wheezing: boolean
  pulmo_lokasi?: string

  abd_supel: boolean
  abd_bu: 'normal' | 'meningkat' | 'menurun' | 'hilang'
  abd_nt: boolean
  abd_nt_lokasi?: string
  abd_hepar_teraba: boolean
  abd_lien_teraba: boolean

  akral_hangat: boolean
  crt_cepat: boolean // < 2 detik
  edema_ekstremitas: boolean
  edema_lokasi?: string

  // 3. Status Lokalis
  markers: LokalisMarker[]

  // 4. Status Neurologis
  kaku_kuduk: boolean
  kernig: boolean
  brudzinski1: boolean
  brudzinski2: boolean

  n7_wajah: 'normal' | 'parese_dextra_sentral' | 'parese_dextra_perifer' | 'parese_sinistra_sentral' | 'parese_sinistra_perifer'
  pupil_kanan_mm: number
  pupil_kiri_mm: number
  isokor: boolean
  rcl_kanan: boolean
  rcl_kiri: boolean
  rctl_kanan: boolean
  rctl_kiri: boolean
  ptosis_kanan: boolean
  ptosis_kiri: boolean
  n12_lidah: 'normal' | 'deviasi_kanan' | 'deviasi_kiri'

  motorik_sk: number // Superior Kanan 0-5
  motorik_ski: number // Superior Kiri 0-5
  motorik_ik: number // Inferior Kanan 0-5
  motorik_iki: number // Inferior Kiri 0-5
  tonus: 'normotonus' | 'spastik' | 'hipotonus' | 'rigid'

  bpr_kanan: string
  bpr_kiri: string
  tpr_kanan: string
  tpr_kiri: string
  kpr_kanan: string
  kpr_kiri: string
  apr_kanan: string
  apr_kiri: string

  babinski_kanan: boolean
  babinski_kiri: boolean
  chaddock_kanan: boolean
  chaddock_kiri: boolean
  hoffman_kanan: boolean
  hoffman_kiri: boolean

  sensorik_tipe: 'normal' | 'hemi_kanan' | 'hemi_kiri' | 'parahipestesi' | 'glove_stocking'
  sensorik_level?: string

  // Catatan manual tambahan
  catatan_tambahan?: string
}

export const DEFAULT_PEMFIS_STATE: PemfisState = {
  // 1. TTV
  gcs_e: 4,
  gcs_v: 5,
  gcs_m: 6,
  td_systolic: '120',
  td_diastolic: '80',
  hr: '80',
  rr: '18',
  suhu: '36.5',
  spo2: '98',

  // 2. Interna
  ca: false,
  si: false,
  sianosis: false,
  kgb: false,
  jvp: '5+2',

  cor_reguler: true,
  cor_murmur: false,
  cor_gallop: false,

  pulmo_vesikuler: true,
  pulmo_rhonki: false,
  pulmo_wheezing: false,

  abd_supel: true,
  abd_bu: 'normal',
  abd_nt: false,
  abd_hepar_teraba: false,
  abd_lien_teraba: false,

  akral_hangat: true,
  crt_cepat: true,
  edema_ekstremitas: false,

  // 3. Lokalis
  markers: [],

  // 4. Neuro
  kaku_kuduk: false,
  kernig: false,
  brudzinski1: false,
  brudzinski2: false,

  n7_wajah: 'normal',
  pupil_kanan_mm: 3,
  pupil_kiri_mm: 3,
  isokor: true,
  rcl_kanan: true,
  rcl_kiri: true,
  rctl_kanan: true,
  rctl_kiri: true,
  ptosis_kanan: false,
  ptosis_kiri: false,
  n12_lidah: 'normal',

  motorik_sk: 5,
  motorik_ski: 5,
  motorik_ik: 5,
  motorik_iki: 5,
  tonus: 'normotonus',

  bpr_kanan: '+2',
  bpr_kiri: '+2',
  tpr_kanan: '+2',
  tpr_kiri: '+2',
  kpr_kanan: '+2',
  kpr_kiri: '+2',
  apr_kanan: '+2',
  apr_kiri: '+2',

  babinski_kanan: false,
  babinski_kiri: false,
  chaddock_kanan: false,
  chaddock_kiri: false,
  hoffman_kanan: false,
  hoffman_kiri: false,

  sensorik_tipe: 'normal',
}

/**
 * Format string klinis rapi dari objek PemfisState
 * Terstruktur berurutan: TTV -> Status Interna -> Status Lokalis -> Status Neurologis
 */
export function generatePemfisText(s: PemfisState): string {
  const lines: string[] = []

  // 1. TTV & GCS
  lines.push('[Tanda-Tanda Vital & GCS]')
  const totalGcs = (typeof s.gcs_v === 'number') ? s.gcs_e + s.gcs_v + s.gcs_m : s.gcs_e + 1 + s.gcs_m
  lines.push(`- GCS: E${s.gcs_e}V${s.gcs_v}M${s.gcs_m} (Total: ${totalGcs})`)
  
  const ttvParts: string[] = []
  if (s.td_systolic && s.td_diastolic) ttvParts.push(`TD: ${s.td_systolic}/${s.td_diastolic} mmHg`)
  if (s.hr) ttvParts.push(`HR: ${s.hr} x/m`)
  if (s.rr) ttvParts.push(`RR: ${s.rr} x/m`)
  if (s.suhu) ttvParts.push(`Suhu: ${s.suhu} °C`)
  if (s.spo2) ttvParts.push(`SpO2: ${s.spo2}%`)
  if (ttvParts.length > 0) {
    lines.push(`- ${ttvParts.join(' | ')}`)
  }

  // 2. Status Interna
  lines.push('\n[Status Interna]')
  lines.push(`- K/L: CA (${s.ca ? '+/+' : '-/-'}), SI (${s.si ? '+/+' : '-/-'}), Sianosis (${s.sianosis ? '+' : '-'}), Pembesaran KGB (${s.kgb ? '+' : '-'}), JVP ${s.jvp} cmH2O`)
  lines.push(`- Cor: S1 S2 tunggal ${s.cor_reguler ? 'reguler' : 'irreguler'}, Murmur (${s.cor_murmur ? '+' : '-'}), Gallop (${s.cor_gallop ? '+' : '-'})`)
  lines.push(`- Pulmo: Suara nafas vesikuler (${s.pulmo_vesikuler ? '+/+' : '-/-'}), Rhonki (${s.pulmo_rhonki ? '+/+' : '-/-'}${s.pulmo_lokasi ? ` di ${s.pulmo_lokasi}` : ''}), Wheezing (${s.pulmo_wheezing ? '+/+' : '-/-'})`)
  lines.push(`- Abdomen: ${s.abd_supel ? 'Supel' : 'Defans muskular/tegang'}, Bising usus (+) ${s.abd_bu}, Hepar/Lien (${s.abd_hepar_teraba || s.abd_lien_teraba ? 'teraba membesar' : 'ttb'}), Nyeri tekan (${s.abd_nt ? `+ di ${s.abd_nt_lokasi || 'epigastrium'}` : '-'})`)
  lines.push(`- Ekstremitas: Akral ${s.akral_hangat ? 'hangat, kering, merah' : 'dingin/basah'}, CRT ${s.crt_cepat ? '< 2 detik' : '> 2 detik'}, Edema (${s.edema_ekstremitas ? `+ di ${s.edema_lokasi || 'pretibial'}` : '-/-'})`)

  // 3. Status Lokalis
  if (s.markers && s.markers.length > 0) {
    lines.push('\n[Status Lokalis]')
    s.markers.forEach((m) => {
      const jns = m.jenis.charAt(0).toUpperCase() + m.jenis.slice(1)
      lines.push(`- Regio ${m.region} (${m.view}): ${jns} - ${m.catatan || 'Temuan positif'}`)
    })
  }

  // 4. Status Neurologis
  lines.push('\n[Status Neurologis]')
  // Meningeal
  lines.push(`- Rangsang Meningeal: Kaku kuduk (${s.kaku_kuduk ? '+' : '-'}), Kernig (${s.kernig ? '+/+' : '-/-'}), Brudzinski I (${s.brudzinski1 ? '+' : '-'}), Brudzinski II (${s.brudzinski2 ? '+/+' : '-/-'})`)

  // N. Cranialis
  const cranialisDesc: string[] = []
  if (s.n7_wajah === 'normal') {
    cranialisDesc.push('N.VII wajah simetris')
  } else if (s.n7_wajah === 'parese_dextra_sentral') {
    cranialisDesc.push('Parese N.VII Dextra (Sentral)')
  } else if (s.n7_wajah === 'parese_dextra_perifer') {
    cranialisDesc.push("Parese N.VII Dextra (Perifer / Bell's)")
  } else if (s.n7_wajah === 'parese_sinistra_sentral') {
    cranialisDesc.push('Parese N.VII Sinistra (Sentral)')
  } else if (s.n7_wajah === 'parese_sinistra_perifer') {
    cranialisDesc.push("Parese N.VII Sinistra (Perifer / Bell's)")
  }

  const pupilDesc = `Pupil ${s.isokor ? 'isokor' : 'anisokor'} (${s.pupil_kanan_mm}mm/${s.pupil_kiri_mm}mm), RCL (${s.rcl_kanan ? '+' : '-'}/${s.rcl_kiri ? '+' : '-'}), RCTL (${s.rctl_kanan ? '+' : '-'}/${s.rctl_kiri ? '+' : '-'})`
  cranialisDesc.push(pupilDesc)

  if (s.ptosis_kanan || s.ptosis_kiri) {
    cranialisDesc.push(`Ptosis (${s.ptosis_kanan ? '+' : '-'}/${s.ptosis_kiri ? '+' : '-'})`)
  }

  if (s.n12_lidah !== 'normal') {
    cranialisDesc.push(`N.XII deviasi ${s.n12_lidah === 'deviasi_kanan' ? 'ke kanan' : 'ke kiri'}`)
  } else {
    cranialisDesc.push('N.XII lidah di tengah')
  }
  lines.push(`- N. Cranialis: ${cranialisDesc.join(' | ')}`)

  // Motorik
  lines.push(`- Motorik: ${s.motorik_sk}${s.motorik_sk}${s.motorik_sk}${s.motorik_sk}/${s.motorik_ski}${s.motorik_ski}${s.motorik_ski}${s.motorik_ski} // ${s.motorik_ik}${s.motorik_ik}${s.motorik_ik}${s.motorik_ik}/${s.motorik_iki}${s.motorik_iki}${s.motorik_iki}${s.motorik_iki}, Tonus ${s.tonus}`)

  // Sensorik
  if (s.sensorik_tipe === 'normal') {
    lines.push('- Sensorik: Dalam batas normal')
  } else if (s.sensorik_tipe === 'hemi_kanan') {
    lines.push('- Sensorik: Hemihipestesi dextra')
  } else if (s.sensorik_tipe === 'hemi_kiri') {
    lines.push('- Sensorik: Hemihipestesi sinistra')
  } else if (s.sensorik_tipe === 'parahipestesi') {
    lines.push(`- Sensorik: Parahipestesi (sensoric level setinggi ${s.sensorik_level || 'Th10'})`)
  } else if (s.sensorik_tipe === 'glove_stocking') {
    lines.push('- Sensorik: Hipoestesi pola glove & stocking')
  }

  // Refleks
  lines.push(`- Refleks Fisiologis: BPR (${s.bpr_kanan}/${s.bpr_kiri}), TPR (${s.tpr_kanan}/${s.tpr_kiri}), KPR (${s.kpr_kanan}/${s.kpr_kiri}), APR (${s.apr_kanan}/${s.apr_kiri})`)
  lines.push(`- Refleks Patologis: Babinski (${s.babinski_kanan ? '+' : '-'}/${s.babinski_kiri ? '+' : '-'}), Chaddock (${s.chaddock_kanan ? '+' : '-'}/${s.chaddock_kiri ? '+' : '-'}), Hoffman (${s.hoffman_kanan ? '+' : '-'}/${s.hoffman_kiri ? '+' : '-'})`)

  if (s.catatan_tambahan?.trim()) {
    lines.push(`\n[Catatan Tambahan]\n${s.catatan_tambahan.trim()}`)
  }

  return lines.join('\n')
}

/**
 * Parsing teks narasi yang sudah ada kembali ke objek PemfisState
 */
export function parsePemfisFromText(rawText: string): PemfisState {
  const s: PemfisState = { ...DEFAULT_PEMFIS_STATE, markers: [] }
  if (!rawText || !rawText.trim()) return s

  const text = rawText

  // 1. Ekstraksi GCS
  const evmMatch = text.match(/\b(?:GCS\s*[:-]?\s*)?E([1-4])\s*V([1-5X]|ett|afasia)?\s*M([1-6])\b/i)
  if (evmMatch) {
    s.gcs_e = parseInt(evmMatch[1], 10)
    const vRaw = evmMatch[2] || '5'
    const vNum = parseInt(vRaw, 10)
    s.gcs_v = isNaN(vNum) ? vRaw.toLowerCase() : vNum
    s.gcs_m = parseInt(evmMatch[3], 10)
  }

  // TTV
  const tdMatch = text.match(/\b(?:TD|BP|Tens[ie])\s*[:-]?\s*(\d{2,3})\s*[/x]\s*(\d{2,3})\b/i) || text.match(/\b(\d{2,3})\s*[/x]\s*(\d{2,3})\s*mmHg\b/i)
  if (tdMatch) {
    s.td_systolic = tdMatch[1]
    s.td_diastolic = tdMatch[2]
  }

  const hrMatch = text.match(/\b(?:HR|Nadi|Pulse)\s*[:-]?\s*(\d{2,3})\b/i)
  if (hrMatch) s.hr = hrMatch[1]

  const rrMatch = text.match(/\b(?:RR|Resp)\s*[:-]?\s*(\d{1,2})\b/i)
  if (rrMatch) s.rr = rrMatch[1]

  const suhuMatch = text.match(/\b(?:Suhu|Temp|T|S)\s*[:-]?\s*(\d{2}(?:[.,]\d+)?)\b/i)
  if (suhuMatch) s.suhu = suhuMatch[1].replace(',', '.')

  const spo2Match = text.match(/\b(?:SpO2|Sat(?:urasi)?)\s*[:-]?\s*(\d{2,3})\s*%?\b/i)
  if (spo2Match) s.spo2 = spo2Match[1]

  // 2. Status Interna
  if (/anemis\s*\(\s*\+\s*\/\s*\+\s*\)|\banemis\s*\(\s*\+\s*\)/i.test(text)) s.ca = true
  if (/ikterik\s*\(\s*\+\s*\/\s*\+\s*\)|\bikterik\s*\(\s*\+\s*\)/i.test(text)) s.si = true
  if (/sianosis\s*\(\s*\+\s*\)/i.test(text)) s.sianosis = true
  if (/pembesaran\s*kgb\s*\(\s*\+\s*\)/i.test(text)) s.kgb = true

  if (/irreguler/i.test(text) && /cor|jantung/i.test(text)) s.cor_reguler = false
  if (/murmur\s*\(\s*\+\s*\)/i.test(text)) s.cor_murmur = true
  if (/gallop\s*\(\s*\+\s*\)/i.test(text)) s.cor_gallop = true

  if (/rhonki\s*\(\s*\+\s*\/\s*\+\s*\)|\brhonki\s*\(\s*\+\s*\)/i.test(text)) s.pulmo_rhonki = true
  if (/wheezing\s*\(\s*\+\s*\/\s*\+\s*\)|\bwheezing\s*\(\s*\+\s*\)/i.test(text)) s.pulmo_wheezing = true

  if (/nyeri\s*tekan\s*\(\s*\+\s*\)/i.test(text)) s.abd_nt = true
  if (/defans|tegang/i.test(text) && /abdomen/i.test(text)) s.abd_supel = false
  if (/hepar.*teraba/i.test(text)) s.abd_hepar_teraba = true

  if (/dingin|basah/i.test(text) && /akral/i.test(text)) s.akral_hangat = false
  if (/edema\s*\(\s*\+\s*\/\s*\+\s*\)|\bedema\s*\(\s*\+\s*\)/i.test(text)) s.edema_ekstremitas = true

  // 4. Status Neurologis
  if (/kaku\s*kuduk\s*\(\s*\+\s*\)/i.test(text)) s.kaku_kuduk = true
  if (/kernig\s*\(\s*\+\s*\/\s*\+\s*\)|\bkernig\s*\(\s*\+\s*\)/i.test(text)) s.kernig = true
  if (/brudzinski\s*i\s*\(\s*\+\s*\)/i.test(text)) s.brudzinski1 = true
  if (/brudzinski\s*ii\s*\(\s*\+\s*\)/i.test(text)) s.brudzinski2 = true

  // N.VII
  if (/parese.*n\.?\s*vii.*dextra.*sentral/i.test(text)) {
    s.n7_wajah = 'parese_dextra_sentral'
  } else if (/parese.*n\.?\s*vii.*dextra.*perifer/i.test(text) || /bell'?s.*dextra/i.test(text)) {
    s.n7_wajah = 'parese_dextra_perifer'
  } else if (/parese.*n\.?\s*vii.*sinistra.*sentral/i.test(text)) {
    s.n7_wajah = 'parese_sinistra_sentral'
  } else if (/parese.*n\.?\s*vii.*sinistra.*perifer/i.test(text) || /bell'?s.*sinistra/i.test(text)) {
    s.n7_wajah = 'parese_sinistra_perifer'
  }

  // Pupil
  const pupilMatch = text.match(/pupil.*(?:isokor|anisokor).*\(?(\d)\s*mm\s*[/x]\s*(\d)\s*mm\)?/i)
  if (pupilMatch) {
    s.pupil_kanan_mm = parseInt(pupilMatch[1], 10)
    s.pupil_kiri_mm = parseInt(pupilMatch[2], 10)
  }
  if (/anisokor/i.test(text)) s.isokor = false

  // N.XII
  if (/deviasi\s*(?:ke\s*)?kanan/i.test(text) && /lidah|n\.?\s*xii/i.test(text)) {
    s.n12_lidah = 'deviasi_kanan'
  } else if (/deviasi\s*(?:ke\s*)?kiri/i.test(text) && /lidah|n\.?\s*xii/i.test(text)) {
    s.n12_lidah = 'deviasi_kiri'
  }

  // Motorik 4 kuadran
  const motorikQuadMatch = text.match(
    /\b(?:motorik|kekuatan)\s*[:-]?\s*([0-5]{1,4})\s*[/x]\s*([0-5]{1,4})\s*(?:[\n//,;|-]+|\s+)\s*([0-5]{1,4})\s*[/x]\s*([0-5]{1,4})/i
  )
  if (motorikQuadMatch) {
    s.motorik_sk = parseInt(motorikQuadMatch[1].charAt(0), 10) || 5
    s.motorik_ski = parseInt(motorikQuadMatch[2].charAt(0), 10) || 5
    s.motorik_ik = parseInt(motorikQuadMatch[3].charAt(0), 10) || 5
    s.motorik_iki = parseInt(motorikQuadMatch[4].charAt(0), 10) || 5
  }

  // Sensorik
  if (/hemihipestesi.*dextra|hemihipestesi.*kanan/i.test(text)) {
    s.sensorik_tipe = 'hemi_kanan'
  } else if (/hemihipestesi.*sinistra|hemihipestesi.*kiri/i.test(text)) {
    s.sensorik_tipe = 'hemi_kiri'
  } else if (/parahipestesi/i.test(text)) {
    s.sensorik_tipe = 'parahipestesi'
  } else if (/glove.*stocking/i.test(text)) {
    s.sensorik_tipe = 'glove_stocking'
  }

  // Babinski
  if (/babinski\s*\(\s*\+\s*\/\s*-\s*\)/i.test(text) || /babinski.*kanan\s*\(\s*\+\s*\)/i.test(text)) {
    s.babinski_kanan = true
    s.babinski_kiri = false
  } else if (/babinski\s*\(\s*-\s*\/\s*\+\s*\)/i.test(text) || /babinski.*kiri\s*\(\s*\+\s*\)/i.test(text)) {
    s.babinski_kanan = false
    s.babinski_kiri = true
  } else if (/babinski\s*\(\s*\+\s*\/\s*\+\s*\)|\bbabinski\s*\(\s*\+\s*\)/i.test(text)) {
    s.babinski_kanan = true
    s.babinski_kiri = true
  }

  return s
}
