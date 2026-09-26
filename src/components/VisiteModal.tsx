import { useState } from 'react'
import { X, Plus, Trash2, Check, Stethoscope, Sparkles } from 'lucide-react'
import { db, type Patient, type ProgressNote, type TerapiItem, type DiagnosisItem } from '../db'
import { lineToTerapi } from '../parser'
import { getLocalDateString } from '../utils/dateFormat'
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
  const todayStr = getLocalDateString()

  // Pre-fill S, O, A, P dari catatan terakhir
  const [tanggal, setTanggal] = useState(todayStr)
  const [S, setS] = useState(latestNote?.S || '')
  const [O_pemfis, setOPemfis] = useState(latestNote?.O_pemfis || '')
  const [O_penunjang, setOPenunjang] = useState(latestNote?.O_penunjang || '')

  // Diagnosis A
  const initialA = latestNote?.A?.length
    ? (Array.isArray(latestNote.A) ? latestNote.A.map((a) => a.nama_diagnosis).join('\n') : String(latestNote.A))
    : patient.diagnosis_utama || ''
  const [A, setA] = useState(initialA)

  // Terapi P (salin hanya terapi yang statusnya 'aktif')
  const initialP: TerapiItem[] = (latestNote?.P || [])
    .filter((p) => p.status === 'aktif')
    .map((p) => ({
      ...p,
      tgl_mulai: p.tgl_mulai || todayStr,
      tgl_stop: null,
      status: 'aktif' as const,
    }))
  const [P, setP] = useState<TerapiItem[]>(initialP)

  // Input cepat obat baru (mis. "+ Betahistin 3x6mg")
  const [quickDrugInput, setQuickDrugInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAddQuickDrug = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const text = quickDrugInput.trim()
    if (!text) return

    const clean = text.replace(/^[\+\-•*]\s*/, '')
    const parsed = lineToTerapi(clean, tanggal)
    setP((prev) => [...prev, parsed])
    setQuickDrugInput('')
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

      // Simpan catatan CPPT baru untuk visite hari ini
      await db.progressNotes.add({
        patient_id: patient.id!,
        tanggal,
        S: S.trim(),
        O_pemfis: O_pemfis.trim(),
        O_penunjang: O_penunjang.trim(),
        A: aItems.length > 0 ? aItems : (latestNote?.A || []),
        P,
      })

      // Jika diagnosis utama berubah, perbarui juga di profil pasien
      if (aItems.length > 0 && aItems[0].nama_diagnosis !== patient.diagnosis_utama) {
        await db.patients.update(patient.id!, {
          diagnosis_utama: aItems[0].nama_diagnosis,
        })
      }

      onSaved(`Visite ${patient.title} ${patient.nama_depan} berhasil dicatat ✓`)
      onClose()
    } catch (err) {
      console.error(err)
      alert('Gagal menyimpan catatan visite')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-3.5 sm:p-5 animate-in fade-in duration-150 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl space-y-4 my-auto max-h-[92dvh] flex flex-col">
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-wider">
              <Stethoscope size={15} className="shrink-0" />
              <span>Catat Visite Hari Ini</span>
            </div>
            <h2 className="text-sm sm:text-base font-black text-ink truncate mt-0.5">
              {patient.title} <Masked value={patient.nama_depan} type="name" />{' '}
              <span className="text-xs font-semibold text-ink-muted">({patient.usia})</span>
            </h2>
            <p className="caption text-[11px] text-ink-muted flex items-center gap-1.5 mt-0.5">
              <Sparkles size={11} className="text-amber-500 shrink-0" />
              <span>Data otomatis tersalin dari visite sebelumnya</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
          {/* Tanggal Visite */}
          <div>
            <label className="block font-bold text-ink-muted text-[11px] mb-1">
              Tanggal Visite
            </label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            />
          </div>

          {/* S (Subjektif / Keluhan Terkini) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-ink text-xs flex items-center gap-1 text-primary">
                <span>S (Subjektif / Keluhan)</span>
              </label>
              <button
                type="button"
                onClick={() => setS('')}
                className="text-[10px] text-ink-muted hover:text-rose-600 transition-colors cursor-pointer"
              >
                Kosongkan
              </button>
            </div>
            <textarea
              rows={2}
              value={S}
              onChange={(e) => setS(e.target.value)}
              placeholder="Keluhan baru pasien hari ini (mis. Pusing berputar sejak pagi, mual (+), diare (-))..."
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink placeholder:text-ink-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            />
          </div>

          {/* O (Objektif / TTV & Pemfis Terkini) */}
          <div className="space-y-1.5">
            <label className="font-bold text-ink text-xs text-primary block">
              O (Objektif / TTV & Penunjang)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] font-semibold text-ink-muted block mb-0.5">Pemfis / TTV</span>
                <textarea
                  rows={2}
                  value={O_pemfis}
                  onChange={(e) => setOPemfis(e.target.value)}
                  placeholder="TD, Nadi, RR, Suhu, GCS, defisit neurologis..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <span className="text-[10px] font-semibold text-ink-muted block mb-0.5">Hasil Lab / Penunjang Baru</span>
                <textarea
                  rows={2}
                  value={O_penunjang}
                  onChange={(e) => setOPenunjang(e.target.value)}
                  placeholder="GDS, Elektrolit, Darah Lengkap, CT Scan..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
          </div>

          {/* A (Assessment / Diagnosis) */}
          <div>
            <label className="font-bold text-ink text-xs text-primary block mb-1">
              A (Assessment / Diagnosis)
            </label>
            <textarea
              rows={2}
              value={A}
              onChange={(e) => setA(e.target.value)}
              placeholder="Daftar diagnosis (1 diagnosis per baris)..."
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            />
          </div>

          {/* P (Planning / Terapi Terkini) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-ink text-xs text-primary">
                P (Planning / Daftar Terapi Pasien)
              </label>
              <span className="text-[10px] font-semibold text-ink-muted">
                {P.filter(p => p.status === 'aktif').length} aktif
              </span>
            </div>

            {/* Quick add drug bar */}
            <div className="flex items-center gap-1.5 mb-2">
              <input
                type="text"
                value={quickDrugInput}
                onChange={(e) => setQuickDrugInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddQuickDrug()
                  }
                }}
                placeholder="Tambah obat/terapi cepat: mis. Betahistin 3x6mg..."
                className="flex-1 h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink placeholder:text-ink-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
              />
              <button
                type="button"
                onClick={() => handleAddQuickDrug()}
                disabled={!quickDrugInput.trim()}
                className="h-9 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>

            {/* Daftar obat */}
            <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
              {P.map((item, idx) => {
                const isStop = item.status === 'stop'
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between gap-1.5 rounded-xl border p-2 text-xs transition-colors ${
                      isStop
                        ? 'border-slate-200 bg-slate-100/70 text-ink-muted line-through opacity-60'
                        : 'border-slate-200/80 bg-white text-ink shadow-2xs'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold">{item.nama_item}</span>{' '}
                      {item.dosis_keterangan && (
                        <span className="text-ink-muted">({item.dosis_keterangan})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleDrugStatus(idx)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                          isStop
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        }`}
                      >
                        {isStop ? 'Lanjut' : 'Stop'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDrug(idx)}
                        className="p-1 text-ink-muted hover:text-rose-600 rounded-lg cursor-pointer"
                        title="Hapus dari daftar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
              {!P.length && (
                <p className="text-center py-2 text-ink-muted text-xs">
                  Belum ada terapi tercatat.
                </p>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
              className="h-9 px-5 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check size={14} /> Simpan Visite Hari Ini
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
