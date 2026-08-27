import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Pill, HeartPulse, ClipboardCopy, X, Send,
  Loader2, LogOut, Check, History, Sparkles, Activity, ShieldCheck, Stethoscope
} from 'lucide-react'
import { db, type TerapiItem } from '../db'
import Masked from '../components/Masked'
import { chatPasien, type ChatMsg } from '../ai'
import { applyMicroUpdate } from '../microUpdate'
import { formatDate } from '../utils/dateFormat'

const hariKe = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1)

const PARENTERAL = /\binj\b|injeksi|drip|\biv\b|infus|\bamp\b|bolus|syringe|titrasi|pump|nebul/i

function TerapiRow({ item, noteDate }: { item: TerapiItem; noteDate: string }) {
  const baru = item.status === 'aktif' && item.tgl_mulai === noteDate
  if (item.status === 'stop') {
    return (
      <p className="text-xs text-ink-muted/70">
        <del>
          {item.nama_item} {item.dosis_keterangan}
        </del>{' '}
        <span className="caption">(stop {formatDate(item.tgl_stop)})</span>
      </p>
    )
  }
  return (
    <div className="flex items-center justify-between py-0.5">
      <p className="text-xs text-ink">
        <b className="font-bold">{item.nama_item}</b> <span className="text-ink-muted">{item.dosis_keterangan}</span>
        {item.icd9 && <span className="ml-1.5 font-mono caption font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">ICD-9: {item.icd9}</span>}
      </p>
      {baru && (
        <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-0.5 text-xs font-bold">
          + Baru
        </span>
      )}
    </div>
  )
}

export default function PatientProfile() {
  const { id } = useParams()
  const pid = Number(id)
  const patient = useLiveQuery(() => db.patients.get(pid), [pid])
  const notes = useLiveQuery(
    () => db.progressNotes.where('patient_id').equals(pid).sortBy('tanggal'),
    [pid], [],
  )
  const ward = useLiveQuery(() => (patient ? db.wards.get(patient.lokasi_sekarang) : undefined), [patient?.lokasi_sekarang])
  const hospital = useLiveQuery(() => (patient ? db.hospitals.get(patient.hospital_id) : undefined), [patient?.hospital_id])
  const allHospitals = useLiveQuery(() => db.hospitals.toArray(), [], [])
  const allWards = useLiveQuery(() => db.wards.toArray(), [], [])

  const [toast, setToast] = useState('')
  const [krsText, setKrsText] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  /* Chat */
  const [chatOpen, setChatOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingEdit, setPendingEdit] = useState('')

  if (!patient) return <main className="p-5 text-sm text-ink-muted">Memuat data rekam medis…</main>

  const latest = notes[notes.length - 1]
  const farmako = latest?.P.filter((p) => p.kategori === 'Farmakologi') ?? []
  const nonFarmako = latest?.P.filter((p) => p.kategori === 'Non-Farmakologi') ?? []
  const diagnostik = latest?.P.filter((p) => p.kategori === 'Diagnostik') ?? []
  const monitoring = latest?.P.filter((p) => p.kategori === 'Monitoring') ?? []
  const edukasi = latest?.P.filter((p) => p.kategori === 'Edukasi') ?? []

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

  const toggleKrs = async () => {
    await db.patients.update(pid, { status_rawat: patient.status_rawat === 'aktif' ? 'krs' : 'aktif' })
    notify(patient.status_rawat === 'aktif' ? 'Pasien ditandai KRS' : 'Pasien kembali rawat aktif')
  }

  const buildKonteks = () => {
    const riwayatRawatKonteks = patient.riwayat_rawat && patient.riwayat_rawat.length > 0
      ? `\n\n[RIWAYAT RAWAT INAP TERDAHULU (REKAM MEDIS)]\n` +
        patient.riwayat_rawat.map((r, i) =>
          `- Rawat Ke-${i + 1}: MRS ${formatDate(r.tgl_mrs)}${r.tgl_krs ? ` s/d KRS ${formatDate(r.tgl_krs)}` : ''} | Dx: ${r.diagnosis_utama}${r.catatan_krs ? ` | Terapi KRS: ${r.catatan_krs}` : ''}`
        ).join('\n')
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

  return (
    <main className="space-y-5 p-5">
      {/* Header Pasien Hero */}
      <div className="glass-blue-hero rounded-3xl p-6 text-white shadow-xl">
        <Link
          to="/dasbor"
          className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white/15 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25 active:scale-95 transition-all"
        >
          <ArrowLeft size={15} /> Kembali ke Dasbor
        </Link>

        <div className="flex items-start gap-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-3xl font-black text-xl text-white shadow-lg ring-4 ring-white/20"
            style={{ backgroundColor: ward?.kode_warna || '#1D4ED8' }}
          >
            {patient.nama_depan?.[0]?.toUpperCase() || (patient as any).inisial?.[0]?.toUpperCase() || 'P'}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="h1 text-2xl font-black text-white flex flex-wrap items-center gap-2">
              <span>{(patient as any).title}</span>
              <Masked value={patient.nama_depan || (patient as any).inisial} type="name" className="text-white" />
              {(patient as any).usia && <span className="text-base font-medium text-white/80">({(patient as any).usia} th)</span>}
            </h1>

            <p className="caption text-xs font-semibold text-white/85 mt-0.5">
              No. RM: <Masked value={patient.no_rm} type="rm" />
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/10 backdrop-blur-md p-3 border border-white/20">
          <p className="caption font-semibold text-white/75 uppercase tracking-wider">Diagnosis Utama</p>
          <p className="text-sm font-bold text-white mt-0.5">{patient.diagnosis_utama}</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
            {patient.jaminan}
          </span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
            {hospital?.nama} · {ward?.nama}
          </span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
            Perawatan P-{hariKe(patient.tgl_mrs)} ({formatDate(patient.tgl_mrs)})
          </span>
          {patient.tgl_onset && (
            <span className="rounded-full bg-amber-400/30 text-amber-200 border border-amber-300/40 px-3 py-1 text-xs font-bold">
              Onset OH-{hariKe(patient.tgl_onset)} ({formatDate(patient.tgl_onset)})
            </span>
          )}
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
            patient.status_rawat === 'aktif' ? 'bg-emerald-400/30 text-emerald-100 border border-emerald-300/40' : 'bg-white/30 text-white'
          }`}>
            {patient.status_rawat === 'aktif' ? 'Rawat Inap' : 'Sudah KRS'}
          </span>
        </div>
      </div>

      {/* Terapi & Planning Berjalan */}
      <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3">
        <p className="h2 text-sm font-bold text-ink">Planning & Terapi Berjalan</p>
        {!latest?.P.length && <p className="caption text-xs text-ink-muted">Belum ada terapi aktif tercatat.</p>}
        
        {/* PDX */}
        {diagnostik.length > 0 && (
          <div className="space-y-1.5">
            <p className="h3 flex items-center gap-1.5 text-xs font-bold text-sky-600">
              <Stethoscope size={14} /> Plan Diagnostik & Prosedur (PDX)
            </p>
            <div className="space-y-1 pl-1 divide-y divide-surface">
              {diagnostik.map((it, i) => <TerapiRow key={i} item={it} noteDate={latest!.tanggal} />)}
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
              {farmako.map((it, i) => <TerapiRow key={i} item={it} noteDate={latest!.tanggal} />)}
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
              {nonFarmako.map((it, i) => <TerapiRow key={i} item={it} noteDate={latest!.tanggal} />)}
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
              {monitoring.map((it, i) => <TerapiRow key={i} item={it} noteDate={latest!.tanggal} />)}
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
              {edukasi.map((it, i) => <TerapiRow key={i} item={it} noteDate={latest!.tanggal} />)}
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
          <button
            onClick={toggleKrs}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-2xl bg-surface px-4 text-xs font-bold text-ink hover:bg-surface/80 active:scale-95 transition-all"
          >
            <LogOut size={15} /> {patient.status_rawat === 'aktif' ? 'Tandai KRS' : 'Kembali Rawat'}
          </button>
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

      {/* Riwayat Rawat Inap Terdahulu */}
      {patient.riwayat_rawat && patient.riwayat_rawat.length > 0 && (
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
              return (
                <div key={ep.id || i} className="rounded-2xl border border-surface bg-surface/60 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-ink-muted">
                    <span className="h3 text-xs font-bold text-primary">Episode #{episodeIndex}</span>
                    <span className="caption font-medium">MRS: {formatDate(ep.tgl_mrs)} {ep.tgl_krs ? `→ KRS: ${formatDate(ep.tgl_krs)}` : ''}</span>
                  </div>
                  <p className="h2 text-sm font-bold text-ink">{ep.diagnosis_utama}</p>
                  {(h || w) && (
                    <p className="caption text-xs text-ink-muted">
                      {h?.nama}{w ? ` · ${w.nama}` : ''}
                    </p>
                  )}
                  {ep.catatan_krs && (
                    <p className="caption text-xs text-ink-muted border-t border-surface pt-1.5 mt-1">
                      <b className="text-ink">Terapi KRS:</b> {ep.catatan_krs}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline CPPT */}
      <div className="space-y-3">
        <p className="h2 text-sm font-bold text-ink px-1">Riwayat CPPT</p>
        {[...notes].reverse().map((n) => (
          <div key={n.id} className="glass-card rounded-3xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="h3 text-xs font-bold text-primary">{formatDate(n.tanggal)}</span>
              <span className="caption font-normal">{n.P.filter((p) => p.kategori === 'Diagnostik' && p.icd9).map((p) => p.icd9).join(', ')}</span>
            </div>
            {(['S', 'O_pemfis', 'O_penunjang'] as const).map((k) =>
              n[k] ? (
                <p key={k} className="body-md text-xs leading-relaxed">
                  <b className="text-ink-muted font-bold">{k === 'S' ? 'S' : k === 'O_pemfis' ? 'O (Pemfis)' : 'O (Penunjang)'}:</b> {n[k]}
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
                {n.P.map((it, i) => <TerapiRow key={i} item={it} noteDate={n.tanggal} />)}
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setChatOpen(false)}>
          <div className="flex h-[82dvh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-surface p-4">
              <div>
                <p className="h2 text-sm font-bold text-ink">Diskusi Kasus AI</p>
                <p className="caption text-xs text-ink-muted">EBM & Rasionalisasi Klinis — data identitas disensor</p>
              </div>
              <button onClick={() => setChatOpen(false)} aria-label="Tutup diskusi" className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:bg-surface transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
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

      {toast && (
        <aside aria-label="Notifikasi" className="fixed inset-x-0 bottom-24 z-[60] mx-auto w-fit max-w-[90%] rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </aside>
      )}
    </main>
  )
}
