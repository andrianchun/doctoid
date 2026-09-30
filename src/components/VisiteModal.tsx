import { useState, useRef } from 'react'
import { X, Plus, Trash2, CheckSquare, Square, Camera, FileImage, Loader2, Sparkles } from 'lucide-react'
import { db, type Patient, type ProgressNote, type TerapiItem, type DiagnosisItem } from '../db'
import { lineToTerapi } from '../parser'
import { rapikan } from '../ai'
import { convertToWebP } from '../utils/mediaCompress'
import { getLocalDateString } from '../utils/dateFormat'
import { useBodyScrollLock } from '../utils/useBodyScrollLock'
import { getVisiteSubjectivePrefill } from '../utils/clinicalExtractor'
import Masked from './Masked'

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
      const webp = await convertToWebP(file, 1200, 0.85)
      const promptContext = `Pasien: ${patient.title} ${patient.nama_depan}\nTanggal: ${tanggal}`
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

      setOcrMessage('CPPT berhasil diimpor dari foto/screenshot! ✓')
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

      // Simpan catatan CPPT baru untuk visite hari ini
      await db.progressNotes.add({
        patient_id: patient.id!,
        tanggal,
        S: finalS,
        O_pemfis: O_pemfis.trim(),
        O_penunjang: O_penunjang.trim(),
        A: aItems.length > 0 ? aItems : (latestNote?.A || []),
        P,
        catatan: catatan.trim() || undefined,
      })

      // Jika diagnosis utama berubah, perbarui juga di profil pasien
      if (aItems.length > 0 && aItems[0].nama_diagnosis !== patient.diagnosis_utama) {
        await db.patients.update(patient.id!, {
          diagnosis_utama: aItems[0].nama_diagnosis,
        })
      }

      onSaved(`Visite ${patient.title} ${patient.nama_depan} berhasil dicatat`)
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-3.5 sm:p-5 animate-in fade-in duration-150 overscroll-contain touch-none select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-4 sm:p-5 shadow-2xl my-auto max-h-[92dvh] flex flex-col overscroll-contain touch-auto select-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal - Langsung & Tanpa Tulisan Visite/Tanggal/Icon */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 shrink-0">
          <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink truncate leading-tight">
              {patient.title} <Masked value={patient.nama_depan} type="name" />{' '}
              {patient.usia && (
                <span className="text-xs font-normal text-ink-muted">({patient.usia})</span>
              )}
            </h2>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="h-7 rounded-lg border border-slate-200 bg-slate-50/80 px-2 text-[11px] font-medium text-ink focus:bg-white focus:border-primary outline-none cursor-pointer shrink-0"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="size-8 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer shrink-0 -mr-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick OCR / AI Import Ribbon (Foto Layar SIMRS / Screenshot WA) */}
        <div className="flex flex-col gap-1.5 pt-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-blue-50/90 to-indigo-50/80 border border-blue-200/70 rounded-2xl px-3 py-2 shadow-2xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles size={13} className="text-primary shrink-0 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-700 truncate">
                Impor dari Layar SIMRS / WA
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isOcrBusy}
                onClick={() => simrsCameraRef.current?.click()}
                className="text-[10.5px] font-bold bg-white hover:bg-slate-50 text-primary border border-primary/30 rounded-xl px-2.5 py-1 flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="Foto layar komputer SIMRS"
              >
                {isOcrBusy ? <Loader2 size={11} className="animate-spin text-primary" /> : <Camera size={11} />}
                Foto Layar
              </button>
              <button
                type="button"
                disabled={isOcrBusy}
                onClick={() => simrsGalleryRef.current?.click()}
                className="text-[10.5px] font-bold bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200 rounded-xl px-2.5 py-1 flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="Upload screenshot chat WA laporan ruangan"
              >
                <FileImage size={11} />
                Screenshot WA
              </button>
            </div>
          </div>

          {/* Feedback OCR status text */}
          {ocrMessage && (
            <div className="text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl animate-in fade-in duration-150 flex items-center gap-1.5">
              <span>{ocrMessage}</span>
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
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-3 pr-1 text-xs">
            {/* S */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-xs text-primary">S</label>
                <div className="flex items-center gap-2.5">
                  {latestNote?.S && (
                    <button
                      type="button"
                      onClick={() => setS(getVisiteSubjectivePrefill(latestNote.S))}
                      title="Muat ulang daftar keluhan awal saat MRS"
                      className="text-[10px] text-primary hover:underline transition-colors cursor-pointer font-semibold"
                    >
                      Keluhan MRS
                    </button>
                  )}
                  {S && (
                    <button
                      type="button"
                      onClick={() => setS('')}
                      className="text-[10px] text-ink-muted hover:text-rose-600 transition-colors cursor-pointer font-medium"
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
                placeholder="mual + berkurang&#10;muntah -&#10;pusing -&#10;lemah separuh badan kiri membaik"
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink placeholder:text-ink-muted/40 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-y leading-relaxed font-mono"
              />
            </div>

            {/* O */}
            <div className="space-y-1.5">
              <label className="font-bold text-xs text-primary block">O</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-semibold text-ink-muted block mb-0.5">Fisik & TTV</span>
                  <textarea
                    rows={2}
                    value={O_pemfis}
                    onChange={(e) => setOPemfis(e.target.value)}
                    placeholder="KU, TTV, defisit fisik..."
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs text-ink placeholder:text-ink-muted/40 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-y"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-ink-muted block mb-0.5">Penunjang / Lab</span>
                  <textarea
                    rows={2}
                    value={O_penunjang}
                    onChange={(e) => setOPenunjang(e.target.value)}
                    placeholder="Lab, Ro, CT scan..."
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs text-ink placeholder:text-ink-muted/40 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-y"
                  />
                </div>
              </div>
            </div>

            {/* A */}
            <div>
              <label className="font-bold text-xs text-primary block mb-1">A</label>
              <textarea
                rows={2}
                value={A}
                onChange={(e) => setA(e.target.value)}
                placeholder="Diagnosis (1 per baris)..."
                className="w-full rounded-xl border border-slate-200 p-2 text-xs text-ink placeholder:text-ink-muted/40 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-y"
              />
            </div>

            {/* PDx */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-xs text-primary">PDx</label>
                {pdxList.length > 0 && (
                  <span className="text-[10px] font-semibold text-ink-muted">
                    {pdxList.filter((p) => p.status === 'stop').length}/{pdxList.length} sudah
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <input
                  type="text"
                  value={quickPdxInput}
                  onChange={(e) => setQuickPdxInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddPdx()
                    }
                  }}
                  placeholder="Rencana penunjang (Enter utk tambah)..."
                  className="flex-1 h-8 rounded-xl border border-slate-200 px-3 text-xs text-ink placeholder:text-ink-muted/40 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAddPdx()}
                  disabled={!quickPdxInput.trim()}
                  className="h-8 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus size={14} /> Tambah
                </button>
              </div>
              {pdxList.length > 0 && (
                <div className="space-y-0.5 max-h-28 overflow-y-auto pr-0.5 divide-y divide-slate-100">
                  {pdxList.map((item) => {
                    const originalIdx = P.indexOf(item)
                    const isDone = item.status === 'stop'
                    return (
                      <div
                        key={originalIdx}
                        className="flex items-center justify-between gap-1.5 py-1 text-xs"
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
                          <span className={`font-semibold truncate ${isDone ? 'line-through text-ink-muted' : 'text-ink'}`}>
                            {item.nama_item}
                          </span>
                          {item.dosis_keterangan && (
                            <span className="text-ink-muted text-[11px] truncate">({item.dosis_keterangan})</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDrug(originalIdx)}
                          className="p-1 text-ink-muted hover:text-rose-600 rounded-lg cursor-pointer shrink-0"
                          title="Hapus"
                        >
                          <Trash2 size={13} />
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
                <label className="font-bold text-xs text-primary">PTx</label>
                {ptxList.length > 0 && (
                  <span className="text-[10px] font-semibold text-ink-muted">
                    {ptxList.filter((p) => p.status === 'aktif').length} aktif
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <input
                  type="text"
                  value={quickPtxInput}
                  onChange={(e) => setQuickPtxInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddPtx()
                    }
                  }}
                  placeholder="Ketik obat & dosis (Enter utk tambah)..."
                  className="flex-1 h-8 rounded-xl border border-slate-200 px-3 text-xs text-ink placeholder:text-ink-muted/40 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAddPtx()}
                  disabled={!quickPtxInput.trim()}
                  className="h-8 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus size={14} /> Tambah
                </button>
              </div>
              <div className="space-y-0.5 max-h-32 overflow-y-auto pr-0.5 divide-y divide-slate-100">
                {ptxList.map((item) => {
                  const originalIdx = P.indexOf(item)
                  const isStop = item.status === 'stop'
                  return (
                    <div
                      key={originalIdx}
                      className="flex items-center justify-between gap-2 py-1 text-xs"
                    >
                      <div className="min-w-0 flex-1 truncate flex items-center gap-2">
                        <span className={`size-1.5 rounded-full shrink-0 ${isStop ? 'bg-slate-300' : 'bg-primary'}`} />
                        <span className={`truncate ${isStop ? 'line-through text-ink-muted/70' : 'text-ink'}`}>
                          <b>{item.nama_item}</b>{' '}
                          {item.dosis_keterangan && (
                            <span className="text-ink-muted text-[11px]">({item.dosis_keterangan})</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleDrugStatus(originalIdx)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                            isStop
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              : 'text-ink-muted hover:bg-rose-50 hover:text-rose-600'
                          }`}
                        >
                          {isStop ? 'Lanjut' : 'Stop'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDrug(originalIdx)}
                          className="p-1 text-ink-muted hover:text-rose-600 rounded-lg cursor-pointer"
                          title="Hapus"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {!ptxList.length && (
                  <p className="text-center py-1.5 text-ink-muted text-xs">
                    Belum ada terapi obat.
                  </p>
                )}
              </div>
            </div>

            {/* Catatan Bebas */}
            <div>
              <label className="font-bold text-xs text-ink-muted block mb-1">Catatan</label>
              <textarea
                rows={2}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Rencana KRS, konsul, extra, dll..."
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink placeholder:text-ink-muted/40 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-y"
              />
            </div>
          </div>

          {/* Modal Actions - Pinned di Bawah, Simpan Bersih */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-5 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
            >
              {isSubmitting ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
