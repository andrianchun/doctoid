// src/utils/visitePresets.ts
// Katalog preset medis terstandardisasi untuk Visite Rawat Inap & Bangsal RS

export interface QuickDrugPreset {
  name: string
  dose: string
  kategori: 'Farmakologi' | 'Non-Farmakologi' | 'Diagnostik'
}

export interface QuickPdxPreset {
  name: string
  kategori: 'Laboratorium' | 'Radiologi' | 'Diagnostik'
}

export interface QuickFinding {
  id: string
  label: string
  category: 'Pupil' | 'Sensorik' | 'Kranialis' | 'Meningeal' | 'Thorax' | 'Abdomen' | 'Ekstremitas'
  insertText: string
}

// Preset Keluhan Singkat Khas Visite Bangsal (Ringkas & Padat)
export const QUICK_COMPLAINT_PRESETS: string[] = [
  'pusing berputar',
  'mual',
  'muntah',
  'lemah badan separuh',
  'pelo',
  'merot',
  'nyeri kepala',
  'demam',
  'sesak',
  'kejang',
]

// Skala kekuatan motorik lengkap (mendukung 4- dan 4+)
export const MOTORIK_SCALE: string[] = ['0', '1', '2', '3', '4-', '4', '4+', '5']

// Mapping Switch Oral (Injeksi IV -> Tablet/Kapsul Oral)
export const SWITCH_ORAL_MAPPING: Record<string, { name: string; dose: string }> = {
  ceftriaxone: { name: 'Cefixime', dose: '2 x 100 mg po' },
  rocephin: { name: 'Cefixime', dose: '2 x 100 mg po' },
  cefotaxime: { name: 'Cefixime', dose: '2 x 100 mg po' },
  levofloxacin: { name: 'Levofloxacin', dose: '1 x 500 mg po' },
  omeprazole: { name: 'Omeprazole', dose: '1 x 20 mg po ac pagi' },
  pantoprazole: { name: 'Pantoprazole', dose: '1 x 40 mg po ac pagi' },
  lansoprazole: { name: 'Lansoprazole', dose: '1 x 30 mg po ac pagi' },
  paracetamol: { name: 'Paracetamol', dose: '3 x 500 mg po' },
  sanmol: { name: 'Paracetamol', dose: '3 x 500 mg po' },
  ketorolac: { name: 'Asam Mefenamat', dose: '3 x 500 mg po pc' },
  santagesik: { name: 'Metamizole', dose: '3 x 500 mg po' },
  citicoline: { name: 'Citicoline', dose: '2 x 500 mg po' },
  ondansetron: { name: 'Ondansetron', dose: '2 x 4 mg po' },
  metoclopramide: { name: 'Metoclopramide', dose: '3 x 10 mg po ac' },
  ranitidine: { name: 'Ranitidine', dose: '2 x 150 mg po ac' },
  furosemide: { name: 'Furosemide', dose: '1 x 40 mg po pagi' },
}

// Katalog Terapi Cepat Bangsal per Kategori
export const QUICK_DRUG_CATEGORIES = [
  'Antibiotik',
  'Analgetik',
  'Gastro',
  'Cairan',
  'Neuro/Kardio',
] as const

export const QUICK_DRUG_PRESETS: Record<string, QuickDrugPreset[]> = {
  Antibiotik: [
    { name: 'Ceftriaxone', dose: '2 x 1 gr iv (skin test)', kategori: 'Farmakologi' },
    { name: 'Cefotaxime', dose: '3 x 1 gr iv (skin test)', kategori: 'Farmakologi' },
    { name: 'Meropenem', dose: '3 x 1 gr iv drip 3 jam', kategori: 'Farmakologi' },
    { name: 'Levofloxacin', dose: '1 x 750 mg iv drip', kategori: 'Farmakologi' },
    { name: 'Cefixime', dose: '2 x 100 mg po', kategori: 'Farmakologi' },
    { name: 'Azithromycin', dose: '1 x 500 mg po', kategori: 'Farmakologi' },
  ],
  Analgetik: [
    { name: 'Paracetamol', dose: '3 x 1 gr iv drip (k/p demam/nyeri)', kategori: 'Farmakologi' },
    { name: 'Ketorolac', dose: '3 x 30 mg iv (maks 3-5 hari)', kategori: 'Farmakologi' },
    { name: 'Tramadol', dose: '2 x 50 mg iv drip perlahan', kategori: 'Farmakologi' },
    { name: 'Santagesik (Metamizole)', dose: '3 x 1 gr iv perlahan', kategori: 'Farmakologi' },
    { name: 'Paracetamol Tab', dose: '3 x 500 mg po (k/p)', kategori: 'Farmakologi' },
    { name: 'Gabapentin', dose: '1 x 300 mg po malam', kategori: 'Farmakologi' },
  ],
  Gastro: [
    { name: 'Omeprazole', dose: '2 x 40 mg iv', kategori: 'Farmakologi' },
    { name: 'Pantoprazole', dose: '2 x 40 mg iv', kategori: 'Farmakologi' },
    { name: 'Ondansetron', dose: '3 x 4 mg iv', kategori: 'Farmakologi' },
    { name: 'Sucralfate Syr', dose: '3 x 1 C po ac (sebelum makan)', kategori: 'Farmakologi' },
    { name: 'Metoclopramide', dose: '3 x 10 mg iv', kategori: 'Farmakologi' },
    { name: 'Lansoprazole', dose: '1 x 30 mg po ac pagi', kategori: 'Farmakologi' },
  ],
  Cairan: [
    { name: 'Infus NaCl 0.9%', dose: '1500 cc / 24 jam (20 tpm)', kategori: 'Farmakologi' },
    { name: 'Infus Asering', dose: '1500 cc / 24 jam (20 tpm)', kategori: 'Farmakologi' },
    { name: 'Infus Ringer Laktat (RL)', dose: '1500 cc / 24 jam (20 tpm)', kategori: 'Farmakologi' },
    { name: 'Kalium L-aspartat (KSR)', dose: '3 x 1 tab po', kategori: 'Farmakologi' },
    { name: 'KCL Drip', dose: '25 mEq dlm 500 cc NaCl 0.9% drip 8 jam', kategori: 'Farmakologi' },
    { name: 'Infus Aminofluid', dose: '1000 cc / 24 jam iv drip', kategori: 'Farmakologi' },
  ],
  'Neuro/Kardio': [
    { name: 'Citicoline', dose: '2 x 500 mg iv', kategori: 'Farmakologi' },
    { name: 'Manitol 20%', dose: '6 x 100 cc iv cepat (tiap 4 jam)', kategori: 'Farmakologi' },
    { name: 'Aspilet', dose: '1 x 80 mg po pc (pagi)', kategori: 'Farmakologi' },
    { name: 'Clopidogrel', dose: '1 x 75 mg po (malam)', kategori: 'Farmakologi' },
    { name: 'Atorvastatin', dose: '1 x 20 mg po (malam)', kategori: 'Farmakologi' },
    { name: 'Amlodipine', dose: '1 x 10 mg po (pagi)', kategori: 'Farmakologi' },
    { name: 'Candesartan', dose: '1 x 16 mg po (pagi)', kategori: 'Farmakologi' },
    { name: 'Nicardipine Drip', dose: 'Titrasi 0.5 - 5 mcg/kgBB/menit iv syringe pump', kategori: 'Farmakologi' },
  ],
}

// Chip Rencana Penunjang Rutin (PDx)
export const QUICK_PDX_PRESETS: QuickPdxPreset[] = [
  { name: 'Darah Lengkap (DL) Rutin', kategori: 'Laboratorium' },
  { name: 'Elektrolit Serum (Na/K/Cl)', kategori: 'Laboratorium' },
  { name: 'GDA / GDS Evaluasi', kategori: 'Laboratorium' },
  { name: 'Faal Ginjal (Ureum / Kreatinin)', kategori: 'Laboratorium' },
  { name: 'Faal Hati (SGOT / SGPT)', kategori: 'Laboratorium' },
  { name: 'Profil Lipid Lengkap', kategori: 'Laboratorium' },
  { name: 'Koagulasi (PT / APTT / INR)', kategori: 'Laboratorium' },
  { name: 'Foto Thorax AP/PA', kategori: 'Radiologi' },
  { name: 'CT Scan Kepala Evaluasi', kategori: 'Radiologi' },
  { name: 'EKG 12 Lead', kategori: 'Diagnostik' },
]

// Chip Temuan Pemfis Populer untuk Bangsal & Rawat Inap
export const QUICK_FINDINGS: QuickFinding[] = [
  // Pupil
  { id: 'pupil-anisokor', label: 'Pupil Anisokor 3mm/4mm', category: 'Pupil', insertText: 'Pupil anisokor (3mm / 4mm), RCL (+/-), RCTL (+/-)' },
  { id: 'pupil-isokor', label: 'Pupil Isokor 3mm/3mm', category: 'Pupil', insertText: 'Pupil isokor (3mm / 3mm), RCL (+/+), RCTL (+/+)' },
  { id: 'pupil-pinpoint', label: 'Pupil Pinpoint 1mm/1mm', category: 'Pupil', insertText: 'Pupil pinpoint (1mm / 1mm), RCL minimal (+/+)' },

  // Sensorik
  { id: 'sensorik-hemi-dx', label: 'Hemihipestesi Dextra', category: 'Sensorik', insertText: 'Hemihipestesi sisi kanan (dextra)' },
  { id: 'sensorik-hemi-sn', label: 'Hemihipestesi Sinistra', category: 'Sensorik', insertText: 'Hemihipestesi sisi kiri (sinistra)' },
  { id: 'sensorik-parahipestesi', label: 'Parahipestesi Tungkai', category: 'Sensorik', insertText: 'Parahipestesi kedua ekstremitas inferior' },

  // Nervus Kranialis
  { id: 'nvii-sentral-dx', label: 'Parese N.VII Dextra Sentral', category: 'Kranialis', insertText: 'Parese N.VII dextra tipe sentral (sudut mulut tertinggal saat meringis, plika nasolabialis datar)' },
  { id: 'nvii-sentral-sn', label: 'Parese N.VII Sinistra Sentral', category: 'Kranialis', insertText: 'Parese N.VII sinistra tipe sentral (sudut mulut tertinggal saat meringis, plika nasolabialis datar)' },
  { id: 'nxii-deviasi-dx', label: 'Deviasi Lidah N.XII Dextra', category: 'Kranialis', insertText: 'Deviasi lidah ke arah kanan saat dijulurkan (parese N.XII dextra)' },
  { id: 'nxii-deviasi-sn', label: 'Deviasi Lidah N.XII Sinistra', category: 'Kranialis', insertText: 'Deviasi lidah ke arah kiri saat dijulurkan (parese N.XII sinistra)' },

  // Meningeal
  { id: 'meningeal-kaku-kuduk', label: 'Kaku Kuduk (+)', category: 'Meningeal', insertText: 'Tanda rangsang meningeal: Kaku kuduk (+), Kernig (+)' },
  { id: 'meningeal-negatif', label: 'Meningeal Sign (-)', category: 'Meningeal', insertText: 'Tanda rangsang meningeal: Kaku kuduk (-), Kernig (-), Brudzinski I/II (-/-)' },

  // Thorax & Interna
  { id: 'interna-dbn', label: 'Cor & Pulmo DBN', category: 'Thorax', insertText: 'Cor: S1 S2 tunggal reguler, murmur (-), gallop (-)\nPulmo: vesikuler (+/+), rhonki (-/-), wheezing (-/-)' },
  { id: 'pulmo-rhonki', label: 'Rhonki Basah (+/+)', category: 'Thorax', insertText: 'Pulmo: Suara nafas vesikuler, rhonki basah (+/+) di basal bilateral' },
  { id: 'pulmo-wheezing', label: 'Wheezing Ekspiratoar (+)', category: 'Thorax', insertText: 'Pulmo: Suara nafas vesikuler, wheezing (+/+) pada fase ekspirasi' },

  // Abdomen
  { id: 'abd-supel', label: 'Abdomen Supel, NT (-)', category: 'Abdomen', insertText: 'Abdomen: Supel, bising usus (+) normal, hepar/lien ttb, nyeri tekan (-)' },
  { id: 'abd-nt-epigastrium', label: 'Nyeri Tekan Epigastrium (+)', category: 'Abdomen', insertText: 'Abdomen: Supel, bising usus (+) normal, nyeri tekan (+) regio epigastrium' },

  // Ekstremitas
  { id: 'ext-hangat-noedema', label: 'Akral Hangat, Edema (-)', category: 'Ekstremitas', insertText: 'Ekstremitas: Akral hangat, kering, merah, CRT < 2 detik, edema (-/-)' },
  { id: 'ext-edema-tungkai', label: 'Edema Pretibial (+/+)', category: 'Ekstremitas', insertText: 'Ekstremitas: Pitting edema (+/+) di regio pretibial bilateral' },
  { id: 'ext-babinski-dx', label: 'Babinski (+/-)', category: 'Ekstremitas', insertText: 'Refleks patologis: Babinski (+/- dextra), Chaddock (+/-)' },
]
