import { useState, useRef, useEffect } from 'react'
import {
  X,
  CheckSquare,
  Square,
  Loader2,
  Camera,
  Image as ImageIcon,
  Plus,
  Check,
  Sparkles,
  ArrowRightLeft,
  ArrowDown,
  ArrowUp,
  RotateCw,
  AlertCircle,
} from 'lucide-react'
import { db, type Patient, type ProgressNote, type TerapiItem, type DiagnosisItem } from '../db'
import { lineToTerapi } from '../parser'
import { rapikan, type RapikanResult } from '../ai'
import { convertToWebP } from '../utils/mediaCompress'
import { getLocalDateString, hariKe } from '../utils/dateFormat'
import { useBodyScrollLock } from '../utils/useBodyScrollLock'
import {
  parseSubjectiveToComplaints,
  formatComplaintsToSubjective,
  extractClinicalMetrics,
  type VisiteComplaint,
  type ComplaintStatus,
} from '../utils/clinicalExtractor'
import {
  type VisitePemfisState,
  AVAILABLE_PEMFIS_PARAMS,
  parsePemfisFromString,
  formatPemfisToString,
  formatKlString,
  type VisitePenunjangItem,
  COMMON_PENUNJANG_PRESETS,
  isPresetPenunjang,
  parsePenunjangFromString,
  formatPenunjangToString,
} from '../utils/visitePemfis'
import { cleanNamaDepan, formatPatientDisplayName } from '../utils/patientName'
import { notifyParserFinished } from '../utils/nativeNotify'
import Masked from './Masked'
import DateInput from './DateInput'
import TimeInput from './TimeInput'
import PredictiveInput from './PredictiveInput'
import { ImageViewerModal } from './ImageViewerModal'
import { type ClinicalMediaItem } from './ClinicalMediaCard'
import { triggerCloudSync } from '../sync'
import {
  SWITCH_ORAL_MAPPING,
} from '../utils/visitePresets'

interface VisiteModalProps {
  patient: Patient
  latestNote?: ProgressNote
  onClose: () => void
  onSaved: (msg: string) => void
}

function GcsDigitBox({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min: number
  max: number
  onChange: (val: string) => void
}) {
  const touchStartY = useRef<number | null>(null)

  const handleCycle = (direction: 1 | -1 = 1) => {
    const cur = parseInt(value, 10) || min
    let next = cur + direction
    if (next > max) next = min
    if (next < min) next = max
    onChange(String(next))
  }

  return (
    <div className="flex items-center gap-1 select-none">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <button
        type="button"
        onClick={() => handleCycle(1)}
        onContextMenu={(e) => {
          e.preventDefault()
          handleCycle(-1)
        }}
        onTouchStart={(e) => {
          touchStartY.current = e.touches[0].clientY
        }}
        onTouchEnd={(e) => {
          if (touchStartY.current !== null) {
            const diff = touchStartY.current - e.changedTouches[0].clientY
            if (diff > 15) {
              handleCycle(1)
            } else if (diff < -15) {
              handleCycle(-1)
            } else {
              handleCycle(1)
            }
            touchStartY.current = null
          }
        }}
        className="size-7 rounded-lg border border-slate-200 bg-white font-bold text-xs text-slate-800 flex items-center justify-center hover:border-emerald-500 hover:text-emerald-700 active:scale-95 transition-all shadow-2xs cursor-pointer"
        title={`${label}: Klik / swipe untuk ubah (${min}-${max})`}
      >
        {value || min}
      </button>
    </div>
  )
}

// Global store untuk background OCR di VisiteModal agar tidak hilang saat modal ditutup sementara
export interface PendingVisiteOcrTask {
  status: 'busy' | 'done' | 'error'
  result?: any
  patientId: number
  patientDisp: string
  attachmentId?: string
  message: string
}
export const pendingVisiteOcrStore = new Map<number, PendingVisiteOcrTask>()

export default function VisiteModal({
  patient,
  latestNote,
  onClose,
  onSaved,
}: VisiteModalProps) {
  useBodyScrollLock()
  const todayStr = getLocalDateString()

  // Pre-fill S, O, A, P dari catatan terakhir
  const [tanggal, setTanggal] = useState(todayStr)
  const [waktu, setWaktu] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [complaints, setComplaints] = useState<VisiteComplaint[]>(() =>
    parseSubjectiveToComplaints(latestNote?.S)
  )
  const [newComplaintInput, setNewComplaintInput] = useState('')
  const [pemfis, setPemfis] = useState<VisitePemfisState>(() =>
    parsePemfisFromString(latestNote?.O_pemfis || '')
  )
  const [O_pemfis, setOPemfis] = useState(latestNote?.O_pemfis || '')
  const [penunjangItems, setPenunjangItems] = useState<VisitePenunjangItem[]>(() =>
    parsePenunjangFromString(latestNote?.O_penunjang || '')
  )
  const [O_penunjang, setOPenunjang] = useState(latestNote?.O_penunjang || '')
  const [pemfisViewMode, setPemfisViewMode] = useState<'structured' | 'raw'>('structured')
  const [penunjangViewMode, setPenunjangViewMode] = useState<'structured' | 'raw'>('structured')
  const [showAddParamMenu, setShowAddParamMenu] = useState(false)
  const [showAddPenunjangMenu, setShowAddPenunjangMenu] = useState(false)
  const [openKuMenu, setOpenKuMenu] = useState(false)
  const [openKlMenu, setOpenKlMenu] = useState(false)
  const sistolRef = useRef<HTMLInputElement>(null)
  const diastolRef = useRef<HTMLInputElement>(null)

  // Sinkronisasi otomatis O_pemfis string dari structured pemfis
  useEffect(() => {
    setOPemfis(formatPemfisToString(pemfis))
  }, [pemfis])

  // Sinkronisasi otomatis O_penunjang string dari structured penunjang
  useEffect(() => {
    setOPenunjang(formatPenunjangToString(penunjangItems))
  }, [penunjangItems])

  // Diagnosis A
  const initialA = latestNote?.A?.length
    ? (Array.isArray(latestNote.A) ? latestNote.A.map((a) => a.nama_diagnosis).join('\n') : String(latestNote.A))
    : patient.diagnosis_utama || ''
  const [A, setA] = useState(initialA)

  // Terapi P (salin terapi yang aktif atau item diagnostik)
  const initialP: TerapiItem[] = (latestNote?.P || [])
    .filter((p) => p.status === 'aktif' || p.kategori === 'Diagnostik')
    .map((p) => ({
      ...p,
      tgl_mulai: p.tgl_mulai || todayStr,
      tgl_stop: p.status === 'stop' ? (p.tgl_stop || todayStr) : null,
      status: p.status,
    }))
  const [P, setP] = useState<TerapiItem[]>(initialP)

  // Input manual cepat PDx dan PTx
  const [quickPdxInput, setQuickPdxInput] = useState('')
  const [quickPtxInput, setQuickPtxInput] = useState('')
  const [catatan, setCatatan] = useState(latestNote?.catatan || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Background OCR & Attachments state (Optimistic & Safe — ala LogMeal)
  const [attachments, setAttachments] = useState<ClinicalMediaItem[]>(() => {
    if (latestNote?.tanggal === todayStr && latestNote?.attachments) {
      return latestNote.attachments.map((a, idx) => ({
        id: (a as any).id || `att-existing-${idx}`,
        ...a,
      }))
    }
    return []
  })
  const [isOcrBusy, setIsOcrBusy] = useState(false)
  const [activeOcrAttId, setActiveOcrAttId] = useState<string | null>(null)
  const [ocrMessage, setOcrMessage] = useState('')
  const [pendingOcrResult, setPendingOcrResult] = useState<RapikanResult | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const simrsCameraRef = useRef<HTMLInputElement>(null)
  const simrsGalleryRef = useRef<HTMLInputElement>(null)

  // Sinkronisasi status background OCR dari pendingVisiteOcrStore
  useEffect(() => {
    if (!patient?.id) return
    const stored = pendingVisiteOcrStore.get(patient.id)
    if (stored) {
      if (stored.status === 'done' && stored.result) {
        setPendingOcrResult(stored.result)
        setIsOcrBusy(false)
        setOcrMessage(stored.message)
      } else if (stored.status === 'busy') {
        setIsOcrBusy(true)
        setActiveOcrAttId(stored.attachmentId || null)
        setOcrMessage(stored.message)
      }
    }

    const ocrReadyHandler = (e: any) => {
      const pid = patient?.id
      if (pid && e.detail?.patientId === pid) {
        const updated = pendingVisiteOcrStore.get(pid)
        if (updated?.result) {
          setPendingOcrResult(updated.result)
          setIsOcrBusy(false)
          setOcrMessage(updated.message)
        }
      }
    }
    window.addEventListener('doctoid_visite_ocr_ready', ocrReadyHandler)
    return () => window.removeEventListener('doctoid_visite_ocr_ready', ocrReadyHandler)
  }, [patient?.id])

  // Interaksi Status Keluhan (Diklik muncul popover atau diswipe horizontal muncul pilihan)
  const [activeStatusMenuId, setActiveStatusMenuId] = useState<string | null>(null)
  const [swipedComplaintId, setSwipedComplaintId] = useState<string | null>(null)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)

  useEffect(() => {
    if (!activeStatusMenuId && !swipedComplaintId) return
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-complaint-row]')) {
        setActiveStatusMenuId(null)
        setSwipedComplaintId(null)
      }
    }
    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('touchstart', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('touchstart', handlePointerDown)
    }
  }, [activeStatusMenuId, swipedComplaintId])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent, id: string) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current
    // Cek gestur geser horizontal yang disengaja
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < -35) {
        // Swipe ke kiri: buka pilihan status inline
        setSwipedComplaintId(id)
        setActiveStatusMenuId(null)
      } else if (deltaX > 35) {
        // Swipe ke kanan: tutup pilihan status
        setSwipedComplaintId(null)
      }
    }
  }

  // Handlers Keluhan S Terstruktur
  const handleSetComplaintStatus = (id: string, status: ComplaintStatus) => {
    setComplaints((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    )
  }

  const handleRemoveComplaint = (id: string) => {
    setComplaints((prev) => prev.filter((c) => c.id !== id))
  }

  const handleUpdateComplaintText = (id: string, text: string) => {
    setComplaints((prev) =>
      prev.map((c) => (c.id === id ? { ...c, text } : c))
    )
  }

  const handleAddQuickComplaint = (presetName: string) => {
    setComplaints((prev) => {
      const exists = prev.some((c) => c.text.toLowerCase().trim() === presetName.toLowerCase().trim())
      if (exists) return prev
      return [
        ...prev,
        {
          id: `complaint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: presetName,
          status: '+',
        },
      ]
    })
  }

  const handleAddCustomComplaint = () => {
    const trimmed = newComplaintInput.trim()
    if (!trimmed) return
    setComplaints((prev) => {
      const exists = prev.some((c) => c.text.toLowerCase().trim() === trimmed.toLowerCase().trim())
      if (exists) return prev
      return [
        ...prev,
        {
          id: `complaint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: trimmed,
          status: '+',
        },
      ]
    })
    setNewComplaintInput('')
  }

  // Handler Parameter Pemfis Terstruktur
  const handleRemovePemfisParam = (key: string) => {
    setPemfis((prev) => ({
      ...prev,
      activeKeys: prev.activeKeys.filter((k) => k !== key),
    }))
  }

  const handleAddPemfisParam = (key: string) => {
    setPemfis((prev) => {
      if (prev.activeKeys.includes(key)) return prev
      const next = {
        ...prev,
        activeKeys: [...prev.activeKeys, key],
      }
      if (key === 'cor' && !next.cor) next.cor = 'S1 S2 tunggal reguler, murmur (-), gallop (-)'
      if (key === 'thorax' && !next.thorax_custom) next.thorax_custom = 'Pulmo: vesikuler (+/+), Rh (-/-), Wh (-/-)'
      if (key === 'abdomen' && !next.abdomen_custom) next.abdomen_custom = 'Supel, BU (+) normal, NT (-)'
      if (key === 'ekstremitas' && !next.ekstremitas_custom) next.ekstremitas_custom = 'Akral hangat, CRT < 2s, Edema (-/-)'
      if (key === 'ms' && !next.ms) next.ms = 'Kaku kuduk (-), Brudzinski (-), Kernig (-)'
      if (key === 'n_cranialis' && !next.n_cranialis) next.n_cranialis = 'Pupil isokor 3mm/3mm, RC (+/+)'
      if (key === 'rfisio' && !next.rfisio) next.rfisio = 'BPR (+2/+2), TPR (+2/+2), KPR (+2/+2), APR (+2/+2)'
      if (key === 'rpato' && !next.rpato) next.rpato = 'Babinski (-/-), Chaddock (-/-)'
      if (key === 'tonus' && !next.tonus) next.tonus = 'Normotonus seluruh ekstremitas'
      if (key === 'mmt' && !next.mmt) next.mmt = '5555/5555, 5555/5555'
      if (key === 'sensorik' && !next.sensorik) next.sensorik = 'Sensibilitas normal'
      if (key === 'autonom' && !next.autonom) next.autonom = 'BAB & BAK (+) normal'
      return next
    })
    setShowAddParamMenu(false)
  }

  const handleAddCustomPemfisRow = () => {
    setPemfis((prev) => ({
      ...prev,
      customRows: [
        ...prev.customRows,
        {
          id: Math.random().toString(36).substring(7),
          label: 'Temuan',
          value: '',
        },
      ],
    }))
    setShowAddParamMenu(false)
  }

  const handleRemoveCustomPemfisRow = (id: string) => {
    setPemfis((prev) => ({
      ...prev,
      customRows: prev.customRows.filter((c) => c.id !== id),
    }))
  }

  const handleUpdateCustomPemfisRow = (id: string, field: 'label' | 'value', text: string) => {
    setPemfis((prev) => ({
      ...prev,
      customRows: prev.customRows.map((c) => (c.id === id ? { ...c, [field]: text } : c)),
    }))
  }

  // Handler Penunjang Terstruktur
  const handleAddPenunjangItem = (presetName = '', isCustom = false) => {
    setPenunjangItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        name: presetName || '',
        value: '',
        isCustom: isCustom || !presetName,
      },
    ])
    setShowAddPenunjangMenu(false)
  }

  const handleRemovePenunjangItem = (id: string) => {
    setPenunjangItems((prev) => prev.filter((it) => it.id !== id))
  }

  const handleUpdatePenunjangItem = (id: string, field: 'name' | 'value', val: string) => {
    setPenunjangItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: val } : it))
    )
  }

  // Handler Switch Oral (Injeksi -> Oral)
  const handleSwitchOral = (index: number, target: { name: string; dose: string }) => {
    setP((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        return {
          ...item,
          nama_item: target.name,
          dosis_keterangan: target.dose,
        }
      })
    )
  }

  // Handler Background OCR / AI Parser (Optimistic & Safe — ala LogMeal)
  const handleProcessImage = async (file: File) => {
    try {
      const webp = await convertToWebP(file, 1600, 0.85)
      const attId = `simrs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const timeTag = waktu.replace(':', '') || 'visite'
      const newAtt: ClinicalMediaItem = {
        id: attId,
        name: `SIMRS_${tanggal}_${timeTag}`,
        type: 'image/webp',
        dataUrl: webp,
        kategori: 'penunjang',
        tag: 'Lab',
      }

      // 1. LANGSUNG lampirkan foto seketika ke catatan (Optimistic Capture)
      // Sekalipun proses AI lambat atau dokter langsung klik "Simpan", foto asli aman tersimpan!
      setAttachments((prev) => [...prev, newAtt])

      // 2. Jalankan analisis AI Vision di background
      runOcrOnAttachment(newAtt)
    } catch (err: any) {
      console.error('Gagal menyiapkan foto:', err)
      setOcrMessage('Gagal memproses berkas foto: ' + (err?.message || 'Error'))
    }
  }

  // Worker OCR per lampiran — dapat dipanggil ulang kapan saja & berjalan di background
  const runOcrOnAttachment = (att: ClinicalMediaItem) => {
    const patientDisp = formatPatientDisplayName(patient.title, patient.nama_depan)
    const patientId = patient.id!
    setIsOcrBusy(true)
    setActiveOcrAttId(att.id || null)
    const busyMsg = 'Menganalisis foto layar SIMRS / chat WA di background... (bisa ditutup/ditinggal)'
    setOcrMessage(busyMsg)
    setPendingOcrResult(null)

    pendingVisiteOcrStore.set(patientId, {
      status: 'busy',
      patientId,
      patientDisp,
      attachmentId: att.id,
      message: busyMsg,
    })

    ;(async () => {
      try {
        const promptContext = `Pasien: ${patientDisp}\nTanggal Visite: ${tanggal}\nFoto Layar Monitor Komputer SIMRS (CPPT / Catatan Perkembangan Pasien Terintegrasi / Instruksi Terapi Harian) atau Screenshot Chat WA Ruangan`
        const r = await rapikan(promptContext, [{ type: 'image/webp', dataUrl: att.dataUrl || att.url || '' }], false)

        const foundTherapies = r.P?.length || 0
        const foundLab = r.O_penunjang?.trim() ? 1 : 0
        const readyMsg = `Data ${patientDisp} siap diterapkan (${foundTherapies} terapi${foundLab ? ', lab' : ''})`

        pendingVisiteOcrStore.set(patientId, {
          status: 'done',
          result: r,
          patientId,
          patientDisp,
          attachmentId: att.id,
          message: readyMsg,
        })

        setPendingOcrResult(r)
        setOcrMessage(readyMsg)

        // 1. Notifikasi Pop-up Status Bar Android (Heads-up) & Web Notification dengan routing tepat ke Visite Pasien ini
        notifyParserFinished(
          patientDisp,
          `Ditemukan ${foundTherapies} terapi${foundLab ? ', hasil penunjang/lab' : ''}. Siap diterapkan.`,
          {
            type: 'visite',
            route: '/rawatinap',
            patientId,
            date: tanggal,
            patientName: patientDisp,
          }
        )

        window.dispatchEvent(new CustomEvent('doctoid_visite_ocr_ready', { detail: { patientId } }))
      } catch (err: any) {
        console.error('Gagal OCR multimodal:', err)
        pendingVisiteOcrStore.delete(patientId)
        setOcrMessage('AI Vision terkendala. Foto asli tetap tersimpan aman; Anda bisa klik "Ulangi Parsing".')
      } finally {
        setIsOcrBusy(false)
        setActiveOcrAttId(null)
      }
    })()
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
    if (activeOcrAttId === id) {
      if (patient?.id) {
        pendingVisiteOcrStore.delete(patient.id)
      }
      setIsOcrBusy(false)
      setActiveOcrAttId(null)
      setPendingOcrResult(null)
      setOcrMessage('')
    }
  }

  // Handler Terapkan Data OCR Cerdas (Non-destructive)
  const handleApplyOcrResult = () => {
    if (!pendingOcrResult) return
    if (patient?.id) {
      pendingVisiteOcrStore.delete(patient.id)
    }
    const r = pendingOcrResult

    if (r.S && r.S.trim()) {
      const incoming = parseSubjectiveToComplaints(r.S)
      setComplaints((prev) => {
        const existingNames = new Set(prev.map((c) => c.text.toLowerCase().trim()))
        const newOnes = incoming.filter((c) => !existingNames.has(c.text.toLowerCase().trim()))
        return [...prev, ...newOnes]
      })
    }

    if (r.O_pemfis && r.O_pemfis.trim()) {
      const parsedIncoming = parsePemfisFromString(r.O_pemfis)
      setPemfis((prev) => {
        const updated = { ...prev }
        if (parsedIncoming.ku) updated.ku = parsedIncoming.ku
        if (parsedIncoming.td_sistol) {
          updated.td_sistol = parsedIncoming.td_sistol
          updated.td_diastol = parsedIncoming.td_diastol
          if (!updated.activeKeys.includes('td')) updated.activeKeys.push('td')
        }
        if (parsedIncoming.hr) {
          updated.hr = parsedIncoming.hr
          if (!updated.activeKeys.includes('hr')) updated.activeKeys.push('hr')
        }
        if (parsedIncoming.rr) {
          updated.rr = parsedIncoming.rr
          if (!updated.activeKeys.includes('rr')) updated.activeKeys.push('rr')
        }
        if (parsedIncoming.suhu) {
          updated.suhu = parsedIncoming.suhu
          if (!updated.activeKeys.includes('suhu')) updated.activeKeys.push('suhu')
        }
        if (parsedIncoming.spo2) {
          updated.spo2 = parsedIncoming.spo2
          if (!updated.activeKeys.includes('spo2')) updated.activeKeys.push('spo2')
        }
        if (parsedIncoming.kl) {
          updated.kl = parsedIncoming.kl
          if (!updated.activeKeys.includes('kl')) updated.activeKeys.push('kl')
        }
        if (parsedIncoming.cor) {
          updated.cor = parsedIncoming.cor
          if (!updated.activeKeys.includes('cor')) updated.activeKeys.push('cor')
        }
        if (parsedIncoming.activeKeys.includes('thorax')) {
          updated.thorax_vesikuler = parsedIncoming.thorax_vesikuler
          updated.thorax_rhonki = parsedIncoming.thorax_rhonki
          updated.thorax_wheezing = parsedIncoming.thorax_wheezing
          updated.thorax_custom = parsedIncoming.thorax_custom
          if (!updated.activeKeys.includes('thorax')) updated.activeKeys.push('thorax')
        }
        if (parsedIncoming.activeKeys.includes('abdomen')) {
          updated.abdomen_supel = parsedIncoming.abdomen_supel
          updated.abdomen_bu = parsedIncoming.abdomen_bu
          updated.abdomen_nt = parsedIncoming.abdomen_nt
          updated.abdomen_custom = parsedIncoming.abdomen_custom
          if (!updated.activeKeys.includes('abdomen')) updated.activeKeys.push('abdomen')
        }
        if (parsedIncoming.activeKeys.includes('ekstremitas')) {
          updated.ekstremitas_akral = parsedIncoming.ekstremitas_akral
          updated.ekstremitas_edema = parsedIncoming.ekstremitas_edema
          updated.ekstremitas_custom = parsedIncoming.ekstremitas_custom
          if (!updated.activeKeys.includes('ekstremitas')) updated.activeKeys.push('ekstremitas')
        }
        if (parsedIncoming.gcs_e || parsedIncoming.gcs_v || parsedIncoming.gcs_m) {
          updated.gcs_e = parsedIncoming.gcs_e || prev.gcs_e
          updated.gcs_v = parsedIncoming.gcs_v || prev.gcs_v
          updated.gcs_m = parsedIncoming.gcs_m || prev.gcs_m
          if (!updated.activeKeys.includes('gcs')) updated.activeKeys.push('gcs')
        }
        if (parsedIncoming.ms || parsedIncoming.meningeal) {
          updated.ms = parsedIncoming.ms || parsedIncoming.meningeal || ''
          updated.meningeal = updated.ms
          if (!updated.activeKeys.includes('ms')) updated.activeKeys.push('ms')
        }
        if (parsedIncoming.n_cranialis || parsedIncoming.pupil) {
          updated.n_cranialis = parsedIncoming.n_cranialis || parsedIncoming.pupil || ''
          updated.pupil = updated.n_cranialis
          if (!updated.activeKeys.includes('n_cranialis')) updated.activeKeys.push('n_cranialis')
        }
        if (parsedIncoming.rfisio) {
          updated.rfisio = parsedIncoming.rfisio
          if (!updated.activeKeys.includes('rfisio')) updated.activeKeys.push('rfisio')
        }
        if (parsedIncoming.rpato) {
          updated.rpato = parsedIncoming.rpato
          if (!updated.activeKeys.includes('rpato')) updated.activeKeys.push('rpato')
        }
        if (parsedIncoming.tonus) {
          updated.tonus = parsedIncoming.tonus
          if (!updated.activeKeys.includes('tonus')) updated.activeKeys.push('tonus')
        }
        if (parsedIncoming.mmt || parsedIncoming.motorik) {
          updated.mmt = parsedIncoming.mmt || parsedIncoming.motorik || ''
          updated.motorik = updated.mmt
          if (!updated.activeKeys.includes('mmt')) updated.activeKeys.push('mmt')
        }
        if (parsedIncoming.sensorik) {
          updated.sensorik = parsedIncoming.sensorik
          if (!updated.activeKeys.includes('sensorik')) updated.activeKeys.push('sensorik')
        }
        if (parsedIncoming.autonom) {
          updated.autonom = parsedIncoming.autonom
          if (!updated.activeKeys.includes('autonom')) updated.activeKeys.push('autonom')
        }
        if (parsedIncoming.customRows.length > 0) {
          updated.customRows = [...prev.customRows, ...parsedIncoming.customRows]
        }
        return updated
      })
      setOPemfis((prev) => {
        const incoming = r.O_pemfis.trim()
        if (!prev.trim()) return incoming
        if (prev.includes(incoming)) return prev
        return prev + '\n\n' + incoming
      })
    }

    if (r.O_penunjang && r.O_penunjang.trim()) {
      const parsedIncoming = parsePenunjangFromString(r.O_penunjang)
      setPenunjangItems((prev) => {
        const existingNames = new Set(prev.map((p) => p.name.toLowerCase().trim()))
        const newOnes = parsedIncoming.filter(
          (p) => !existingNames.has(p.name.toLowerCase().trim())
        )
        return [...prev, ...newOnes]
      })
      setOPenunjang((prev) => {
        const incoming = r.O_penunjang.trim()
        if (!prev.trim()) return incoming
        if (prev.includes(incoming)) return prev
        return prev + '\n\n' + incoming
      })
    }

    if (r.A && r.A.length > 0) {
      setA((prev) => {
        const existing = new Set(prev.split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean))
        const incoming = r.A.map((a) => a.nama_diagnosis.trim()).filter((d) => d && !existing.has(d.toLowerCase()))
        if (!incoming.length) return prev
        return prev.trim() ? prev.trim() + '\n' + incoming.join('\n') : incoming.join('\n')
      })
    }

    if (r.P && r.P.length > 0) {
      setP((prev) => {
        const existingNames = new Set(prev.map((p) => p.nama_item.trim().toLowerCase()))
        const newItems: TerapiItem[] = r.P
          .filter((p) => p.nama_item.trim() && !existingNames.has(p.nama_item.trim().toLowerCase()))
          .map((p) => ({
            nama_item: p.nama_item.trim(),
            dosis_keterangan: p.dosis_keterangan || '',
            kategori: p.kategori || 'Farmakologi',
            tgl_mulai: tanggal,
            tgl_stop: null,
            status: 'aktif',
          }))
        return [...prev, ...newItems]
      })
    }

    setPendingOcrResult(null)
    setOcrMessage('Data SIMRS/WA berhasil diterapkan!')
    setTimeout(() => setOcrMessage(''), 3000)
  }

  const handleAddPdx = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const text = quickPdxInput.trim()
    if (!text) return

    const lines = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    const newItems = lines.map((clean) => {
      const withoutBullet = clean.replace(/^[+\-•*]\s*/, '')
      return lineToTerapi(withoutBullet, tanggal, 'Diagnostik')
    })
    setP((prev) => [...prev, ...newItems])
    setQuickPdxInput('')
  }

  const handleAddPtx = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const text = quickPtxInput.trim()
    if (!text) return

    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean)
    const newItems = lines.map((clean) => {
      const withoutBullet = clean.replace(/^[+\-•*]\s*/, '')
      return lineToTerapi(withoutBullet, tanggal)
    })
    setP((prev) => [...prev, ...newItems])
    setQuickPtxInput('')
  }

  const handleToggleDrugStatus = (index: number) => {
    setP((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        const willStop = item.status === 'aktif'
        return {
          ...item,
          status: willStop ? 'stop' : 'aktif',
          tgl_stop: willStop ? tanggal : null,
        }
      })
    )
  }

  const handleRemoveDrug = (index: number) => {
    setP((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleUpdateDrugDose = (index: number, newDose: string) => {
    setP((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item
        return {
          ...item,
          dosis_keterangan: newDose,
        }
      })
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const aItems: DiagnosisItem[] = A.split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name, idx) => ({
          kategori: idx === 0 ? 'Utama' : 'Sekunder',
          nama_diagnosis: name,
          icd10: '',
        }))

      const finalS = formatComplaintsToSubjective(complaints)
      const metrics = extractClinicalMetrics({
        S: finalS,
        O_pemfis: O_pemfis.trim(),
        O_penunjang: O_penunjang.trim(),
      })

      // Simpan catatan CPPT baru untuk visite hari ini (termasuk lampiran foto SIMRS aman)
      const nowTime = waktu.trim() || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')
      const finalAttachments = attachments.length > 0 ? attachments.map((a) => ({
        name: a.name,
        type: a.type,
        dataUrl: a.dataUrl || '',
        url: a.url,
        kategori: a.kategori || 'penunjang',
        tag: a.tag || 'Lab',
      })) : undefined

      if (latestNote?.id && latestNote.tanggal === tanggal && latestNote.tipe_note === 'visite') {
        await db.progressNotes.update(latestNote.id, {
          waktu: nowTime,
          S: finalS,
          O_pemfis: O_pemfis.trim(),
          O_penunjang: O_penunjang.trim(),
          A: aItems.length > 0 ? aItems : (latestNote?.A || []),
          P,
          catatan: catatan.trim() || undefined,
          attachments: finalAttachments,
          metrics,
        })
      } else {
        await db.progressNotes.add({
          patient_id: patient.id!,
          tanggal,
          waktu: nowTime,
          tipe_note: 'visite',
          S: finalS,
          O_pemfis: O_pemfis.trim(),
          O_penunjang: O_penunjang.trim(),
          A: aItems.length > 0 ? aItems : (latestNote?.A || []),
          P,
          catatan: catatan.trim() || undefined,
          attachments: finalAttachments,
          metrics,
        })
      }

      // Jika diagnosis utama berubah, perbarui juga di profil pasien
      if (aItems.length > 0 && aItems[0].nama_diagnosis !== patient.diagnosis_utama) {
        await db.patients.update(patient.id!, {
          diagnosis_utama: aItems[0].nama_diagnosis,
        })
      }

      triggerCloudSync(50)

      onSaved(`Visite ${formatPatientDisplayName(patient.title, patient.nama_depan)} berhasil dicatat`)
      onClose()
    } catch (err) {
      console.error(err)
      alert('Gagal menyimpan catatan visite')
    } finally {
      setIsSubmitting(false)
    }
  }

  const pdxList = P.filter((item) => item.kategori === 'Diagnostik')
  const ptxList = P.filter((item) => item.kategori !== 'Diagnostik')

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overscroll-contain touch-none select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-xl max-h-[94dvh] sm:max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl border-t sm:border border-slate-200 overflow-hidden overscroll-contain touch-auto select-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Indicator */}
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

        {/* Header Modal: Info Pasien (Kiri) & Tanggal + Jam (Kanan, Tanpa X) */}
        <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-b border-slate-100 flex items-center justify-between gap-2.5 bg-white shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate leading-snug">
                {patient.title ? `${patient.title} ` : ''}
                <Masked value={cleanNamaDepan(patient.nama_depan, patient.title)} type="name" />
                {patient.usia && (
                  <span className="text-xs font-normal text-slate-500 ml-1">({patient.usia})</span>
                )}
              </h2>
              {patient.no_rm && (
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0">
                  RM {patient.no_rm}
                </span>
              )}
            </div>
          </div>

          {/* Kanan: Tanggal & Jam Murni Angka Sebaris Nama */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-[94px] shrink-0">
              <DateInput
                value={tanggal}
                onChange={(val) => setTanggal(val)}
                placeholder="DD/MM/YY"
                hideIcon={true}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50/60 px-1.5 text-xs font-semibold text-slate-800 text-center focus:bg-white focus:border-primary outline-none transition-colors"
              />
            </div>
            <div className="w-[58px] shrink-0">
              <TimeInput
                value={waktu}
                onChange={(val) => setWaktu(val)}
                placeholder="JJ:MM"
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-1 text-xs font-semibold text-slate-800 text-center focus:bg-white focus:border-primary outline-none transition-colors"
                title="Jam visite (Format 24 Jam)"
              />
            </div>
          </div>
        </div>

        {/* Feedback Background OCR status banner (Non-blocking) */}
        {ocrMessage && (
          <div
            className={`px-4 sm:px-5 py-2 text-xs font-semibold border-b flex items-center justify-between shrink-0 ${
              isOcrBusy
                ? 'bg-blue-50 text-blue-700 border-blue-100'
                : pendingOcrResult
                ? 'bg-primary/10 text-primary-deep border-primary/20'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isOcrBusy ? (
                <Loader2 size={13} className="animate-spin shrink-0 text-primary" />
              ) : pendingOcrResult ? (
                <Sparkles size={13} className="shrink-0 text-primary" />
              ) : (
                <AlertCircle size={13} className="shrink-0 text-amber-600" />
              )}
              <span className="truncate">{ocrMessage}</span>
            </div>

            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              {pendingOcrResult && !isOcrBusy && (
                <button
                  type="button"
                  onClick={handleApplyOcrResult}
                  className="h-6 px-2.5 rounded-md bg-primary hover:bg-primary-deep text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                >
                  Terapkan
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOcrMessage('')
                  setPendingOcrResult(null)
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                aria-label="Tutup pesan"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Strip Foto Lampiran SIMRS / WA (Minimalis ala LogMeal) */}
        {attachments.length > 0 && (
          <div className="px-4 sm:px-5 py-2 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-[11px] font-bold text-slate-500 shrink-0">
              Lampiran ({attachments.length}):
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {attachments.map((att) => {
                const isAnalyzingThis = isOcrBusy && activeOcrAttId === att.id
                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 px-2 py-1 rounded-xl bg-white border border-slate-200 shadow-2xs shrink-0"
                  >
                    {/* Thumbnail Foto - Klik untuk zoom layar SIMRS */}
                    <div
                      onClick={() => setPreviewImage(att.dataUrl || att.url || null)}
                      className="size-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 relative cursor-pointer shrink-0"
                      title="Klik untuk perbesar foto"
                    >
                      <img
                        src={att.dataUrl || att.url}
                        alt={att.name}
                        className="size-full object-cover hover:scale-105 transition-transform"
                      />
                      {isAnalyzingThis && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 size={13} className="animate-spin text-white" />
                        </div>
                      )}
                    </div>

                    {/* Info Ringkas */}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-bold text-slate-800 truncate max-w-[110px]">
                        {att.name}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {isAnalyzingThis
                          ? 'Menganalisis...'
                          : pendingOcrResult
                          ? 'Siap diterapkan'
                          : 'Tersimpan aman'}
                      </span>
                    </div>

                    {/* Tombol Aksi per Lampiran */}
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {!isAnalyzingThis && (
                        <button
                          type="button"
                          onClick={() => runOcrOnAttachment(att)}
                          className="h-6 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                          title="Ulangi parsing AI dari foto ini"
                        >
                          <RotateCw size={11} />
                          <span>Ulangi</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id!)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Hapus lampiran"
                      >
                        <X size={13} className="stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Hidden inputs untuk kamera dan galeri */}
        <input
          ref={simrsCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => e.target.files?.[0] && handleProcessImage(e.target.files[0])}
        />
        <input
          ref={simrsGalleryRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && handleProcessImage(e.target.files[0])}
        />

        {/* Form Body dengan Scrollable Input dan Sticky Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Bagian Input Scrollable - Bersih & Padat */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5 text-xs">
            {/* S (Subjektif) - List Keluhan dengan Status Switcher & Preset */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-base font-black text-blue-600 tracking-wide">S</span>
                {complaints.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setComplaints([])}
                    className="size-6 rounded-md flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Kosongkan keluhan"
                    aria-label="Kosongkan keluhan"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Daftar Keluhan Visite Berbentuk List Hairline (Tanpa Kotak Bertingkat) */}
              <div className="divide-y divide-slate-100">
                {complaints.map((item) => {
                  const isSwiped = swipedComplaintId === item.id
                  const isMenuOpen = activeStatusMenuId === item.id

                  return (
                    <div
                      key={item.id}
                      data-complaint-row
                      onTouchStart={handleTouchStart}
                      onTouchEnd={(e) => handleTouchEnd(e, item.id)}
                      className="relative flex items-center justify-between gap-2 py-1.5 px-0.5 text-xs transition-all overflow-visible"
                    >
                      <span className="text-slate-400 font-black text-sm shrink-0 select-none leading-none pl-0.5">
                        •
                      </span>
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) => handleUpdateComplaintText(item.id, e.target.value)}
                        onBlur={(e) => {
                          if (!e.target.value.trim()) {
                            handleRemoveComplaint(item.id)
                          }
                        }}
                        className="flex-1 text-xs font-semibold text-slate-800 bg-transparent outline-none truncate"
                        placeholder="Nama keluhan..."
                      />

                      {/* Mode A: Muncul saat baris di-SWIPE ke kiri */}
                      {isSwiped ? (
                        <div className="flex items-center gap-1 shrink-0 bg-slate-50 p-0.5 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-right-3 duration-150 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => {
                              handleSetComplaintStatus(item.id, '-')
                              setSwipedComplaintId(null)
                            }}
                            className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                              item.status === '-'
                                ? 'bg-slate-300 text-slate-900 font-black'
                                : 'text-slate-500 hover:bg-slate-200'
                            }`}
                            title="Hilang (-)"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleSetComplaintStatus(item.id, '+')
                              setSwipedComplaintId(null)
                            }}
                            className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                              item.status === '+'
                                ? 'bg-amber-500 text-white font-black'
                                : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600'
                            }`}
                            title="Masih menetap (+)"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleSetComplaintStatus(item.id, '↓')
                              setSwipedComplaintId(null)
                            }}
                            className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                              item.status === '↓'
                                ? 'bg-emerald-600 text-white font-black'
                                : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'
                            }`}
                            title="Berkurang / membaik (↓)"
                          >
                            <ArrowDown size={12} className="stroke-[2.5]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleSetComplaintStatus(item.id, '↑')
                              setSwipedComplaintId(null)
                            }}
                            className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                              item.status === '↑'
                                ? 'bg-rose-600 text-white font-black'
                                : 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                            }`}
                            title="Memberat / meningkat (↑)"
                          >
                            <ArrowUp size={12} className="stroke-[2.5]" />
                          </button>
                          <div className="w-px h-3.5 bg-slate-200 mx-0.5" />
                          <button
                            type="button"
                            onClick={() => {
                              handleRemoveComplaint(item.id)
                              setSwipedComplaintId(null)
                            }}
                            className="size-6 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                            title="Hapus keluhan"
                          >
                            <X size={13} className="stroke-[2.5]" />
                          </button>
                        </div>
                      ) : (
                        /* Mode B: Tampilan Ringkas 1 Badge (DIKLIK muncul pilihan popover) */
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setActiveStatusMenuId(isMenuOpen ? null : item.id)}
                            className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
                              item.status === '+'
                                ? 'bg-amber-500 text-white font-black'
                                : item.status === '↓'
                                ? 'bg-emerald-600 text-white font-black'
                                : item.status === '↑'
                                ? 'bg-rose-600 text-white font-black'
                                : 'bg-slate-200 text-slate-800 font-black'
                            }`}
                            title="Klik atau geser untuk ubah status keluhan"
                          >
                            {item.status === '↓' ? (
                              <ArrowDown size={13} className="stroke-[2.5]" />
                            ) : item.status === '↑' ? (
                              <ArrowUp size={13} className="stroke-[2.5]" />
                            ) : (
                              <span>{item.status}</span>
                            )}
                          </button>

                          {/* Popover Pilihan Status Saat Tombol Diklik */}
                          {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 z-30 flex items-center gap-1 p-1 bg-white rounded-xl shadow-lg border border-slate-200 animate-in fade-in zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSetComplaintStatus(item.id, '-')
                                  setActiveStatusMenuId(null)
                                }}
                                className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                                  item.status === '-'
                                    ? 'bg-slate-200 text-slate-800 font-black'
                                    : 'text-slate-500 hover:bg-slate-100'
                                }`}
                                title="Hilang (-)"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSetComplaintStatus(item.id, '+')
                                  setActiveStatusMenuId(null)
                                }}
                                className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                                  item.status === '+'
                                    ? 'bg-amber-500 text-white font-black'
                                    : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600'
                                }`}
                                title="Masih menetap (+)"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSetComplaintStatus(item.id, '↓')
                                  setActiveStatusMenuId(null)
                                }}
                                className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                                  item.status === '↓'
                                    ? 'bg-emerald-600 text-white font-black'
                                    : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'
                                }`}
                                title="Berkurang / membaik (↓)"
                              >
                                <ArrowDown size={12} className="stroke-[2.5]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSetComplaintStatus(item.id, '↑')
                                  setActiveStatusMenuId(null)
                                }}
                                className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                                  item.status === '↑'
                                    ? 'bg-rose-600 text-white font-black'
                                    : 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                                }`}
                                title="Memberat / meningkat (↑)"
                              >
                                <ArrowUp size={12} className="stroke-[2.5]" />
                              </button>
                              <div className="w-px h-3.5 bg-slate-200 mx-0.5" />
                              <button
                                type="button"
                                onClick={() => {
                                  handleRemoveComplaint(item.id)
                                  setActiveStatusMenuId(null)
                                }}
                                className="size-6 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                                title="Hapus keluhan"
                              >
                                <X size={13} className="stroke-[2.5]" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {!complaints.length && (
                  <div className="py-0.5 px-1 text-slate-500 text-sm font-bold">
                    -
                  </div>
                )}
              </div>

              {/* Input Tambah Keluhan dengan Suggestion Cepat ala Lomeal */}
              <div className="flex items-center gap-1.5">
                <PredictiveInput
                  type="complaint"
                  value={newComplaintInput}
                  onChange={(val) => setNewComplaintInput(val)}
                  onSelect={(item) => {
                    handleAddQuickComplaint(item.name)
                    setNewComplaintInput('')
                  }}
                  onCustomSubmit={handleAddCustomComplaint}
                  placeholder="Tambahkan keluhan..."
                  className="flex-1"
                  inputClassName="w-full h-8 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-primary outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={handleAddCustomComplaint}
                  disabled={!newComplaintInput.trim()}
                  className="h-8 px-3 rounded-xl bg-primary hover:bg-primary-deep text-white font-semibold text-xs disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                >
                  +
                </button>
              </div>
            </div>

            {/* O (Objektif) - Form Terstruktur 2 Kolom ala Keluhan */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-base font-black text-emerald-600 tracking-wide">O</span>
                <button
                  type="button"
                  onClick={() => setPemfisViewMode(pemfisViewMode === 'structured' ? 'raw' : 'structured')}
                  className="text-[10px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                >
                  {pemfisViewMode === 'structured' ? 'Edit Teks Narasi' : 'Kembali ke 2 Kolom'}
                </button>
              </div>

              {pemfisViewMode === 'raw' ? (
                /* Mode Fallback Teks Narasi */
                <textarea
                  rows={4}
                  value={O_pemfis}
                  onChange={(e) => {
                    setOPemfis(e.target.value)
                    setPemfis(parsePemfisFromString(e.target.value))
                  }}
                  placeholder="KU, TTV, status generalis & defisit neurologis..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none leading-relaxed transition-colors"
                />
              ) : (
                /* Mode 2 Kolom Terstruktur */
                (() => {
                  const hasActiveTtv = ['ku', 'td', 'hr', 'rr', 'suhu', 'spo2'].some((k) =>
                    pemfis.activeKeys.includes(k)
                  )
                  const hasActiveInterna = ['kl', 'cor', 'thorax', 'abdomen', 'ekstremitas'].some((k) =>
                    pemfis.activeKeys.includes(k)
                  )
                  const hasActiveNeuro = [
                    'gcs',
                    'ms',
                    'n_cranialis',
                    'rfisio',
                    'rpato',
                    'tonus',
                    'mmt',
                    'sensorik',
                    'autonom',
                    'pupil',
                    'meningeal',
                    'motorik',
                  ].some((k) => pemfis.activeKeys.includes(k))
                  const hasActiveLokalis = pemfis.customRows.length > 0
                  const hasAny = hasActiveTtv || hasActiveInterna || hasActiveNeuro || hasActiveLokalis

                  return (
                    <div className="border border-slate-200/80 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white shadow-2xs">
                      {/* SEKSI 1: TANDA VITAL & KU */}
                      {hasActiveTtv && (
                        <>
                          <div className="bg-slate-50/80 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                            Tanda Vital & KU
                          </div>

                          {/* KU */}
                          {pemfis.activeKeys.includes('ku') && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">KU</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setOpenKuMenu(!openKuMenu)}
                                    className={`h-7 px-2.5 text-xs font-bold rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors shadow-2xs min-w-24 max-w-xs ${
                                      pemfis.ku?.toLowerCase() === 'buruk'
                                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                                        : pemfis.ku?.toLowerCase() === 'lemah'
                                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                                        : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    }`}
                                  >
                                    <span className="capitalize truncate whitespace-nowrap">{pemfis.ku || 'Cukup'}</span>
                                    <span className="text-[9px] text-slate-400 shrink-0">▼</span>
                                  </button>

                                  {openKuMenu && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-20"
                                        onClick={() => setOpenKuMenu(false)}
                                      />
                                      <div className="absolute left-0 top-full mt-1 z-30 w-36 bg-white rounded-xl shadow-xl border border-slate-200 py-1 divide-y divide-slate-100 text-xs">
                                        <div className="py-1">
                                          {(['cukup', 'lemah', 'buruk'] as const).map((opt) => (
                                            <button
                                              key={opt}
                                              type="button"
                                              onClick={() => {
                                                setPemfis((prev) => ({ ...prev, ku: opt }))
                                                setOpenKuMenu(false)
                                              }}
                                              className={`w-full text-left px-3 py-1.5 font-medium flex items-center justify-between cursor-pointer capitalize ${
                                                pemfis.ku?.toLowerCase() === opt
                                                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                                                  : 'text-slate-700 hover:bg-slate-50'
                                              }`}
                                            >
                                              <span>{opt}</span>
                                              {pemfis.ku?.toLowerCase() === opt && (
                                                <Check size={12} className="text-emerald-600" />
                                              )}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePemfisParam('ku')}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus KU"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* TD */}
                  {pemfis.activeKeys.includes('td') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">TD</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            ref={sistolRef}
                            type="text"
                            inputMode="numeric"
                            maxLength={3}
                            value={pemfis.td_sistol}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 3)
                              setPemfis((prev) => ({ ...prev, td_sistol: val }))
                              if (val.length === 3 && diastolRef.current) {
                                diastolRef.current.focus()
                                diastolRef.current.select()
                              }
                            }}
                            placeholder="120"
                            className="w-14 h-7 text-left px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-primary outline-none"
                          />
                          <span className="text-slate-400 font-bold text-xs">/</span>
                          <input
                            ref={diastolRef}
                            type="text"
                            inputMode="numeric"
                            maxLength={3}
                            value={pemfis.td_diastol}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 3)
                              setPemfis((prev) => ({ ...prev, td_diastol: val }))
                            }}
                            placeholder="80"
                            className="w-14 h-7 text-left px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-primary outline-none"
                          />
                          <span className="text-[11px] text-slate-400 font-medium ml-0.5">mmHg</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('td')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus TD"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Nadi / HR */}
                  {pemfis.activeKeys.includes('hr') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Nadi</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={3}
                            value={pemfis.hr}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 3)
                              setPemfis((prev) => ({ ...prev, hr: val }))
                            }}
                            placeholder="80"
                            className="w-14 h-7 text-left px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-primary outline-none"
                          />
                          <span className="text-[11px] text-slate-400 font-medium">x/m</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('hr')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus Nadi"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* RR */}
                  {pemfis.activeKeys.includes('rr') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">RR</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            value={pemfis.rr}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 2)
                              setPemfis((prev) => ({ ...prev, rr: val }))
                            }}
                            placeholder="20"
                            className="w-14 h-7 text-left px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-primary outline-none"
                          />
                          <span className="text-[11px] text-slate-400 font-medium">x/m</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('rr')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus RR"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Suhu */}
                  {pemfis.activeKeys.includes('suhu') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Suhu</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            maxLength={5}
                            value={pemfis.suhu}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.,]/g, '').slice(0, 5)
                              setPemfis((prev) => ({ ...prev, suhu: val }))
                            }}
                            placeholder="36.5"
                            className="w-14 h-7 text-left px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-primary outline-none"
                          />
                          <span className="text-[11px] text-slate-400 font-medium">°C</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('suhu')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus Suhu"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SpO2 */}
                  {pemfis.activeKeys.includes('spo2') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">SpO2</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={3}
                            value={pemfis.spo2}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 3)
                              setPemfis((prev) => ({ ...prev, spo2: val }))
                            }}
                            placeholder="98"
                            className="w-14 h-7 text-left px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-primary outline-none"
                          />
                          <span className="text-[11px] text-slate-400 font-medium">%</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('spo2')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus SpO2"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}
                        </>
                      )}

                      {/* SEKSI 2: STATUS INTERNA */}
                      {hasActiveInterna && (
                        <>
                          <div className="bg-slate-50/80 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                            Status Interna
                          </div>

                          {/* Kep/Leher (Kepala / Leher) */}
                          {pemfis.activeKeys.includes('kl') && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Kep/Leher</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <div className="relative flex-1 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => setOpenKlMenu(!openKlMenu)}
                                    className={`w-full h-7 px-2.5 text-xs font-medium rounded-lg border flex items-center justify-between gap-1.5 cursor-pointer transition-colors shadow-2xs ${
                                      (pemfis.kl_anemis?.some(Boolean) ||
                                        pemfis.kl_ikterik?.some(Boolean) ||
                                        pemfis.kl_cyanosis?.some(Boolean))
                                        ? 'bg-amber-50 text-amber-900 border-amber-300 font-bold'
                                        : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-white'
                                    }`}
                                    title="Klik untuk mengatur Anemis, Ikterik, Cyanosis"
                                  >
                                    <span className="truncate text-left font-semibold">
                                      {pemfis.kl ||
                                        formatKlString(
                                          pemfis.kl_anemis,
                                          pemfis.kl_ikterik,
                                          pemfis.kl_cyanosis,
                                          pemfis.kl_custom
                                        )}
                                    </span>
                                    <span className="text-[9px] text-slate-400 shrink-0">▼</span>
                                  </button>

                                  {openKlMenu && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-20"
                                        onClick={() => setOpenKlMenu(false)}
                                      />
                                      <div className="absolute left-0 top-full mt-1 z-30 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden text-xs divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                                        {/* Header Popup */}
                                        <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between">
                                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Kep/Leher (A / I / C)
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const anemis: [boolean, boolean] = [false, false]
                                              const ikterik: [boolean, boolean] = [false, false]
                                              const cyanosis: [boolean, boolean] = [false, false]
                                              const formatted = formatKlString(anemis, ikterik, cyanosis, pemfis.kl_custom)
                                              setPemfis((prev) => ({
                                                ...prev,
                                                kl_anemis: anemis,
                                                kl_ikterik: ikterik,
                                                kl_cyanosis: cyanosis,
                                                kl: formatted,
                                              }))
                                            }}
                                            className="text-[10px] text-primary hover:underline font-bold cursor-pointer"
                                          >
                                            Semua (-/-)
                                          </button>
                                        </div>

                                        {/* Baris Anemis */}
                                        <div className="flex items-center justify-between px-3 py-2">
                                          <span className="text-xs font-bold text-slate-700">Anemis</span>
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const cur = pemfis.kl_anemis || [false, false]
                                                const next: [boolean, boolean] = [!cur[0], cur[1]]
                                                const formatted = formatKlString(next, pemfis.kl_ikterik, pemfis.kl_cyanosis, pemfis.kl_custom)
                                                setPemfis((prev) => ({ ...prev, kl_anemis: next, kl: formatted }))
                                              }}
                                              className={`size-7 rounded-lg font-bold text-xs flex items-center justify-center border transition-all cursor-pointer ${
                                                pemfis.kl_anemis?.[0]
                                                  ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs'
                                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                                              }`}
                                              title="Mata Kanan: klik untuk ubah (- / +)"
                                            >
                                              {pemfis.kl_anemis?.[0] ? '+' : '-'}
                                            </button>
                                            <span className="text-slate-400 font-bold">/</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const cur = pemfis.kl_anemis || [false, false]
                                                const next: [boolean, boolean] = [cur[0], !cur[1]]
                                                const formatted = formatKlString(next, pemfis.kl_ikterik, pemfis.kl_cyanosis, pemfis.kl_custom)
                                                setPemfis((prev) => ({ ...prev, kl_anemis: next, kl: formatted }))
                                              }}
                                              className={`size-7 rounded-lg font-bold text-xs flex items-center justify-center border transition-all cursor-pointer ${
                                                pemfis.kl_anemis?.[1]
                                                  ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs'
                                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                                              }`}
                                              title="Mata Kiri: klik untuk ubah (- / +)"
                                            >
                                              {pemfis.kl_anemis?.[1] ? '+' : '-'}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Baris Ikterik */}
                                        <div className="flex items-center justify-between px-3 py-2">
                                          <span className="text-xs font-bold text-slate-700">Ikterik</span>
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const cur = pemfis.kl_ikterik || [false, false]
                                                const next: [boolean, boolean] = [!cur[0], cur[1]]
                                                const formatted = formatKlString(pemfis.kl_anemis, next, pemfis.kl_cyanosis, pemfis.kl_custom)
                                                setPemfis((prev) => ({ ...prev, kl_ikterik: next, kl: formatted }))
                                              }}
                                              className={`size-7 rounded-lg font-bold text-xs flex items-center justify-center border transition-all cursor-pointer ${
                                                pemfis.kl_ikterik?.[0]
                                                  ? 'bg-amber-50 border-amber-300 text-amber-700 shadow-2xs'
                                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                                              }`}
                                              title="Sklera Kanan: klik untuk ubah (- / +)"
                                            >
                                              {pemfis.kl_ikterik?.[0] ? '+' : '-'}
                                            </button>
                                            <span className="text-slate-400 font-bold">/</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const cur = pemfis.kl_ikterik || [false, false]
                                                const next: [boolean, boolean] = [cur[0], !cur[1]]
                                                const formatted = formatKlString(pemfis.kl_anemis, next, pemfis.kl_cyanosis, pemfis.kl_custom)
                                                setPemfis((prev) => ({ ...prev, kl_ikterik: next, kl: formatted }))
                                              }}
                                              className={`size-7 rounded-lg font-bold text-xs flex items-center justify-center border transition-all cursor-pointer ${
                                                pemfis.kl_ikterik?.[1]
                                                  ? 'bg-amber-50 border-amber-300 text-amber-700 shadow-2xs'
                                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                                              }`}
                                              title="Sklera Kiri: klik untuk ubah (- / +)"
                                            >
                                              {pemfis.kl_ikterik?.[1] ? '+' : '-'}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Baris Cyanosis */}
                                        <div className="flex items-center justify-between px-3 py-2">
                                          <span className="text-xs font-bold text-slate-700">Cyanosis</span>
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const cur = pemfis.kl_cyanosis || [false, false]
                                                const next: [boolean, boolean] = [!cur[0], cur[1]]
                                                const formatted = formatKlString(pemfis.kl_anemis, pemfis.kl_ikterik, next, pemfis.kl_custom)
                                                setPemfis((prev) => ({ ...prev, kl_cyanosis: next, kl: formatted }))
                                              }}
                                              className={`size-7 rounded-lg font-bold text-xs flex items-center justify-center border transition-all cursor-pointer ${
                                                pemfis.kl_cyanosis?.[0]
                                                  ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs'
                                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                                              }`}
                                              title="Perifer: klik untuk ubah (- / +)"
                                            >
                                              {pemfis.kl_cyanosis?.[0] ? '+' : '-'}
                                            </button>
                                            <span className="text-slate-400 font-bold">/</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const cur = pemfis.kl_cyanosis || [false, false]
                                                const next: [boolean, boolean] = [cur[0], !cur[1]]
                                                const formatted = formatKlString(pemfis.kl_anemis, pemfis.kl_ikterik, next, pemfis.kl_custom)
                                                setPemfis((prev) => ({ ...prev, kl_cyanosis: next, kl: formatted }))
                                              }}
                                              className={`size-7 rounded-lg font-bold text-xs flex items-center justify-center border transition-all cursor-pointer ${
                                                pemfis.kl_cyanosis?.[1]
                                                  ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs'
                                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                                              }`}
                                              title="Sentral: klik untuk ubah (- / +)"
                                            >
                                              {pemfis.kl_cyanosis?.[1] ? '+' : '-'}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Input Tambahan (KGB, dll.) */}
                                        <div className="p-2 bg-slate-50/50">
                                          <input
                                            type="text"
                                            value={pemfis.kl_custom || ''}
                                            onChange={(e) => {
                                              const customVal = e.target.value
                                              const formatted = formatKlString(
                                                pemfis.kl_anemis,
                                                pemfis.kl_ikterik,
                                                pemfis.kl_cyanosis,
                                                customVal
                                              )
                                              setPemfis((prev) => ({ ...prev, kl_custom: customVal, kl: formatted }))
                                            }}
                                            placeholder="KGB (-), JVP normal, dll..."
                                            className="w-full h-7 px-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:border-primary outline-none"
                                          />
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePemfisParam('kl')}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus Kep/Leher"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Cor */}
                  {pemfis.activeKeys.includes('cor') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Cor</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <input
                          type="text"
                          value={pemfis.cor}
                          onChange={(e) => setPemfis((prev) => ({ ...prev, cor: e.target.value }))}
                          placeholder="S1 S2 tunggal reguler, murmur (-), gallop (-)..."
                          className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('cor')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus Cor"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Thorax */}
                  {pemfis.activeKeys.includes('thorax') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Thorax</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <input
                          type="text"
                          value={pemfis.thorax_custom}
                          onChange={(e) => setPemfis((prev) => ({ ...prev, thorax_custom: e.target.value }))}
                          placeholder="Pulmo: vesikuler (+/+), Rh (-/-), Wh (-/-)..."
                          className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('thorax')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus Thorax"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Abdomen */}
                  {pemfis.activeKeys.includes('abdomen') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Abdomen</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <input
                          type="text"
                          value={pemfis.abdomen_custom}
                          onChange={(e) => setPemfis((prev) => ({ ...prev, abdomen_custom: e.target.value }))}
                          placeholder="Supel, BU (+) normal, NT (-)..."
                          className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('abdomen')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus Abdomen"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Ekstremitas */}
                  {pemfis.activeKeys.includes('ekstremitas') && (
                    <div className="flex items-center justify-between py-2 px-3 gap-2">
                      <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Ekstremitas</span>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                        <input
                          type="text"
                          value={pemfis.ekstremitas_custom}
                          onChange={(e) => setPemfis((prev) => ({ ...prev, ekstremitas_custom: e.target.value }))}
                          placeholder="Akral hangat, CRT < 2s, Edema (-/-)..."
                          className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePemfisParam('ekstremitas')}
                          className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                          title="Hapus Ekstremitas"
                        >
                          <X size={13} className="stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  )}
                        </>
                      )}

                      {/* SEKSI 3: STATUS NEUROLOGIS */}
                      {hasActiveNeuro && (
                        <>
                          <div className="bg-slate-50/80 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                            Status Neurologis
                          </div>

                          {/* 1. GCS */}
                          {pemfis.activeKeys.includes('gcs') && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">GCS</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <GcsDigitBox
                                    label="E"
                                    value={pemfis.gcs_e}
                                    min={1}
                                    max={4}
                                    onChange={(val) => setPemfis((prev) => ({ ...prev, gcs_e: val }))}
                                  />
                                  <GcsDigitBox
                                    label="V"
                                    value={pemfis.gcs_v}
                                    min={1}
                                    max={5}
                                    onChange={(val) => setPemfis((prev) => ({ ...prev, gcs_v: val }))}
                                  />
                                  <GcsDigitBox
                                    label="M"
                                    value={pemfis.gcs_m}
                                    min={1}
                                    max={6}
                                    onChange={(val) => setPemfis((prev) => ({ ...prev, gcs_m: val }))}
                                  />
                                  {/* Total badge */}
                                  {(() => {
                                    const tot =
                                      (parseInt(pemfis.gcs_e, 10) || 0) +
                                      (parseInt(pemfis.gcs_v, 10) || 0) +
                                      (parseInt(pemfis.gcs_m, 10) || 0)
                                    return (
                                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                        {tot}
                                      </span>
                                    )
                                  })()}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePemfisParam('gcs')}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus GCS"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 2. MS (Meningeal Sign) */}
                          {(pemfis.activeKeys.includes('ms') || pemfis.activeKeys.includes('meningeal')) && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">MS</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={pemfis.ms || pemfis.meningeal || ''}
                                  onChange={(e) => setPemfis((prev) => ({ ...prev, ms: e.target.value, meningeal: e.target.value }))}
                                  placeholder="Kaku kuduk (-), Brudzinski (-), Kernig (-)..."
                                  className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRemovePemfisParam('ms')
                                    handleRemovePemfisParam('meningeal')
                                  }}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus MS"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 3. N Cranialis (I - XII) */}
                          {(pemfis.activeKeys.includes('n_cranialis') || pemfis.activeKeys.includes('pupil')) && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">N Cranialis</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={pemfis.n_cranialis || pemfis.pupil || ''}
                                  onChange={(e) => setPemfis((prev) => ({ ...prev, n_cranialis: e.target.value, pupil: e.target.value }))}
                                  placeholder="N.II-III: pupil isokor 3mm/3mm, RC (+/+); N.VII/XII: normal..."
                                  className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRemovePemfisParam('n_cranialis')
                                    handleRemovePemfisParam('pupil')
                                  }}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus N Cranialis"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 4. R. Fisio */}
                          {pemfis.activeKeys.includes('rfisio') && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">R. Fisio</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={pemfis.rfisio || ''}
                                  onChange={(e) => setPemfis((prev) => ({ ...prev, rfisio: e.target.value }))}
                                  placeholder="BPR (+2/+2), TPR (+2/+2), KPR (+2/+2), APR (+2/+2)..."
                                  className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePemfisParam('rfisio')}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus R. Fisio"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 5. R. Pato */}
                          {pemfis.activeKeys.includes('rpato') && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">R. Pato</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={pemfis.rpato || ''}
                                  onChange={(e) => setPemfis((prev) => ({ ...prev, rpato: e.target.value }))}
                                  placeholder="Babinski (-/-), Chaddock (-/-), Hoffman-Tromner (-/-)..."
                                  className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePemfisParam('rpato')}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus R. Pato"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 6. Tonus */}
                          {pemfis.activeKeys.includes('tonus') && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Tonus</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={pemfis.tonus || ''}
                                  onChange={(e) => setPemfis((prev) => ({ ...prev, tonus: e.target.value }))}
                                  placeholder="Eutoni / normal di keempat ekstremitas..."
                                  className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePemfisParam('tonus')}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus Tonus"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 7. MMT */}
                          {(pemfis.activeKeys.includes('mmt') || pemfis.activeKeys.includes('motorik')) && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">MMT</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={pemfis.mmt || pemfis.motorik || ''}
                                  onChange={(e) => setPemfis((prev) => ({ ...prev, mmt: e.target.value, motorik: e.target.value }))}
                                  placeholder="5555/5555, 5555/5555..."
                                  className="flex-1 h-7 px-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRemovePemfisParam('mmt')
                                    handleRemovePemfisParam('motorik')
                                  }}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus MMT"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 8. Sensorik */}
                          {pemfis.activeKeys.includes('sensorik') && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Sensorik</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={pemfis.sensorik || ''}
                                  onChange={(e) => setPemfis((prev) => ({ ...prev, sensorik: e.target.value }))}
                                  placeholder="Hemihipestesi (-), sensibilitas normal..."
                                  className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePemfisParam('sensorik')}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus Sensorik"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 9. Autonom */}
                          {pemfis.activeKeys.includes('autonom') && (
                            <div className="flex items-center justify-between py-2 px-3 gap-2">
                              <span className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700">Autonom</span>
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={pemfis.autonom || ''}
                                  onChange={(e) => setPemfis((prev) => ({ ...prev, autonom: e.target.value }))}
                                  placeholder="BAB (+), BAK (+) spontan..."
                                  className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePemfisParam('autonom')}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus Autonom"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* SEKSI 4: STATUS LOKALIS */}
                      {hasActiveLokalis && (
                        <>
                          <div className="bg-slate-50/80 px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                            Status Lokalis
                          </div>

                          {/* Custom Rows */}
                          {pemfis.customRows.map((row) => (
                            <div key={row.id} className="flex items-center justify-between py-2 px-3 gap-2">
                              <input
                                type="text"
                                value={row.label}
                                onChange={(e) => handleUpdateCustomPemfisRow(row.id, 'label', e.target.value)}
                                placeholder="Lainnya..."
                                className="w-24 shrink-0 h-7 px-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                              />
                              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={row.value}
                                  onChange={(e) => handleUpdateCustomPemfisRow(row.id, 'value', e.target.value)}
                                  placeholder="Luka / ruam / benjolan..."
                                  className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCustomPemfisRow(row.id)}
                                  className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                  title="Hapus baris"
                                >
                                  <X size={13} className="stroke-[2.5]" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {!hasAny && (
                        <div className="py-3 px-3 text-center text-xs text-slate-400">
                          Belum ada parameter pemeriksaan fisik aktif.
                        </div>
                      )}
                    </div>
                  )
                })()
              )}

              {/* Tombol Tambah Parameter */}
              {pemfisViewMode === 'structured' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAddParamMenu(!showAddParamMenu)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-deep py-1 px-1 rounded hover:bg-primary/5 cursor-pointer transition-colors"
                  >
                    <Plus size={13} className="stroke-[2.5]" />
                    <span>Tambah Parameter</span>
                  </button>

                  {showAddParamMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setShowAddParamMenu(false)}
                      />
                      <div className="absolute left-0 bottom-full mb-1 z-30 w-64 max-h-72 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 py-1 divide-y divide-slate-100 text-xs">
                        {(
                          [
                            { cat: 'ttv', title: 'Tanda Vital & KU' },
                            { cat: 'interna', title: 'Status Interna' },
                            { cat: 'neurologis', title: 'Status Neurologis' },
                          ] as const
                        ).map(({ cat, title }) => {
                          const unactiveInCat = AVAILABLE_PEMFIS_PARAMS.filter(
                            (p) => p.category === cat && !pemfis.activeKeys.includes(p.key)
                          )
                          if (unactiveInCat.length === 0) return null
                          return (
                            <div key={cat} className="py-1">
                              <div className="px-3 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {title}
                              </div>
                              {unactiveInCat.map((p) => (
                                <button
                                  key={p.key}
                                  type="button"
                                  onClick={() => handleAddPemfisParam(p.key)}
                                  className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 font-medium flex items-center justify-between cursor-pointer"
                                >
                                  <span>{p.label}</span>
                                  <Plus size={12} className="text-slate-400" />
                                </button>
                              ))}
                            </div>
                          )
                        })}

                        {AVAILABLE_PEMFIS_PARAMS.every((p) =>
                          pemfis.activeKeys.includes(p.key)
                        ) && (
                          <div className="px-3 py-1.5 text-[11px] text-slate-400">
                            Semua parameter standar aktif
                          </div>
                        )}

                        <div className="py-1">
                          <div className="px-3 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Status Lokalis
                          </div>
                          <button
                            type="button"
                            onClick={handleAddCustomPemfisRow}
                            className="w-full text-left px-3 py-1.5 text-primary hover:bg-primary/5 font-bold flex items-center justify-between cursor-pointer"
                          >
                            <span>+ Status Lokalis (Luka / Ruam / dsb.)</span>
                            <Plus size={12} className="text-primary" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Penunjang (2 Kolom ala Pemfis) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-bold text-slate-700">Penunjang</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPenunjangViewMode(penunjangViewMode === 'structured' ? 'raw' : 'structured')
                    }
                    className="text-[10px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                  >
                    {penunjangViewMode === 'structured' ? 'Edit Teks Bebas' : 'Kembali ke 2 Kolom'}
                  </button>
                </div>

                {penunjangViewMode === 'raw' ? (
                  /* Mode Fallback Teks Bebas */
                  <textarea
                    rows={3}
                    value={O_penunjang}
                    onChange={(e) => {
                      setOPenunjang(e.target.value)
                      setPenunjangItems(parsePenunjangFromString(e.target.value))
                    }}
                    placeholder="GDA: 117&#10;CT Scan: Infark cerebri lakunar..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none leading-relaxed transition-colors"
                  />
                ) : (
                  /* Mode 2 Kolom Terstruktur */
                  <div className="border border-slate-200/80 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white shadow-2xs">
                    {penunjangItems.length === 0 ? (
                      <div className="py-2.5 px-3 text-center text-xs text-slate-400">
                        Belum ada data penunjang. Klik "+ Tambah Penunjang" di bawah.
                      </div>
                    ) : (
                      penunjangItems.map((item) => {
                        const isCustom = item.isCustom ?? !isPresetPenunjang(item.name)
                        return (
                          <div key={item.id} className="flex items-center justify-between py-2 px-3 gap-2">
                            {isCustom ? (
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleUpdatePenunjangItem(item.id, 'name', e.target.value)}
                                placeholder="Lainnya..."
                                className="w-24 shrink-0 h-7 px-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                              />
                            ) : (
                              <span
                                className="w-24 shrink-0 whitespace-nowrap text-xs font-bold text-slate-700 truncate"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                            )}
                            <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                              <input
                                type="text"
                                value={item.value}
                                onChange={(e) => handleUpdatePenunjangItem(item.id, 'value', e.target.value)}
                                placeholder="Hasil / interpretasi..."
                                className="flex-1 h-7 px-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-primary outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemovePenunjangItem(item.id)}
                                className="size-6 text-slate-300 hover:text-rose-500 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                                title="Hapus baris"
                              >
                                <X size={13} className="stroke-[2.5]" />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {/* Tombol Tambah Penunjang & Chips Cepat */}
                {penunjangViewMode === 'structured' && (
                  <div className="flex items-center justify-between gap-1 flex-wrap pt-0.5">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowAddPenunjangMenu(!showAddPenunjangMenu)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-deep py-1 px-1 rounded hover:bg-primary/5 cursor-pointer transition-colors"
                      >
                        <Plus size={13} className="stroke-[2.5]" />
                        <span>Tambah Penunjang</span>
                      </button>

                      {showAddPenunjangMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setShowAddPenunjangMenu(false)}
                          />
                          <div className="absolute left-0 bottom-full mb-1 z-30 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1 divide-y divide-slate-100 text-xs">
                            <div className="py-1 max-h-48 overflow-y-auto">
                              {COMMON_PENUNJANG_PRESETS.map((name) => (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => handleAddPenunjangItem(name, false)}
                                  className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 font-medium flex items-center justify-between cursor-pointer"
                                >
                                  <span>{name}</span>
                                  <Plus size={12} className="text-slate-400" />
                                </button>
                              ))}
                            </div>
                            <div className="py-1">
                              <button
                                type="button"
                                onClick={() => handleAddPenunjangItem('', true)}
                                className="w-full text-left px-3 py-1.5 text-primary hover:bg-primary/5 font-bold flex items-center justify-between cursor-pointer"
                              >
                                <span>+ Lainnya (Ketik bebas)</span>
                                <Plus size={12} className="text-primary" />
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* A (Asesmen) */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-base font-black text-purple-600 tracking-wide">A</span>
                <span className="text-[10px] text-slate-400 font-normal">1 diagnosis per baris</span>
              </div>
              <textarea
                rows={2}
                value={A}
                onChange={(e) => setA(e.target.value)}
                placeholder="Daftar diagnosis (1 diagnosis per baris)..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none leading-relaxed transition-colors"
              />
            </div>

            {/* P (Planning: PDx & PTx) */}
            <div className="pt-2 border-t border-slate-100 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-base font-black text-amber-600 tracking-wide">P</span>
              </div>

              {/* PDx (Rencana Penunjang) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700">
                    PDx
                  </label>
                  {pdxList.length > 0 && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {pdxList.filter((p) => p.status === 'stop').length}/{pdxList.length} selesai
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <PredictiveInput
                    type="procedure"
                    value={quickPdxInput}
                    onChange={(val) => setQuickPdxInput(val)}
                    onSelect={(item) => setQuickPdxInput(item.name)}
                    placeholder="Rencana penunjang / ICD-9 lainnya..."
                    className="flex-1"
                    inputClassName="w-full h-8 rounded-xl border border-slate-200 bg-slate-50/40 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddPdx()}
                    disabled={!quickPdxInput.trim()}
                    className="h-8 px-3 rounded-xl bg-primary hover:bg-primary-deep text-white font-semibold text-xs disabled:opacity-40 transition-colors cursor-pointer shrink-0 shadow-xs"
                  >
                    Tambah
                  </button>
                </div>

                {pdxList.length > 0 && (
                  <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto border border-slate-200/80 rounded-xl px-2.5 py-0.5 bg-slate-50/30">
                    {pdxList.map((item) => {
                      const originalIdx = P.indexOf(item)
                      const isDone = item.status === 'stop'
                      return (
                        <div
                          key={originalIdx}
                          className="flex items-center justify-between gap-2 py-1.5 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleDrugStatus(originalIdx)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
                          >
                            {isDone ? (
                              <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                            ) : (
                              <Square size={16} className="text-slate-400 group-hover:text-primary shrink-0 transition-colors" />
                            )}
                            <span className={`font-semibold truncate ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {item.nama_item}
                            </span>
                            {item.dosis_keterangan && (
                              <span className="text-slate-500 text-xs truncate">({item.dosis_keterangan})</span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDrug(originalIdx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer shrink-0 transition-colors"
                            title="Hapus"
                          >
                            <X size={13} className="stroke-[2.5]" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* PTx (Rencana Terapi Obat) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700">PTx</label>
                  {ptxList.length > 0 && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                      {ptxList.filter((p) => p.status === 'aktif').length} aktif
                    </span>
                  )}
                </div>

                {/* Input Pencarian Obat Bebas */}
                <div className="flex items-center gap-1.5">
                  <PredictiveInput
                    type="drug"
                    value={quickPtxInput}
                    onChange={(val) => setQuickPtxInput(val)}
                    onSelect={(item) => {
                      const text = item.detail ? `${item.name} ${item.detail}` : item.name
                      setQuickPtxInput(text)
                    }}
                    placeholder="Ketik obat lain & dosis (Fornas)..."
                    className="flex-1"
                    inputClassName="w-full h-8 rounded-xl border border-slate-200 bg-slate-50/40 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddPtx()}
                    disabled={!quickPtxInput.trim()}
                    className="h-8 px-3 rounded-xl bg-primary hover:bg-primary-deep text-white font-semibold text-xs disabled:opacity-40 transition-colors cursor-pointer shrink-0 shadow-xs"
                  >
                    Tambah
                  </button>
                </div>

                {/* Daftar Obat Aktif dengan Tombol Switch Oral */}
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto border border-slate-200/80 rounded-xl px-2.5 py-0.5 bg-slate-50/30">
                  {ptxList.map((item) => {
                    const originalIdx = P.indexOf(item)
                    const isStop = item.status === 'stop'
                    const nameLower = `${item.nama_item}`.toLowerCase().trim()
                    const doseLower = `${item.dosis_keterangan}`.toLowerCase().trim()
                    const isIv = doseLower.includes('iv') || nameLower.includes('iv') || doseLower.includes('injeksi')

                    // Cek apakah ada mapping switch oral
                    const matchKey = Object.keys(SWITCH_ORAL_MAPPING).find((key) => nameLower.includes(key))
                    const switchOralTarget = matchKey ? SWITCH_ORAL_MAPPING[matchKey] : null

                    const isManitol = nameLower.includes('manitol') || nameLower.includes('mannitol')
                    const isDexa = nameLower.includes('dexa')
                    const isCeftri = nameLower.includes('ceftri')
                    const isNimo = nameLower.includes('nimodipine') || nameLower.includes('nimotop')
                    const isDapt = nameLower.includes('dapt') || (nameLower.includes('clopidogrel') && nameLower.includes('aspirin'))
                    const day = hariKe(item.tracking?.tgl_mulai || item.tgl_mulai || todayStr)

                    return (
                      <div
                        key={originalIdx}
                        className="py-1.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 truncate flex items-center gap-1.5">
                            <span className={`size-1.5 rounded-full shrink-0 ${isStop ? 'bg-slate-300' : 'bg-primary'}`} />
                            <span className={`truncate ${isStop ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              <b>{item.nama_item}</b>{' '}
                              {item.dosis_keterangan && (
                                <span className="text-slate-500 text-xs">({item.dosis_keterangan})</span>
                              )}
                            </span>

                            {!isStop && (
                              <>
                                {item.tracking?.tipe === 'durasi' ? (
                                  <span className="rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-xs font-bold shrink-0">
                                    H-{day}/{item.tracking.target_hari || 7}
                                  </span>
                                ) : isManitol ? (
                                  <span className="rounded-md bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 text-xs font-bold shrink-0">
                                    Manitol H-{day}
                                  </span>
                                ) : isDexa ? (
                                  <span className="rounded-md bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 text-xs font-bold shrink-0">
                                    Dexa H-{day}
                                  </span>
                                ) : isCeftri ? (
                                  <span className="rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-xs font-bold shrink-0">
                                    H-{day}/7
                                  </span>
                                ) : isNimo ? (
                                  <span className="rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-xs font-bold shrink-0">
                                    H-{day}/21
                                  </span>
                                ) : isDapt ? (
                                  <span className="rounded-md bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-xs font-bold shrink-0">
                                    H-{day}/21
                                  </span>
                                ) : null}
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Tombol Switch Oral Cepat */}
                            {!isStop && isIv && switchOralTarget && (
                              <button
                                type="button"
                                onClick={() => handleSwitchOral(originalIdx, switchOralTarget)}
                                className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 cursor-pointer transition-colors flex items-center gap-1"
                                title={`Ganti ke ${switchOralTarget.name} ${switchOralTarget.dose}`}
                              >
                                <ArrowRightLeft size={11} />
                                <span>Ke Oral</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleToggleDrugStatus(originalIdx)}
                              className={`px-2 py-0.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                isStop
                                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  : 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                              }`}
                            >
                              {isStop ? 'Lanjut' : 'Stop'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDrug(originalIdx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer shrink-0 transition-colors"
                              title="Hapus"
                            >
                              <X size={13} className="stroke-[2.5]" />
                            </button>
                          </div>
                        </div>

                        {/* Quick Taper Down Actions untuk Manitol */}
                        {!isStop && isManitol && (
                          <div className="flex items-center gap-1 pl-3 text-xs text-amber-900">
                            <span className="font-semibold">Tap down:</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateDrugDose(originalIdx, '3 x 100 cc iv')}
                              className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 font-bold cursor-pointer"
                            >
                              3x100
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateDrugDose(originalIdx, '2 x 100 cc iv')}
                              className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 font-bold cursor-pointer"
                            >
                              2x100
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateDrugDose(originalIdx, '1 x 100 cc iv')}
                              className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 font-bold cursor-pointer"
                            >
                              1x100
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleDrugStatus(originalIdx)}
                              className="px-1.5 py-0.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold cursor-pointer"
                            >
                              Stop
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!ptxList.length && (
                    <p className="text-center py-2 text-slate-400 text-xs">
                      Belum ada terapi obat.
                    </p>
                  )}
                </div>
              </div>

              {/* Catatan Tambahan */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Catatan Tambahan / Edukasi Pasien</label>
                <textarea
                  rows={2}
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Rencana KRS, jadwal konsul, instruksi khusus..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none leading-relaxed transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div className="px-4 sm:px-5 py-2.5 border-t border-slate-100 bg-slate-50/80 sm:bg-white flex items-center justify-between gap-2.5 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {/* Kiri: Tombol Kamera SIMRS & Galeri WA */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isOcrBusy}
                onClick={() => simrsCameraRef.current?.click()}
                className="size-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                title="Foto Layar SIMRS (Kamera)"
                aria-label="Foto Layar SIMRS"
              >
                {isOcrBusy ? <Loader2 size={16} className="animate-spin text-primary" /> : <Camera size={17} />}
              </button>
              <button
                type="button"
                disabled={isOcrBusy}
                onClick={() => simrsGalleryRef.current?.click()}
                className="size-9 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 shrink-0 shadow-2xs"
                title="Upload Screenshot WA (Galeri)"
                aria-label="Upload Screenshot WA"
              >
                <ImageIcon size={17} />
              </button>
            </div>

            {/* Kanan: Batal & Simpan */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-9 px-5 rounded-xl bg-primary hover:bg-primary-deep text-xs font-bold text-white shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 size={13} className="animate-spin text-white" />}
                <span>{isSubmitting ? 'Menyimpan…' : 'Simpan'}</span>
              </button>
            </div>
          </div>
        </form>

        {previewImage && (
          <ImageViewerModal
            isOpen={Boolean(previewImage)}
            onClose={() => setPreviewImage(null)}
            images={attachments.map((a) => ({
              url: a.url || a.dataUrl || '',
              dataUrl: a.dataUrl,
              name: a.name,
              type: a.type,
            }))}
            initialIndex={Math.max(
              0,
              attachments.findIndex((a) => (a.dataUrl || a.url) === previewImage)
            )}
          />
        )}
      </div>
    </div>
  )
}
