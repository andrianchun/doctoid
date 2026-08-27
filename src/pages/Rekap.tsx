import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, FileText, Plus, Trash2, ClipboardCopy, ChevronRight, Calculator } from 'lucide-react'
import { db, type Patient, type ProgressNote } from '../db'
import Masked from '../components/Masked'

const hariKe = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1)

const inputCls =
  'w-full rounded-2xl border border-primary-soft/30 bg-card px-4 py-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all'

function renderTemplate(fmt: string, p: Patient, latest?: ProgressNote): string {
  const vars: Record<string, string> = {
    nama_depan: p.nama_depan || (p as any).inisial,
    no_rm: p.no_rm,
    diagnosis_utama: p.diagnosis_utama,
    jaminan: p.jaminan,
    tgl_mrs: p.tgl_mrs,
    tgl_onset: p.tgl_onset,
    hari_rawat: String(hariKe(p.tgl_mrs)),
    S: latest?.S ?? '',
    O_pemfis: latest?.O_pemfis ?? '',
    O_penunjang: latest?.O_penunjang ?? '',
    A: Array.isArray(latest?.A) ? latest.A.map(a => a.nama_diagnosis).join('; ') : (latest?.A ?? ''),
    icd9_code: (latest?.P ?? []).filter((t) => t.kategori === 'Diagnostik' && t.icd9).map((t) => t.icd9).join(', '),
    terapi_aktif: (latest?.P ?? [])
      .filter((t) => t.status === 'aktif')
      .map((t) => `- ${t.nama_item} ${t.dosis_keterangan}`.trim())
      .join('\n'),
  }
  return fmt.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

export default function Rekap() {
  const [activeTab, setActiveTab] = useState<'pasien' | 'template' | 'kalkulator'>('pasien')
  const [q, setQ] = useState('')
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3000)
  }

  const patients = useLiveQuery(() => db.patients.toArray(), [], [])
  const templates = useLiveQuery(() => db.templates.toArray(), [], [])
  const wards = useLiveQuery(() => db.wards.toArray(), [], [])

  const wardMap = useMemo(() => {
    const map = new Map<number, string>()
    wards?.forEach(w => {
      if (w.id) map.set(w.id, w.kode_warna)
    })
    return map
  }, [wards])

  const hasil = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return patients ?? []
    return (patients ?? []).filter((p) => {
      const pastDx = p.riwayat_rawat?.map(r => r.diagnosis_utama).join(' ') || ''
      return [p.nama_depan, (p as any).inisial, p.no_rm, p.diagnosis_utama, p.jaminan, pastDx].some(
        (v) => v && v.toLowerCase().includes(s)
      )
    })
  }, [q, patients])

  /* Template generator */
  const [tplId, setTplId] = useState(0)
  const [tplPasienId, setTplPasienId] = useState(0)
  const [output, setOutput] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newNama, setNewNama] = useState('')
  const [newFmt, setNewFmt] = useState('')

  /* Kalkulator state */
  const [gcsE, setGcsE] = useState(4)
  const [gcsV, setGcsV] = useState(5)
  const [gcsM, setGcsM] = useState(6)
  const [nihssScore, setNihssScore] = useState('')

  const generate = async () => {
    const tpl = templates?.find((t) => t.id === tplId)
    const p = patients?.find((x) => x.id === tplPasienId)
    if (!tpl || !p) return
    const notes = await db.progressNotes.where('patient_id').equals(p.id!).sortBy('tanggal')
    setOutput(renderTemplate(tpl.format_string, p, notes[notes.length - 1]))
  }

  return (
    <main className="space-y-5 p-5">
      {/* Header Banner */}
      <div className="glass-blue-hero rounded-3xl p-5 text-white shadow-xl">
        <h1 className="h1 text-2xl font-black text-white">Rekap & Alat Klinis</h1>
        <p className="caption text-xs font-medium text-white/85 mt-0.5">Arsip rekam medis, kalkulator neurologi, & template operan</p>
      </div>

      {/* Pill Sub-Navigation */}
      <div className="flex rounded-2xl bg-surface p-1 border border-surface shadow-xs">
        <button
          onClick={() => setActiveTab('pasien')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'pasien' ? 'bg-white text-primary shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Daftar Pasien ({patients?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('template')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'template' ? 'bg-white text-primary shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Template Operan
        </button>
        <button
          onClick={() => setActiveTab('kalkulator')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'kalkulator' ? 'bg-white text-primary shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Kalkulator
        </button>
      </div>

      {activeTab === 'pasien' && (
        <div className="space-y-4">
          {/* Pencarian */}
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari inisial, RM, diagnosis, jaminan…"
              className={inputCls + ' pl-10 h-11'}
            />
          </div>

          {/* Daftar Pasien */}
          <div className="space-y-3">
            {hasil.map((p) => {
              const warna = p.lokasi_sekarang ? wardMap.get(p.lokasi_sekarang) || '#2563EB' : '#2563EB'
              return (
                <Link
                  key={p.id}
                  to={`/pasien/${p.id}`}
                  className="glass-card glass-card-hover flex items-center justify-between rounded-3xl p-4 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className="flex size-11 shrink-0 items-center justify-center rounded-2xl font-black text-sm text-white shadow-sm"
                      style={{ backgroundColor: warna }}
                    >
                      {p.nama_depan?.[0]?.toUpperCase() || (p as any).inisial?.[0]?.toUpperCase() || 'P'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-ink">
                          {p.title} <Masked value={p.nama_depan || (p as any).inisial} type="name" />
                        </span>
                        <span className="caption">· RM <Masked value={p.no_rm} type="rm" /></span>
                      </div>

                      <p className="truncate text-xs font-bold text-primary mt-0.5">{p.diagnosis_utama || '—'}</p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                          {p.jaminan}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          p.status_rawat === 'aktif' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-surface text-ink-muted'
                        }`}>
                          {p.status_rawat === 'aktif' ? `Rawat H-${hariKe(p.tgl_mrs)}` : 'KRS'}
                        </span>
                        {p.riwayat_rawat && p.riwayat_rawat.length > 0 && (
                          <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 px-2.5 py-0.5 text-xs font-bold">
                            Rawat ke-{p.riwayat_rawat.length + 1}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-ink-muted/70 ml-2 shrink-0" />
                </Link>
              )
            })}
            {!hasil.length && (
              <div className="glass-card rounded-3xl p-8 text-center text-xs font-medium text-ink-muted">
                Tidak ada pasien yang cocok dengan pencarian.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'template' && (
        <div className="glass-card rounded-3xl p-5 shadow-sm space-y-4">
          <p className="h3 text-xs font-bold text-ink flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            <span>Generator Format Operan & Konsul</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={tplId} onChange={(e) => setTplId(+e.target.value)} className={inputCls + ' h-11'}>
              <option value={0}>— Pilih Template —</option>
              {templates?.map((t) => <option key={t.id} value={t.id}>{t.nama_template}</option>)}
            </select>
            <select value={tplPasienId} onChange={(e) => setTplPasienId(+e.target.value)} className={inputCls + ' h-11'}>
              <option value={0}>— Pilih Pasien —</option>
              {patients?.map((p) => <option key={p.id} value={p.id}>{p.nama_depan || (p as any).inisial} ({p.no_rm})</option>)}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={generate}
              disabled={!tplId || !tplPasienId}
              className="flex h-10 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-5 text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-40 active:scale-95 transition-all"
            >
              Render Teks
            </button>
            <button
              onClick={() => setShowNew((v) => !v)}
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-2xl bg-surface px-4 text-xs font-bold text-ink hover:bg-surface/80 transition-all"
            >
              <Plus size={14} /> Template Baru
            </button>
            {tplId > 0 && (
              <button
                onClick={async () => {
                  if (window.confirm('Hapus template ini?')) {
                    await db.templates.delete(tplId)
                    setTplId(0)
                    notify('Template dihapus')
                  }
                }}
                aria-label="Hapus template"
                className="flex size-10 cursor-pointer items-center justify-center rounded-2xl bg-surface text-ink-muted hover:text-rose-600 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {showNew && (
            <div className="mt-3 space-y-2.5 rounded-2xl bg-surface/80 p-4 border border-primary-soft/20 animate-in fade-in">
              <input value={newNama} onChange={(e) => setNewNama(e.target.value)} placeholder="Nama template (mis. Operan Jaga Malam)" className={inputCls} />
              <textarea
                value={newFmt}
                onChange={(e) => setNewFmt(e.target.value)}
                rows={5}
                placeholder={'Operan: {{nama_depan}} / {{no_rm}} / {{jaminan}}\nDx: {{diagnosis_utama}} (H-{{hari_rawat}})\nS: {{S}}\nO (Pemfis): {{O_pemfis}}\nO (Penunjang): {{O_penunjang}}\nTerapi:\n{{terapi_aktif}}'}
                className={inputCls + ' resize-y font-mono text-xs'}
              />
              <p className="caption font-medium text-ink-muted leading-relaxed">
                Variabel: {'{{nama_depan}} {{no_rm}} {{jaminan}} {{diagnosis_utama}} {{hari_rawat}} {{S}} {{O_pemfis}} {{O_penunjang}} {{A}} {{terapi_aktif}}'}
              </p>
              <button
                disabled={!newNama.trim() || !newFmt.trim()}
                onClick={async () => {
                  await db.templates.add({ nama_template: newNama.trim(), format_string: newFmt })
                  setNewNama('')
                  setNewFmt('')
                  setShowNew(false)
                  notify('Template berhasil disimpan ✓')
                }}
                className="flex h-10 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-4 text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-40"
              >
                Simpan Template
              </button>
            </div>
          )}

          {output && (
            <div className="mt-3 space-y-2 animate-in fade-in">
              <textarea value={output} readOnly rows={7} className={inputCls + ' resize-y bg-surface/90 font-mono text-xs'} />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(output)
                    notify('Teks berhasil disalin ke clipboard ✓')
                  } catch {
                    notify('Clipboard tidak tersedia — salin manual')
                  }
                }}
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-4 text-xs font-bold text-white shadow-md shadow-primary/20 active:scale-95 transition-all"
              >
                <ClipboardCopy size={15} /> Salin Hasil
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'kalkulator' && (
        <div className="space-y-4">
          {/* Kalkulator GCS */}
          <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="h3 text-xs font-bold text-ink flex items-center gap-2">
                <Calculator size={16} className="text-primary" />
                <span>Glasgow Coma Scale (GCS)</span>
              </p>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                Total: E{gcsE}V{gcsV}M{gcsM} ({gcsE + gcsV + gcsM})
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <label className="caption block font-bold mb-1">Eye (E)</label>
                <select value={gcsE} onChange={(e) => setGcsE(+e.target.value)} className={inputCls}>
                  <option value={4}>4 - Spontan</option>
                  <option value={3}>3 - Suara</option>
                  <option value={2}>2 - Nyeri</option>
                  <option value={1}>1 - Tidak ada</option>
                </select>
              </div>
              <div>
                <label className="caption block font-bold mb-1">Verbal (V)</label>
                <select value={gcsV} onChange={(e) => setGcsV(+e.target.value)} className={inputCls}>
                  <option value={5}>5 - Orientasi baik</option>
                  <option value={4}>4 - Bingung</option>
                  <option value={3}>3 - Kata tak tepat</option>
                  <option value={2}>2 - Suara mengerang</option>
                  <option value={1}>1 - Tidak ada</option>
                </select>
              </div>
              <div>
                <label className="caption block font-bold mb-1">Motorik (M)</label>
                <select value={gcsM} onChange={(e) => setGcsM(+e.target.value)} className={inputCls}>
                  <option value={6}>6 - Mengikuti perintah</option>
                  <option value={5}>5 - Melokalisir nyeri</option>
                  <option value={4}>4 - Menghindar nyeri</option>
                  <option value={3}>3 - Fleksi abnormal</option>
                  <option value={2}>2 - Ekstensi abnormal</option>
                  <option value={1}>1 - Tidak ada</option>
                </select>
              </div>
            </div>
          </div>

          {/* Kalkulator NIHSS Quick Ref */}
          <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3">
            <p className="h3 text-xs font-bold text-ink">Skor NIHSS Stroke</p>
            <input
              value={nihssScore}
              onChange={(e) => setNihssScore(e.target.value)}
              placeholder="Masukkan total skor NIHSS (0 - 42)"
              type="number"
              min={0}
              max={42}
              className={inputCls}
            />
            {nihssScore !== '' && (
              <div className="rounded-2xl bg-surface p-3 text-xs font-semibold">
                {+nihssScore === 0 && <span className="text-emerald-600 font-bold">Tidak ada defisit stroke</span>}
                {+nihssScore >= 1 && +nihssScore <= 4 && <span className="text-emerald-700 font-bold">Stroke Ringan (Mild)</span>}
                {+nihssScore >= 5 && +nihssScore <= 15 && <span className="text-amber-700 font-bold">Stroke Sedang (Moderate)</span>}
                {+nihssScore >= 16 && +nihssScore <= 20 && <span className="text-rose-600 font-bold">Stroke Sedang-Berat</span>}
                {+nihssScore >= 21 && <span className="text-rose-700 font-bold">Stroke Berat (Severe)</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <aside aria-label="Notifikasi" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </aside>
      )}
    </main>
  )
}
