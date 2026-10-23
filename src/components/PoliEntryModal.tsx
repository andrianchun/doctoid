import React, { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  X, Camera, Loader2, Plus, Sparkles, Check,
  Users, FileSpreadsheet, AlertCircle
} from 'lucide-react'
import { db, type Hospital, type PoliLog, type PoliLogItem } from '../db'
import { extractPoliPatientsFromImage } from '../ai'
import CustomSelect from './CustomSelect'
import DateInput from './DateInput'
import { getLocalDateString } from '../utils/dateFormat'

interface PoliEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
  initialData?: PoliLog
}

export default function PoliEntryModal({
  isOpen,
  onClose,
  onSaved,
  initialData,
}: PoliEntryModalProps) {
  const hospitals = useLiveQuery(() => db.hospitals.toArray(), [], [] as Hospital[])

  const [tanggal, setTanggal] = useState<string>(() => initialData?.tanggal || getLocalDateString())
  const [hospitalId, setHospitalId] = useState<number>(() => {
    if (initialData?.hospital_id) return initialData.hospital_id
    return hospitals.length > 0 ? (hospitals[0].id || 0) : 0
  })
  const [tipePoli, setTipePoli] = useState<'reguler' | 'eksekutif'>(() => initialData?.tipe_poli || 'reguler')
  const [tabMode, setTabMode] = useState<'foto' | 'tally'>('foto')

  // Mode Foto / Scan
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(() => {
    return initialData?.foto_urls?.[0] || null
  })
  const [imageMime, setImageMime] = useState<string>('image/jpeg')
  const [isExtracting, setIsExtracting] = useState<boolean>(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [patients, setPatients] = useState<PoliLogItem[]>(() => {
    return initialData?.daftar_pasien || []
  })

  // Mode Tally
  const [countBpjs, setCountBpjs] = useState<number>(() => {
    if (initialData?.daftar_pasien) {
      return initialData.daftar_pasien.filter(p => p.jaminan === 'BPJS' || !p.jaminan).length
    }
    return 0
  })
  const [countUmum, setCountUmum] = useState<number>(() => {
    if (initialData?.daftar_pasien) {
      return initialData.daftar_pasien.filter(p => p.jaminan === 'Umum').length
    }
    return 0
  })
  const [countAsuransi, setCountAsuransi] = useState<number>(() => {
    if (initialData?.daftar_pasien) {
      return initialData.daftar_pasien.filter(p => p.jaminan === 'Asuransi').length
    }
    return 0
  })

  const [catatan, setCatatan] = useState<string>(() => initialData?.catatan || '')
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Inisialisasi hospitalId jika baru pertama kali load
  useEffect(() => {
    if (!hospitalId && hospitals.length > 0) {
      setHospitalId(hospitals[0].id || 0)
    }
  }, [hospitals, hospitalId])

  if (!isOpen) return null

  const selectedHospital = hospitals.find(h => h.id === hospitalId)

  // Handle upload & compress image
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setExtractError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        // Resize canvas max 1600px width/height for fast AI inference and low payload
        const canvas = document.createElement('canvas')
        const MAX_DIM = 1600
        let { width, height } = img
        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width)
            width = MAX_DIM
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height)
            height = MAX_DIM
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        const compressedB64 = canvas.toDataURL('image/jpeg', 0.85)
        setImageDataUrl(compressedB64)
        setImageMime('image/jpeg')
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // Trigger AI extraction
  const handleExtractWithAi = async () => {
    if (!imageDataUrl) return
    setIsExtracting(true)
    setExtractError(null)

    try {
      const res = await extractPoliPatientsFromImage(
        { type: imageMime, dataUrl: imageDataUrl },
        selectedHospital?.nama
      )
      if (res.daftar_pasien && res.daftar_pasien.length > 0) {
        setPatients(res.daftar_pasien)
        // Auto update tally counters from extraction
        const bpjs = res.daftar_pasien.filter(p => p.jaminan === 'BPJS' || !p.jaminan).length
        const umum = res.daftar_pasien.filter(p => p.jaminan === 'Umum').length
        const asuransi = res.daftar_pasien.filter(p => p.jaminan === 'Asuransi').length
        setCountBpjs(bpjs)
        setCountUmum(umum)
        setCountAsuransi(asuransi)
      } else {
        setExtractError('Tidak ada daftar pasien yang terbaca jelas di gambar. Anda bisa input manual atau gunakan hitung cepat.')
      }
    } catch (err: any) {
      console.error('Gagal ekstrak AI poli:', err)
      setExtractError(err?.message || 'Gagal memproses gambar. Periksa konfigurasi API di Pengaturan.')
    } finally {
      setIsExtracting(false)
    }
  }

  // Add / edit patient row
  const handleAddPatientRow = () => {
    setPatients(prev => [
      ...prev,
      {
        nama: `Pasien ${prev.length + 1}`,
        no_rm: '',
        jaminan: 'BPJS',
        keterangan: '',
      }
    ])
  }

  const handleUpdatePatient = (index: number, field: keyof PoliLogItem, value: any) => {
    setPatients(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleRemovePatient = (index: number) => {
    setPatients(prev => prev.filter((_, i) => i !== index))
  }

  // Total count calculation
  const totalCount = tabMode === 'foto' && patients.length > 0
    ? patients.length
    : (countBpjs + countUmum + countAsuransi)

  // Save to DB
  const handleSave = async () => {
    if (!hospitalId) {
      alert('Pilih Rumah Sakit terlebih dahulu')
      return
    }

    if (totalCount <= 0) {
      alert('Jumlah pasien poli belum ada (minimal 1 pasien)')
      return
    }

    setIsSaving(true)
    try {
      const logData: PoliLog = {
        tanggal,
        hospital_id: hospitalId,
        tipe_poli: tipePoli,
        jumlah_pasien: totalCount,
        daftar_pasien: tabMode === 'foto' && patients.length > 0 ? patients : undefined,
        foto_urls: imageDataUrl ? [imageDataUrl] : undefined,
        catatan: catatan.trim() || undefined,
        created_at: initialData?.created_at || new Date().toISOString(),
      }

      if (initialData?.id) {
        await db.poliLogs.update(initialData.id, logData as any)
      } else {
        await db.poliLogs.add(logData)
      }

      onSaved?.()
      onClose()
    } catch (err: any) {
      console.error('Gagal simpan poli log:', err)
      alert('Gagal menyimpan rekap poli: ' + (err.message || 'Error tidak diketahui'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl max-h-[92dvh] sm:max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200/80 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {initialData ? 'Edit Rekap Poli' : 'Catat Pasien Poli'}
              </h2>
              <p className="text-xs text-slate-500">
                Rekap kehadiran rawat jalan & proyeksi tindakan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Metadata Section: RS, Tanggal, Tipe Poli */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Fasilitas Kesehatan / RS
              </label>
              <CustomSelect
                value={String(hospitalId)}
                onChange={(val) => setHospitalId(parseInt(val, 10))}
                options={hospitals.map(h => ({ value: String(h.id), label: h.nama }))}
                placeholder="Pilih Rumah Sakit"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Tanggal Layanan Poli
              </label>
              <DateInput
                value={tanggal}
                onChange={setTanggal}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Jenis Layanan Poli
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipePoli('reguler')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    tipePoli === 'reguler'
                      ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Poli Reguler
                </button>
                <button
                  type="button"
                  onClick={() => setTipePoli('eksekutif')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    tipePoli === 'eksekutif'
                      ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Poli Eksekutif
                </button>
              </div>
            </div>
          </div>

          {/* Tab Selector: Scan Foto / eRM vs Hitung Cepat */}
          <div>
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setTabMode('foto')}
                className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  tabMode === 'foto'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Camera size={15} />
                <span>Foto Monitor / Register</span>
              </button>
              <button
                type="button"
                onClick={() => setTabMode('tally')}
                className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  tabMode === 'tally'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Users size={15} />
                <span>Hitung Cepat (Tally)</span>
              </button>
            </div>
          </div>

          {/* Mode 1: Foto / AI OCR Extraction */}
          {tabMode === 'foto' && (
            <div className="space-y-3.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />

              {!imageDataUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-500 group-hover:text-primary group-hover:border-primary/40 shadow-sm transition-all mb-2">
                    <Camera size={24} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    Ambil Foto Layar Monitor e-RM / Buku Register
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 text-center">
                    Sistem otomatis membaca nama, nomor RM, dan jaminan pasien
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 flex items-center justify-center max-h-56">
                    <img
                      src={imageDataUrl}
                      alt="Pratinjau Register Poli"
                      className="w-full h-auto max-h-56 object-contain"
                    />
                    <div className="absolute top-2 right-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1.5 rounded-xl bg-black/60 text-white text-[11px] font-medium backdrop-blur-md hover:bg-black/80 transition-colors flex items-center gap-1"
                      >
                        <Camera size={13} />
                        Ganti Foto
                      </button>
                    </div>
                  </div>

                  {/* Tombol Ekstrak AI */}
                  <button
                    type="button"
                    onClick={handleExtractWithAi}
                    disabled={isExtracting}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-deep text-white text-xs font-bold shadow-md shadow-primary/20 flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50 transition-all"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Menganalisis & membaca foto register...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>{patients.length > 0 ? 'Ekstrak Ulang dari Foto' : 'Ekstrak Pasien dari Foto'}</span>
                      </>
                    )}
                  </button>

                  {extractError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>{extractError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Daftar Pasien yang Diekstrak / Diedit */}
              {patients.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileSpreadsheet size={15} className="text-primary" />
                      Daftar Pasien ({patients.length} Pasien)
                    </span>
                    <button
                      type="button"
                      onClick={handleAddPatientRow}
                      className="text-xs font-semibold text-primary hover:text-primary-deep flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Tambah Baris
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {patients.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200/90 bg-white shadow-xs text-xs"
                      >
                        <span className="w-5 text-center font-bold text-slate-400">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={p.nama}
                              onChange={(e) => handleUpdatePatient(idx, 'nama', e.target.value)}
                              placeholder="Nama Pasien"
                              className="flex-1 font-semibold text-slate-800 bg-transparent border-b border-dashed border-slate-200 focus:border-primary focus:outline-none"
                            />
                            <input
                              type="text"
                              value={p.no_rm || ''}
                              onChange={(e) => handleUpdatePatient(idx, 'no_rm', e.target.value)}
                              placeholder="No. RM"
                              className="w-24 text-right text-slate-600 bg-transparent border-b border-dashed border-slate-200 focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <input
                              type="text"
                              value={p.keterangan || ''}
                              onChange={(e) => handleUpdatePatient(idx, 'keterangan', e.target.value)}
                              placeholder="Diagnosis / Keterangan (opsional)"
                              className="flex-1 text-[11px] text-slate-500 bg-transparent focus:outline-none"
                            />
                            <div className="flex gap-1 shrink-0">
                              {(['BPJS', 'Umum', 'Asuransi'] as const).map(j => (
                                <button
                                  key={j}
                                  type="button"
                                  onClick={() => handleUpdatePatient(idx, 'jaminan', j)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                    p.jaminan === j || (!p.jaminan && j === 'BPJS')
                                      ? j === 'BPJS'
                                        ? 'bg-emerald-100 text-emerald-800 font-bold'
                                        : j === 'Umum'
                                        ? 'bg-blue-100 text-blue-800 font-bold'
                                        : 'bg-purple-100 text-purple-800 font-bold'
                                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                  }`}
                                >
                                  {j}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePatient(idx)}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                          title="Hapus Pasien"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Hitung Cepat (Tally) */}
          {tabMode === 'tally' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Gunakan counter ini saat sangat lelah dan tidak sempat memfoto nama pasien satu per satu.
              </p>

              {/* Tally Card: BPJS */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                <div>
                  <div className="text-xs font-bold text-emerald-900">Pasien BPJS / JKN</div>
                  <div className="text-[11px] text-emerald-700">Peserta KIS / PBI / Non-PBI</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCountBpjs(Math.max(0, countBpjs - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-emerald-200 text-emerald-800 font-bold text-sm shadow-xs active:scale-95"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={countBpjs}
                    onChange={(e) => setCountBpjs(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-14 text-center font-bold text-base bg-white border border-emerald-200 rounded-xl py-1 text-emerald-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCountBpjs(countBpjs + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-emerald-200 text-emerald-800 font-bold text-sm shadow-xs active:scale-95"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setCountBpjs(countBpjs + 5)}
                    className="px-2 py-1 rounded-xl bg-emerald-600 text-white font-bold text-[11px] shadow-xs active:scale-95"
                  >
                    +5
                  </button>
                </div>
              </div>

              {/* Tally Card: Pasien Umum */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/60 border border-blue-100">
                <div>
                  <div className="text-xs font-bold text-blue-900">Pasien Umum / Tunai</div>
                  <div className="text-[11px] text-blue-700">Pasien bayar pribadi</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCountUmum(Math.max(0, countUmum - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-blue-200 text-blue-800 font-bold text-sm shadow-xs active:scale-95"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={countUmum}
                    onChange={(e) => setCountUmum(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-14 text-center font-bold text-base bg-white border border-blue-200 rounded-xl py-1 text-blue-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCountUmum(countUmum + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-blue-200 text-blue-800 font-bold text-sm shadow-xs active:scale-95"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setCountUmum(countUmum + 5)}
                    className="px-2 py-1 rounded-xl bg-blue-600 text-white font-bold text-[11px] shadow-xs active:scale-95"
                  >
                    +5
                  </button>
                </div>
              </div>

              {/* Tally Card: Asuransi Swasta */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-purple-50/60 border border-purple-100">
                <div>
                  <div className="text-xs font-bold text-purple-900">Asuransi Swasta</div>
                  <div className="text-[11px] text-purple-700">AdMedika / Prudential, dll</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCountAsuransi(Math.max(0, countAsuransi - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-purple-200 text-purple-800 font-bold text-sm shadow-xs active:scale-95"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={countAsuransi}
                    onChange={(e) => setCountAsuransi(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-14 text-center font-bold text-base bg-white border border-purple-200 rounded-xl py-1 text-purple-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCountAsuransi(countAsuransi + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-purple-200 text-purple-800 font-bold text-sm shadow-xs active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Catatan Bebas Tambahan */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Catatan Sesi Poli (Opsional)
            </label>
            <textarea
              rows={2}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Catatan tambahan, misal: 'Poli ramai 3 kasus emergency dikirim ke IGD', 'Pasien rujukan dari spesialis lain', dll."
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-primary focus:outline-none resize-none"
            />
          </div>

          {/* Ringkasan Total Pasien */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Total Pasien Poli Terhitung
              </span>
              <div className="text-xl font-black text-primary">
                {totalCount} Pasien
              </div>
            </div>
            {selectedHospital && (
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Estimasi Tarif/Px</span>
                <span className="text-xs font-semibold text-slate-700">
                  {tipePoli === 'eksekutif'
                    ? (selectedHospital.tarif_poli_eksekutif ? `Rp ${selectedHospital.tarif_poli_eksekutif.toLocaleString('id-ID')}` : 'Belum diatur')
                    : (selectedHospital.tarif_poli_reguler ? `Rp ${selectedHospital.tarif_poli_reguler.toLocaleString('id-ID')}` : 'Belum diatur')
                  }
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || totalCount === 0}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/20 hover:bg-primary-deep disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Simpan Rekap Poli</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
