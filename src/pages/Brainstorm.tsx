import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, Camera, Image as ImageIcon, Mic, MicOff, Sparkles,
  Trash2, Save, Loader2, X, FileText, Info, ChevronDown, Send
} from 'lucide-react'
import { db, type Jaminan, type TerapiItem, type DiagnosisItem } from '../db'
import { lineToTerapi } from '../parser'
import { rapikan, analisisKasus } from '../ai'

const today = () => new Date().toISOString().slice(0, 10)

interface FormState {
  title: string
  nama_depan: string
  usia: string
  no_rm: string
  jaminan: Jaminan
  tgl_mrs: string
  tgl_onset: string
  S: string
  O_pemfis: string
  O_penunjang: string
  A: DiagnosisItem[]
  P: TerapiItem[]
  icd9_code: string
}

const emptyForm = (): FormState => ({
  title: '', nama_depan: '', usia: '', no_rm: '', jaminan: 'BPJS', tgl_mrs: today(), tgl_onset: '',
  S: '', O_pemfis: '', O_penunjang: '', A: [], P: [], icd9_code: '',
})

const inputCls =
  'w-full rounded-xl border border-primary-soft/40 bg-card px-3 py-2 text-sm outline-none focus:border-primary'

const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new globalThis.Image()
      img.src = e.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        const MAX = 1200
        if (width > height && width > MAX) {
          height *= MAX / width
          width = MAX
        } else if (height > MAX) {
          width *= MAX / height
          height = MAX
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/webp', 0.8))
      }
      img.onerror = reject
    }
    reader.onerror = reject
  })
}

const fileToBase64 = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}

export default function Brainstorm() {
  const [raw, setRaw] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState<'' | 'ocr' | 'ai' | 'analisis'>('')
  const [listening, setListening] = useState(false)
  const [toast, setToast] = useState('')
  const [komentarAnalisis, setKomentarAnalisis] = useState('')

  const [attachments, setAttachments] = useState<{ id: string, name: string, type: string, dataUrl: string }[]>([])

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  
  const ocrCameraRef = useRef<HTMLInputElement>(null)
  const ocrGalleryRef = useRef<HTMLInputElement>(null)
  
  const textRef = useRef<HTMLTextAreaElement>(null)
  const recRef = useRef<SpeechRecognition | null>(null)

  const hospitals = useLiveQuery(() => db.hospitals.toArray(), [], [])
  const [hospitalId, setHospitalId] = useState<number>(0)
  const allWards = useLiveQuery(() => db.wards.toArray(), [], [])
  const [wardId, setWardId] = useState<number>(0)
  const [showFaskesMenu, setShowFaskesMenu] = useState(false)
  const [isRingkas, setIsRingkas] = useState(true)

  const notify = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  /* ---- Handlers ---- */
  const handleAttachFile = async (file: File) => {
    try {
      let dataUrl: string
      if (file.type.startsWith('image/')) {
        dataUrl = await compressImage(file)
      } else {
        dataUrl = await fileToBase64(file)
      }
      setAttachments(prev => [...prev, { 
        id: Math.random().toString(36).substring(7), 
        name: file.name,
        type: file.type || 'application/octet-stream',
        dataUrl 
      }])
    } catch (err) {
      notify('Gagal memproses file.')
    }
  }

  const runOcr = async (file: File) => {
    setBusy('ocr')
    try {
      const { default: Tesseract } = await import('tesseract.js')
      const { data } = await Tesseract.recognize(file, 'ind')
      setRaw((r) => (r ? r + '\n' : '') + data.text.trim())
      notify('Berhasil mengekstrak teks.')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy('')
    }
  }

  const runAnalisis = async () => {
    setBusy('analisis')
    setKomentarAnalisis('')
    try {
      const dataToAnalyze = JSON.stringify({
        S: form.S,
        O_pemfis: form.O_pemfis,
        O_penunjang: form.O_penunjang,
        A: form.A,
        P: form.P
      }, null, 2)
      
      const r = await analisisKasus(dataToAnalyze)
      set({ 
        A: r.A, 
        P: r.P.map(p => ({
          ...p,
          tgl_mulai: today(),
          tgl_stop: ''
        }))
      })
      if (r.icd9_code) set({ icd9_code: r.icd9_code })
      if (r.komentar) setKomentarAnalisis(r.komentar)
      notify('Analisis selesai.')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy('')
    }
  }

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return notify('Browser ini tidak mendukung dikte suara.')
    const rec = new SR()
    rec.lang = 'id-ID'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).slice(e.resultIndex).map((r) => r[0].transcript).join(' ')
      setRaw((r) => (r ? r + ' ' : '') + t.trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  /* ---- parsing ---- */
  const parseAi = async () => {
    setBusy('ai')
    try {
      const r = await rapikan(raw, attachments, isRingkas)
      set({
        ...r,
        jaminan: r.jaminan || 'BPJS',
        tgl_mrs: r.tgl_mrs || today(),
        P: r.P.map((it) => ({ ...it, tgl_mulai: today(), tgl_stop: null, status: 'aktif' as const })),
      })
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  /* ---- simpan ---- */
  const simpan = async () => {
    if (!form.nama_depan.trim()) return notify('Nama depan pasien wajib diisi.')
    if (!hospitalId || !wardId) return notify('Pilih RS dan ruangan dulu (tambah di Pengaturan bila kosong).')
    
    // Cari diagnosis utama dari A
    const dxUtama = form.A.find(d => d.kategori === 'Utama')?.nama_diagnosis || form.A[0]?.nama_diagnosis || ''
    
    const patientId = await db.patients.add({
      hospital_id: hospitalId,
      title: form.title,
      nama_depan: form.nama_depan.trim(),
      usia: form.usia.trim(),
      no_rm: form.no_rm.trim(),
      tgl_mrs: form.tgl_mrs,
      tgl_onset: form.tgl_onset,
      diagnosis_utama: dxUtama.trim(),
      lokasi_sekarang: wardId,
      status_rawat: 'aktif',
      jaminan: form.jaminan,
    })
    await db.progressNotes.add({
      patient_id: patientId as number,
      tanggal: today(),
      S: form.S, O_pemfis: form.O_pemfis, O_penunjang: form.O_penunjang, A: form.A, P: form.P,
      icd9_code: form.icd9_code,
      attachments: attachments.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl })),
    })
    setRaw('')
    setAttachments([])
    setKomentarAnalisis('')
    setForm(emptyForm())
    notify('Pasien baru tersimpan 🎉')
  }

  return (
    <main className="space-y-4 p-5 pb-32">


      {/* Form hasil parse */}
      <div className="space-y-3 rounded-2xl bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Data Pasien Baru</p>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-full bg-surface px-2 py-1 hover:bg-surface/80">
              <span className={`text-[10px] font-bold ${isRingkas ? 'text-primary' : 'text-ink-muted'}`}>{isRingkas ? 'Ringkas' : 'Lengkap'}</span>
              <div className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${isRingkas ? 'bg-primary' : 'bg-surface/50 border border-ink-muted'}`}>
                <input type="checkbox" checked={isRingkas} onChange={(e) => setIsRingkas(e.target.checked)} className="sr-only" />
                <span className={`inline-block size-3 transform rounded-full bg-white transition-transform ${isRingkas ? 'translate-x-3' : 'translate-x-0.5 shadow-sm bg-ink-muted'}`} />
              </div>
            </label>
            <div className="group relative flex cursor-pointer items-center justify-center rounded-full bg-surface p-1 text-ink-muted hover:text-primary">
              <Info size={16} />
              <div className="absolute right-0 top-full z-10 mt-1 hidden w-48 rounded-xl bg-ink p-2 text-[10px] text-white shadow-xl group-hover:block">
                Nama pasien akan otomatis disamarkan (inisial) pada halaman Dasbor untuk keamanan data.
              </div>
            </div>
          </div>
        </div>

        {/* Row 1: Title, Nama, Usia, RM, Jaminan */}
        <div className="flex gap-2">
          <select value={form.title} onChange={(e) => set({ title: e.target.value })} className={inputCls.replace('w-full', '') + ' w-[4.5rem] px-2'}>
            <option value="">Gelar</option><option>Tn.</option><option>Ny.</option><option>Sdr.</option><option>Sdri.</option><option>An.</option><option>By.</option>
          </select>
          <input value={form.nama_depan} onChange={(e) => set({ nama_depan: e.target.value })} placeholder="Nama Panggilan" className={inputCls + ' flex-1 min-w-0'} />
          <input value={form.usia} onChange={(e) => set({ usia: e.target.value })} placeholder="(th)" className={inputCls.replace('w-full', '') + ' w-16 text-center'} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.no_rm} onChange={(e) => set({ no_rm: e.target.value })} placeholder="No. RM" className={inputCls} />
          <select value={form.jaminan} onChange={(e) => set({ jaminan: e.target.value as Jaminan })} className={inputCls}>
            <option value="">Jaminan</option><option>BPJS</option><option>Umum</option><option>Asuransi</option>
          </select>
        </div>

        {/* Row 2: Onset, MRS */}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-ink-muted">Onset<input type="date" value={form.tgl_onset} onChange={(e) => set({ tgl_onset: e.target.value })} className={inputCls + ' mt-1'} /></label>
          <label className="text-xs font-medium text-ink-muted">MRS<input type="date" value={form.tgl_mrs} onChange={(e) => set({ tgl_mrs: e.target.value })} className={inputCls + ' mt-1'} /></label>
        </div>

        {/* Row 3: Faskes & Ruangan */}
        <div className="relative">
          <button 
            type="button"
            onClick={() => setShowFaskesMenu(!showFaskesMenu)} 
            className={inputCls + ' flex items-center gap-2 text-left w-full h-[42px]'}
          >
            {hospitalId && wardId && hospitals && allWards ? (() => {
               const h = hospitals.find(x => x.id === hospitalId)
               const w = allWards.find(x => x.id === wardId)
               if (!h || !w) return <span className="text-ink-muted">— Pilih Faskes & Ruangan —</span>
               return (
                 <>
                   {h.icon && <img src={h.icon} className="size-4 rounded-sm object-cover" />}
                   <span className="font-semibold text-primary">{h.nama}</span>
                   <span className="text-ink-muted text-[10px]">›</span>
                   <div className="size-3 rounded-full shadow-inner" style={{ backgroundColor: w.kode_warna }} />
                   <span className="font-semibold text-primary-deep">{w.nama}</span>
                 </>
               )
            })() : (
              <span className="text-ink-muted">— Pilih Faskes & Ruangan —</span>
            )}
            <ChevronDown size={14} className="ml-auto text-ink-muted shrink-0" />
          </button>
          
          {showFaskesMenu && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-xl bg-card border border-surface shadow-xl p-2 space-y-3 animate-in fade-in zoom-in-95">
              {hospitals?.map(h => {
                 const hWards = allWards?.filter(w => w.hospital_id === h.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) || [];
                 if (hWards.length === 0) return null;
                 return (
                   <div key={h.id} className="space-y-1">
                     <div className="flex items-center gap-2 px-2 py-1 bg-surface/50 rounded-lg">
                       {h.icon && <img src={h.icon} className="size-4 rounded-sm object-cover" />}
                       <span className="text-xs font-bold text-ink-muted">{h.nama}</span>
                     </div>
                     {hWards.map(w => (
                       <button 
                         key={w.id} 
                         type="button"
                         className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-surface rounded-lg text-left pl-6"
                         onClick={() => {
                           setHospitalId(h.id!);
                           setWardId(w.id!);
                           setShowFaskesMenu(false);
                         }}
                       >
                         <div className="size-2.5 rounded-full shadow-inner shrink-0" style={{ backgroundColor: w.kode_warna }} />
                         <span className="text-xs font-medium text-ink">{w.nama}</span>
                       </button>
                     ))}
                   </div>
                 )
              })}
              {!hospitals?.length && <p className="text-xs text-center text-ink-muted p-2">Belum ada faskes. Tambah di Pengaturan.</p>}
            </div>
          )}
        </div>

        {/* S, O_pemfis, O_penunjang */}
        <label className="block text-xs font-semibold text-ink-muted">
          S (Subjektif)
          <textarea value={form.S} onChange={(e) => set({ S: e.target.value })} rows={2} className={inputCls + ' mt-1 resize-y'} />
        </label>
        <label className="block text-xs font-semibold text-ink-muted">
          O — Pemeriksaan Fisik
          <textarea value={form.O_pemfis} onChange={(e) => set({ O_pemfis: e.target.value })} rows={2} className={inputCls + ' mt-1 resize-y'} />
        </label>
        <label className="block text-xs font-semibold text-ink-muted">
          O — Pemeriksaan Penunjang
          <textarea value={form.O_penunjang} onChange={(e) => set({ O_penunjang: e.target.value })} rows={2} className={inputCls + ' mt-1 resize-y'} />
        </label>

        {/* A */}
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-muted">A — Assessment (Diagnosis)</p>
          <div className="space-y-1.5">
            {form.A.map((dx, i) => (
              <div key={i} className="flex gap-2 items-start rounded-xl bg-surface px-2 py-1.5 text-xs">
                <select 
                  value={dx.kategori} 
                  onChange={(e) => {
                    const newA = [...form.A];
                    newA[i].kategori = e.target.value as 'Utama' | 'Sekunder';
                    set({ A: newA });
                  }} 
                  className="rounded bg-transparent outline-none font-semibold text-ink-muted border border-surface/50 p-1 w-20 shrink-0"
                >
                  <option value="Utama">Utama</option>
                  <option value="Sekunder">Sekunder</option>
                </select>
                <textarea 
                  value={dx.nama_diagnosis} 
                  onChange={(e) => {
                    const newA = [...form.A];
                    newA[i].nama_diagnosis = e.target.value;
                    set({ A: newA });
                  }} 
                  placeholder="Nama Diagnosis"
                  rows={1}
                  className="flex-1 resize-none rounded bg-transparent p-1 outline-none font-bold" 
                />
                <input 
                  value={dx.icd10} 
                  onChange={(e) => {
                    const newA = [...form.A];
                    newA[i].icd10 = e.target.value;
                    set({ A: newA });
                  }} 
                  placeholder="ICD-10" 
                  className="w-16 rounded bg-card p-1 outline-none text-center border border-surface uppercase" 
                />
                <button aria-label="Hapus item" className="mt-1 cursor-pointer text-ink-muted hover:text-red-400 shrink-0" onClick={() => set({ A: form.A.filter((_, j) => j !== i) })}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              onClick={() => set({ A: [...form.A, { kategori: 'Sekunder', nama_diagnosis: '', icd10: '' }] })}
              className="text-xs font-semibold text-primary hover:underline px-1 pt-1 cursor-pointer"
            >
              + Tambah Diagnosis
            </button>
          </div>
        </div>

        {/* P */}
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-muted mt-2">P — Planning (Rencana)</p>
          
          <div className="space-y-3">
            {/* PDX */}
            <div className="rounded-xl border border-surface p-2">
              <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 px-1">Plan Diagnostics (PDX)</p>
              <div className="space-y-1.5">
                {form.P.filter(it => it.kategori === 'Diagnostik').map((it) => {
                  const originalIndex = form.P.indexOf(it);
                  return (
                    <div key={originalIndex} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-xs">
                      <span className="flex-1"><b>{it.nama_item}</b> {it.dosis_keterangan}</span>
                      <button className="text-ink-muted hover:text-red-400 cursor-pointer" onClick={() => set({ P: form.P.filter((_, j) => j !== originalIndex) })}><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PTX */}
            <div className="rounded-xl border border-surface p-2">
              <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 px-1">Plan Terapi (PTX)</p>
              <div className="space-y-1.5">
                {form.P.filter(it => it.kategori === 'Farmakologi' || it.kategori === 'Non-Farmakologi').map((it) => {
                  const originalIndex = form.P.indexOf(it);
                  return (
                    <div key={originalIndex} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-xs">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${it.kategori === 'Farmakologi' ? 'bg-primary/15 text-primary-deep' : 'bg-emerald-100 text-emerald-700'}`}>
                        {it.kategori === 'Farmakologi' ? 'F' : 'NF'}
                      </span>
                      <span className="flex-1"><b>{it.nama_item}</b> {it.dosis_keterangan}</span>
                      <button className="text-ink-muted hover:text-red-400 cursor-pointer" onClick={() => set({ P: form.P.filter((_, j) => j !== originalIndex) })}><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PMOX */}
            <div className="rounded-xl border border-surface p-2">
              <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1 px-1">Plan Monitoring (PMOX)</p>
              <div className="space-y-1.5">
                {form.P.filter(it => it.kategori === 'Monitoring').map((it) => {
                  const originalIndex = form.P.indexOf(it);
                  return (
                    <div key={originalIndex} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-xs">
                      <span className="flex-1"><b>{it.nama_item}</b> {it.dosis_keterangan}</span>
                      <button className="text-ink-muted hover:text-red-400 cursor-pointer" onClick={() => set({ P: form.P.filter((_, j) => j !== originalIndex) })}><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
            </div>

            <input
              placeholder="+ Ketik manual PTX (mis: F Inj. Omeprazole 40 mg), Enter untuk simpan"
              className={inputCls + ' text-xs'}
              onKeyDown={(e) => {
                const v = (e.target as HTMLInputElement).value.trim()
                if (e.key === 'Enter' && v) {
                  set({ P: [...form.P, lineToTerapi(v, today())] })
                  ;(e.target as HTMLInputElement).value = ''
                }
              }}
            />
          </div>
        </div>

        <div className="pt-2">
          <input value={form.icd9_code} onChange={(e) => set({ icd9_code: e.target.value })} placeholder="ICD-9-CM Prosedur (Opsional)" className={inputCls} />
        </div>
          
          <div className="pt-2 pb-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-ink-muted">Lampiran: {attachments.length} file</p>
              <button 
                onClick={() => galleryRef.current?.click()}
                className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary-soft/20 px-2 py-1 rounded-md cursor-pointer hover:bg-primary-soft/30 transition-colors"
              >
                <Plus size={12} /> Tambah Foto
              </button>
            </div>
            
            {attachments.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {attachments.map(a => (
                  <div key={a.id} className="size-16 rounded-lg bg-surface border border-surface/80 overflow-hidden relative group" title={a.name}>
                    {a.type.startsWith('image/') ? (
                      <img src={a.dataUrl} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center bg-card text-ink-muted">
                        <FileText size={20} />
                        <span className="text-[8px] truncate w-full text-center px-1 font-bold mt-1">{a.name.split('.').pop()?.toUpperCase()}</span>
                      </div>
                    )}
                    <button 
                      onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
                      className="absolute top-1 right-1 bg-ink/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {komentarAnalisis && (
            <div className="mb-4 rounded-xl bg-blue-50 p-3 border border-blue-100">
              <div className="flex items-center gap-1.5 mb-1 text-blue-700 font-bold text-xs">
                <Sparkles size={14} /> Analisis AI
              </div>
              <p className="text-xs text-blue-900 leading-relaxed">{komentarAnalisis}</p>
            </div>
          )}

          <div className="flex gap-2 w-full mt-2">
            <button
              onClick={runAnalisis}
              disabled={busy === 'analisis' || (!form.S && !form.O_pemfis)}
              className="flex-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700 transition-all hover:bg-blue-200 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {busy === 'analisis' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Analisis
            </button>
            <button
              onClick={simpan}
              disabled={!form.nama_depan.trim() || busy === 'analisis'}
              className="flex-[2] flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-md shadow-primary/30 transition-all hover:bg-primary-deep active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              <Save size={16} /> Simpan
            </button>
          </div>
        </div>

      {/* hidden inputs */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && handleAttachFile(e.target.files[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleAttachFile(e.target.files[0])} />
      <input ref={fileRef} type="file" accept="*/*" hidden onChange={(e) => e.target.files?.[0] && handleAttachFile(e.target.files[0])} />
      
      <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && runOcr(e.target.files[0])} />
      <input ref={ocrGalleryRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && runOcr(e.target.files[0])} />

      {/* fixed bottom input bar ala AI Chat */}
      <div className="fixed bottom-[4.5rem] left-0 right-0 z-40 bg-gradient-to-t from-card via-card to-transparent px-4 pb-2 pt-6 sm:bottom-0 sm:pb-6 max-w-lg mx-auto pointer-events-none">
        
        <div className="relative flex flex-col gap-2 rounded-3xl bg-surface p-2 shadow-lg border border-primary-soft/30 transition-all focus-within:border-primary focus-within:ring-2 ring-primary/20 pointer-events-auto">
          
          <div className="flex items-end gap-2">
            {/* Menu Plus */}
            <div className="relative group shrink-0">
              <button className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-card text-ink-muted hover:bg-primary/10 hover:text-primary transition-colors">
                <Plus size={22} />
              </button>
              <div className="absolute bottom-full left-0 mb-2 hidden flex-col gap-2 rounded-2xl bg-card p-2 shadow-xl border border-surface group-hover:flex group-focus-within:flex w-max">
                <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider px-2 pt-1">Lampirkan ke eRM</p>
                <button onClick={() => cameraRef.current?.click()} className="flex items-center gap-2 whitespace-nowrap rounded-xl p-2 text-sm font-semibold hover:bg-surface text-ink"><Camera size={16}/> Kamera (Foto)</button>
                <button onClick={() => galleryRef.current?.click()} className="flex items-center gap-2 whitespace-nowrap rounded-xl p-2 text-sm font-semibold hover:bg-surface text-ink"><ImageIcon size={16}/> Galeri (Foto)</button>
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 whitespace-nowrap rounded-xl p-2 text-sm font-semibold hover:bg-surface text-ink"><FileText size={16}/> File / Dokumen</button>
                <div className="h-px bg-surface my-1" />
                <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider px-2">Alat AI</p>
                <button onClick={() => ocrCameraRef.current?.click()} className="flex items-center gap-2 whitespace-nowrap rounded-xl p-2 text-sm font-semibold hover:bg-surface text-ink"><Camera size={16}/> Ekstrak Teks (Kamera)</button>
                <button onClick={() => ocrGalleryRef.current?.click()} className="flex items-center gap-2 whitespace-nowrap rounded-xl p-2 text-sm font-semibold hover:bg-surface text-ink"><ImageIcon size={16}/> Ekstrak Teks (Galeri)</button>
              </div>
            </div>

            <textarea
              ref={textRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onInput={(e) => {
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`;
              }}
              onPaste={async (e) => {
                const items = e.clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].kind === 'file') {
                    const file = items[i].getAsFile();
                    if (file) {
                      e.preventDefault();
                      handleAttachFile(file);
                      break; 
                    }
                  }
                }
              }}
              placeholder="Ketik atau dikte kasus..."
              rows={1}
              maxLength={10000}
              className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none text-ink font-medium"
            />

            <div className="shrink-0 flex items-center gap-1 mb-1 mr-1">
              <button
                onClick={toggleMic}
                className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${listening ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/30' : 'bg-card text-ink-muted hover:bg-surface hover:text-ink'}`}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              {(raw.trim() || attachments.length > 0) && (
                <button
                  onClick={parseAi}
                  disabled={busy === 'ai'}
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/30 disabled:opacity-50"
                >
                  {busy === 'ai' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Helper status text beneath chat bar */}
        <div className="pointer-events-auto">
          {(busy === 'ocr' || listening || busy === 'ai') && (
            <div className="mt-1 flex items-center justify-center gap-2 text-[10px] font-medium">
              {busy === 'ocr' && <><Loader2 size={12} className="animate-spin text-primary" /> <span className="text-primary">Mengekstrak teks...</span></>}
              {busy === 'ai' && <><Loader2 size={12} className="animate-spin text-primary" /> <span className="text-primary">AI sedang merapikan...</span></>}
              {busy === 'analisis' && <><Loader2 size={12} className="animate-spin text-blue-600" /> <span className="text-blue-600">AI sedang menganalisis...</span></>}
              {listening && <><Mic size={12} className="animate-pulse text-red-500" /> <span className="text-red-500">Mendengarkan...</span></>}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  )
}
