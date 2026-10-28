import { useState, useRef } from 'react'
import { X, Trash2, CheckSquare, Square, Loader2 } from 'lucide-react'
import { db, type Patient, type ProgressNote, type TerapiItem, type DiagnosisItem } from '../db'
import { lineToTerapi } from '../parser'
import { rapikan } from '../ai'
import { convertToWebP } from '../utils/mediaCompress'
import { getLocalDateString, hariKe } from '../utils/dateFormat'
import { useBodyScrollLock } from '../utils/useBodyScrollLock'
import { getVisiteSubjectivePrefill, extractClinicalMetrics } from '../utils/clinicalExtractor'
import { cleanNamaDepan, formatPatientDisplayName } from '../utils/patientName'
import Masked from './Masked'
import DateInput from './DateInput'
import PredictiveInput from './PredictiveInput'
import { PemfisVisualizer } from './PemfisVisualizer'
import { triggerCloudSync } from '../sync'

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
  const [S, setS] = useState(() => getVisiteSubjectivePrefill(latestNote?.S))
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

  // Input cepat PDx dan PTx
  const [quickPdxInput, setQuickPdxInput] = useState('')
  const [quickPtxInput, setQuickPtxInput] = useState('')
  const [catatan, setCatatan] = useState(latestNote?.catatan || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOcrBusy, setIsOcrBusy] = useState(false)
  const [ocrMessage, setOcrMessage] = useState('')
  const simrsCameraRef = useRef<HTMLInputElement>(null)
  const simrsGalleryRef = useRef<HTMLInputElement>(null)

  const handleProcessImage = async (file: File) => {
    setIsOcrBusy(true)
    setOcrMessage('Menganalisis foto layar SIMRS / chat WA...')
    try {
      const webp = await convertToWebP(file, 1600, 0.85)
      const promptContext = `Pasien: ${formatPatientDisplayName(patient.title, patient.nama_depan)}\nTanggal Visite: ${tanggal}\nFoto Layar Monitor Komputer SIMRS (CPPT / Catatan Perkembangan Pasien Terintegrasi / Instruksi Terapi Harian) atau Screenshot Chat WA Ruangan`
      const r = await rapikan(promptContext, [{ type: 'image/webp', dataUrl: webp }], false)

      if (r.S && r.S.trim()) {
        setS((prev) => {
          const incoming = r.S.trim()
          if (!prev.trim()) return incoming
          return prev.includes(incoming) ? prev : prev + '\n\n' + incoming
        })
      }

      if (r.O_pemfis && r.O_pemfis.trim()) {
        setOPemfis((prev) => {
          const incoming = r.O_pemfis.trim()
          if (!prev.trim()) return incoming
          return prev.includes(incoming) ? prev : prev + '\n\n' + incoming
        })
      }

      if (r.O_penunjang && r.O_penunjang.trim()) {
        setOPenunjang((prev) => {
          const incoming = r.O_penunjang.trim()
          if (!prev.trim()) return incoming
          return prev.includes(incoming) ? prev : prev + '\n\n' + incoming
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

      setOcrMessage('CPPT berhasil diimpor dari foto/screenshot!')
      setTimeout(() => setOcrMessage(''), 4000)
    } catch (err: any) {
      alert(err?.message || 'Gagal memproses gambar.')
    } finally {
      setIsOcrBusy(false)
    }
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

      const finalS = S.trim() || '-'
      const metrics = extractClinicalMetrics({
        S: finalS,
        O_pemfis: O_pemfis.trim(),
        O_penunjang: O_penunjang.trim(),
      })

      // Simpan catatan CPPT baru untuk visite hari ini
      const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150 overscroll-contain touch-none select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-xl my-auto max-h-[92dvh] flex flex-col overscroll-contain touch-auto select-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 shrink-0">
          <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 truncate leading-snug">
                {patient.title ? `${patient.title} ` : ''}
                <Masked value={cleanNamaDepan(patient.nama_depan, patient.title)} type="name" />
                {patient.usia && (
                  <span className="text-xs font-normal text-slate-500 ml-1">({patient.usia})</span>
                )}
              </h2>
              {patient.no_rm && (
                <p className="text-xs text-slate-500 truncate">
                  RM {patient.no_rm}
                </p>
              )}
            </div>
            <div className="w-32 shrink-0">
              <DateInput
                value={tanggal}
                onChange={(val) => setTanggal(val)}
                className="h-8 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-xs font-semibold text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 -mr-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick OCR / AI Import Toolbar (SIMRS / WA) */}
        <div className="py-2.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700">
              Impor SIMRS / WA
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isOcrBusy}
                onClick={() => simrsCameraRef.current?.click()}
                className="h-7 px-3 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                title="Foto layar monitor komputer SIMRS"
              >
                {isOcrBusy && <Loader2 size={12} className="animate-spin text-primary" />}
                <span>Foto Layar SIMRS</span>
              </button>
              <button
                type="button"
                disabled={isOcrBusy}
                onClick={() => simrsGalleryRef.current?.click()}
                className="h-7 px-3 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                title="Upload screenshot chat WA laporan ruangan"
              >
                Upload WA
              </button>
            </div>
          </div>

          {/* Feedback OCR status text */}
          {ocrMessage && (
            <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center justify-between">
              <span>{ocrMessage}</span>
              <button
                type="button"
                onClick={() => setOcrMessage('')}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5"
                aria-label="Tutup pesan"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

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

        {/* Form Body dengan Sticky Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 pt-3">
          {/* Bagian Input Scrollable */}
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 pr-1 text-xs">
            {/* S */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-900">S (Subjektif)</label>
                <div className="flex items-center gap-2">
                  {latestNote?.S && (
                    <button
                      type="button"
                      onClick={() => setS(getVisiteSubjectivePrefill(latestNote.S))}
                      title="Muat ulang daftar keluhan awal saat MRS"
                      className="text-xs text-primary hover:underline font-bold cursor-pointer"
                    >
                      Keluhan MRS
                    </button>
                  )}
                  {S && (
                    <button
                      type="button"
                      onClick={() => setS('')}
                      className="text-xs text-slate-500 hover:text-rose-600 font-semibold cursor-pointer"
                    >
                      Kosongkan
                    </button>
                  )}
                </div>
              </div>
              <textarea
                rows={3}
                value={S}
                onChange={(e) => setS(e.target.value)}
                placeholder="Keluhan subjektif saat visite..."
                className="w-full rounded-2xl border border-slate-300 bg-slate-50/50 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-y leading-relaxed"
              />
            </div>

            {/* O */}
            <div className="space-y-3">
              <div>
                <PemfisVisualizer
                  value={O_pemfis}
                  onChange={(val) => setOPemfis(val)}
                  label="O (Pemeriksaan Fisik & TTV)"
                  placeholder="KU, TTV, defisit fisik..."
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Pemeriksaan Penunjang / Laboratorium
                </label>
                <textarea
                  rows={2}
                  value={O_penunjang}
                  onChange={(e) => setOPenunjang(e.target.value)}
                  placeholder="Hasil Lab, Radiologi, CT Scan..."
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50/50 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-y leading-relaxed"
                />
              </div>
            </div>

            {/* A */}
            <div>
              <label className="text-xs font-bold text-slate-900 block mb-1">A (Asesmen / Diagnosis)</label>
              <textarea
                rows={2}
                value={A}
                onChange={(e) => setA(e.target.value)}
                placeholder="Daftar diagnosis (1 diagnosis per baris)..."
                className="w-full rounded-2xl border border-slate-300 bg-slate-50/50 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-y leading-relaxed"
              />
            </div>

            {/* PDx */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-900">PDx (Rencana Penunjang)</label>
                {pdxList.length > 0 && (
                  <span className="text-xs font-semibold text-slate-500">
                    {pdxList.filter((p) => p.status === 'stop').length}/{pdxList.length} selesai
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <PredictiveInput
                  type="procedure"
                  value={quickPdxInput}
                  onChange={(val) => setQuickPdxInput(val)}
                  onSelect={(item) => setQuickPdxInput(item.name)}
                  placeholder="Rencana penunjang / ICD-9..."
                  className="flex-1"
                  inputClassName="w-full h-8 rounded-xl border border-slate-300 bg-slate-50/50 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAddPdx()}
                  disabled={!quickPdxInput.trim()}
                  className="h-8 px-3 rounded-xl bg-primary hover:bg-primary-deep text-white font-bold text-xs disabled:opacity-40 transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  Tambah
                </button>
              </div>
              {pdxList.length > 0 && (
                <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto pr-0.5 border border-slate-200 rounded-xl px-2.5 py-0.5 bg-slate-50/30">
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

            {/* PTx */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-900">PTx (Rencana Terapi)</label>
                {ptxList.length > 0 && (
                  <span className="text-xs font-semibold text-slate-500">
                    {ptxList.filter((p) => p.status === 'aktif').length} aktif
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <PredictiveInput
                  type="drug"
                  value={quickPtxInput}
                  onChange={(val) => setQuickPtxInput(val)}
                  onSelect={(item) => {
                    const text = item.detail ? `${item.name} ${item.detail}` : item.name
                    setQuickPtxInput(text)
                  }}
                  placeholder="Ketik obat & dosis (Fornas)..."
                  className="flex-1"
                  inputClassName="w-full h-8 rounded-xl border border-slate-300 bg-slate-50/50 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAddPtx()}
                  disabled={!quickPtxInput.trim()}
                  className="h-8 px-3 rounded-xl bg-primary hover:bg-primary-deep text-white font-bold text-xs disabled:opacity-40 transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  Tambah
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-0.5 border border-slate-200 rounded-xl px-2.5 py-0.5 bg-slate-50/30">
                {ptxList.map((item) => {
                  const originalIdx = P.indexOf(item)
                  const isStop = item.status === 'stop'
                  const nameLower = `${item.nama_item} ${item.dosis_keterangan}`.toLowerCase()
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
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Quick Taper Down Actions */}
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

            {/* Catatan Bebas */}
            <div>
              <label className="text-xs font-bold text-slate-900 block mb-1">Catatan Tambahan</label>
              <textarea
                rows={2}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Rencana KRS, jadwal konsul, instruksi khusus..."
                className="w-full rounded-2xl border border-slate-300 bg-slate-50/50 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-y leading-relaxed"
              />
            </div>
          </div>

          {/* Modal Actions - Pinned di Bawah, Simpan Bersih */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-6 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
