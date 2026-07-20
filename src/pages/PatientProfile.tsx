import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Pill, HeartPulse, ClipboardCopy, MessageCircleMore, X, Send,
  Loader2, LogOut, Check,
} from 'lucide-react'
import { db, type TerapiItem } from '../db'
import Masked from '../components/Masked'
import { chatPasien, type ChatMsg } from '../ai'
import { applyMicroUpdate } from '../microUpdate'

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
        <span className="text-[10px]">(stop {item.tgl_stop})</span>
      </p>
    )
  }
  return (
    <p className="text-xs">
      <b>{item.nama_item}</b> {item.dosis_keterangan}
      {baru && (
        <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">+ Baru</span>
      )}
    </p>
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

  if (!patient) return <main className="p-5 text-sm text-ink-muted">Memuat…</main>

  const latest = notes[notes.length - 1]
  const farmako = latest?.P.filter((p) => p.kategori === 'Farmakologi') ?? []
  const nonFarmako = latest?.P.filter((p) => p.kategori === 'Non-Farmakologi') ?? []

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
      notify('Daftar obat KRS tersalin ✓ — siap paste ke WhatsApp')
    } catch {
      notify('Clipboard tidak tersedia — salin manual dari kotak di bawah')
    }
  }

  const toggleKrs = async () => {
    await db.patients.update(pid, { status_rawat: patient.status_rawat === 'aktif' ? 'krs' : 'aktif' })
  }

  /* Konteks chat: data klinis saja, tanpa identitas */
  const buildKonteks = () =>
    `[DATA PASIEN]\nJaminan: [${patient.jaminan}]\nDiagnosis utama: ${patient.diagnosis_utama}\nMRS: ${patient.tgl_mrs} (rawat hari ke-${hariKe(patient.tgl_mrs)})${patient.tgl_onset ? `\nOnset: ${patient.tgl_onset} (hari ke-${hariKe(patient.tgl_onset)})` : ''}\n\n[RIWAYAT CPPT]\n` +
    notes
      .map(
        (n) =>
          `--- ${n.tanggal} ---\nS: ${n.S}\nO Pemfis: ${n.O_pemfis}\nO Penunjang: ${n.O_penunjang}\nA: ${Array.isArray(n.A) ? n.A.map(a => a.nama_diagnosis).join('; ') : n.A}\nP: ${n.P.map((p) => `${p.nama_item} ${p.dosis_keterangan} [${p.status}${p.kategori === 'Non-Farmakologi' ? ', non-farmako' : ''}]`).join('; ')}`,
      )
      .join('\n')

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
    <main className="space-y-4 p-5">
      {/* Header pasien */}
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary-deep p-5 text-white shadow-lg shadow-primary/30">
        <Link to="/rekap" className="mb-2 inline-flex items-center gap-1 text-xs text-white/80">
          <ArrowLeft size={13} /> Kembali
        </Link>
        <div className="flex-1">
          <p className="flex flex-wrap items-center gap-1 text-xl font-bold text-white">
            <span>{(patient as any).title}</span>
            <Masked value={patient.nama_depan || (patient as any).inisial} type="name" className="text-white" />
            {(patient as any).usia && <span className="text-sm font-normal text-white/80">({(patient as any).usia})</span>}
          </p>
          <p className="text-sm font-medium text-white/80">RM <Masked value={patient.no_rm} type="rm" /></p>
        </div>
        <p className="mt-2 text-sm text-white/90">{patient.diagnosis_utama}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
          <span className="rounded-full bg-white/20 px-2 py-0.5">{patient.jaminan}</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5">{hospital?.nama} · {ward?.nama}</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5">Rawat H-{hariKe(patient.tgl_mrs)}</span>
          {patient.tgl_onset && <span className="rounded-full bg-amber-300/30 px-2 py-0.5">Stroke H-{hariKe(patient.tgl_onset)}</span>}
          <span className={`rounded-full px-2 py-0.5 ${patient.status_rawat === 'aktif' ? 'bg-emerald-300/30' : 'bg-white/30'}`}>
            {patient.status_rawat === 'aktif' ? 'Rawat Inap' : 'Sudah KRS'}
          </span>
        </div>
      </div>

      {/* Visual History Terapi */}
      <div className="rounded-2xl bg-card p-4 shadow-sm">
        <p className="mb-2 text-sm font-bold">Terapi Berjalan</p>
        {!latest?.P.length && <p className="text-xs text-ink-muted">Belum ada terapi tercatat.</p>}
        {farmako.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-primary-deep">
              <Pill size={12} /> Farmakologi
            </p>
            <div className="space-y-1">{farmako.map((it, i) => <TerapiRow key={i} item={it} noteDate={latest!.tanggal} />)}</div>
          </div>
        )}
        {nonFarmako.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <HeartPulse size={12} /> Non-Farmakologi
            </p>
            <div className="space-y-1">{nonFarmako.map((it, i) => <TerapiRow key={i} item={it} noteDate={latest!.tanggal} />)}</div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={generateKrs}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-primary-deep px-3 py-2 text-xs font-semibold text-white shadow-md shadow-primary/30"
          >
            <ClipboardCopy size={14} /> Generate Obat KRS
          </button>
          <button
            onClick={toggleKrs}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-ink-muted"
          >
            <LogOut size={14} /> {patient.status_rawat === 'aktif' ? 'Tandai KRS' : 'Rawat Lagi'}
          </button>
        </div>
        {krsText && (
          <textarea
            readOnly
            value={krsText}
            rows={7}
            className="mt-3 w-full resize-y rounded-xl border border-primary-soft/40 bg-surface px-3 py-2 font-mono text-xs outline-none"
          />
        )}
      </div>

      {/* Timeline CPPT */}
      <div className="space-y-3">
        <p className="text-sm font-bold">Riwayat CPPT</p>
        {[...notes].reverse().map((n) => (
          <div key={n.id} className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="mb-1.5 flex items-center justify-between text-xs font-bold text-primary-deep">
              {n.tanggal}
              <span className="font-normal text-ink-muted">{n.icd9_code}</span>
            </p>
            {(['S', 'O_pemfis', 'O_penunjang'] as const).map((k) =>
              n[k] ? (
                <p key={k} className="text-xs">
                  <b className="text-ink-muted">{k === 'S' ? 'S' : k === 'O_pemfis' ? 'O (Pemfis)' : 'O (Penunjang)'}:</b> {n[k]}
                </p>
              ) : null,
            )}
            {n.A && (
              <p className="text-xs">
                <b className="text-ink-muted">A:</b> {Array.isArray(n.A) ? n.A.map(a => a.nama_diagnosis).join('; ') : n.A}
              </p>
            )}
            {n.P.length > 0 && (
              <div className="mt-1.5 border-t border-surface pt-1.5">
                {n.P.map((it, i) => <TerapiRow key={i} item={it} noteDate={n.tanggal} />)}
              </div>
            )}
          </div>
        ))}
        {!notes.length && <p className="rounded-2xl bg-card p-4 text-xs text-ink-muted">Belum ada catatan.</p>}
      </div>

      {/* FAB Chat kontekstual */}
      <button
        onClick={() => setChatOpen(true)}
        aria-label="Chat tentang pasien ini"
        className="fixed bottom-24 right-5 z-40 flex size-14 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-xl shadow-primary/40"
      >
        <MessageCircleMore size={24} />
      </button>

      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm" onClick={() => setChatOpen(false)}>
          <div className="flex h-[80dvh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-surface p-4">
              <div>
                <p className="text-sm font-bold">Diskusi Kasus</p>
                <p className="text-[11px] text-ink-muted">AI membaca jaminan, CPPT & terapi — identitas tidak dikirim</p>
              </div>
              <button onClick={() => setChatOpen(false)} aria-label="Tutup chat" className="cursor-pointer rounded-full p-1.5 text-ink-muted hover:bg-surface">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {!msgs.length && (
                <p className="text-center text-xs text-ink-muted">
                  Tanyakan rasionalisasi EBM, minta evaluasi terapi, atau instruksikan perubahan.
                </p>
              )}
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${
                    m.role === 'user'
                      ? 'ml-auto bg-gradient-to-br from-primary to-primary-deep text-white'
                      : m.content.startsWith('⛔')
                        ? 'border border-red-300 bg-red-50 text-red-700'
                        : 'bg-surface'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {busy && <Loader2 size={16} className="animate-spin text-ink-muted" />}
              {pendingEdit && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-xs">
                  <p className="mb-1 font-semibold text-emerald-800">AI mengusulkan Direct Edit terapi:</p>
                  <p className="mb-2 font-mono text-[11px]">{pendingEdit}</p>
                  <button
                    onClick={terapkanEdit}
                    className="flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 font-semibold text-white"
                  >
                    <Check size={13} /> Terapkan ke CPPT hari ini
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && kirimChat()}
                placeholder="mis. rasionalisasi pemberian statin pada pasien ini…"
                className="w-full flex-1 rounded-xl border border-primary-soft/40 bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
              />
              <button
                onClick={kirimChat}
                disabled={!draft.trim() || busy}
                aria-label="Kirim"
                className="cursor-pointer rounded-xl bg-gradient-to-br from-primary to-primary-deep px-3 text-white shadow-md shadow-primary/30 disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-[60] mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  )
}
