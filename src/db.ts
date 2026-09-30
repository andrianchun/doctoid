import Dexie, { type EntityTable } from 'dexie'

export type Jaminan = 'BPJS' | 'Umum' | 'Asuransi'
export type StatusRawat = 'aktif' | 'krs'
export type KeteranganKrs = 'Izin Dokter' | 'APS' | 'Meninggal' | 'Alih Rawat' | 'Rujuk'
export type KategoriTerapi = 'Farmakologi' | 'Non-Farmakologi' | 'Diagnostik' | 'Monitoring' | 'Edukasi'

export interface Hospital {
  id?: number
  nama: string
  kode_warna: string
  icon?: string // path to icon image e.g., '/icons/hospital.png'
  order?: number
}

export interface Ward {
  id?: number
  hospital_id: number
  nama: string
  kode_warna: string
  order?: number
}

export interface RawatEpisode {
  id: string
  tgl_mrs: string // ISO date
  tgl_krs?: string // ISO date
  hospital_id: number
  ward_id?: number
  diagnosis_utama: string
  catatan_krs?: string
  keterangan_krs?: KeteranganKrs
  detail_krs?: string // keterangan departemen alih rawat atau RS rujukan
}

export interface Patient {
  id?: number
  hospital_id: number
  title: string
  nama_depan: string
  usia: string
  no_rm: string
  tgl_mrs: string // ISO date
  tgl_onset: string // ISO date — dasar hitung "Stroke Hari ke-X"
  tgl_krs?: string // ISO date tanggal pulang
  diagnosis_utama: string
  lokasi_sekarang: number // ward id
  status_rawat: StatusRawat
  keterangan_krs?: KeteranganKrs
  detail_krs?: string // keterangan departemen alih rawat atau RS rujukan
  jaminan: Jaminan
  riwayat_rawat?: RawatEpisode[] // riwayat episode rawat inap sebelumnya
  order?: number // urutan tampilan / nomor urut bed manual
}

export interface DiagnosisItem {
  kategori: 'Utama' | 'Sekunder'
  nama_diagnosis: string
  icd10: string
}

export interface TerapiItem {
  nama_item: string
  dosis_keterangan: string
  tgl_mulai: string
  tgl_stop: string | null
  status: 'aktif' | 'stop'
  kategori: KategoriTerapi
  icd9?: string // kode ICD-9-CM prosedur, relevan utk kategori Diagnostik (mirip icd10 pada DiagnosisItem)
}

export interface ProgressNote {
  id?: number
  patient_id: number
  tanggal: string // ISO date
  S: string
  O_pemfis: string
  O_penunjang: string
  A: DiagnosisItem[]
  P: TerapiItem[]
  catatan?: string // Catatan bebas di luar SOAP (rencana KRS, konsul, extra, dll)
  attachments?: { name: string; type: string; dataUrl: string; kategori: 'pemfis' | 'penunjang' }[]
}

export interface DoctorPreference {
  id?: number
  konteks: string // mis. "stroke iskemik akut"
  pola: string // deskripsi style terapi yang dipelajari
  updated_at: string
}

export interface Template {
  id?: number
  nama_template: string
  format_string: string // mendukung variabel {{inisial}}, {{diagnosis_utama}}, dst.
}

export type RegexField =
  | 'nama_depan' | 'usia' | 'no_rm' | 'jaminan'
  | 'label_S' | 'label_O_pemfis' | 'label_O_penunjang' | 'label_A' | 'label_P'

export interface RegexRule {
  id?: number
  field: RegexField
  pattern: string // untuk field skalar: regex dgn capture group 1 = value. untuk label_*: kata label literal.
  flags: string
  hospital_id?: number
  source: 'ai' | 'user'
  hits: number
  created_at: string
}

export interface TherapyHistoryEntry {
  id?: number
  konteks: string // teks S + nama diagnosis A, dipakai sbg basis kemiripan (TF-IDF)
  nama_item: string
  dosis_keterangan: string
  kategori: KategoriTerapi
  created_at: string
}

/* Draft Brainstorm aktif — 1 baris (id selalu 1), disimpan supaya pindah tab (Dasbor/Rekap) gak ngilangin isian */
export interface BrainstormDraft {
  id: 1
  raw: string
  form: unknown // FormState (tipe didefinisikan di Brainstorm.tsx)
  attachments: { id: string; name: string; type: string; dataUrl: string; kategori: 'pemfis' | 'penunjang' }[]
  hospitalId: number
  wardId: number
  readmissionPatientId?: number | null
  updated_at: string
}

export type KategoriPenunjang = 'Laboratorium' | 'Radiologi' | 'Lainnya'

export interface PenunjangItem {
  id?: number
  patient_id: number
  tanggal: string // ISO date YYYY-MM-DD
  kategori: KategoriPenunjang
  nama_pemeriksaan: string // mis. "Darah Lengkap", "CT Scan Kepala", "Foto Thorax AP"
  hasil: string // mis. "Hb 12.8, Leu 11.200, Plt 285.000" atau "Infark luas hemisfer kiri"
  status: 'selesai' | 'menunggu' // 'selesai' = ada hasil, 'menunggu' = menunggu hasil
  catatan?: string // indikasi / keterangan tambahan
  attachments?: { id?: string; name: string; type: string; dataUrl: string }[]
  created_at?: string
  updated_at?: string
}

export const db = new Dexie('doctoid') as Dexie & {
  patients: EntityTable<Patient, 'id'>
  progressNotes: EntityTable<ProgressNote, 'id'>
  doctorPreferences: EntityTable<DoctorPreference, 'id'>
  hospitals: EntityTable<Hospital, 'id'>
  wards: EntityTable<Ward, 'id'>
  templates: EntityTable<Template, 'id'>
  regexRules: EntityTable<RegexRule, 'id'>
  therapyHistory: EntityTable<TherapyHistoryEntry, 'id'>
  brainstormDraft: EntityTable<BrainstormDraft, 'id'>
  penunjang: EntityTable<PenunjangItem, 'id'>
}

db.version(1).stores({
  patients: '++id, hospital_id, status_rawat, lokasi_sekarang, jaminan, no_rm',
  progressNotes: '++id, patient_id, tanggal, [patient_id+tanggal]',
  doctorPreferences: '++id, konteks',
  hospitals: '++id',
  wards: '++id, hospital_id',
  templates: '++id',
})

db.version(2).stores({
  regexRules: '++id, field, hospital_id',
})

db.version(3).stores({
  therapyHistory: '++id, nama_item',
})

db.version(4).stores({
  brainstormDraft: 'id',
})

db.version(5).stores({
  penunjang: '++id, patient_id, kategori, tanggal, status',
})
