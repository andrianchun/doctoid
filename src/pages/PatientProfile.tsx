import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Pill, HeartPulse, ClipboardCopy, X, Send,
  Loader2, LogOut, RotateCcw, Check, History, Sparkles, Activity, ShieldCheck, Stethoscope,
  Mic, Eye, EyeOff, Pencil, Trash2, Plus, CheckSquare, Square,
  FlaskConical, Image as ImageIcon, Upload, AlertTriangle, ArrowLeftRight
} from 'lucide-react'
import {
  db,
  type TerapiItem,
  type KategoriTerapi,
  type KategoriPenunjang,
  type PenunjangItem,
  type Jaminan,
  type StatusRawat,
  type KeteranganKrs,
  type PeranRawat,
  type ProgressNote,
  type Patient,
  type Ward,
  type Hospital,
} from '../db'
import { appCache, cachePatient } from '../utils/dataCache'
import { triggerCloudSync } from '../sync'
import Masked from '../components/Masked'
import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'
import { chatPasien, type ChatMsg } from '../ai'
import { applyMicroUpdate } from '../microUpdate'
import { formatDate, getLocalDateString } from '../utils/dateFormat'
import VisiteModal from '../components/VisiteModal'
import DateInput from '../components/DateInput'
import { useBodyScrollLock } from '../utils/useBodyScrollLock'
import ClinicalTrendingView from '../components/ClinicalTrendingView'
import PredictiveInput from '../components/PredictiveInput'
import { extractClinicalMetrics } from '../utils/clinicalExtractor'

const hariKe = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1)

const PARENTERAL = /\binj\b|injeksi|drip|\biv\b|infus|\bamp\b|bolus|syringe|titrasi|pump|nebul/i

const KATEGORI_OPTIONS: KategoriTerapi[] = [
  'Farmakologi',
  'Non-Farmakologi',
  'Diagnostik',
  'Monitoring',
  'Edukasi',
]

function guessKategori(nama: string): KategoriPenunjang {
  const n = nama.toLowerCase()
  if (/\b(ct|rontgen|ro|x-ray|xray|mri|usg|thorax|bno|foto|angio|msct|scan)\b/i.test(n)) {
    return 'Radiologi'
  }
  if (/\b(dl|darah|urin|lab|gda|gds|gdp|elektrolit|sgot|sgpt|ureum|kreatinin|cr|lipid|kolesterol|tg|hba1c|crp|ast|alt|wbc|hgb|plt|hbsag|anti-hcv|troponin|ckmb|d-dimer)\b/i.test(n)) {
    return 'Laboratorium'
  }
  return 'Lainnya'
}

const LAB_SUGGESTIONS = [
  'Darah Lengkap (DL)', 'GDA / GDS', 'Ureum / Kreatinin', 'Elektrolit (Na/K/Cl)',
  'Profil Lipid (Kol/TG/HDL/LDL)', 'SGOT / SGPT', 'Urinalisis Lengkap', 'Koagulasi (PT/APTT/INR)',
  'HbA1c', 'Analisa Gas Darah (AGD)', 'Troponin I / T', 'D-Dimer'
]
const RADIOLOGI_SUGGESTIONS = [
  'CT-Scan Kepala Non-Kontras', 'Foto Thorax AP', 'MRI Kepala & MRA', 'USG Abdomen',
  'USG Doppler Carotis', 'CT-Scan Kepala dg Kontras', 'Foto BNO / Polos Abdomen', 'Echocardiografi'
]
const LAINNYA_SUGGESTIONS = [
  'EKG 12 Lead', 'EEG (Elektroensefalografi)', 'EMG / NCV', 'Lumbal Pungsi',
  'Endoskopi', 'Funduskopi'
]

export const DEPT_ALIH_RAWAT = [
  'Bedah Saraf',
  'IPD',
  'Paru',
  'Kardio',
  'Anestesi',
  'Ortopedi',
  'Anak',
  'Obgyn',
  'Bedah Umum',
  'Bedah Plastik',
  'Urologi',
]

export const RS_RUJUKAN = [
  'RSUD Dr. Soetomo',
  'RSUP Dr. Sardjito',
  'RSUP Dr. Kariadi',
  'RS Jantung Harapan Kita',
  'RS PON (Pusat Otak Nasional)',
  'RS Tipe A Terdekat',
  'RS Tipe B Terdekat',
]

function TerapiRow({
  item,
  index,
  noteId,
  noteDate,
  resultText,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  item: TerapiItem
  index: number
  noteId: number
  noteDate: string
  resultText?: string
  onEdit?: (item: TerapiItem, index: number, noteId: number) => void
  onDelete?: (index: number, noteId: number) => void
  onToggleStatus?: (index: number, noteId: number) => void
}) {
  const isDiagnostic = item.kategori === 'Diagnostik'
  const baru = item.status === 'aktif' && item.tgl_mulai === noteDate
  const isStopped = item.status === 'stop'

  return (
    <div className="group flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-surface/60 transition-colors gap-2">
      <div className="min-w-0 flex-1 flex items-center gap-2">
        {isDiagnostic && onToggleStatus && (
          <button
            type="button"
            onClick={() => onToggleStatus(index, noteId)}
            className="cursor-pointer text-ink-muted hover:text-primary transition-colors shrink-0"
            title={isStopped ? 'Tandai belum dilakukan' : 'Tandai sudah dilakukan'}
          >
            {isStopped ? (
              <CheckSquare size={16} className="text-emerald-600" />
            ) : (
              <Square size={16} className="text-slate-400" />
            )}
          </button>
        )}
        <div className="min-w-0 flex-1">
          {isDiagnostic ? (
            <p className="text-xs leading-snug">
              <span className={`font-bold ${isStopped ? 'line-through text-ink-muted/70' : 'text-ink'}`}>
                {item.nama_item}
              </span>
              {resultText ? (
                <span className="text-primary font-medium ml-1.5">: {resultText}</span>
              ) : item.dosis_keterangan ? (
                <span className="text-ink-muted ml-1.5">({item.dosis_keterangan})</span>
              ) : (
                <span className="text-amber-600 font-medium ml-1.5 text-[11px]">(Menunggu hasil)</span>
              )}
            </p>
          ) : isStopped ? (
            <p className="text-xs text-ink-muted/70">
              <del className="text-rose-500/80">
                {item.nama_item} {item.dosis_keterangan}
              </del>{' '}
              <span className="caption text-[11px] text-rose-600 font-semibold">
                (stop {formatDate(item.tgl_stop)})
              </span>
            </p>
          ) : (
            <p className="text-xs text-ink leading-snug">
              <b className="font-bold">{item.nama_item}</b>{' '}
              <span className="text-ink-muted">{item.dosis_keterangan}</span>
              {item.icd9 && (
                <span className="ml-1.5 font-mono caption font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[10px]">
                  ICD-9: {item.icd9}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {baru && (
          <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 text-[10px] font-bold">
            + Baru
          </span>
        )}

        {!isDiagnostic && onToggleStatus && (
          <button
            type="button"
            onClick={() => onToggleStatus(index, noteId)}
            title={isStopped ? 'Aktifkan kembali terapi' : 'Hentikan obat/terapi ini'}
            aria-label={isStopped ? 'Aktifkan kembali' : 'Stop obat'}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              isStopped
                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                : 'text-ink-muted hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            {isStopped ? 'Re-aktif' : 'Stop'}
          </button>
        )}

        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(item, index, noteId)}
            title="Edit item terapi"
            aria-label="Edit item terapi"
            className="p-1 rounded-lg text-ink-muted hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          >
            <Pencil size={13} />
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(index, noteId)}
            title="Hapus item terapi"
            aria-label="Hapus item terapi"
            className="p-1 rounded-lg text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function PatientProfile() {
  const { id } = useParams()
  const pid = Number(id)
  const location = useLocation()
  const navState = (location.state || {}) as {
    patient?: Patient
    latestNote?: ProgressNote
    latestNoteWithS?: ProgressNote
    ward?: Ward
    hospital?: Hospital
  }

  // Pre-seed from navState or appCache to eliminate frame-0 rendering flicker
  const initialPatient = navState.patient || (pid ? appCache.patientsMap.get(pid) : undefined)
  const initialNotes = (pid && appCache.notesMap.has(pid))
    ? appCache.notesMap.get(pid)!
    : (navState.latestNote ? [navState.latestNote] : [])
  const initialWard = navState.ward || (initialPatient?.lokasi_sekarang ? appCache.wardsMap.get(initialPatient.lokasi_sekarang) : undefined)
  const initialHospital = navState.hospital || (initialPatient?.hospital_id ? appCache.hospitalsMap.get(initialPatient.hospital_id) : undefined)

  const patient = useLiveQuery(() => db.patients.get(pid), [pid], initialPatient)
  const notes = useLiveQuery(
    () => db.progressNotes.where('patient_id').equals(pid).sortBy('tanggal'),
    [pid],
    initialNotes,
  )
  const ward = useLiveQuery(
    () => (patient ? db.wards.get(patient.lokasi_sekarang) : undefined),
    [patient?.lokasi_sekarang],
    initialWard,
  )
  const hospital = useLiveQuery(
    () => (patient ? db.hospitals.get(patient.hospital_id) : undefined),
    [patient?.hospital_id],
    initialHospital,
  )
  const allHospitals = useLiveQuery(() => db.hospitals.toArray(), [], appCache.hospitals || [])
  const allWards = useLiveQuery(() => db.wards.toArray(), [], appCache.wards || [])

  // Update in-memory cache when fresh data arrives
  useEffect(() => {
    if (patient) cachePatient(patient)
  }, [patient])

  useEffect(() => {
    if (notes && pid) {
      appCache.notesMap.set(pid, notes)
      if (notes.length > 0) {
        appCache.latestNoteMap.set(pid, notes[notes.length - 1])
      }
    }
  }, [notes, pid])

  const navigate = useNavigate()
  const { unmasked, setUnmasked } = useUi()
  const [toast, setToast] = useState('')
  const [krsText, setKrsText] = useState('')
  const [visiteModalOpen, setVisiteModalOpen] = useState(false)
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  /* Biometrik */
  const handleToggleMask = async () => {
    if (unmasked) {
      setUnmasked(false)
    } else {
      const ok = await verifyBiometric()
      if (ok) setUnmasked(true)
    }
  }

  /* CRUD Data Pasien */
  const [showEditPatientModal, setShowEditPatientModal] = useState(false)
  const [editPatientForm, setEditPatientForm] = useState({
    title: 'Tn.',
    nama_depan: '',
    usia: '',
    no_rm: '',
    diagnosis_utama: '',
    hospital_id: 0,
    lokasi_sekarang: 0,
    status_rawat: 'aktif' as StatusRawat,
    keterangan_krs: 'Izin Dokter' as KeteranganKrs,
    detail_krs: '',
    tgl_krs: '',
    jaminan: 'BPJS' as Jaminan,
    tgl_mrs: '',
    tgl_onset: '',
    peran_rawat: 'Leader' as PeranRawat,
    dpjp_utama: 'Neuro',
    tim_raber: [] as string[],
  })

  const openEditPatientModal = () => {
    if (!patient) return
    setEditPatientForm({
      title: patient.title || 'Tn.',
      nama_depan: patient.nama_depan || (patient as any).inisial || '',
      usia: (patient.usia || '').replace(/\s*(th|tahun)\b/gi, '').trim(),
      no_rm: patient.no_rm || '',
      diagnosis_utama: patient.diagnosis_utama || '',
      hospital_id: patient.hospital_id || 0,
      lokasi_sekarang: patient.lokasi_sekarang || 0,
      status_rawat: patient.status_rawat || 'aktif',
      keterangan_krs: patient.keterangan_krs || 'Izin Dokter',
      detail_krs: patient.detail_krs || '',
      tgl_krs: patient.tgl_krs ? patient.tgl_krs.slice(0, 10) : getLocalDateString(),
      jaminan: patient.jaminan || 'BPJS',
      tgl_mrs: patient.tgl_mrs ? patient.tgl_mrs.slice(0, 10) : '',
      tgl_onset: patient.tgl_onset ? patient.tgl_onset.slice(0, 10) : '',
      peran_rawat: (patient.peran_rawat || 'Leader') as PeranRawat,
      dpjp_utama: patient.dpjp_utama || 'Neuro',
      tim_raber: patient.tim_raber || [],
    })
    setShowEditPatientModal(true)
  }

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient) return
    const newWardId = Number(editPatientForm.lokasi_sekarang)
    let newOrder = patient.order
    if (newWardId !== patient.lokasi_sekarang) {
      const wardCount = await db.patients
        .where('lokasi_sekarang')
        .equals(newWardId)
        .filter((p) => p.status_rawat === 'aktif')
        .count()
      newOrder = wardCount + 1
    }

    const updatedPatient: Patient = {
      ...patient,
      title: editPatientForm.title,
      nama_depan: editPatientForm.nama_depan.trim(),
      usia: editPatientForm.usia.trim() ? `${editPatientForm.usia.trim()} th` : '',
      no_rm: editPatientForm.no_rm.trim(),
      diagnosis_utama: editPatientForm.diagnosis_utama.trim(),
      hospital_id: Number(editPatientForm.hospital_id),
      lokasi_sekarang: newWardId,
      status_rawat: editPatientForm.status_rawat,
      keterangan_krs: editPatientForm.status_rawat === 'krs' ? editPatientForm.keterangan_krs : undefined,
      detail_krs: editPatientForm.status_rawat === 'krs' ? editPatientForm.detail_krs.trim() || undefined : undefined,
      tgl_krs: editPatientForm.status_rawat === 'krs' ? editPatientForm.tgl_krs : undefined,
      jaminan: editPatientForm.jaminan,
      tgl_mrs: editPatientForm.tgl_mrs,
      tgl_onset: editPatientForm.tgl_onset,
      peran_rawat: editPatientForm.peran_rawat,
      dpjp_utama: editPatientForm.dpjp_utama || 'Neuro',
      tim_raber: editPatientForm.tim_raber,
      order: newOrder,
    }
    cachePatient(updatedPatient)

    await db.patients.update(pid, {
      title: editPatientForm.title,
      nama_depan: editPatientForm.nama_depan.trim(),
      usia: editPatientForm.usia.trim() ? `${editPatientForm.usia.trim()} th` : '',
      no_rm: editPatientForm.no_rm.trim(),
      diagnosis_utama: editPatientForm.diagnosis_utama.trim(),
      hospital_id: Number(editPatientForm.hospital_id),
      lokasi_sekarang: newWardId,
      status_rawat: editPatientForm.status_rawat,
      keterangan_krs: editPatientForm.status_rawat === 'krs' ? editPatientForm.keterangan_krs : undefined,
      detail_krs: editPatientForm.status_rawat === 'krs' ? editPatientForm.detail_krs.trim() || undefined : undefined,
      tgl_krs: editPatientForm.status_rawat === 'krs' ? editPatientForm.tgl_krs : undefined,
      jaminan: editPatientForm.jaminan,
      tgl_mrs: editPatientForm.tgl_mrs,
      tgl_onset: editPatientForm.tgl_onset,
      peran_rawat: editPatientForm.peran_rawat,
      dpjp_utama: editPatientForm.dpjp_utama || 'Neuro',
      tim_raber: editPatientForm.tim_raber,
      order: newOrder,
    })
    triggerCloudSync(50)
    notify('Data pasien berhasil diperbarui ✓')
    setShowEditPatientModal(false)
  }

  const handleDeletePatient = async () => {
    if (!patient) return
    const nama = patient.nama_depan || (patient as any).inisial || 'pasien ini'
    if (window.confirm(`Yakin ingin menghapus seluruh data rekam medis ${patient.title || ''} ${nama}? Tindakan ini tidak dapat dibatalkan.`)) {
      await db.progressNotes.where('patient_id').equals(pid).delete()
      await db.patients.delete(pid)
      notify('Data pasien berhasil dihapus')
      navigate('/rekammedis', { replace: true })
    }
  }

  /* CRUD Pemeriksaan Penunjang (Lab, Radiologi, Penunjang Lain) */
  const rawPenunjang = useLiveQuery(
    () => (pid ? db.penunjang.where('patient_id').equals(pid).reverse().sortBy('tanggal') : []),
    [pid]
  )
  const penunjangList = useMemo(() => rawPenunjang || [], [rawPenunjang])

  const [activeProfileTab, setActiveProfileTab] = useState<'semua' | 'terapi' | 'tren' | 'penunjang' | 'cppt'>('semua')
  const [penunjangFilter, setPenunjangFilter] = useState<'semua' | 'Laboratorium' | 'Radiologi' | 'Lainnya' | 'menunggu'>('semua')
  const [showAddPenunjangModal, setShowAddPenunjangModal] = useState(false)
  const [penunjangForm, setPenunjangForm] = useState<{
    id?: number
    kategori: KategoriPenunjang
    nama_pemeriksaan: string
    tanggal: string
    status: 'selesai' | 'menunggu'
    hasil: string
    catatan: string
    attachments: { id?: string; name: string; type: string; dataUrl: string }[]
  }>({
    kategori: 'Laboratorium',
    nama_pemeriksaan: '',
    tanggal: getLocalDateString(),
    status: 'selesai',
    hasil: '',
    catatan: '',
    attachments: [],
  })

  const [showQuickHasilModal, setShowQuickHasilModal] = useState(false)
  const [quickHasilItem, setQuickHasilItem] = useState<PenunjangItem | null>(null)
  const [quickHasilText, setQuickHasilText] = useState('')
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null)

  const openAddPenunjang = (defaultKategori: KategoriPenunjang = 'Laboratorium', defaultName = '') => {
    setPenunjangForm({
      kategori: defaultKategori,
      nama_pemeriksaan: defaultName,
      tanggal: getLocalDateString(),
      status: 'selesai',
      hasil: '',
      catatan: '',
      attachments: [],
    })
    setShowAddPenunjangModal(true)
  }

  const openEditPenunjang = (item: PenunjangItem) => {
    setPenunjangForm({
      id: item.id,
      kategori: item.kategori,
      nama_pemeriksaan: item.nama_pemeriksaan,
      tanggal: item.tanggal,
      status: item.status,
      hasil: item.hasil || '',
      catatan: item.catatan || '',
      attachments: item.attachments || [],
    })
    setShowAddPenunjangModal(true)
  }

  const handleSavePenunjang = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pid || !penunjangForm.nama_pemeriksaan.trim()) return

    if (penunjangForm.id) {
      await db.penunjang.update(penunjangForm.id, {
        kategori: penunjangForm.kategori,
        nama_pemeriksaan: penunjangForm.nama_pemeriksaan.trim(),
        tanggal: penunjangForm.tanggal,
        status: penunjangForm.status,
        hasil: penunjangForm.hasil.trim(),
        catatan: penunjangForm.catatan.trim(),
        attachments: penunjangForm.attachments,
        updated_at: new Date().toISOString(),
      })
      notify('Pemeriksaan penunjang berhasil diperbarui ✓')
    } else {
      await db.penunjang.add({
        patient_id: pid,
        kategori: penunjangForm.kategori,
        nama_pemeriksaan: penunjangForm.nama_pemeriksaan.trim(),
        tanggal: penunjangForm.tanggal || getLocalDateString(),
        status: penunjangForm.status,
        hasil: penunjangForm.hasil.trim(),
        catatan: penunjangForm.catatan.trim(),
        attachments: penunjangForm.attachments,
        created_at: new Date().toISOString(),
      })
      notify('Pemeriksaan penunjang berhasil ditambahkan ✓')
    }
    setShowAddPenunjangModal(false)
  }

  const handleDeletePenunjang = async (id: number, nama: string) => {
    if (window.confirm(`Hapus pemeriksaan penunjang "${nama}"?`)) {
      await db.penunjang.delete(id)
      notify(`Pemeriksaan "${nama}" dihapus`)
    }
  }

  const openQuickHasil = (item: PenunjangItem) => {
    setQuickHasilItem(item)
    setQuickHasilText(item.hasil || '')
    setShowQuickHasilModal(true)
  }

  const handleSaveQuickHasil = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickHasilItem?.id || !quickHasilText.trim()) return
    await db.penunjang.update(quickHasilItem.id, {
      hasil: quickHasilText.trim(),
      status: 'selesai',
      updated_at: new Date().toISOString(),
    })
    notify(`Hasil ${quickHasilItem.nama_pemeriksaan} berhasil disimpan ✓`)
    setShowQuickHasilModal(false)
    setQuickHasilItem(null)
    setQuickHasilText('')
  }

  const handleAttachPenunjangFile = (file: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setPenunjangForm((prev) => ({
        ...prev,
        attachments: [
          ...prev.attachments,
          {
            id: Math.random().toString(36).slice(2),
            name: file.name,
            type: file.type,
            dataUrl,
          },
        ],
      }))
    }
    reader.readAsDataURL(file)
  }

  const handleRemovePenunjangAttachment = (index: number) => {
    setPenunjangForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }))
  }

  const handleImportFromCppt = async () => {
    if (!pid || !notes || notes.length === 0) {
      notify('Tidak ada catatan CPPT untuk diimpor')
      return
    }
    const latestNote = notes[notes.length - 1]
    const imported: string[] = []

    // 1. Tarik dari P (Diagnostik)
    const pDiag = latestNote.P.filter((p) => p.kategori === 'Diagnostik')
    for (const it of pDiag) {
      const lower = it.nama_item.toLowerCase().trim()
      const already = penunjangList.some((p) => p.nama_pemeriksaan.toLowerCase().trim() === lower)
      if (!already) {
        await db.penunjang.add({
          patient_id: pid,
          kategori: guessKategori(it.nama_item),
          nama_pemeriksaan: it.nama_item.trim(),
          tanggal: latestNote.tanggal,
          status: it.dosis_keterangan?.trim() ? 'selesai' : 'menunggu',
          hasil: it.dosis_keterangan?.trim() || '',
          created_at: new Date().toISOString(),
        })
        imported.push(it.nama_item)
      }
    }

    // 2. Tarik dari O_penunjang jika ada baris berformat "Item: Hasil"
    if (latestNote.O_penunjang?.trim()) {
      const lines = latestNote.O_penunjang.split('\n').map((l) => l.trim()).filter(Boolean)
      for (const line of lines) {
        const cleanLine = line.replace(/^[-•*]\s*/, '')
        const match = cleanLine.match(/^([^:\n]+):\s*(.+)$/)
        if (match) {
          const testName = match[1].trim()
          const testResult = match[2].trim()
          const lower = testName.toLowerCase()
          const already = penunjangList.some((p) => p.nama_pemeriksaan.toLowerCase().trim() === lower)
          if (!already && testName.length < 50) {
            await db.penunjang.add({
              patient_id: pid,
              kategori: guessKategori(testName),
              nama_pemeriksaan: testName,
              tanggal: latestNote.tanggal,
              status: 'selesai',
              hasil: testResult,
              created_at: new Date().toISOString(),
            })
            imported.push(testName)
          }
        }
      }
    }

    if (imported.length > 0) {
      notify(`Berhasil mengimpor ${imported.length} pemeriksaan penunjang dari CPPT ✓`)
    } else {
      notify('Semua pemeriksaan dari CPPT sudah tercatat di penunjang')
    }
  }

  const filteredPenunjang = useMemo(() => {
    if (penunjangFilter === 'menunggu') {
      return penunjangList.filter((p) => p.status === 'menunggu')
    }
    if (penunjangFilter !== 'semua') {
      return penunjangList.filter((p) => p.kategori === penunjangFilter)
    }
    return penunjangList
  }, [penunjangList, penunjangFilter])

  /* CRUD Item Terapi */
  const [editingTerapi, setEditingTerapi] = useState<{
    noteId: number
    index: number
    item: TerapiItem
  } | null>(null)

  const [addingTerapiNoteId, setAddingTerapiNoteId] = useState<number | null>(null)
  const [newTerapiForm, setNewTerapiForm] = useState<TerapiItem>({
    nama_item: '',
    dosis_keterangan: '',
    status: 'aktif',
    kategori: 'Farmakologi',
    tgl_mulai: getLocalDateString(),
    tgl_stop: null,
  })

  const openEditTerapi = (item: TerapiItem, index: number, noteId: number) => {
    setEditingTerapi({ noteId, index, item: { ...item } })
  }

  const handleSaveEditTerapi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTerapi) return
    const targetNote = notes.find((n) => n.id === editingTerapi.noteId)
    if (!targetNote) return
    const newP = [...targetNote.P]
    newP[editingTerapi.index] = { ...editingTerapi.item }
    await db.progressNotes.update(editingTerapi.noteId, { P: newP })
    notify('Terapi diperbarui ✓')
    setEditingTerapi(null)
  }

  const handleDeleteTerapi = async (index: number, noteId: number) => {
    const targetNote = notes.find((n) => n.id === noteId)
    if (!targetNote) return
    const newP = targetNote.P.filter((_, idx) => idx !== index)
    await db.progressNotes.update(noteId, { P: newP })
    notify('Item terapi dihapus ✓')
  }

  const handleToggleTerapiStatus = async (index: number, noteId: number) => {
    const targetNote = notes.find((n) => n.id === noteId)
    if (!targetNote) return
    const item = targetNote.P[index]
    const newP = [...targetNote.P]
    const isDiag = item.kategori === 'Diagnostik'
    if (item.status === 'aktif') {
      newP[index] = {
        ...item,
        status: 'stop',
        tgl_stop: getLocalDateString(),
      }
      notify(isDiag ? `PDx "${item.nama_item}" ditandai sudah dilakukan ✓` : `Terapi "${item.nama_item}" dihentikan (stop)`)
    } else {
      newP[index] = {
        ...item,
        status: 'aktif',
        tgl_stop: null,
      }
      notify(isDiag ? `PDx "${item.nama_item}" ditandai belum dilakukan` : `Terapi "${item.nama_item}" diaktifkan kembali`)
    }
    await db.progressNotes.update(noteId, { P: newP })
  }

  const handleAddTerapi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addingTerapiNoteId || !newTerapiForm.nama_item.trim()) return
    const targetNote = notes.find((n) => n.id === addingTerapiNoteId)
    if (!targetNote) return
    const newP = [
      ...targetNote.P,
      {
        ...newTerapiForm,
        nama_item: newTerapiForm.nama_item.trim(),
        dosis_keterangan: newTerapiForm.dosis_keterangan.trim(),
      },
    ]
    await db.progressNotes.update(addingTerapiNoteId, { P: newP })
    notify('Item terapi ditambahkan ✓')
    setAddingTerapiNoteId(null)
    setNewTerapiForm({
      nama_item: '',
      dosis_keterangan: '',
      status: 'aktif',
      kategori: 'Farmakologi',
      tgl_mulai: getLocalDateString(),
      tgl_stop: null,
    })
  }

  /* CRUD Catatan CPPT */
  const [editingNote, setEditingNote] = useState<{
    id: number
    tanggal: string
    S: string
    O_pemfis: string
    O_penunjang: string
    A: string
    catatan: string
  } | null>(null)

  const openEditNote = (n: ProgressNote) => {
    setEditingNote({
      id: n.id!,
      tanggal: n.tanggal,
      S: n.S || '',
      O_pemfis: n.O_pemfis || '',
      O_penunjang: n.O_penunjang || '',
      A: Array.isArray(n.A) ? n.A.map((a) => a.nama_diagnosis).join('\n') : String(n.A || ''),
      catatan: n.catatan || '',
    })
  }

  const handleSaveEditNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingNote) return
    const targetNote = notes.find((n) => n.id === editingNote.id)
    if (!targetNote) return

    const aItems = editingNote.A.split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((diag, i) => ({
        kategori: (i === 0 ? 'Utama' : 'Sekunder') as 'Utama' | 'Sekunder',
        nama_diagnosis: diag,
        icd10: '',
      }))

    const metrics = extractClinicalMetrics({
      S: editingNote.S.trim(),
      O_pemfis: editingNote.O_pemfis.trim(),
      O_penunjang: editingNote.O_penunjang.trim(),
    })

    await db.progressNotes.update(editingNote.id, {
      tanggal: editingNote.tanggal,
      S: editingNote.S.trim(),
      O_pemfis: editingNote.O_pemfis.trim(),
      O_penunjang: editingNote.O_penunjang.trim(),
      A: aItems.length > 0 ? aItems : targetNote.A,
      catatan: editingNote.catatan.trim() || undefined,
      metrics,
    })
    notify('Catatan CPPT berhasil diperbarui')
    setEditingNote(null)
  }

  const handleDeleteNote = async (noteId: number, tgl: string) => {
    if (window.confirm(`Hapus catatan CPPT tanggal ${formatDate(tgl)}?`)) {
      await db.progressNotes.delete(noteId)
      notify('Catatan CPPT berhasil dihapus')
    }
  }

  /* Chat & Instruksi Mikro */
  const [chatOpen, setChatOpen] = useState(false)
  const [showKrsModal, setShowKrsModal] = useState(false)
  const [showAlihLeaderModal, setShowAlihLeaderModal] = useState(false)
  const [newLeader, setNewLeader] = useState('Neuro')
  const [isCustomDept, setIsCustomDept] = useState(false)
  const [isCustomRs, setIsCustomRs] = useState(false)
  const [krsForm, setKrsForm] = useState<{
    keterangan_krs: KeteranganKrs
    detail_krs: string
    tgl_krs: string
  }>({
    keterangan_krs: 'Izin Dokter',
    detail_krs: '',
    tgl_krs: getLocalDateString(),
  })
  useBodyScrollLock(Boolean(chatOpen || showEditPatientModal || editingTerapi || addingTerapiNoteId || editingNote || showKrsModal || showAlihLeaderModal))

  const openAlihLeaderModal = () => {
    setNewLeader(patient?.dpjp_utama || 'Neuro')
    setShowAlihLeaderModal(true)
  }

  const handleSaveAlihLeader = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient || !pid) return
    const isNeuro = newLeader === 'Neuro'
    const newPeran: PeranRawat = isNeuro ? 'Leader' : 'Raber'
    const updated: Patient = {
      ...patient,
      dpjp_utama: newLeader,
      peran_rawat: newPeran,
    }
    cachePatient(updated)
    await db.patients.update(pid, {
      dpjp_utama: newLeader,
      peran_rawat: newPeran,
    })
    triggerCloudSync(50)
    setShowAlihLeaderModal(false)
    notify(`DPJP Utama berhasil dialihkan ke ${newLeader} ✓`)
  }
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingEdit, setPendingEdit] = useState('')
  const [listening, setListening] = useState(false)

  const dikte = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return notify('Browser tidak mendukung dikte suara.')
    const rec = new SR()
    rec.lang = 'id-ID'
    rec.onresult = (e: SpeechRecognitionEvent) => {
      setPendingEdit((prev) => (prev ? `${prev}, ${e.results[0][0].transcript}` : e.results[0][0].transcript))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.start()
    setListening(true)
  }

  if (!patient) {
    return (
      <main className="space-y-5 p-5 animate-pulse">
        <div className="glass-blue-hero rounded-3xl p-6 h-56 bg-primary/20" />
        <div className="rounded-3xl glass-card p-6 h-48 bg-slate-100" />
      </main>
    )
  }

  const latest = notes[notes.length - 1]
  const farmako = latest?.P.filter((p) => p.kategori === 'Farmakologi') ?? []
  const nonFarmako = latest?.P.filter((p) => p.kategori === 'Non-Farmakologi') ?? []
  const diagnostik = latest?.P.filter((p) => p.kategori === 'Diagnostik') ?? []
  const monitoring = latest?.P.filter((p) => p.kategori === 'Monitoring') ?? []
  const edukasi = latest?.P.filter((p) => p.kategori === 'Edukasi') ?? []

  const cleanUsia = (patient.usia || '').replace(/\s*(th|tahun)\b/gi, '').trim()

  const generateKrs = async () => {
    const aktif = (latest?.P ?? []).filter((p) => p.status === 'aktif' && p.kategori === 'Farmakologi')
    const oral = aktif.filter((p) => !PARENTERAL.test(`${p.nama_item} ${p.dosis_keterangan}`))
    const parenteral = aktif.filter((p) => PARENTERAL.test(`${p.nama_item} ${p.dosis_keterangan}`))
    const lines = [
      `*Obat KRS — ${(patient as any).title ? (patient as any).title + ' ' : ''}${patient.nama_depan || (patient as any).inisial}${patient.no_rm ? ` (RM ${patient.no_rm})` : ''}*`,
      `Dx: ${patient.diagnosis_utama}`,
      '',
      ...oral.map((p, i) => `${i + 1}. ${p.nama_item} ${p.dosis_keterangan}`.trim()),
      ...(parenteral.length
        ? ['', '_Perlu konversi ke sediaan oral (mohon konfirmasi DPJP):_', ...parenteral.map((p) => `- ${p.nama_item} ${p.dosis_keterangan}`.trim())]
        : []),
      '',
      'Mohon disiapkan, terima kasih 🙏',
    ]
    const text = lines.join('\n')
    setKrsText(text)
    try {
      await navigator.clipboard.writeText(text)
      notify('Daftar obat KRS tersalin ✓ — siap kirim WhatsApp')
    } catch {
      notify('Clipboard tidak tersedia — salin manual dari kotak')
    }
  }

  const openKrsModal = () => {
    const defaultDetail = patient?.detail_krs || ''
    setKrsForm({
      keterangan_krs: patient?.keterangan_krs || 'Izin Dokter',
      detail_krs: defaultDetail,
      tgl_krs: patient?.status_rawat === 'krs' && patient?.tgl_krs ? patient.tgl_krs.slice(0, 10) : getLocalDateString(),
    })
    setIsCustomDept(Boolean(defaultDetail && !DEPT_ALIH_RAWAT.includes(defaultDetail)))
    setIsCustomRs(Boolean(defaultDetail && !RS_RUJUKAN.includes(defaultDetail)))
    setShowKrsModal(true)
  }

  const handleConfirmKrs = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient) return
    const updatedPatient: Patient = {
      ...patient,
      status_rawat: 'krs',
      keterangan_krs: krsForm.keterangan_krs,
      detail_krs: krsForm.detail_krs.trim() || undefined,
      tgl_krs: krsForm.tgl_krs || getLocalDateString(),
    }
    // Langsung hapus dari cache pasien aktif in-memory agar Dasbor bersih seketika
    cachePatient(updatedPatient)

    await db.patients.update(pid, {
      status_rawat: 'krs',
      keterangan_krs: krsForm.keterangan_krs,
      detail_krs: krsForm.detail_krs.trim() || undefined,
      tgl_krs: krsForm.tgl_krs || getLocalDateString(),
    })
    triggerCloudSync(50)
    setShowKrsModal(false)
    const detailLabel = krsForm.detail_krs.trim() ? ` (${krsForm.detail_krs.trim()})` : ''
    const statusLabel = krsForm.keterangan_krs === 'Meninggal'
      ? 'MD'
      : krsForm.keterangan_krs === 'APS'
      ? 'APS'
      : krsForm.keterangan_krs === 'Alih Rawat'
      ? 'Alih Rawat'
      : krsForm.keterangan_krs === 'Rujuk'
      ? 'Rujuk'
      : 'KRS'
    notify(`Pasien ditandai ${statusLabel}${detailLabel} ✓`)
  }

  const handleKembaliRawat = async () => {
    if (!patient) return
    if (!window.confirm('Kembalikan status pasien ini menjadi Rawat Inap (aktif)?')) return
    const updatedPatient: Patient = {
      ...patient,
      status_rawat: 'aktif',
    }
    delete updatedPatient.keterangan_krs
    delete updatedPatient.detail_krs
    delete updatedPatient.tgl_krs
    cachePatient(updatedPatient)

    await db.patients.put(updatedPatient)
    triggerCloudSync(50)
    notify('Pasien kembali rawat aktif ✓')
  }

  const buildKonteks = () => {
    const riwayatRawatKonteks = patient.riwayat_rawat && patient.riwayat_rawat.length > 0
      ? `\n\n[RIWAYAT RAWAT INAP TERDAHULU (REKAM MEDIS)]\n` +
        patient.riwayat_rawat.map((r, i) => {
          const outcomeLabel = r.keterangan_krs === 'Meninggal' ? 'MD' : r.keterangan_krs === 'APS' ? 'APS' : r.keterangan_krs === 'Alih Rawat' ? 'Alih Rawat' : r.keterangan_krs === 'Rujuk' ? 'Rujuk' : 'KRS'
          return `- Rawat Ke-${i + 1}: MRS ${formatDate(r.tgl_mrs)}${r.tgl_krs ? ` s/d ${outcomeLabel} ${formatDate(r.tgl_krs)}` : ''}${r.keterangan_krs && r.keterangan_krs !== 'Izin Dokter' ? ` (${r.keterangan_krs}${r.detail_krs ? `: ${r.detail_krs}` : ''})` : ''} | Dx: ${r.diagnosis_utama}${r.catatan_krs ? ` | Terapi: ${r.catatan_krs}` : ''}`
        }).join('\n')
      : ''

    return `[DATA PASIEN]\nJaminan: [${patient.jaminan}]\nDiagnosis utama: ${patient.diagnosis_utama}\nMRS: ${formatDate(patient.tgl_mrs)} (rawat hari ke-${hariKe(patient.tgl_mrs)})${patient.tgl_onset ? `\nOnset: ${formatDate(patient.tgl_onset)} (hari ke-${hariKe(patient.tgl_onset)})` : ''}${riwayatRawatKonteks}\n\n[RIWAYAT CPPT]\n` +
      notes
        .map(
          (n) =>
            `--- ${formatDate(n.tanggal)} ---\nS: ${n.S}\nO Pemfis: ${n.O_pemfis}\nO Penunjang: ${n.O_penunjang}\nA: ${Array.isArray(n.A) ? n.A.map(a => a.nama_diagnosis).join('; ') : n.A}\nP: ${n.P.map((p) => `${p.nama_item} ${p.dosis_keterangan} [${p.status}${p.kategori ? `, ${p.kategori}` : ''}]`).join('; ')}`,
        )
        .join('\n')
  }

  const kirimChat = async () => {
    if (!draft.trim() || busy) return
    const next: ChatMsg[] = [...msgs, { role: 'user', content: draft.trim() }]
    setMsgs(next)
    setDraft('')
    setBusy(true)
    setPendingEdit('')
    try {
      const reply = await chatPasien(next, buildKonteks())
      const m = reply.match(/```doctoid-edit\s*\n([\s\S]*?)```/)
      if (m) setPendingEdit(m[1].trim())
      setMsgs([...next, { role: 'assistant', content: reply.replace(/```doctoid-edit[\s\S]*?```/, '').trim() }])
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: `⚠ ${(e as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }

  const terapkanEdit = async () => {
    const { applied, ignored } = await applyMicroUpdate(pid, pendingEdit)
    notify(
      [applied.length ? `✓ ${applied.join(', ')}` : '', ignored.length ? `? ${ignored.join(', ')}` : '']
        .filter(Boolean).join(' · ') || 'Tidak ada perubahan',
    )
    setPendingEdit('')
  }

  const filteredWardsForEdit = (allWards ?? []).filter(
    (w) => w.hospital_id === Number(editPatientForm.hospital_id)
  )

  return (
    <main className="space-y-5 p-5">
      {/* Header Pasien Hero */}
      <div className="glass-blue-hero rounded-3xl p-6 text-white shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft size={15} /> Kembali
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMask}
              aria-label={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
              title={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
              className="flex size-8 cursor-pointer items-center justify-center rounded-xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
            >
              {unmasked ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              type="button"
              onClick={openEditPatientModal}
              aria-label="Edit Data Pasien"
              title="Edit Data Pasien"
              className="flex size-8 cursor-pointer items-center justify-center rounded-xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-3xl font-black text-xl text-white shadow-lg ring-4 ring-white/20"
            style={{ backgroundColor: ward?.kode_warna || '#1D4ED8' }}
          >
            {patient.nama_depan?.[0]?.toUpperCase() || (patient as any).inisial?.[0]?.toUpperCase() || 'P'}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="h1 text-2xl font-black text-white flex flex-wrap items-center gap-2">
              <span>{patient.title}</span>
              <Masked value={patient.nama_depan || (patient as any).inisial} type="name" className="text-white" />
              {cleanUsia && <span className="text-base font-medium text-white/80">({cleanUsia} th)</span>}
            </h1>

            <p className="caption text-xs font-semibold text-white/85 mt-0.5">
              No. RM: <Masked value={patient.no_rm} type="rm" />
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/10 backdrop-blur-md p-3 border border-white/20 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="caption font-semibold text-white/75 uppercase tracking-wider">Diagnosis Utama</p>
            <p className="text-sm font-bold text-white mt-0.5">{patient.diagnosis_utama}</p>
          </div>
          <button
            type="button"
            onClick={openEditPatientModal}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Edit diagnosis & data pasien"
          >
            <Pencil size={14} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 items-center">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
            {patient.jaminan}
          </span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
            {hospital?.nama} · {ward?.nama}
          </span>

          {/* Peran & Leader */}
          {patient.status_rawat === 'aktif' && (
            patient.peran_rawat === 'Raber' || (patient.dpjp_utama && patient.dpjp_utama !== 'Neuro' && patient.peran_rawat !== 'Konsul') ? (
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-indigo-500/80 text-white border border-indigo-400/50 px-3 py-1 text-xs font-bold">
                  Raber · {patient.dpjp_utama}
                </span>
                <button
                  type="button"
                  onClick={openAlihLeaderModal}
                  className="flex items-center gap-1 text-[11px] font-bold text-white/90 bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                  title="Alih DPJP Utama"
                >
                  <ArrowLeftRight size={12} /> Alih Leader
                </button>
              </div>
            ) : patient.peran_rawat === 'Konsul' ? (
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-sky-500/80 text-white border border-sky-400/50 px-3 py-1 text-xs font-bold">
                  Konsul · {patient.dpjp_utama || 'Dept Lain'}
                </span>
                <button
                  type="button"
                  onClick={openAlihLeaderModal}
                  className="flex items-center gap-1 text-[11px] font-bold text-white/90 bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                  title="Alih DPJP Utama"
                >
                  <ArrowLeftRight size={12} /> Alih Leader
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
                  Leader (Neuro)
                </span>
                {patient.tim_raber && patient.tim_raber.length > 0 && (
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white/90">
                    Raber: {patient.tim_raber.join(', ')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={openAlihLeaderModal}
                  className="flex items-center gap-1 text-[11px] font-bold text-white/90 bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                  title="Alih DPJP Utama"
                >
                  <ArrowLeftRight size={12} /> Alih Leader
                </button>
              </div>
            )
          )}

          {patient.tgl_onset && (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
              Onset OH-{hariKe(patient.tgl_onset)} ({formatDate(patient.tgl_onset)})
            </span>
          )}
          {patient.status_rawat === 'aktif' ? (
            <span className="rounded-full bg-amber-400/30 text-amber-200 border border-amber-300/40 px-3 py-1 text-xs font-bold">
              Perawatan P-{hariKe(patient.tgl_mrs)} ({formatDate(patient.tgl_mrs)})
            </span>
          ) : (
            <span className="rounded-full bg-slate-700/60 text-slate-200 border border-slate-600/60 px-3 py-1 text-xs font-bold">
              {patient.tgl_krs ? `${patient.keterangan_krs === 'Meninggal' ? 'MD' : patient.keterangan_krs === 'APS' ? 'APS' : patient.keterangan_krs === 'Alih Rawat' ? 'Alih Rawat' : patient.keterangan_krs === 'Rujuk' ? 'Rujuk' : 'KRS'} ${formatDate(patient.tgl_krs)}` : 'Sudah Keluar'}
              {patient.tgl_krs && patient.tgl_mrs ? ` · ${Math.max(1, Math.floor((new Date(patient.tgl_krs).getTime() - new Date(patient.tgl_mrs).getTime()) / 86400000) + 1)} hari rawat` : ''}
            </span>
          )}
          {patient.status_rawat === 'aktif' ? (
            <span className="rounded-full px-3 py-1 text-xs font-bold bg-emerald-400/30 text-emerald-100 border border-emerald-300/40">
              Rawat Inap
            </span>
          ) : patient.keterangan_krs === 'Meninggal' ? (
            <span className="rounded-full px-3 py-1 text-xs font-bold bg-rose-500/80 text-white border border-rose-400/50 shadow-xs">
              MD
            </span>
          ) : patient.keterangan_krs === 'APS' ? (
            <span className="rounded-full px-3 py-1 text-xs font-bold bg-amber-500/80 text-white border border-amber-400/50 shadow-xs">
              APS
            </span>
          ) : patient.keterangan_krs === 'Alih Rawat' ? (
            <span className="rounded-full px-3 py-1 text-xs font-bold bg-indigo-500/80 text-white border border-indigo-400/50 shadow-xs">
              Alih Rawat {patient.detail_krs ? `→ ${patient.detail_krs}` : ''}
            </span>
          ) : patient.keterangan_krs === 'Rujuk' ? (
            <span className="rounded-full px-3 py-1 text-xs font-bold bg-sky-500/80 text-white border border-sky-400/50 shadow-xs">
              Rujuk {patient.detail_krs ? `→ ${patient.detail_krs}` : ''}
            </span>
          ) : (
            <span className="rounded-full px-3 py-1 text-xs font-bold bg-white/30 text-white">
              KRS
            </span>
          )}
        </div>
      </div>

      {/* Tab Switcher Profil Pasien */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <button
          type="button"
          onClick={() => setActiveProfileTab('semua')}
          className={`px-3 py-1.5 rounded-2xl font-bold whitespace-nowrap cursor-pointer transition-all ${
            activeProfileTab === 'semua'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white/80 text-ink-muted hover:bg-white hover:text-ink border border-slate-200/70'
          }`}
        >
          Semua
        </button>
        <button
          type="button"
          onClick={() => setActiveProfileTab('terapi')}
          className={`px-3 py-1.5 rounded-2xl font-bold whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
            activeProfileTab === 'terapi'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white/80 text-ink-muted hover:bg-white hover:text-ink border border-slate-200/70'
          }`}
        >
          <Pill size={13} /> Terapi & Plan
        </button>
        <button
          type="button"
          onClick={() => setActiveProfileTab('tren')}
          className={`px-3 py-1.5 rounded-2xl font-bold whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
            activeProfileTab === 'tren'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white/80 text-ink-muted hover:bg-white hover:text-ink border border-slate-200/70'
          }`}
        >
          <Activity size={13} /> Tren Klinis
        </button>
        <button
          type="button"
          onClick={() => setActiveProfileTab('penunjang')}
          className={`px-3 py-1.5 rounded-2xl font-bold whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
            activeProfileTab === 'penunjang'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white/80 text-ink-muted hover:bg-white hover:text-ink border border-slate-200/70'
          }`}
        >
          <FlaskConical size={13} /> Penunjang ({penunjangList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveProfileTab('cppt')}
          className={`px-3 py-1.5 rounded-2xl font-bold whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
            activeProfileTab === 'cppt'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white/80 text-ink-muted hover:bg-white hover:text-ink border border-slate-200/70'
          }`}
        >
          <Stethoscope size={13} /> CPPT ({notes.length})
        </button>
      </div>

      {/* Terapi & Planning Berjalan */}
      {(activeProfileTab === 'semua' || activeProfileTab === 'terapi') && (
      <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between">
          <p className="h2 text-sm font-bold text-ink">Planning & Terapi Berjalan</p>
          {latest && (
            <span className="caption text-xs font-semibold text-ink-muted">
              CPPT: {formatDate(latest.tanggal)}
            </span>
          )}
        </div>

        {/* Bilah Instruksi Cepat / Micro-Update Terapi */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-surface/70 border border-slate-200/80 py-1 pl-3.5 pr-1 focus-within:bg-white focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <input
            value={pendingEdit}
            onChange={(e) => setPendingEdit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && terapkanEdit()}
            placeholder='Instruksi: mis. "stop ceftriaxone, + valsartan 1x80"'
            className="h-8 w-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-ink-muted/50 font-medium"
          />
          <button
            onClick={dikte}
            type="button"
            aria-label="Dikte suara"
            className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors ${
              listening ? 'bg-rose-100 text-rose-600' : 'text-ink-muted hover:text-ink hover:bg-white/80'
            }`}
          >
            <Mic size={15} className={listening ? 'animate-pulse' : ''} />
          </button>
          <button
            onClick={terapkanEdit}
            type="button"
            disabled={!pendingEdit.trim()}
            aria-label="Kirim instruksi"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-xs disabled:opacity-30 active:scale-95 transition-all"
          >
            <Send size={14} />
          </button>
        </div>

        {/* Tombol Tambah Item Terapi Manual */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (latest?.id) {
                setAddingTerapiNoteId(latest.id)
              } else {
                notify('Belum ada catatan CPPT aktif. Silakan gunakan instruksi di atas untuk membuat catatan hari ini.')
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={14} /> Tambah Terapi / Plan Manual
          </button>
        </div>

        {!latest?.P.length && <p className="caption text-xs text-ink-muted">Belum ada terapi aktif tercatat.</p>}
        
        {/* PDX */}
        {diagnostik.length > 0 && (
          <div className="space-y-1.5">
            <p className="h3 flex items-center gap-1.5 text-xs font-bold text-sky-600">
              <Stethoscope size={14} /> Plan Diagnostik & Prosedur (PDX)
            </p>
            <div className="space-y-1 pl-1 divide-y divide-surface">
              {diagnostik.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
            </div>
          </div>
        )}

        {/* PTX Farmakologi */}
        {farmako.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-surface">
            <p className="h3 flex items-center gap-1.5 text-xs font-bold text-primary">
              <Pill size={14} /> Terapi Farmakologi (PTX)
            </p>
            <div className="space-y-1 pl-1 divide-y divide-surface">
              {farmako.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
            </div>
          </div>
        )}

        {/* PTX Non-Farmakologi */}
        {nonFarmako.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-surface">
            <p className="h3 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <HeartPulse size={14} /> Terapi Non-Farmakologi
            </p>
            <div className="space-y-1 pl-1 divide-y divide-surface">
              {nonFarmako.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
            </div>
          </div>
        )}

        {/* PMX Monitoring */}
        {monitoring.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-surface">
            <p className="h3 flex items-center gap-1.5 text-xs font-bold text-amber-600">
              <Activity size={14} /> Monitoring (PMX)
            </p>
            <div className="space-y-1 pl-1 divide-y divide-surface">
              {monitoring.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
            </div>
          </div>
        )}

        {/* PEX Edukasi */}
        {edukasi.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-surface">
            <p className="h3 flex items-center gap-1.5 text-xs font-bold text-violet-600">
              <ShieldCheck size={14} /> Edukasi Pasien & Keluarga (PEX)
            </p>
            <div className="space-y-1 pl-1 divide-y divide-surface">
              {edukasi.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-3 border-t border-surface">
          <button
            onClick={generateKrs}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-4 text-xs font-bold text-white shadow-md shadow-primary/20 active:scale-95 transition-all"
          >
            <ClipboardCopy size={15} /> Salin Resep KRS WhatsApp
          </button>
          {patient.status_rawat === 'aktif' ? (
            <>
              <button
                type="button"
                onClick={openAlihLeaderModal}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-2xl bg-surface px-4 text-xs font-bold text-ink hover:bg-surface/80 active:scale-95 transition-all"
              >
                <ArrowLeftRight size={15} /> Alih Leader
              </button>
              <button
                type="button"
                onClick={openKrsModal}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-2xl bg-surface px-4 text-xs font-bold text-ink hover:bg-surface/80 active:scale-95 transition-all"
              >
                <LogOut size={15} /> Tandai KRS / Keluar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={openKrsModal}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-2xl bg-surface px-4 text-xs font-bold text-ink hover:bg-surface/80 active:scale-95 transition-all"
              >
                <Pencil size={14} /> Ubah Status ({patient.keterangan_krs === 'Meninggal' ? 'MD' : patient.keterangan_krs === 'APS' ? 'APS' : patient.keterangan_krs === 'Alih Rawat' ? 'Alih Rawat' : patient.keterangan_krs === 'Rujuk' ? 'Rujuk' : 'KRS'})
              </button>
              <button
                onClick={handleKembaliRawat}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 px-4 text-xs font-bold hover:bg-amber-100 active:scale-95 transition-all"
              >
                <RotateCcw size={15} /> Kembali Rawat Aktif
              </button>
            </>
          )}
        </div>

        {krsText && (
          <textarea
            readOnly
            value={krsText}
            rows={7}
            className="mt-2 w-full resize-y rounded-2xl border border-primary-soft/30 bg-surface/90 p-3.5 font-mono text-xs outline-none animate-in fade-in"
          />
        )}
      </div>
      )}

      {/* Tren Klinis Pasien (GCS, TTV, Motorik, Gejala) */}
      {(activeProfileTab === 'semua' || activeProfileTab === 'tren') && (
        <ClinicalTrendingView notes={notes} />
      )}

      {/* Pemeriksaan Penunjang (Lab, Radiologi, Penunjang Lain) */}
      {(activeProfileTab === 'semua' || activeProfileTab === 'penunjang') && (
      <div id="section-penunjang" className="glass-card rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <FlaskConical size={18} />
            </div>
            <div>
              <p className="h2 text-sm font-bold text-ink">Pemeriksaan Penunjang</p>
              <p className="caption text-[11px] text-ink-muted">Lab, Radiologi, & Evaluasi Diagnostik</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openAddPenunjang()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={14} /> Tambah Penunjang
          </button>
        </div>

        {/* Filter Chips Kategori */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setPenunjangFilter('semua')}
            className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-all ${
              penunjangFilter === 'semua'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface text-ink-muted hover:bg-slate-200/60'
            }`}
          >
            Semua ({penunjangList.length})
          </button>
          <button
            type="button"
            onClick={() => setPenunjangFilter('Laboratorium')}
            className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-all ${
              penunjangFilter === 'Laboratorium'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/50'
            }`}
          >
            🔬 Lab ({penunjangList.filter((p) => p.kategori === 'Laboratorium').length})
          </button>
          <button
            type="button"
            onClick={() => setPenunjangFilter('Radiologi')}
            className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-all ${
              penunjangFilter === 'Radiologi'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/50'
            }`}
          >
            🩻 Radiologi ({penunjangList.filter((p) => p.kategori === 'Radiologi').length})
          </button>
          <button
            type="button"
            onClick={() => setPenunjangFilter('Lainnya')}
            className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-all ${
              penunjangFilter === 'Lainnya'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200/60'
            }`}
          >
            📑 Lainnya ({penunjangList.filter((p) => p.kategori === 'Lainnya').length})
          </button>
          {penunjangList.some((p) => p.status === 'menunggu') && (
            <button
              type="button"
              onClick={() => setPenunjangFilter('menunggu')}
              className={`px-3 py-1 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-all ${
                penunjangFilter === 'menunggu'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
              }`}
            >
              ⏳ Menunggu ({penunjangList.filter((p) => p.status === 'menunggu').length})
            </button>
          )}
        </div>

        {/* Empty state & smart import helper */}
        {penunjangList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center space-y-2 bg-surface/30">
            <p className="text-xs text-ink-muted font-medium">Belum ada pemeriksaan penunjang tercatat untuk pasien ini.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => openAddPenunjang()}
                className="px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                + Tambah Pemeriksaan Baru
              </button>
              {(latest?.O_penunjang?.trim() || latest?.P.some((p) => p.kategori === 'Diagnostik')) && (
                <button
                  type="button"
                  onClick={handleImportFromCppt}
                  className="px-3.5 py-1.5 rounded-xl bg-surface border border-slate-200 text-ink text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
                >
                  ⚡ Tarik dari CPPT Terakhir
                </button>
              )}
            </div>
          </div>
        ) : filteredPenunjang.length === 0 ? (
          <p className="text-center py-4 text-xs text-ink-muted">Tidak ada pemeriksaan pada kategori ini.</p>
        ) : (
          <div className="space-y-2.5">
            {filteredPenunjang.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-surface bg-surface/40 p-3.5 space-y-2 hover:bg-surface/70 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        item.kategori === 'Laboratorium'
                          ? 'bg-blue-50 text-blue-700 border-blue-200/60'
                          : item.kategori === 'Radiologi'
                          ? 'bg-purple-50 text-purple-700 border-purple-200/60'
                          : 'bg-slate-100 text-slate-700 border-slate-200/60'
                      }`}
                    >
                      {item.kategori === 'Laboratorium' ? '🔬 Lab' : item.kategori === 'Radiologi' ? '🩻 Radiologi' : '📑 ' + item.kategori}
                    </span>
                    <span className="text-[11px] font-medium text-ink-muted">
                      {formatDate(item.tanggal)}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        item.status === 'selesai'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                          : 'bg-amber-50 text-amber-700 border-amber-200/60'
                      }`}
                    >
                      {item.status === 'selesai' ? '✓ Ada Hasil' : '⏳ Menunggu'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditPenunjang(item)}
                      title="Edit penunjang"
                      className="p-1 rounded-lg text-ink-muted hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePenunjang(item.id!, item.nama_pemeriksaan)}
                      title="Hapus penunjang"
                      className="p-1 rounded-lg text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-ink">{item.nama_pemeriksaan}</p>
                  {item.catatan && (
                    <p className="text-[11px] text-ink-muted/80 mt-0.5 italic">
                      Indikasi: {item.catatan}
                    </p>
                  )}
                </div>

                {item.status === 'selesai' ? (
                  <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/70 text-xs">
                    <span className="font-bold text-primary mr-1">Hasil:</span>
                    <span className="text-ink font-medium whitespace-pre-line leading-relaxed">
                      {item.hasil || '—'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 bg-amber-50/70 border border-amber-200/60 px-3 py-2 rounded-xl text-xs">
                    <span className="text-amber-800 font-medium italic text-[11px]">
                      Pemeriksaan telah dijadwalkan / sampel dikirim — belum ada hasil
                    </span>
                    <button
                      type="button"
                      onClick={() => openQuickHasil(item)}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] active:scale-95 transition-all cursor-pointer shrink-0 shadow-2xs"
                    >
                      + Isi Hasil
                    </button>
                  </div>
                )}

                {item.attachments && item.attachments.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {item.attachments.map((att, attIdx) => (
                      <button
                        key={attIdx}
                        type="button"
                        onClick={() => setPreviewImage({ url: att.dataUrl, title: `${item.nama_pemeriksaan} - ${att.name}` })}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] text-ink font-medium hover:border-primary cursor-pointer transition-colors shadow-2xs"
                      >
                        <ImageIcon size={12} className="text-primary" />
                        <span className="truncate max-w-[120px]">{att.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Riwayat Rawat Inap Terdahulu */}
      {activeProfileTab === 'semua' && patient.riwayat_rawat && patient.riwayat_rawat.length > 0 && (
        <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3">
          <p className="h2 flex items-center gap-2 text-sm font-bold text-ink">
            <History size={18} className="text-primary" />
            Riwayat Rawat Terdahulu ({patient.riwayat_rawat.length}x)
          </p>
          <div className="space-y-2.5">
            {[...patient.riwayat_rawat].reverse().map((ep, i) => {
              const h = allHospitals?.find((x) => x.id === ep.hospital_id)
              const w = allWards?.find((x) => x.id === ep.ward_id)
              const episodeIndex = patient.riwayat_rawat!.length - i
              const epOutcome = ep.keterangan_krs === 'Meninggal' ? 'MD' : ep.keterangan_krs === 'APS' ? 'APS' : ep.keterangan_krs === 'Alih Rawat' ? 'Alih Rawat' : ep.keterangan_krs === 'Rujuk' ? 'Rujuk' : 'KRS'
              return (
                <div key={ep.id || i} className="rounded-2xl border border-surface bg-surface/60 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-ink-muted">
                    <span className="h3 text-xs font-bold text-primary">Episode #{episodeIndex}</span>
                    <span className="caption font-medium">MRS: {formatDate(ep.tgl_mrs)} {ep.tgl_krs ? `→ ${epOutcome}: ${formatDate(ep.tgl_krs)}` : ''}{ep.keterangan_krs && ep.keterangan_krs !== 'Izin Dokter' ? ` (${ep.keterangan_krs}${ep.detail_krs ? `: ${ep.detail_krs}` : ''})` : ''}</span>
                  </div>
                  <p className="h2 text-sm font-bold text-ink">{ep.diagnosis_utama}</p>
                  {(h || w) && (
                    <p className="caption text-xs text-ink-muted">
                      {h?.nama}{w ? ` · ${w.nama}` : ''}
                    </p>
                  )}
                  {ep.catatan_krs && (
                    <p className="caption text-xs text-ink-muted border-t border-surface pt-1.5 mt-1">
                      <b className="text-ink">Terapi Pulang:</b> {ep.catatan_krs}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline CPPT */}
      {(activeProfileTab === 'semua' || activeProfileTab === 'cppt') && (
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <p className="h2 text-sm font-bold text-ink">Riwayat CPPT</p>
          <button
            type="button"
            onClick={() => setVisiteModalOpen(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white px-3 py-1.5 text-xs font-bold shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
          >
            <Stethoscope size={14} />
            <span>+ Visite Hari Ini</span>
          </button>
        </div>
        {[...notes].reverse().map((n) => (
          <div key={n.id} className="glass-card rounded-3xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="h3 text-xs font-bold text-primary">{formatDate(n.tanggal)}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditNote(n)}
                  title="Edit Catatan CPPT"
                  aria-label="Edit Catatan CPPT"
                  className="p-1.5 rounded-xl text-ink-muted hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(n.id!, n.tanggal)}
                  title="Hapus Catatan CPPT"
                  aria-label="Hapus Catatan CPPT"
                  className="p-1.5 rounded-xl text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {(['S', 'O_pemfis', 'O_penunjang'] as const).map((k) =>
              n[k] ? (
                <p key={k} className="body-md text-xs leading-relaxed">
                  <b className="text-ink-muted font-bold">{k === 'S' ? 'S' : k === 'O_pemfis' ? 'O - Fisik' : 'O - Penunjang'}:</b> {n[k]}
                </p>
              ) : null,
            )}
            {n.A && (
              <p className="body-md text-xs leading-relaxed">
                <b className="text-ink-muted font-bold">A:</b> {Array.isArray(n.A) ? n.A.map(a => `${a.nama_diagnosis}${a.icd10 ? ` (${a.icd10})` : ''}`).join('; ') : n.A}
              </p>
            )}
            {n.P.length > 0 && (
              <div className="mt-2 border-t border-surface pt-2 space-y-1">
                {n.P.map((it, i) => (
                  <TerapiRow
                    key={i}
                    item={it}
                    index={i}
                    noteId={n.id!}
                    noteDate={n.tanggal}
                    onEdit={openEditTerapi}
                    onDelete={handleDeleteTerapi}
                    onToggleStatus={handleToggleTerapiStatus}
                  />
                ))}
              </div>
            )}
            {n.catatan && (
              <div className="flex items-start gap-1.5 text-xs border-t border-surface/80 pt-1.5 mt-1">
                <AlertTriangle size={13} className="text-amber-500 fill-amber-400/20 shrink-0 mt-0.5" />
                <span className="text-amber-900 font-semibold break-words leading-relaxed min-w-0 flex-1">
                  {n.catatan}
                </span>
              </div>
            )}
          </div>
        ))}
        {!notes.length && (
          <div className="glass-card rounded-3xl p-6 text-center text-xs font-medium text-ink-muted">
            Belum ada catatan CPPT.
          </div>
        )}
      </div>
      )}

      {/* Floating Action Button Diskusi AI */}
      <button
        onClick={() => setChatOpen(true)}
        aria-label="Konsultasi AI tentang pasien ini"
        className="fixed bottom-24 right-5 z-40 flex size-14 cursor-pointer items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-2xl shadow-primary/40 active:scale-95 transition-all"
      >
        <Sparkles size={24} />
      </button>

      {/* Dialog Chat AI */}
      {chatOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in overscroll-contain touch-none select-none"
          onClick={() => setChatOpen(false)}
        >
          <div
            className="flex h-[82dvh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-2xl overscroll-contain touch-auto select-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface p-4">
              <div>
                <p className="h2 text-sm font-bold text-ink">Diskusi Kasus AI</p>
                <p className="caption text-xs text-ink-muted">EBM & Rasionalisasi Klinis — data identitas disensor</p>
              </div>
              <button onClick={() => setChatOpen(false)} aria-label="Tutup diskusi" className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:bg-surface transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-4">
              {!msgs.length && (
                <div className="rounded-2xl bg-surface/80 p-4 text-center text-xs text-ink-muted">
                  Tanyakan rasionalisasi EBM, evaluasi interaksi obat, atau usulkan perubahan terapi.
                </div>
              )}
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl p-3 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto bg-gradient-to-br from-primary to-primary-deep text-white shadow-sm'
                      : m.content.startsWith('⛔')
                        ? 'border border-rose-300 bg-rose-50 text-rose-800'
                        : 'bg-surface text-ink'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {busy && <Loader2 size={18} className="animate-spin text-primary mx-auto my-2" />}
              {pendingEdit && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs space-y-2">
                  <p className="font-bold text-emerald-900">AI mengusulkan pembaruan terapi:</p>
                  <p className="font-mono text-xs text-emerald-800 bg-white/80 p-2 rounded-xl border border-emerald-200">{pendingEdit}</p>
                  <button
                    onClick={terapkanEdit}
                    className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
                  >
                    <Check size={15} /> Terapkan ke CPPT Hari Ini
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && kirimChat()}
                placeholder="mis. rasionalisasi terapi antiplatelet ganda…"
                className="h-11 w-full flex-1 rounded-2xl border border-primary-soft/30 bg-surface px-3.5 text-xs outline-none focus:border-primary"
              />
              <button
                onClick={kirimChat}
                disabled={!draft.trim() || busy}
                aria-label="Kirim pertanyaan"
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/20 disabled:opacity-40 active:scale-95 transition-all"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Data Pasien */}
      {showEditPatientModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in overscroll-contain touch-none select-none"
          onClick={() => setShowEditPatientModal(false)}
        >
          <div
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl space-y-4 touch-auto select-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Edit Data Pasien</h3>
                <p className="text-[11px] text-ink-muted">Perbarui profil dan administrasi rawat</p>
              </div>
              <button type="button" onClick={() => setShowEditPatientModal(false)} className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePatient} className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Panggilan</label>
                  <select
                    value={editPatientForm.title}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, title: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    {['Tn.', 'Ny.', 'An.', 'Sdr.', 'By.', 'dr.', 'Prof.'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Nama Pasien</label>
                  <input
                    required
                    value={editPatientForm.nama_depan}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, nama_depan: e.target.value })}
                    placeholder="Nama lengkap"
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">No. RM</label>
                  <input
                    value={editPatientForm.no_rm}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, no_rm: e.target.value })}
                    placeholder="mis. 12-34-56"
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Usia (Tahun)</label>
                  <input
                    value={editPatientForm.usia}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, usia: e.target.value })}
                    placeholder="mis. 65"
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Diagnosis Utama (ICD-10)</label>
                <PredictiveInput
                  type="diagnosis"
                  required
                  value={editPatientForm.diagnosis_utama}
                  onChange={(val) => setEditPatientForm({ ...editPatientForm, diagnosis_utama: val })}
                  onSelect={(item) => setEditPatientForm({ ...editPatientForm, diagnosis_utama: item.name })}
                  placeholder="mis. Stroke Iskemik Akut, ICH, Hipertensi..."
                  className="w-full"
                  inputClassName="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Faskes / RS</label>
                  <select
                    value={editPatientForm.hospital_id}
                    onChange={(e) => {
                      const newHId = Number(e.target.value)
                      const firstW = (allWards ?? []).find((w) => w.hospital_id === newHId)
                      setEditPatientForm({
                        ...editPatientForm,
                        hospital_id: newHId,
                        lokasi_sekarang: firstW?.id || 0,
                      })
                    }}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    {allHospitals?.map((h) => (
                      <option key={h.id} value={h.id}>{h.nama}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Ruangan</label>
                  <select
                    value={editPatientForm.lokasi_sekarang}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, lokasi_sekarang: Number(e.target.value) })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    {filteredWardsForEdit.map((w) => (
                      <option key={w.id} value={w.id}>{w.nama}</option>
                    ))}
                    {!filteredWardsForEdit.length && (
                      <option value={0}>Belum ada ruangan</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Peran & DPJP Tim Rawat */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
                <label className="block text-xs font-bold text-slate-700">Peran Rawat</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Leader', 'Raber', 'Konsul'] as PeranRawat[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setEditPatientForm((f) => ({
                          ...f,
                          peran_rawat: role,
                          dpjp_utama: role === 'Leader' ? 'Neuro' : f.dpjp_utama === 'Neuro' ? 'IPD' : f.dpjp_utama,
                        }))
                      }}
                      className={`py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        editPatientForm.peran_rawat === role
                          ? role === 'Leader'
                            ? 'bg-primary text-white border-primary shadow-xs'
                            : role === 'Raber'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                {editPatientForm.peran_rawat !== 'Leader' ? (
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                      {editPatientForm.peran_rawat === 'Raber' ? 'DPJP Utama (Leader)' : 'Konsul dari (Leader)'}
                    </label>
                    <select
                      value={editPatientForm.dpjp_utama}
                      onChange={(e) => setEditPatientForm({ ...editPatientForm, dpjp_utama: e.target.value })}
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary font-semibold"
                    >
                      {DEPT_ALIH_RAWAT.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                      Spesialis Lain yang Ikut Raber (Opsional)
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {DEPT_ALIH_RAWAT.map((dept) => {
                        const isChecked = editPatientForm.tim_raber.includes(dept)
                        return (
                          <button
                            key={dept}
                            type="button"
                            onClick={() => {
                              setEditPatientForm((f) => ({
                                ...f,
                                tim_raber: isChecked
                                  ? f.tim_raber.filter((d) => d !== dept)
                                  : [...f.tim_raber, dept],
                              }))
                            }}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                              isChecked
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {isChecked ? `✓ ${dept}` : `+ ${dept}`}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Jaminan</label>
                  <select
                    value={editPatientForm.jaminan}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, jaminan: e.target.value as Jaminan })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    <option value="BPJS">BPJS</option>
                    <option value="Umum">Umum</option>
                    <option value="Asuransi">Asuransi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Status Rawat</label>
                  <select
                    value={
                      editPatientForm.status_rawat === 'aktif'
                        ? 'aktif'
                        : editPatientForm.keterangan_krs === 'APS'
                        ? 'krs_aps'
                        : editPatientForm.keterangan_krs === 'Meninggal'
                        ? 'krs_meninggal'
                        : editPatientForm.keterangan_krs === 'Alih Rawat'
                        ? 'krs_alih'
                        : editPatientForm.keterangan_krs === 'Rujuk'
                        ? 'krs_rujuk'
                        : 'krs_izin'
                    }
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'aktif') {
                        setEditPatientForm({ ...editPatientForm, status_rawat: 'aktif' })
                      } else {
                        const ketMap: Record<string, KeteranganKrs> = {
                          krs_izin: 'Izin Dokter',
                          krs_aps: 'APS',
                          krs_meninggal: 'Meninggal',
                          krs_alih: 'Alih Rawat',
                          krs_rujuk: 'Rujuk',
                        }
                        setEditPatientForm({
                          ...editPatientForm,
                          status_rawat: 'krs',
                          keterangan_krs: ketMap[val] || 'Izin Dokter',
                          tgl_krs: editPatientForm.tgl_krs || getLocalDateString(),
                        })
                      }
                    }}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary font-medium"
                  >
                    <option value="aktif">Rawat Inap (Aktif)</option>
                    <option value="krs_izin">KRS (Izin Dokter)</option>
                    <option value="krs_aps">APS (Pulang Paksa)</option>
                    <option value="krs_meninggal">MD (Meninggal Dunia)</option>
                    <option value="krs_alih">Alih Rawat (Departemen Lain)</option>
                    <option value="krs_rujuk">Rujuk (Faskes/RS Lain)</option>
                  </select>
                </div>
              </div>

              {editPatientForm.status_rawat === 'krs' && (
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
                  {editPatientForm.keterangan_krs === 'Alih Rawat' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                        Ke Departemen / Spesialis
                      </label>
                      <input
                        type="text"
                        value={editPatientForm.detail_krs}
                        onChange={(e) => setEditPatientForm({ ...editPatientForm, detail_krs: e.target.value })}
                        placeholder="Contoh: Bedah Saraf, IPD, Kardio, Anestesi..."
                        className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary bg-white"
                      />
                    </div>
                  )}
                  {editPatientForm.keterangan_krs === 'Rujuk' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                        Tujuan Rujukan (RS / Faskes)
                      </label>
                      <input
                        type="text"
                        value={editPatientForm.detail_krs}
                        onChange={(e) => setEditPatientForm({ ...editPatientForm, detail_krs: e.target.value })}
                        placeholder="Contoh: RSUD Dr. Soetomo, RS PON..."
                        className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary bg-white"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tanggal Keluar (DD/MM/YY)</label>
                    <DateInput
                      value={editPatientForm.tgl_krs}
                      onChange={(val) => setEditPatientForm({ ...editPatientForm, tgl_krs: val })}
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tgl MRS (DD/MM/YY)</label>
                  <DateInput
                    value={editPatientForm.tgl_mrs}
                    onChange={(val) => setEditPatientForm({ ...editPatientForm, tgl_mrs: val })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tgl Onset (DD/MM/YY)</label>
                  <DateInput
                    value={editPatientForm.tgl_onset}
                    onChange={(val) => setEditPatientForm({ ...editPatientForm, tgl_onset: val })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleDeletePatient}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} /> Hapus Pasien
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditPatientModal(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Item Terapi */}
      {editingTerapi && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in overscroll-contain touch-none select-none"
          onClick={() => setEditingTerapi(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4 overscroll-contain touch-auto select-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Edit Item Terapi</h3>
                <p className="text-[11px] text-ink-muted">Ubah nama obat, dosis, atau kategori</p>
              </div>
              <button type="button" onClick={() => setEditingTerapi(null)} className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditTerapi} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Kategori</label>
                <select
                  value={editingTerapi.item.kategori}
                  onChange={(e) =>
                    setEditingTerapi({
                      ...editingTerapi,
                      item: { ...editingTerapi.item, kategori: e.target.value as KategoriTerapi },
                    })
                  }
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-ink outline-none focus:border-primary"
                >
                  {KATEGORI_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Nama Item / Obat (Fornas/ICD-9)</label>
                <PredictiveInput
                  type={editingTerapi.item.kategori === 'Diagnostik' ? 'procedure' : 'drug'}
                  required
                  value={editingTerapi.item.nama_item}
                  onChange={(val) =>
                    setEditingTerapi({
                      ...editingTerapi,
                      item: { ...editingTerapi.item, nama_item: val },
                    })
                  }
                  onSelect={(sel) => {
                    setEditingTerapi({
                      ...editingTerapi,
                      item: {
                        ...editingTerapi.item,
                        nama_item: sel.name,
                        dosis_keterangan: sel.detail || editingTerapi.item.dosis_keterangan,
                      },
                    })
                  }}
                  placeholder="mis. Amlodipine, Ceftriaxone, CT Scan..."
                  className="w-full"
                  inputClassName="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Dosis / Keterangan</label>
                <input
                  value={editingTerapi.item.dosis_keterangan}
                  onChange={(e) =>
                    setEditingTerapi({
                      ...editingTerapi,
                      item: { ...editingTerapi.item, dosis_keterangan: e.target.value },
                    })
                  }
                  placeholder="mis. 2 x 1 gr iv"
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Status</label>
                  <select
                    value={editingTerapi.item.status}
                    onChange={(e) =>
                      setEditingTerapi({
                        ...editingTerapi,
                        item: {
                          ...editingTerapi.item,
                          status: e.target.value as 'aktif' | 'stop',
                          tgl_stop: e.target.value === 'stop' ? (editingTerapi.item.tgl_stop || getLocalDateString()) : null,
                        },
                      })
                    }
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="stop">Stop</option>
                  </select>
                </div>
                {editingTerapi.item.status === 'stop' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tgl Stop (DD/MM/YY)</label>
                    <DateInput
                      value={editingTerapi.item.tgl_stop || ''}
                      onChange={(val) =>
                        setEditingTerapi({
                          ...editingTerapi,
                          item: { ...editingTerapi.item, tgl_stop: val },
                        })
                      }
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary bg-white"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTerapi(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
                >
                  Simpan Terapi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Terapi Manual */}
      {addingTerapiNoteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in overscroll-contain touch-none select-none"
          onClick={() => setAddingTerapiNoteId(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4 overscroll-contain touch-auto select-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Tambah Terapi / Plan Manual</h3>
                <p className="text-[11px] text-ink-muted">Tambahkan rencana terapi atau tindakan ke CPPT</p>
              </div>
              <button type="button" onClick={() => setAddingTerapiNoteId(null)} className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTerapi} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Kategori</label>
                <select
                  value={newTerapiForm.kategori}
                  onChange={(e) => setNewTerapiForm({ ...newTerapiForm, kategori: e.target.value as KategoriTerapi })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-ink outline-none focus:border-primary"
                >
                  {KATEGORI_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Nama Item / Obat (Fornas/ICD-9)</label>
                <PredictiveInput
                  type={newTerapiForm.kategori === 'Diagnostik' ? 'procedure' : 'drug'}
                  required
                  autoFocus
                  value={newTerapiForm.nama_item}
                  onChange={(val) => setNewTerapiForm({ ...newTerapiForm, nama_item: val })}
                  onSelect={(item) => {
                    setNewTerapiForm((prev) => ({
                      ...prev,
                      nama_item: item.name,
                      dosis_keterangan: item.detail || prev.dosis_keterangan,
                      kategori: (item.category as KategoriTerapi) || prev.kategori,
                    }))
                  }}
                  placeholder="mis. Amlodipine, Ondansetron, CT Scan..."
                  className="w-full"
                  inputClassName="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Dosis / Instruksi</label>
                <input
                  value={newTerapiForm.dosis_keterangan}
                  onChange={(e) => setNewTerapiForm({ ...newTerapiForm, dosis_keterangan: e.target.value })}
                  placeholder="mis. 3 x 4 mg iv, evaluasi per 8 jam..."
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddingTerapiNoteId(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newTerapiForm.nama_item.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                >
                  Tambah Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Catatan CPPT */}
      {editingNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in overscroll-contain touch-none select-none"
          onClick={() => setEditingNote(null)}
        >
          <div
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl space-y-4 touch-auto select-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Edit Catatan CPPT</h3>
                <p className="text-[11px] text-ink-muted">Tanggal: {formatDate(editingNote.tanggal)}</p>
              </div>
              <button type="button" onClick={() => setEditingNote(null)} className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditNote} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tanggal CPPT (DD/MM/YY)</label>
                <DateInput
                  value={editingNote.tanggal}
                  onChange={(val) => setEditingNote({ ...editingNote, tanggal: val })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Subjective (S)</label>
                <textarea
                  rows={2}
                  value={editingNote.S}
                  onChange={(e) => setEditingNote({ ...editingNote, S: e.target.value })}
                  placeholder="Keluhan subjektif pasien..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Objective - Pemeriksaan Fisik (O Pemfis)</label>
                <textarea
                  rows={2}
                  value={editingNote.O_pemfis}
                  onChange={(e) => setEditingNote({ ...editingNote, O_pemfis: e.target.value })}
                  placeholder="Tanda vital, kesadaran, status lokalis..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Objective - Penunjang (O Penunjang)</label>
                <textarea
                  rows={2}
                  value={editingNote.O_penunjang}
                  onChange={(e) => setEditingNote({ ...editingNote, O_penunjang: e.target.value })}
                  placeholder="Hasil lab, radiologi, EKG..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Assessment (A) - 1 baris per diagnosis</label>
                <textarea
                  rows={2}
                  value={editingNote.A}
                  onChange={(e) => setEditingNote({ ...editingNote, A: e.target.value })}
                  placeholder="Diagnosis kerja / komorbiditas..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Catatan Bebas (di luar SOAP)</label>
                <textarea
                  rows={2}
                  value={editingNote.catatan}
                  onChange={(e) => setEditingNote({ ...editingNote, catatan: e.target.value })}
                  placeholder="Rencana KRS, konsul, extra, dll..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
                >
                  Simpan CPPT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah / Edit Pemeriksaan Penunjang */}
      {showAddPenunjangModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in overscroll-contain touch-none select-none"
          onClick={() => setShowAddPenunjangModal(false)}
        >
          <div
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl space-y-4 touch-auto select-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">
                  {penunjangForm.id ? 'Edit Pemeriksaan Penunjang' : 'Tambah Pemeriksaan Penunjang'}
                </h3>
                <p className="text-[11px] text-ink-muted">Kelola laboratorium, radiologi, dan penunjang diagnostik</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPenunjangModal(false)}
                className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePenunjang} className="space-y-3.5">
              {/* Pilihan Kategori */}
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1.5">Kategori Penunjang</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Laboratorium', 'Radiologi', 'Lainnya'] as const).map((kat) => (
                    <button
                      key={kat}
                      type="button"
                      onClick={() => setPenunjangForm({ ...penunjangForm, kategori: kat })}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border text-center ${
                        penunjangForm.kategori === kat
                          ? kat === 'Laboratorium'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : kat === 'Radiologi'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : 'bg-slate-700 text-white border-slate-700 shadow-sm'
                          : 'bg-white text-ink border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {kat === 'Laboratorium' ? '🔬 Lab' : kat === 'Radiologi' ? '🩻 Radiologi' : '📑 Lainnya'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nama Pemeriksaan & Suggestions */}
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Nama Pemeriksaan (ICD-9-CM)</label>
                <PredictiveInput
                  type="procedure"
                  procedureCategory={penunjangForm.kategori}
                  required
                  value={penunjangForm.nama_pemeriksaan}
                  onChange={(val) => setPenunjangForm({ ...penunjangForm, nama_pemeriksaan: val })}
                  onSelect={(item) => setPenunjangForm({ ...penunjangForm, nama_pemeriksaan: item.name })}
                  placeholder={
                    penunjangForm.kategori === 'Laboratorium'
                      ? 'mis. Darah Lengkap, GDS, Elektrolit...'
                      : penunjangForm.kategori === 'Radiologi'
                      ? 'mis. CT-Scan Kepala Non-Kontras, Foto Thorax AP...'
                      : 'mis. EKG 12 Lead, EEG, Lumbal Pungsi...'
                  }
                  className="w-full"
                  inputClassName="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
                {/* Suggestions chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 pb-0.5 scrollbar-none">
                  {(penunjangForm.kategori === 'Laboratorium'
                    ? LAB_SUGGESTIONS
                    : penunjangForm.kategori === 'Radiologi'
                    ? RADIOLOGI_SUGGESTIONS
                    : LAINNYA_SUGGESTIONS
                  ).slice(0, 6).map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setPenunjangForm({ ...penunjangForm, nama_pemeriksaan: sug })}
                      className="px-2 py-0.5 rounded-lg bg-surface hover:bg-slate-200/80 text-[10px] font-semibold text-ink-muted hover:text-ink whitespace-nowrap cursor-pointer transition-colors shrink-0"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tanggal & Status */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tanggal (DD/MM/YY)</label>
                  <DateInput
                    required
                    value={penunjangForm.tanggal}
                    onChange={(val) => setPenunjangForm({ ...penunjangForm, tanggal: val })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Status Hasil</label>
                  <select
                    value={penunjangForm.status}
                    onChange={(e) =>
                      setPenunjangForm({
                        ...penunjangForm,
                        status: e.target.value as 'selesai' | 'menunggu',
                      })
                    }
                    className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    <option value="selesai">✓ Selesai (Ada Hasil)</option>
                    <option value="menunggu">⏳ Menunggu Hasil</option>
                  </select>
                </div>
              </div>

              {/* Hasil / Temuan */}
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Hasil / Kesimpulan Pemeriksaan
                  {penunjangForm.status === 'menunggu' && (
                    <span className="text-amber-600 font-normal ml-1">(opsional bila belum selesai)</span>
                  )}
                </label>
                <textarea
                  rows={3}
                  value={penunjangForm.hasil}
                  onChange={(e) => setPenunjangForm({ ...penunjangForm, hasil: e.target.value })}
                  placeholder={
                    penunjangForm.kategori === 'Laboratorium'
                      ? 'mis. Hb 12.8, Leu 11.200, Plt 285.000, GDS 145...'
                      : penunjangForm.kategori === 'Radiologi'
                      ? 'mis. Infark luas di teritori MCA sinistra, tanda perdarahan (-)...'
                      : 'mis. Irama sinus takikardia, HR 108 bpm, ST elevasi (-)...'
                  }
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              {/* Indikasi / Catatan Tambahan */}
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Indikasi / Catatan Klinis (Opsional)</label>
                <input
                  value={penunjangForm.catatan}
                  onChange={(e) => setPenunjangForm({ ...penunjangForm, catatan: e.target.value })}
                  placeholder="mis. Curiga stroke hemoragik, evaluasi pasca koreksi K..."
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              {/* Lampiran Gambar / Berkas */}
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Foto Lampiran / Berkas Hasil</label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-surface hover:bg-slate-100 text-xs font-bold text-ink cursor-pointer transition-colors">
                    <Upload size={14} className="text-primary" />
                    <span>Upload Foto / Dokumen</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleAttachPenunjangFile(file)
                      }}
                    />
                  </label>
                </div>
                {penunjangForm.attachments.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    {penunjangForm.attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-ink"
                      >
                        <ImageIcon size={12} className="text-primary shrink-0" />
                        <span className="truncate max-w-[120px]">{att.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePenunjangAttachment(idx)}
                          className="p-0.5 text-ink-muted hover:text-rose-600 rounded cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddPenunjangModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!penunjangForm.nama_pemeriksaan.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                >
                  Simpan Penunjang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Quick Isi Hasil */}
      {showQuickHasilModal && quickHasilItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in overscroll-contain touch-none select-none"
          onClick={() => setShowQuickHasilModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4 touch-auto select-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Input Hasil Pemeriksaan</h3>
                <p className="text-xs font-bold text-primary mt-0.5">{quickHasilItem.nama_pemeriksaan}</p>
                <p className="text-[11px] text-ink-muted">{formatDate(quickHasilItem.tanggal)}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickHasilModal(false)}
                className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveQuickHasil} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Hasil / Ekspertise</label>
                <textarea
                  autoFocus
                  required
                  rows={4}
                  value={quickHasilText}
                  onChange={(e) => setQuickHasilText(e.target.value)}
                  placeholder="Ketik hasil pemeriksaan lab/radiologi di sini..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowQuickHasilModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!quickHasilText.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                >
                  Simpan Hasil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Preview Gambar Lampiran */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="max-w-2xl w-full max-h-[90dvh] bg-white rounded-3xl p-4 space-y-3 flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <p className="text-xs font-bold text-ink truncate">{previewImage.title}</p>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-ink-muted cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center min-h-[300px] bg-slate-50 rounded-2xl p-2">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[75dvh] max-w-full object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Tandai Pasien KRS */}
      {showKrsModal && patient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in overscroll-contain"
          onClick={() => setShowKrsModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-ink">Status Pasien Keluar</h3>
              <button
                type="button"
                onClick={() => setShowKrsModal(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-ink-muted cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmKrs} className="space-y-3.5">
              {/* Pilihan Alasan Keluar */}
              <div className="space-y-1.5">
                {[
                  {
                    key: 'Izin Dokter' as KeteranganKrs,
                    label: 'KRS',
                    sub: 'Atas Izin Dokter (PBJ)',
                    borderSelected: 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/25 text-emerald-950',
                    dotSelected: 'border-emerald-600 bg-emerald-600',
                  },
                  {
                    key: 'APS' as KeteranganKrs,
                    label: 'APS',
                    sub: 'Pulang Paksa',
                    borderSelected: 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500/25 text-amber-950',
                    dotSelected: 'border-amber-600 bg-amber-600',
                  },
                  {
                    key: 'Meninggal' as KeteranganKrs,
                    label: 'MD',
                    sub: 'Meninggal Dunia',
                    borderSelected: 'border-rose-500 bg-rose-50/60 ring-1 ring-rose-500/25 text-rose-950',
                    dotSelected: 'border-rose-600 bg-rose-600',
                  },
                  {
                    key: 'Alih Rawat' as KeteranganKrs,
                    label: 'Alih Rawat',
                    sub: 'Departemen Lain',
                    borderSelected: 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500/25 text-indigo-950',
                    dotSelected: 'border-indigo-600 bg-indigo-600',
                  },
                  {
                    key: 'Rujuk' as KeteranganKrs,
                    label: 'Rujuk',
                    sub: 'Faskes / RS Luar',
                    borderSelected: 'border-sky-500 bg-sky-50/60 ring-1 ring-sky-500/25 text-sky-950',
                    dotSelected: 'border-sky-600 bg-sky-600',
                  },
                ].map((opt) => {
                  const isSelected = krsForm.keterangan_krs === opt.key
                  const isAlihRawat = opt.key === 'Alih Rawat'
                  const isRujuk = opt.key === 'Rujuk'

                  return (
                    <div key={opt.key} className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setKrsForm((f) => ({
                            ...f,
                            keterangan_krs: opt.key,
                            detail_krs: f.keterangan_krs === opt.key ? f.detail_krs : '',
                          }))
                          if (opt.key !== 'Alih Rawat') setIsCustomDept(false)
                          if (opt.key !== 'Rujuk') setIsCustomRs(false)
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? opt.borderSelected
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 bg-white text-ink'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? opt.dotSelected : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <span className="size-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="text-xs font-bold">{opt.label}</span>
                        </div>
                        <span className="text-[11px] text-ink-muted font-medium">{opt.sub}</span>
                      </button>

                      {/* Dropdown Spesifik Alih Rawat — Tepat di bawah Alih Rawat */}
                      {isAlihRawat && isSelected && (
                        <div className="pl-3.5 pr-0.5 py-1 space-y-1.5 animate-in fade-in">
                          <select
                            value={isCustomDept ? 'lainnya' : krsForm.detail_krs}
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === 'lainnya') {
                                setIsCustomDept(true)
                                setKrsForm((f) => ({ ...f, detail_krs: '' }))
                              } else {
                                setIsCustomDept(false)
                                setKrsForm((f) => ({ ...f, detail_krs: val }))
                              }
                            }}
                            className="w-full h-10 rounded-xl border border-indigo-200 px-3 text-xs bg-white text-ink font-semibold outline-none focus:border-indigo-500 shadow-2xs"
                          >
                            <option value="">— Pilih Departemen / Spesialis Tujuan —</option>
                            {DEPT_ALIH_RAWAT.map((dept) => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                            <option value="lainnya">Lainnya (Ketik Manual)...</option>
                          </select>

                          {isCustomDept && (
                            <input
                              type="text"
                              autoFocus
                              value={krsForm.detail_krs}
                              onChange={(e) => setKrsForm((f) => ({ ...f, detail_krs: e.target.value }))}
                              placeholder="Ketik nama spesialis / departemen tujuan..."
                              className="w-full h-9 rounded-xl border border-indigo-200 px-3 text-xs text-ink outline-none focus:border-indigo-500 bg-white"
                            />
                          )}
                        </div>
                      )}

                      {/* Dropdown Spesifik Rujuk — Tepat di bawah Rujuk */}
                      {isRujuk && isSelected && (
                        <div className="pl-3.5 pr-0.5 py-1 space-y-1.5 animate-in fade-in">
                          <select
                            value={isCustomRs ? 'lainnya' : krsForm.detail_krs}
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === 'lainnya') {
                                setIsCustomRs(true)
                                setKrsForm((f) => ({ ...f, detail_krs: '' }))
                              } else {
                                setIsCustomRs(false)
                                setKrsForm((f) => ({ ...f, detail_krs: val }))
                              }
                            }}
                            className="w-full h-10 rounded-xl border border-sky-200 px-3 text-xs bg-white text-ink font-semibold outline-none focus:border-sky-500 shadow-2xs"
                          >
                            <option value="">— Pilih Rumah Sakit Rujukan —</option>
                            {RS_RUJUKAN.map((rs) => (
                              <option key={rs} value={rs}>
                                {rs}
                              </option>
                            ))}
                            <option value="lainnya">Lainnya (Ketik Nama RS)...</option>
                          </select>

                          {isCustomRs && (
                            <input
                              type="text"
                              autoFocus
                              value={krsForm.detail_krs}
                              onChange={(e) => setKrsForm((f) => ({ ...f, detail_krs: e.target.value }))}
                              placeholder="Ketik nama rumah sakit / faskes rujukan..."
                              className="w-full h-9 rounded-xl border border-sky-200 px-3 text-xs text-ink outline-none focus:border-sky-500 bg-white"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Tanggal Keluar */}
              <div>
                <label className="block text-[11px] font-bold text-ink-muted mb-1">Tanggal Keluar (DD/MM/YY)</label>
                <DateInput
                  value={krsForm.tgl_krs}
                  onChange={(val) => setKrsForm((f) => ({ ...f, tgl_krs: val }))}
                  required
                  className="w-full h-9.5 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowKrsModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 transition-all cursor-pointer ${
                    krsForm.keterangan_krs === 'Meninggal'
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
                      : krsForm.keterangan_krs === 'APS'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25'
                      : krsForm.keterangan_krs === 'Alih Rawat'
                      ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25'
                      : krsForm.keterangan_krs === 'Rujuk'
                      ? 'bg-sky-600 hover:bg-sky-700 shadow-sky-600/25'
                      : 'bg-primary hover:bg-primary-deep shadow-primary/25'
                  }`}
                >
                  Konfirmasi {krsForm.keterangan_krs === 'Meninggal' ? 'MD' : krsForm.keterangan_krs === 'APS' ? 'APS' : krsForm.keterangan_krs === 'Alih Rawat' ? 'Alih Rawat' : krsForm.keterangan_krs === 'Rujuk' ? 'Rujuk' : 'KRS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alih Leader */}
      {showAlihLeaderModal && patient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150 overscroll-contain touch-none select-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAlihLeaderModal(false)
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ArrowLeftRight size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink">Alih DPJP Utama (Leader)</h3>
                  <p className="text-[11px] text-ink-muted">Pasien: {patient.title} {patient.nama_depan || (patient as any).inisial}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAlihLeaderModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAlihLeader} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  DPJP Utama Saat Ini
                </label>
                <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-ink">
                  {patient.dpjp_utama || 'Neuro'} ({patient.peran_rawat || 'Leader'})
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih DPJP Utama (Leader) Baru
                </label>
                <select
                  value={newLeader}
                  onChange={(e) => setNewLeader(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-xs bg-white text-ink font-semibold outline-none focus:border-primary shadow-2xs"
                >
                  <option value="Neuro">Neuro (DPJP Utama Saraf)</option>
                  {DEPT_ALIH_RAWAT.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-muted mt-1.5 leading-relaxed">
                  {newLeader === 'Neuro'
                    ? 'Neuro akan menjadi Leader / DPJP Utama pasien ini.'
                    : `${newLeader} akan menjadi Leader / DPJP Utama. Neuro akan tetap ikut merawat sebagai Raber.`}
                </p>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAlihLeaderModal(false)}
                  className="flex-1 h-10 rounded-xl border border-slate-200 text-xs font-bold text-ink hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 h-10 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-deep shadow-md shadow-primary/20 cursor-pointer"
                >
                  Simpan Alih Leader
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visite Harian (Salin SOAP Cepat) */}
      {visiteModalOpen && patient && (
        <VisiteModal
          patient={patient}
          latestNote={notes && notes.length > 0 ? notes[notes.length - 1] : undefined}
          onClose={() => setVisiteModalOpen(false)}
          onSaved={(msg) => notify(msg)}
        />
      )}

      {toast && (
        <aside aria-label="Notifikasi" className="fixed inset-x-0 bottom-24 z-[60] mx-auto w-fit max-w-[90%] rounded-2xl bg-gradient-to-r from-primary to-primary-deep px-5 py-2.5 text-xs font-bold text-white shadow-xl shadow-primary/35 border border-white/20 animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </aside>
      )}
    </main>
  )
}
