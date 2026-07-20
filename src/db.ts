import Dexie, { type EntityTable } from 'dexie'

export type Jaminan = 'BPJS' | 'Umum' | 'Asuransi'
export type StatusRawat = 'aktif' | 'krs'
export type KategoriTerapi = 'Farmakologi' | 'Non-Farmakologi' | 'Diagnostik' | 'Monitoring'

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

export interface Patient {
  id?: number
  hospital_id: number
  title: string
  nama_depan: string
  usia: string
  no_rm: string
  tgl_mrs: string // ISO date
  tgl_onset: string // ISO date — dasar hitung "Stroke Hari ke-X"
  diagnosis_utama: string
  lokasi_sekarang: number // ward id
  status_rawat: StatusRawat
  jaminan: Jaminan
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
  icd9_code?: string
  attachments?: { name: string; type: string; dataUrl: string }[]
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

export const db = new Dexie('doctoid') as Dexie & {
  patients: EntityTable<Patient, 'id'>
  progressNotes: EntityTable<ProgressNote, 'id'>
  doctorPreferences: EntityTable<DoctorPreference, 'id'>
  hospitals: EntityTable<Hospital, 'id'>
  wards: EntityTable<Ward, 'id'>
  templates: EntityTable<Template, 'id'>
}

db.version(1).stores({
  patients: '++id, hospital_id, status_rawat, lokasi_sekarang, jaminan, no_rm',
  progressNotes: '++id, patient_id, tanggal, [patient_id+tanggal]',
  doctorPreferences: '++id, konteks',
  hospitals: '++id',
  wards: '++id, hospital_id',
  templates: '++id',
})
