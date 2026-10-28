import { useState, useRef } from 'react'
import {
  X,
  Trash2,
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
import { cleanNamaDepan, formatPatientDisplayName } from '../utils/patientName'
import Masked from './Masked'
import DateInput from './DateInput'
import PredictiveInput from './PredictiveInput'
import { triggerCloudSync } from '../sync'
import {
  SWITCH_ORAL_MAPPING,
  QUICK_DRUG_CATEGORIES,
  QUICK_DRUG_PRESETS,
  QUICK_PDX_PRESETS,
  type QuickDrugPreset,
  type QuickPdxPreset,
} from '../utils/visitePresets'

interface VisiteModalProps {
  patient: Patient
  latestNote?: ProgressNote
  onClose: () => void
  onSaved: (msg: string) => void
}

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
  const [O_pemfis, setOPemfis] = useState(latestNote?.O_pemfis || '')
  const [O_penunjang, setOPenunjang] = useState(latestNote?.O_penunjang || '')

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

  // Terapi Cepat state
  const [activeDrugCategory, setActiveDrugCategory] = useState<string>('Antibiotik')

  // Input manual cepat PDx dan PTx
  const [quickPdxInput, setQuickPdxInput] = useState('')
  const [quickPtxInput, setQuickPtxInput] = useState('')
  const [catatan, setCatatan] = useState(latestNote?.catatan || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Background OCR / AI state
  const [isOcrBusy, setIsOcrBusy] = useState(false)
  const [ocrMessage, setOcrMessage] = useState('')
  const [pendingOcrResult, setPendingOcrResult] = useState<RapikanResult | null>(null)
  const simrsCameraRef = useRef<HTMLInputElement>(null)
  const simrsGalleryRef = useRef<HTMLInputElement>(null)

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

  // Handler Sisipkan / Update Teks Pemfis Cepat
  const handleInsertPemfisText = (textToInsert: string) => {
    setOPemfis((prev) => {
      if (!prev.trim()) return textToInsert

      // Update baris TTV jika sudah ada
      if (textToInsert.startsWith('TD:') || textToInsert.startsWith('TTV:')) {
        if (/TTV\s*:[^\n]*|TD\s*:[^\n]*/i.test(prev)) {
          return prev.replace(/(?:TTV|TD)\s*:[^\n]*/i, textToInsert)
        }
        return `${textToInsert}\n${prev}`
      }

      // Update baris Motorik jika sudah ada
      if (textToInsert.startsWith('Motorik:')) {
        if (/Motorik\s*:[^\n]*/i.test(prev)) {
          return prev.replace(/Motorik\s*:[^\n]*/i, textToInsert)
        }
        return `${prev}\n${textToInsert}`
      }

      // Update baris Kesadaran / GCS jika sudah ada
      if (textToInsert.includes('Kesadaran:') || textToInsert.startsWith('KU:')) {
        if (/(?:KU|Kesadaran|GCS)\s*:[^\n]*/i.test(prev)) {
          return prev.replace(/(?:KU|Kesadaran|GCS)\s*:[^\n]*/i, textToInsert)
        }
        return `${textToInsert}\n${prev}`
      }

      // Temuan umum
      if (prev.includes(textToInsert)) return prev
      return `${prev.trim()}\n- ${textToInsert}`
    })
  }

  // Handler Tambah Terapi Cepat dari Kategori
  const handleAddQuickDrug = (drug: QuickDrugPreset) => {
    setP((prev) => {
      const exists = prev.some((p) => p.nama_item.toLowerCase().trim() === drug.name.toLowerCase().trim())
      if (exists) return prev
      return [
        ...prev,
        {
          nama_item: drug.name,
          dosis_keterangan: drug.dose,
          kategori: drug.kategori,
          tgl_mulai: tanggal,
          tgl_stop: null,
          status: 'aktif',
        },
      ]
    })
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

  // Handler Tambah PDx Rutin 1-Tap
  const handleAddQuickPdx = (preset: QuickPdxPreset) => {
    setP((prev) => {
      const exists = prev.some(
        (p) => p.kategori === 'Diagnostik' && p.nama_item.toLowerCase().trim() === preset.name.toLowerCase().trim()
      )
      if (exists) return prev
      return [
        ...prev,
        {
          nama_item: preset.name,
          dosis_keterangan: preset.kategori,
          kategori: 'Diagnostik',
          tgl_mulai: tanggal,
          tgl_stop: null,
          status: 'aktif',
        },
      ]
    })
  }

  // Handler Background OCR / AI Parser (Non-blocking)
  const handleProcessImage = (file: File) => {
    setIsOcrBusy(true)
    setOcrMessage('Sedang membaca SIMRS / WA di background... Anda tetap bebas mencatat')
    setPendingOcrResult(null)

    // Jalankan asinkron tanpa mengunci layar dokter
    ;(async () => {
      try {
        const webp = await convertToWebP(file, 1600, 0.85)
        const promptContext = `Pasien: ${formatPatientDisplayName(patient.title, patient.nama_depan)}\nTanggal Visite: ${tanggal}\nFoto Layar Monitor Komputer SIMRS (CPPT / Catatan Perkembangan Pasien Terintegrasi / Instruksi Terapi Harian) atau Screenshot Chat WA Ruangan`
        const r = await rapikan(promptContext, [{ type: 'image/webp', dataUrl: webp }], false)

        setPendingOcrResult(r)
        const foundTherapies = r.P?.length || 0
        const foundLab = r.O_penunjang?.trim() ? 1 : 0

        setOcrMessage(
          `Hasil SIMRS/WA siap: Ditemukan ${foundTherapies} terapi, ${foundLab ? 'lab baru' : ''}`
        )
      } catch (err: any) {
        console.error(err)
        setOcrMessage(err?.message || 'Gagal memproses gambar.')
        setTimeout(() => setOcrMessage(''), 4000)
      } finally {
        setIsOcrBusy(false)
      }
    })()
  }

  // Handler Terapkan Data OCR Cerdas (Non-destructive)
  const handleApplyOcrResult = () => {
    if (!pendingOcrResult) return
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
      setOPemfis((prev) => {
        const incoming = r.O_pemfis.trim()
        if (!prev.trim()) return incoming
        if (prev.includes(incoming)) return prev
        return prev + '\n\n' + incoming
      })
    }

    if (r.O_penunjang && r.O_penunjang.trim()) {
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

      // Simpan catatan CPPT baru untuk visite hari ini
      const nowTime = waktu.trim() || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')
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
        metrics,
      })

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
            <input
              type="time"
              value={waktu}
              onChange={(e) => setWaktu(e.target.value)}
              className="h-8 w-[64px] px-1 rounded-lg border border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-800 text-center focus:bg-white focus:border-primary outline-none shrink-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden transition-colors"
              title="Jam visite"
            />
          </div>
        </div>

        {/* Feedback Background OCR status banner (Non-blocking) */}
        {ocrMessage && (
          <div
            className={`px-4 sm:px-5 py-2 text-xs font-semibold border-b flex items-center justify-between shrink-0 ${
              isOcrBusy
                ? 'bg-blue-50 text-blue-700 border-blue-100'
                : pendingOcrResult
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isOcrBusy ? (
                <Loader2 size={13} className="animate-spin shrink-0 text-blue-600" />
              ) : (
                <Sparkles size={13} className="shrink-0 text-emerald-600" />
              )}
              <span className="truncate">{ocrMessage}</span>
            </div>

            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              {pendingOcrResult && !isOcrBusy && (
                <button
                  type="button"
                  onClick={handleApplyOcrResult}
                  className="h-6 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
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
                {complaints.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 py-1.5 px-0.5 text-xs"
                  >
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

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Tombol Status Langsung: (-), (+), (↓), (↑) */}
                      <button
                        type="button"
                        onClick={() => handleSetComplaintStatus(item.id, '-')}
                        className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                          item.status === '-'
                            ? 'bg-slate-200 text-slate-800 font-black'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Hilang (-)"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetComplaintStatus(item.id, '+')}
                        className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                          item.status === '+'
                            ? 'bg-amber-500 text-white font-black shadow-2xs'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Masih menetap (+)"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetComplaintStatus(item.id, '↓')}
                        className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                          item.status === '↓'
                            ? 'bg-emerald-600 text-white font-black shadow-2xs'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Berkurang / membaik (↓)"
                      >
                        <ArrowDown size={13} className="stroke-[2.5]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetComplaintStatus(item.id, '↑')}
                        className={`size-6 rounded-md font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                          item.status === '↑'
                            ? 'bg-rose-600 text-white font-black shadow-2xs'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Memberat / meningkat (↑)"
                      >
                        <ArrowUp size={13} className="stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                ))}

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
                  placeholder="Ketik keluhan (pusing, pelo, merot, mual)..."
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

            {/* O (Objektif) - Quick Chips 1-Baris & Textarea Padat */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-base font-black text-emerald-600 tracking-wide">O</span>
              </div>

              {/* 1 Baris Horizontal Scrollable Quick Chips untuk GCS, TTV, Motorik 4+, Temuan */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {/* Kesadaran */}
                <span className="text-[10px] font-bold text-slate-400 shrink-0">GCS:</span>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('KU: sedang, Kesadaran: CM (E4V5M6)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-emerald-500 hover:text-emerald-700 shrink-0 cursor-pointer shadow-2xs"
                >
                  CM (456)
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('KU: lemah, Kesadaran: Somnolen (E3V4M5)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-amber-500 hover:text-amber-700 shrink-0 cursor-pointer shadow-2xs"
                >
                  Somnolen (345)
                </button>

                <div className="h-3.5 w-px bg-slate-200 shrink-0 mx-0.5" />

                {/* TTV Presets */}
                <span className="text-[10px] font-bold text-slate-400 shrink-0">TTV:</span>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('TTV: TD 120/80 mmHg | HR 80 x/m | RR 18 x/m | Suhu 36.5 °C | SpO2 98%')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  120/80 Normal
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('TTV: TD 140/90 mmHg | HR 84 x/m | RR 20 x/m | Suhu 36.6 °C | SpO2 98%')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  140/90
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Afebris (Suhu: 36.5 °C)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  Afebris 36.5°
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('SpO2: 98% room air')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  SpO2 98%
                </button>

                <div className="h-3.5 w-px bg-slate-200 shrink-0 mx-0.5" />

                {/* Motorik (Termasuk 4+) */}
                <span className="text-[10px] font-bold text-slate-400 shrink-0">Motorik:</span>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Motorik: 5555/5555 (normal)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  5555/5555
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Motorik: 3333/5555 (hemiparesis dextra)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  Hemi Kanan 3/3
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Motorik: 5555/3333 (hemiparesis sinistra)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  Hemi Kiri 3/3
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Motorik: 4+/5 (perbaikan paresis)')}
                  className="h-6 px-2 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 shrink-0 cursor-pointer shadow-2xs"
                >
                  Hemi 4+
                </button>

                <div className="h-3.5 w-px bg-slate-200 shrink-0 mx-0.5" />

                {/* Temuan Penting */}
                <span className="text-[10px] font-bold text-slate-400 shrink-0">Temuan:</span>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Pupil anisokor (3mm / 4mm), RCL (+/-)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  + Anisokor 3/4
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Pupil isokor (3mm / 3mm), RCL (+/+)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  + Isokor 3/3
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Hemihipestesi dextra (sisi kanan)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  + Hemihipestesi Kanan
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Tanda rangsang meningeal: Kaku kuduk (+), Kernig (+)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  + Kaku Kuduk (+)
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertPemfisText('Cor: S1 S2 tunggal reguler | Pulmo: vesikuler (+/+), rhonki (-/-), wheezing (-/-)')}
                  className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-primary hover:text-primary shrink-0 cursor-pointer shadow-2xs"
                >
                  + Cor/Pulmo DBN
                </button>
              </div>

              {/* Textarea Narasi Pemfis */}
              <textarea
                rows={3}
                value={O_pemfis}
                onChange={(e) => setOPemfis(e.target.value)}
                placeholder="KU, TTV, status generalis & defisit neurologis..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none leading-relaxed transition-colors"
              />

              {/* Textarea Penunjang / Lab */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Penunjang / Lab Terkini
                </label>
                <textarea
                  rows={2}
                  value={O_penunjang}
                  onChange={(e) => setOPenunjang(e.target.value)}
                  placeholder="Hasil Lab, Radiologi, CT Scan, Ro Thorax..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none leading-relaxed transition-colors"
                />
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

                {/* Chip Penunjang Rutin 1-Tap */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {QUICK_PDX_PRESETS.map((pdx) => {
                    const isAdded = pdxList.some(
                      (p) => p.nama_item.toLowerCase().trim() === pdx.name.toLowerCase().trim()
                    )
                    return (
                      <button
                        key={pdx.name}
                        type="button"
                        disabled={isAdded}
                        onClick={() => handleAddQuickPdx(pdx)}
                        className={`h-6 px-2 text-[10px] font-semibold rounded-lg shrink-0 transition-colors cursor-pointer flex items-center gap-1 ${
                          isAdded
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 opacity-70 cursor-default'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-primary shadow-2xs'
                        }`}
                      >
                        {isAdded ? <Check size={10} className="text-emerald-600" /> : <Plus size={10} />}
                        <span>{pdx.name}</span>
                      </button>
                    )
                  })}
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
                            <Trash2 size={14} />
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

                {/* Baris Kategori Obat Cepat */}
                <div className="space-y-1.5 bg-slate-50/60 p-2 rounded-xl border border-slate-200/80">
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                    {QUICK_DRUG_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveDrugCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                          activeDrugCategory === cat
                            ? 'bg-primary text-white shadow-2xs font-bold'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Pills 1-Tap Add dari Kategori Terpilih */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {(QUICK_DRUG_PRESETS[activeDrugCategory] || []).map((preset) => {
                      const isAlreadyAdded = P.some(
                        (p) => p.nama_item.toLowerCase().trim() === preset.name.toLowerCase().trim()
                      )
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          disabled={isAlreadyAdded}
                          onClick={() => handleAddQuickDrug(preset)}
                          className={`h-7 px-2.5 text-xs font-semibold rounded-lg shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                            isAlreadyAdded
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 opacity-80 cursor-default'
                              : 'bg-white border border-slate-200 text-slate-800 hover:bg-primary/10 hover:border-primary/40 hover:text-primary shadow-2xs'
                          }`}
                          title={isAlreadyAdded ? 'Sudah ada dalam daftar terapi' : `Tambah ${preset.name} (${preset.dose})`}
                        >
                          {isAlreadyAdded ? <Check size={11} className="text-emerald-600" /> : <Plus size={11} />}
                          <span>{preset.name}</span>
                        </button>
                      )
                    })}
                  </div>
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
                              <Trash2 size={14} />
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
      </div>
    </div>
  )
}
