export interface StandardDrug {
  name: string
  category: 'Farmakologi' | 'Non-Farmakologi'
  commonDosages: string[]
  aliases?: string[]
  route?: 'oral' | 'iv' | 'sc' | 'topical' | 'inhalasi'
}

export interface StandardProcedure {
  name: string
  icd9: string
  category: 'Laboratorium' | 'Radiologi' | 'Lainnya' | 'Diagnostik' | 'Non-Farmakologi'
  aliases?: string[]
}

export interface StandardDiagnosis {
  name: string
  icd10: string
  category: 'Neurologi' | 'IPD' | 'Kardiologi' | 'Lainnya'
  aliases?: string[]
}

export const STANDARD_DRUGS: StandardDrug[] = [
  // Antihipertensi & Kardiovaskular
  {
    name: 'Amlodipine',
    category: 'Farmakologi',
    commonDosages: ['5 mg (1-0-0)', '10 mg (1-0-0)', '5 mg (0-0-1)', '10 mg (0-0-1)'],
    aliases: ['amlo', 'amlodipin', 'norvask'],
    route: 'oral',
  },
  {
    name: 'Candesartan',
    category: 'Farmakologi',
    commonDosages: ['8 mg (0-0-1)', '16 mg (0-0-1)', '8 mg (1-0-0)', '16 mg (1-0-0)'],
    aliases: ['cande', 'blopress'],
    route: 'oral',
  },
  {
    name: 'Valsartan',
    category: 'Farmakologi',
    commonDosages: ['80 mg (0-0-1)', '160 mg (0-0-1)', '80 mg (1-0-0)'],
    aliases: ['diovan'],
    route: 'oral',
  },
  {
    name: 'Bisoprolol',
    category: 'Farmakologi',
    commonDosages: ['2.5 mg (1-0-0)', '5 mg (1-0-0)', '1.25 mg (1-0-0)'],
    aliases: ['biso', 'concor'],
    route: 'oral',
  },
  {
    name: 'Ramipril',
    category: 'Farmakologi',
    commonDosages: ['5 mg (0-0-1)', '10 mg (0-0-1)', '2.5 mg (0-0-1)'],
    aliases: ['triatec'],
    route: 'oral',
  },
  {
    name: 'Captopril',
    category: 'Farmakologi',
    commonDosages: ['3 x 12.5 mg po', '3 x 25 mg po', '2 x 25 mg po'],
    aliases: ['capto'],
    route: 'oral',
  },
  {
    name: 'Nicardipine',
    category: 'Farmakologi',
    commonDosages: ['Titrasi 0.5 - 5 mcg/kgBB/menit iv pump', 'Titrasi mulai 5 mg/jam iv syringe pump'],
    aliases: ['perdipine', 'nicar'],
    route: 'iv',
  },
  {
    name: 'Diltiazem',
    category: 'Farmakologi',
    commonDosages: ['3 x 30 mg po', 'titrasi 5-15 mg/jam iv pump', '1 x 100 mg po (SR)'],
    aliases: ['herbesser'],
    route: 'oral',
  },
  {
    name: 'Furosemide',
    category: 'Farmakologi',
    commonDosages: ['1 x 20 mg iv', '2 x 20 mg iv', '1 x 40 mg po pagi', 'titrasi 5-10 mg/jam iv'],
    aliases: ['lasix', 'furo'],
    route: 'iv',
  },
  {
    name: 'Spironolactone',
    category: 'Farmakologi',
    commonDosages: ['1 x 25 mg po pagi', '1 x 50 mg po pagi'],
    aliases: ['spiro', 'aldactone'],
    route: 'oral',
  },

  // Neuroprotektor & Sirkulasi Serebral
  {
    name: 'Citicoline',
    category: 'Farmakologi',
    commonDosages: ['2 x 500 mg iv', '2 x 250 mg iv', '2 x 500 mg po', '1 x 1000 mg iv drip'],
    aliases: ['citi', 'citikolin', 'brainact', 'nicholin'],
    route: 'iv',
  },
  {
    name: 'Piracetam',
    category: 'Farmakologi',
    commonDosages: ['3 x 3 gr iv', '4 x 3 gr iv', '3 x 1200 mg po', '1 x 12 gr iv drip bolus'],
    aliases: ['pira', 'nootropil'],
    route: 'iv',
  },

  // Antiplatelet & Antikoagulan
  {
    name: 'Aspilet (Asam Asetilsalisilat)',
    category: 'Farmakologi',
    commonDosages: ['1 x 80 mg po pc', '1 x 160 mg po (loading)', '1 x 100 mg po pc'],
    aliases: ['aspi', 'aspirin', 'asetosal', 'thrombo aspilets'],
    route: 'oral',
  },
  {
    name: 'Clopidogrel',
    category: 'Farmakologi',
    commonDosages: ['1 x 75 mg po', '300 mg po (loading)', '75 mg (0-0-1)'],
    aliases: ['clopi', 'plavix'],
    route: 'oral',
  },
  {
    name: 'Cilostazol',
    category: 'Farmakologi',
    commonDosages: ['2 x 100 mg po ac', '2 x 50 mg po ac'],
    aliases: ['pletaal', 'cilo'],
    route: 'oral',
  },
  {
    name: 'Warfarin',
    category: 'Farmakologi',
    commonDosages: ['1 x 2 mg po malam', '1 x 3 mg po malam', '1 x 5 mg po malam'],
    aliases: ['simarc'],
    route: 'oral',
  },

  // Hipolipidemik / Statin
  {
    name: 'Atorvastatin',
    category: 'Farmakologi',
    commonDosages: ['1 x 20 mg po malam (0-0-1)', '1 x 40 mg po malam (0-0-1)', '1 x 10 mg po malam'],
    aliases: ['ator', 'lipitor', 'statin'],
    route: 'oral',
  },
  {
    name: 'Simvastatin',
    category: 'Farmakologi',
    commonDosages: ['1 x 20 mg po malam (0-0-1)', '1 x 10 mg po malam', '1 x 40 mg po malam'],
    aliases: ['simva'],
    route: 'oral',
  },
  {
    name: 'Fenofibrate',
    category: 'Farmakologi',
    commonDosages: ['1 x 100 mg po malam', '1 x 300 mg po malam', '1 x 145 mg po malam'],
    aliases: ['feno', 'tricor'],
    route: 'oral',
  },

  // Antiedema Serebral
  {
    name: 'Manitol 20%',
    category: 'Farmakologi',
    commonDosages: ['6 x 100 cc iv cepat (tiap 4 jam)', '4 x 125 cc iv cepat (tiap 6 jam)', '6 x 125 cc iv cepat', 'tapering off: 3 x 100 cc iv'],
    aliases: ['mannitol', 'osmo'],
    route: 'iv',
  },

  // Antiepilepsi & Antikonvulsan
  {
    name: 'Phenytoin',
    category: 'Farmakologi',
    commonDosages: ['3 x 100 mg iv bolus perlahan', '3 x 100 mg po', '100 mg - 0 - 200 mg po', 'Loading 15-20 mg/kgBB dlm NaCl'],
    aliases: ['dilantin', 'kutoin', 'fenitoin'],
    route: 'iv',
  },
  {
    name: 'Asam Valproat',
    category: 'Farmakologi',
    commonDosages: ['2 x 250 mg po', '2 x 500 mg po', 'syrup 3 x 250 mg', 'Depakote ER 1 x 500 mg po malam'],
    aliases: ['valproat', 'depakote', 'valproic'],
    route: 'oral',
  },
  {
    name: 'Levetiracetam',
    category: 'Farmakologi',
    commonDosages: ['2 x 500 mg iv', '2 x 500 mg po', '2 x 1000 mg po'],
    aliases: ['keppra', 'leveti'],
    route: 'iv',
  },
  {
    name: 'Diazepam',
    category: 'Farmakologi',
    commonDosages: ['1 x 5-10 mg iv perlahan (bila kejang)', '1 x 10 mg rectal supp (anak/dewasa bila kejang)'],
    aliases: ['valium', 'stesolid'],
    route: 'iv',
  },
  {
    name: 'Midazolam',
    category: 'Farmakologi',
    commonDosages: ['Titrasi 1-5 mg/jam iv pump', 'Bolus 2.5-5 mg iv bila kejang'],
    aliases: ['dormicum'],
    route: 'iv',
  },

  // Neuropatik & Analgetik
  {
    name: 'Gabapentin',
    category: 'Farmakologi',
    commonDosages: ['1 x 100 mg po malam', '1 x 300 mg po malam', '2 x 300 mg po', '3 x 300 mg po'],
    aliases: ['gaba', 'neurontin'],
    route: 'oral',
  },
  {
    name: 'Pregabalin',
    category: 'Farmakologi',
    commonDosages: ['1 x 75 mg po malam', '2 x 75 mg po', '2 x 150 mg po'],
    aliases: ['lyrica', 'prega'],
    route: 'oral',
  },
  {
    name: 'Mecobalamin',
    category: 'Farmakologi',
    commonDosages: ['3 x 500 mcg po', '1 x 500 mcg iv', '2 x 500 mcg po'],
    aliases: ['meco', 'methycobal', 'vitamin b12'],
    route: 'oral',
  },
  {
    name: 'Paracetamol',
    category: 'Farmakologi',
    commonDosages: ['3 x 1 gr iv drip (k/p)', '3 x 500 mg po', '3 x 650 mg po', '1 gr iv drip extra demam/nyeri'],
    aliases: ['pct', 'sanmol', 'pamol'],
    route: 'oral',
  },
  {
    name: 'Ketorolac',
    category: 'Farmakologi',
    commonDosages: ['3 x 30 mg iv (maks 3-5 hari)', '2 x 30 mg iv'],
    aliases: ['keto', 'toradol'],
    route: 'iv',
  },
  {
    name: 'Tramadol',
    category: 'Farmakologi',
    commonDosages: ['2 x 50 mg iv perlahan', '1 x 50 mg drip'],
    aliases: ['trama'],
    route: 'iv',
  },

  // Gastroprotektor & Antiemetik
  {
    name: 'Omeprazole',
    category: 'Farmakologi',
    commonDosages: ['2 x 40 mg iv', '1 x 40 mg iv', '1 x 20 mg po ac pagi', '2 x 20 mg po ac'],
    aliases: ['ome', 'ozid'],
    route: 'iv',
  },
  {
    name: 'Lansoprazole',
    category: 'Farmakologi',
    commonDosages: ['2 x 30 mg iv', '1 x 30 mg po ac pagi', '2 x 30 mg po ac'],
    aliases: ['lanso', 'inazol'],
    route: 'oral',
  },
  {
    name: 'Pantoprazole',
    category: 'Farmakologi',
    commonDosages: ['2 x 40 mg iv', '1 x 40 mg iv'],
    aliases: ['panto'],
    route: 'iv',
  },
  {
    name: 'Ranitidine',
    category: 'Farmakologi',
    commonDosages: ['2 x 50 mg iv', '2 x 150 mg po ac'],
    aliases: ['rani'],
    route: 'iv',
  },
  {
    name: 'Ondansetron',
    category: 'Farmakologi',
    commonDosages: ['3 x 4 mg iv', '3 x 8 mg iv', '2 x 4 mg iv (k/p mual)'],
    aliases: ['ondan', 'narfoz'],
    route: 'iv',
  },
  {
    name: 'Metoclopramide',
    category: 'Farmakologi',
    commonDosages: ['3 x 10 mg iv', '3 x 10 mg po ac'],
    aliases: ['meto', 'primperan'],
    route: 'iv',
  },
  {
    name: 'Sucralfate',
    category: 'Farmakologi',
    commonDosages: ['3 x 1 C po ac (sebelum makan)', '4 x 1 C po ac'],
    aliases: ['sucral', 'episan'],
    route: 'oral',
  },

  // Antidiabetes
  {
    name: 'Metformin',
    category: 'Farmakologi',
    commonDosages: ['3 x 500 mg po dc (saat makan)', '2 x 500 mg po dc', '1 x 500 mg po dc', '2 x 850 mg po dc'],
    aliases: ['metfor', 'glucophage'],
    route: 'oral',
  },
  {
    name: 'Glimepiride',
    category: 'Farmakologi',
    commonDosages: ['1 x 1 mg po pagi ac', '1 x 2 mg po pagi ac', '1 x 3 mg po pagi ac'],
    aliases: ['glime', 'amaryl'],
    route: 'oral',
  },
  {
    name: 'Insulin Rapid (Novorapid/Apidra)',
    category: 'Farmakologi',
    commonDosages: ['3 x 4 unit sc ac', '3 x 6 unit sc ac', '3 x 8 unit sc ac', 'Regulasi Sliding Scale per 6 jam sc'],
    aliases: ['novorapid', 'apidra', 'insulin pendek'],
    route: 'sc',
  },
  {
    name: 'Insulin Basal (Lantus/Levemir)',
    category: 'Farmakologi',
    commonDosages: ['1 x 10 unit sc malam (22.00)', '1 x 12 unit sc malam (22.00)', '1 x 14 unit sc malam'],
    aliases: ['lantus', 'levemir', 'insulin panjang'],
    route: 'sc',
  },

  // Antibiotik
  {
    name: 'Ceftriaxone',
    category: 'Farmakologi',
    commonDosages: ['2 x 1 gr iv (skin test)', '1 x 2 gr iv (skin test)'],
    aliases: ['ceftri', 'rocephin'],
    route: 'iv',
  },
  {
    name: 'Cefotaxime',
    category: 'Farmakologi',
    commonDosages: ['3 x 1 gr iv (skin test)', '2 x 1 gr iv (skin test)'],
    aliases: ['cefo'],
    route: 'iv',
  },
  {
    name: 'Meropenem',
    category: 'Farmakologi',
    commonDosages: ['3 x 1 gr iv drip 3 jam', '3 x 500 mg iv'],
    aliases: ['mero', 'meronem'],
    route: 'iv',
  },
  {
    name: 'Levofloxacin',
    category: 'Farmakologi',
    commonDosages: ['1 x 750 mg iv drip perlahan', '1 x 500 mg iv drip', '1 x 500 mg po'],
    aliases: ['levo', 'cravit'],
    route: 'iv',
  },

  // Cairan & Elektrolit
  {
    name: 'Infus NaCl 0.9%',
    category: 'Farmakologi',
    commonDosages: ['1500 cc / 24 jam (20 tpm makro)', '1000 cc / 24 jam (14 tpm makro)', '2000 cc / 24 jam (28 tpm makro)'],
    aliases: ['ns', 'normal saline', 'nacl'],
    route: 'iv',
  },
  {
    name: 'Infus Asering',
    category: 'Farmakologi',
    commonDosages: ['1500 cc / 24 jam (20 tpm)', '1000 cc / 24 jam (14 tpm)'],
    aliases: ['asering'],
    route: 'iv',
  },
  {
    name: 'Kalium L-aspartat / KSR',
    category: 'Farmakologi',
    commonDosages: ['3 x 1 tab po', '2 x 1 tab po', 'KCL 25 mEq dlm 500 cc NaCl 0.9% drip 8 jam'],
    aliases: ['ksr', 'kalium', 'kcl'],
    route: 'oral',
  },

  // Non-Farmakologi
  {
    name: 'Head Up 30 Derajat',
    category: 'Non-Farmakologi',
    commonDosages: ['Pertahankan posisi kepala 30° cegah TTIK'],
    aliases: ['head up', 'elevasi kepala'],
  },
  {
    name: 'Oksigen Nasal Kanul',
    category: 'Non-Farmakologi',
    commonDosages: ['3 lpm nasal kanul', '2-4 lpm nasal kanul target SpO2 >= 95%'],
    aliases: ['o2', 'oksigen', 'nasal kanul'],
  },
  {
    name: 'Fisioterapi Motorik & ROM Aktif/Pasif',
    category: 'Non-Farmakologi',
    commonDosages: ['Latihan mobilisasi bertahap & alih baring per 2 jam'],
    aliases: ['fisioterapi', 'rom', 'alih baring'],
  },
  {
    name: 'Nutrisi Sonde NGT',
    category: 'Non-Farmakologi',
    commonDosages: ['6 x 200 cc cair sonde bertahap (1500-1800 kkal)'],
    aliases: ['ngt', 'sonde', 'diet cair'],
  },
]

export const STANDARD_PROCEDURES: StandardProcedure[] = [
  // Radiologi
  {
    name: 'CT-Scan Kepala Non-Kontras',
    icd9: '87.03',
    category: 'Radiologi',
    aliases: ['ct', 'ct scan', 'ct kepala', 'msct', 'head ct'],
  },
  {
    name: 'CT-Scan Kepala dg Kontras',
    icd9: '87.03',
    category: 'Radiologi',
    aliases: ['ct kontras', 'ct scan kontras'],
  },
  {
    name: 'MRI Kepala & MRA',
    icd9: '88.91',
    category: 'Radiologi',
    aliases: ['mri', 'mri kepala', 'mra', 'brain mri'],
  },
  {
    name: 'Foto Thorax AP/PA',
    icd9: '87.44',
    category: 'Radiologi',
    aliases: ['cxr', 'thorax', 'foto rontgen dada', 'rontgen thorax'],
  },
  {
    name: 'USG Doppler Carotis',
    icd9: '88.71',
    category: 'Radiologi',
    aliases: ['doppler', 'carotis', 'usg karotis'],
  },
  {
    name: 'USG Abdomen',
    icd9: '88.76',
    category: 'Radiologi',
    aliases: ['usg', 'usg abd'],
  },

  // Laboratorium
  {
    name: 'Darah Lengkap (DL)',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['dl', 'darah rutin', 'cbc', 'hemoglobin leukosit'],
  },
  {
    name: 'GDA / GDS Rutin',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['gda', 'gds', 'gula darah', 'glukosa acak'],
  },
  {
    name: 'Elektrolit Serum (Na/K/Cl)',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['se', 'elektrolit', 'natrium kalium klorida'],
  },
  {
    name: 'Faal Ginjal (Ureum / Kreatinin)',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['ur cr', 'ureum', 'kreatinin', 'rft', 'bun cr'],
  },
  {
    name: 'Faal Hati (SGOT / SGPT)',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['lft', 'sgot', 'sgpt', 'ast alt'],
  },
  {
    name: 'Profil Lipid (Kol/TG/HDL/LDL)',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['lipid', 'kolesterol', 'trigliserida', 'ldl'],
  },
  {
    name: 'Koagulasi (PT / APTT / INR)',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['pt', 'aptt', 'inr', 'faal hemostasis'],
  },
  {
    name: 'HbA1c',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['hba1c', 'a1c'],
  },
  {
    name: 'Analisa Gas Darah (AGD)',
    icd9: '89.65',
    category: 'Laboratorium',
    aliases: ['agd', 'bga', 'astrup'],
  },
  {
    name: 'Troponin I / T Kuantitatif',
    icd9: '90.59',
    category: 'Laboratorium',
    aliases: ['trop', 'troponin'],
  },
  {
    name: 'Urinalisis Lengkap',
    icd9: '91.39',
    category: 'Laboratorium',
    aliases: ['ul', 'urine lengkap', 'urinalisis'],
  },

  // Prosedur Diagnostik & Lainnya
  {
    name: 'EKG 12 Lead',
    icd9: '89.52',
    category: 'Lainnya',
    aliases: ['ekg', 'ecg', 'rekam jantung'],
  },
  {
    name: 'EEG (Elektroensefalografi)',
    icd9: '89.14',
    category: 'Lainnya',
    aliases: ['eeg', 'rekam otak'],
  },
  {
    name: 'EMG / NCV (Elektromiografi)',
    icd9: '93.08',
    category: 'Lainnya',
    aliases: ['emg', 'ncv', 'kecepatan hantar saraf'],
  },
  {
    name: 'Echocardiografi (TTE)',
    icd9: '88.72',
    category: 'Lainnya',
    aliases: ['echo', 'usg jantung'],
  },
  {
    name: 'Lumbal Pungsi',
    icd9: '03.31',
    category: 'Lainnya',
    aliases: ['lp', 'lumbar puncture'],
  },
  {
    name: 'Pemasangan NGT',
    icd9: '96.07',
    category: 'Lainnya',
    aliases: ['pasang ngt', 'selang makan'],
  },
  {
    name: 'Pemasangan Kateter Urin',
    icd9: '57.94',
    category: 'Lainnya',
    aliases: ['pasang dc', 'dower catheter', 'foley catheter'],
  },
  {
    name: 'Fisioterapi Motorik & Rehabilitasi',
    icd9: '93.11',
    category: 'Non-Farmakologi',
    aliases: ['rehab', 'ft', 'fisioterapi'],
  },
]

export const STANDARD_DIAGNOSES: StandardDiagnosis[] = [
  // Neurologi
  {
    name: 'Stroke Iskemik Akut (Cerebral Infarction)',
    icd10: 'I63.9',
    category: 'Neurologi',
    aliases: ['stroke iskemik', 'infark serebri', 'snh', 'stroke non hemoragik', 'ischemic stroke'],
  },
  {
    name: 'Perdarahan Intraserebral (ICH / Stroke Hemoragik)',
    icd10: 'I61.9',
    category: 'Neurologi',
    aliases: ['ich', 'stroke hemoragik', 'sh', 'perdarahan intraserebral', 'intracerebral hemorrhage'],
  },
  {
    name: 'Perdarahan Subaraknoid (SAH)',
    icd10: 'I60.9',
    category: 'Neurologi',
    aliases: ['sah', 'subarachnoid hemorrhage'],
  },
  {
    name: 'Transient Ischemic Attack (TIA)',
    icd10: 'G45.9',
    category: 'Neurologi',
    aliases: ['tia'],
  },
  {
    name: 'Epilepsi & Bangkitan Kejang Simtomatik',
    icd10: 'G40.9',
    category: 'Neurologi',
    aliases: ['kejang', 'epilepsi', 'seizure', 'status epileptikus'],
  },
  {
    name: 'Cephalgia / Tension Type Headache',
    icd10: 'G44.2',
    category: 'Neurologi',
    aliases: ['cephalgia', 'sakit kepala', 'nyeri kepala', 'tth'],
  },
  {
    name: 'Vertigo Perifer (BPPV / Vestibulopati)',
    icd10: 'H81.1',
    category: 'Neurologi',
    aliases: ['vertigo', 'bppv', 'pusing berputar'],
  },
  {
    name: 'Vertigo Sentral',
    icd10: 'H81.4',
    category: 'Neurologi',
    aliases: ['vertigo sentral', 'central vertigo'],
  },
  {
    name: 'Bells Palsy (Paresis N. VII Perifer)',
    icd10: 'G51.0',
    category: 'Neurologi',
    aliases: ['bells palsy', 'n vii', 'fasialis perifer'],
  },
  {
    name: 'Ensefalopati Metabolik',
    icd10: 'G93.4',
    category: 'Neurologi',
    aliases: ['ensefalopati', 'metabolic encephalopathy', 'penurunan kesadaran ec metabolik'],
  },
  {
    name: 'Meningitis / Meningoensefalitis',
    icd10: 'G00.9',
    category: 'Neurologi',
    aliases: ['meningitis', 'meningoensefalitis', 'infeksi ssp'],
  },
  {
    name: 'Spondilosis Lumbal / HNP (Hernia Nukleus Pulposus)',
    icd10: 'M51.2',
    category: 'Neurologi',
    aliases: ['hnp', 'spondilosis', 'lbp', 'ischialgia'],
  },
  {
    name: 'Polineuropati Diabetik',
    icd10: 'G63.2',
    category: 'Neurologi',
    aliases: ['polineuropati', 'neuropati diabetik', 'kebas baal dm'],
  },

  // Komorbiditas Umum & Penyakit Dalam
  {
    name: 'Hipertensi Grade 1-2 / Urgency',
    icd10: 'I10',
    category: 'IPD',
    aliases: ['hipertensi', 'ht', 'ht urgency', 'hypertension', 'tekanan darah tinggi'],
  },
  {
    name: 'Diabetes Melitus Tipe 2 (T2DM)',
    icd10: 'E11.9',
    category: 'IPD',
    aliases: ['dm', 'dm tipe 2', 't2dm', 'kencing manis', 'diabetes'],
  },
  {
    name: 'Dislipidemia',
    icd10: 'E78.5',
    category: 'IPD',
    aliases: ['dislipid', 'kolesterol tinggi', 'hiperkolesterolemia'],
  },
  {
    name: 'Chronic Kidney Disease (CKD)',
    icd10: 'N18.9',
    category: 'IPD',
    aliases: ['ckd', 'gagal ginjal kronik', 'ggk'],
  },
  {
    name: 'Hipokalemia',
    icd10: 'E87.6',
    category: 'IPD',
    aliases: ['hipokalemia', 'kalium rendah'],
  },
  {
    name: 'Hiponatremia',
    icd10: 'E87.1',
    category: 'IPD',
    aliases: ['hiponatremia', 'natrium rendah'],
  },
  {
    name: 'Dispepsia / Gastritis Akut',
    icd10: 'K30',
    category: 'IPD',
    aliases: ['dispepsia', 'gastritis', 'maag', 'mual muntah'],
  },
  {
    name: 'Pneumonia / CAP (Community Acquired Pneumonia)',
    icd10: 'J18.9',
    category: 'IPD',
    aliases: ['pneumonia', 'cap', 'hap', 'infeksi paru'],
  },
  {
    name: 'Gagal Jantung Kongestif (CHF)',
    icd10: 'I50.9',
    category: 'Kardiologi',
    aliases: ['chf', 'gagal jantung', 'heart failure'],
  },
]

/**
 * Pencarian prediktif obat standar Fornas
 */
export function searchStandardDrugs(query: string, limit = 6): StandardDrug[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  return STANDARD_DRUGS.filter((d) => {
    if (d.name.toLowerCase().includes(q)) return true
    if (d.aliases?.some((a) => a.includes(q))) return true
    return false
  }).slice(0, limit)
}

/**
 * Pencarian prediktif tindakan & pemeriksaan penunjang (ICD-9-CM)
 */
export function searchStandardProcedures(
  query: string,
  categoryFilter?: 'Laboratorium' | 'Radiologi' | 'Lainnya',
  limit = 6
): StandardProcedure[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  return STANDARD_PROCEDURES.filter((p) => {
    if (categoryFilter && p.category !== categoryFilter && p.category !== 'Lainnya') {
      return false
    }
    if (p.name.toLowerCase().includes(q)) return true
    if (p.icd9.includes(q)) return true
    if (p.aliases?.some((a) => a.includes(q))) return true
    return false
  }).slice(0, limit)
}

/**
 * Pencarian prediktif diagnosis standar (ICD-10)
 */
export function searchStandardDiagnoses(query: string, limit = 6): StandardDiagnosis[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  return STANDARD_DIAGNOSES.filter((d) => {
    if (d.name.toLowerCase().includes(q)) return true
    if (d.icd10.toLowerCase().includes(q)) return true
    if (d.aliases?.some((a) => a.includes(q))) return true
    return false
  }).slice(0, limit)
}
