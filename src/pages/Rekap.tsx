import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, FileText, Plus, Trash2, ClipboardCopy, ChevronRight } from 'lucide-react'
import { db, type Patient, type ProgressNote } from '../db'
import Masked from '../components/Masked'

const hariKe = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1)

const inputCls =
  'w-full rounded-xl border border-primary-soft/40 bg-card px-3 py-2 text-sm outline-none focus:border-primary'

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
    icd9_code: latest?.icd9_code ?? '',
    terapi_aktif: (latest?.P ?? [])
      .filter((t) => t.status === 'aktif')
      .map((t) => `- ${t.nama_item} ${t.dosis_keterangan}`.trim())
      .join('\n'),
  }
  return fmt.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

export default function Rekap() {
  const [q, setQ] = useState('')
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3000)
  }

  const patients = useLiveQuery(() => db.patients.toArray(), [], [])
  const templates = useLiveQuery(() => db.templates.toArray(), [], [])

  const hasil = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return patients ?? []
    return (patients ?? []).filter((p) =>
      [p.nama_depan, (p as any).inisial, p.no_rm, p.diagnosis_utama, p.jaminan].some((v) => v && v.toLowerCase().includes(s)),
    )
  }, [q, patients])

  /* Template generator */
  const [tplId, setTplId] = useState(0)
  const [tplPasienId, setTplPasienId] = useState(0)
  const [output, setOutput] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newNama, setNewNama] = useState('')
  const [newFmt, setNewFmt] = useState('')

  const generate = async () => {
    const tpl = templates?.find((t) => t.id === tplId)
    const p = patients?.find((x) => x.id === tplPasienId)
    if (!tpl || !p) return
    const notes = await db.progressNotes.where('patient_id').equals(p.id!).sortBy('tanggal')
    setOutput(renderTemplate(tpl.format_string, p, notes[notes.length - 1]))
  }

  return (
    <main className="space-y-4 p-5">
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary-deep p-5 text-white shadow-lg shadow-primary/30">
        <h1 className="text-xl font-bold">Rekap</h1>
        <p className="text-sm text-white/80">Arsip pasien & generator template</p>
      </div>

      {/* Pencarian */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari inisial, RM, diagnosis, jaminan…"
          className={inputCls + ' pl-9'}
        />
      </div>

      {/* Daftar pasien */}
      <div className="space-y-2">
        {hasil.map((p) => (
          <Link
            key={p.id}
            to={`/pasien/${p.id}`}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold flex gap-1">
                <span>{p.title}</span> <Masked value={p.nama_depan || (p as any).inisial} type="name" />{' '}
                <span className="font-normal text-ink-muted">· RM <Masked value={p.no_rm} type="rm" /></span>
              </p>
              <p className="truncate text-xs text-ink-muted">{p.diagnosis_utama || '—'}</p>
              <div className="mt-1 flex gap-1.5 text-[10px] font-semibold">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary-deep">{p.jaminan}</span>
                <span className={`rounded-full px-2 py-0.5 ${p.status_rawat === 'aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-surface text-ink-muted'}`}>
                  {p.status_rawat === 'aktif' ? `Rawat H-${hariKe(p.tgl_mrs)}` : 'KRS'}
                </span>
              </div>
            </div>
            <ChevronRight size={16} className="text-ink-muted" />
          </Link>
        ))}
        {!hasil.length && <p className="rounded-2xl bg-card p-4 text-center text-xs text-ink-muted">Tidak ada pasien cocok.</p>}
      </div>

      {/* Template Generator */}
      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
          <FileText size={15} /> Template Operan / Konsul
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select value={tplId} onChange={(e) => setTplId(+e.target.value)} className={inputCls}>
            <option value={0}>— Pilih template —</option>
            {templates?.map((t) => <option key={t.id} value={t.id}>{t.nama_template}</option>)}
          </select>
          <select value={tplPasienId} onChange={(e) => setTplPasienId(+e.target.value)} className={inputCls}>
            <option value={0}>— Pilih pasien —</option>
            {patients?.map((p) => <option key={p.id} value={p.id}>{p.nama_depan || (p as any).inisial} ({p.no_rm})</option>)}
          </select>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={generate}
            disabled={!tplId || !tplPasienId}
            className="cursor-pointer rounded-xl bg-gradient-to-br from-primary to-primary-deep px-3 py-2 text-xs font-semibold text-white shadow-md shadow-primary/30 disabled:opacity-40"
          >
            Render
          </button>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="flex cursor-pointer items-center gap-1 rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-ink-muted"
          >
            <Plus size={13} /> Template Baru
          </button>
          {tplId > 0 && (
            <button
              onClick={async () => {
                await db.templates.delete(tplId)
                setTplId(0)
              }}
              aria-label="Hapus template"
              className="cursor-pointer rounded-xl bg-surface px-3 py-2 text-ink-muted hover:text-red-400"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {showNew && (
          <div className="mt-3 space-y-2 rounded-xl bg-surface p-3">
            <input value={newNama} onChange={(e) => setNewNama(e.target.value)} placeholder="Nama template (mis. Operan Jaga)" className={inputCls} />
            <textarea
              value={newFmt}
              onChange={(e) => setNewFmt(e.target.value)}
              rows={5}
              placeholder={'Operan: {{nama_depan}} / {{no_rm}} / {{jaminan}}\nDx: {{diagnosis_utama}} (H-{{hari_rawat}})\nS: {{S}}\nO (Pemfis): {{O_pemfis}}\nO (Penunjang): {{O_penunjang}}\nTerapi:\n{{terapi_aktif}}'}
              className={inputCls + ' resize-y font-mono text-xs'}
            />
            <p className="text-[10px] text-ink-muted">
              Variabel: {'{{nama_depan}} {{no_rm}} {{jaminan}} {{diagnosis_utama}} {{tgl_mrs}} {{tgl_onset}} {{hari_rawat}} {{S}} {{O_pemfis}} {{O_penunjang}} {{A}} {{terapi_aktif}} {{icd9_code}}'}
            </p>
            <button
              disabled={!newNama.trim() || !newFmt.trim()}
              onClick={async () => {
                await db.templates.add({ nama_template: newNama.trim(), format_string: newFmt })
                setNewNama('')
                setNewFmt('')
                setShowNew(false)
              }}
              className="cursor-pointer rounded-xl bg-gradient-to-br from-primary to-primary-deep px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-primary/30 disabled:opacity-40"
            >
              Simpan Template
            </button>
          </div>
        )}

        {output && (
          <div className="mt-3">
            <textarea value={output} readOnly rows={7} className={inputCls + ' resize-y bg-surface font-mono text-xs'} />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(output)
                  notify('Tersalin ✓')
                } catch {
                  notify('Clipboard tidak tersedia — salin manual dari kotak di atas')
                }
              }}
              className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-ink-muted"
            >
              <ClipboardCopy size={13} /> Salin
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-50 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  )
}
