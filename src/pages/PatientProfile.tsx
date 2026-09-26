import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Pill, HeartPulse, ClipboardCopy, X, Send,
  Loader2, LogOut, Check, History, Sparkles, Activity, ShieldCheck, Stethoscope,
  Mic, Eye, EyeOff, Pencil, Trash2, Plus
} from 'lucide-react'
import { db, type TerapiItem, type KategoriTerapi, type Jaminan, type StatusRawat, type ProgressNote } from '../db'
import Masked from '../components/Masked'
import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'
import { chatPasien, type ChatMsg } from '../ai'
import { applyMicroUpdate } from '../microUpdate'
import { formatDate, getLocalDateString } from '../utils/dateFormat'
import VisiteModal from '../components/VisiteModal'

const hariKe = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1)

const PARENTERAL = /\binj\b|injeksi|drip|\biv\b|infus|\bamp\b|bolus|syringe|titrasi|pump|nebul/i

const KATEGORI_OPTIONS: KategoriTerapi[] = [
  'Farmakologi',
  'Non-Farmakologi',
  'Diagnostik',
  'Monitoring',
  'Edukasi',
]

function TerapiRow({
  item,
  index,
  noteId,
  noteDate,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  item: TerapiItem
  index: number
  noteId: number
  noteDate: string
  onEdit?: (item: TerapiItem, index: number, noteId: number) => void
  onDelete?: (index: number, noteId: number) => void
  onToggleStatus?: (index: number, noteId: number) => void
}) {
  const baru = item.status === 'aktif' && item.tgl_mulai === noteDate
  const isStopped = item.status === 'stop'

  return (
    <div className="group flex items-center justify-between py-1.5 px-2 rounded-xl hover:bg-surface/60 transition-colors gap-2">
      <div className="min-w-0 flex-1">
        {isStopped ? (
          <p className="text-xs text-ink-muted/70">
            <del className="text-rose-500/80">
              {item.nama_item} {item.dosis_keterangan}
            </del>{' '}
            <span className="caption text-[11px] text-rose-600 font-semibold">
              (stop {formatDate(item.tgl_stop)})
            </span>
          </p>
        ) : (
          <p className="text-xs text-ink leading-snug">
            <b className="font-bold">{item.nama_item}</b>{' '}
            <span className="text-ink-muted">{item.dosis_keterangan}</span>
            {item.icd9 && (
              <span className="ml-1.5 font-mono caption font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[10px]">
                ICD-9: {item.icd9}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {baru && (
          <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 text-[10px] font-bold">
            + Baru
          </span>
        )}

        {onToggleStatus && (
          <button
            type="button"
            onClick={() => onToggleStatus(index, noteId)}
            title={isStopped ? 'Aktifkan kembali terapi' : 'Hentikan obat/terapi ini'}
            aria-label={isStopped ? 'Aktifkan kembali' : 'Stop obat'}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              isStopped
                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                : 'text-ink-muted hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            {isStopped ? 'Re-aktif' : 'Stop'}
          </button>
        )}

        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(item, index, noteId)}
            title="Edit item terapi"
            aria-label="Edit item terapi"
            className="p-1 rounded-lg text-ink-muted hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          >
            <Pencil size={13} />
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(index, noteId)}
            title="Hapus item terapi"
            aria-label="Hapus item terapi"
            className="p-1 rounded-lg text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
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

  const navigate = useNavigate()
  const { unmasked, setUnmasked } = useUi()
  const [toast, setToast] = useState('')
  const [krsText, setKrsText] = useState('')
  const [visiteModalOpen, setVisiteModalOpen] = useState(false)
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  /* Biometrik */
  const handleToggleMask = async () => {
    if (unmasked) {
      setUnmasked(false)
    } else {
      const ok = await verifyBiometric()
      if (ok) setUnmasked(true)
    }
  }

  /* CRUD Data Pasien */
  const [showEditPatientModal, setShowEditPatientModal] = useState(false)
  const [editPatientForm, setEditPatientForm] = useState({
    title: 'Tn.',
    nama_depan: '',
    usia: '',
    no_rm: '',
    diagnosis_utama: '',
    hospital_id: 0,
    lokasi_sekarang: 0,
    status_rawat: 'aktif' as StatusRawat,
    jaminan: 'BPJS' as Jaminan,
    tgl_mrs: '',
    tgl_onset: '',
  })

  const openEditPatientModal = () => {
    if (!patient) return
    setEditPatientForm({
      title: patient.title || 'Tn.',
      nama_depan: patient.nama_depan || (patient as any).inisial || '',
      usia: (patient.usia || '').replace(/\s*(th|tahun)\b/gi, '').trim(),
      no_rm: patient.no_rm || '',
      diagnosis_utama: patient.diagnosis_utama || '',
      hospital_id: patient.hospital_id || 0,
      lokasi_sekarang: patient.lokasi_sekarang || 0,
      status_rawat: patient.status_rawat || 'aktif',
      jaminan: patient.jaminan || 'BPJS',
      tgl_mrs: patient.tgl_mrs ? patient.tgl_mrs.slice(0, 10) : '',
      tgl_onset: patient.tgl_onset ? patient.tgl_onset.slice(0, 10) : '',
    })
    setShowEditPatientModal(true)
  }

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient) return
    await db.patients.update(pid, {
      title: editPatientForm.title,
      nama_depan: editPatientForm.nama_depan.trim(),
      usia: editPatientForm.usia.trim() ? `${editPatientForm.usia.trim()} th` : '',
      no_rm: editPatientForm.no_rm.trim(),
      diagnosis_utama: editPatientForm.diagnosis_utama.trim(),
      hospital_id: Number(editPatientForm.hospital_id),
      lokasi_sekarang: Number(editPatientForm.lokasi_sekarang),
      status_rawat: editPatientForm.status_rawat,
      jaminan: editPatientForm.jaminan,
      tgl_mrs: editPatientForm.tgl_mrs,
      tgl_onset: editPatientForm.tgl_onset,
    })
    notify('Data pasien berhasil diperbarui ✓')
    setShowEditPatientModal(false)
  }

  const handleDeletePatient = async () => {
    if (!patient) return
    const nama = patient.nama_depan || (patient as any).inisial || 'pasien ini'
    if (window.confirm(`Yakin ingin menghapus seluruh data rekam medis ${patient.title || ''} ${nama}? Tindakan ini tidak dapat dibatalkan.`)) {
      await db.progressNotes.where('patient_id').equals(pid).delete()
      await db.patients.delete(pid)
      notify('Data pasien berhasil dihapus')
      navigate('/rekammedis', { replace: true })
    }
  }

  /* CRUD Item Terapi */
  const [editingTerapi, setEditingTerapi] = useState<{
    noteId: number
    index: number
    item: TerapiItem
  } | null>(null)

  const [addingTerapiNoteId, setAddingTerapiNoteId] = useState<number | null>(null)
  const [newTerapiForm, setNewTerapiForm] = useState<TerapiItem>({
    nama_item: '',
    dosis_keterangan: '',
    status: 'aktif',
    kategori: 'Farmakologi',
    tgl_mulai: getLocalDateString(),
    tgl_stop: null,
  })

  const openEditTerapi = (item: TerapiItem, index: number, noteId: number) => {
    setEditingTerapi({ noteId, index, item: { ...item } })
  }

  const handleSaveEditTerapi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTerapi) return
    const targetNote = notes.find((n) => n.id === editingTerapi.noteId)
    if (!targetNote) return
    const newP = [...targetNote.P]
    newP[editingTerapi.index] = { ...editingTerapi.item }
    await db.progressNotes.update(editingTerapi.noteId, { P: newP })
    notify('Terapi diperbarui ✓')
    setEditingTerapi(null)
  }

  const handleDeleteTerapi = async (index: number, noteId: number) => {
    const targetNote = notes.find((n) => n.id === noteId)
    if (!targetNote) return
    const newP = targetNote.P.filter((_, idx) => idx !== index)
    await db.progressNotes.update(noteId, { P: newP })
    notify('Item terapi dihapus ✓')
  }

  const handleToggleTerapiStatus = async (index: number, noteId: number) => {
    const targetNote = notes.find((n) => n.id === noteId)
    if (!targetNote) return
    const item = targetNote.P[index]
    const newP = [...targetNote.P]
    if (item.status === 'aktif') {
      newP[index] = {
        ...item,
        status: 'stop',
        tgl_stop: getLocalDateString(),
      }
      notify(`Terapi "${item.nama_item}" dihentikan (stop)`)
    } else {
      newP[index] = {
        ...item,
        status: 'aktif',
        tgl_stop: null,
      }
      notify(`Terapi "${item.nama_item}" diaktifkan kembali`)
    }
    await db.progressNotes.update(noteId, { P: newP })
  }

  const handleAddTerapi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addingTerapiNoteId || !newTerapiForm.nama_item.trim()) return
    const targetNote = notes.find((n) => n.id === addingTerapiNoteId)
    if (!targetNote) return
    const newP = [
      ...targetNote.P,
      {
        ...newTerapiForm,
        nama_item: newTerapiForm.nama_item.trim(),
        dosis_keterangan: newTerapiForm.dosis_keterangan.trim(),
      },
    ]
    await db.progressNotes.update(addingTerapiNoteId, { P: newP })
    notify('Item terapi ditambahkan ✓')
    setAddingTerapiNoteId(null)
    setNewTerapiForm({
      nama_item: '',
      dosis_keterangan: '',
      status: 'aktif',
      kategori: 'Farmakologi',
      tgl_mulai: getLocalDateString(),
      tgl_stop: null,
    })
  }

  /* CRUD Catatan CPPT */
  const [editingNote, setEditingNote] = useState<{
    id: number
    tanggal: string
    S: string
    O_pemfis: string
    O_penunjang: string
    A: string
  } | null>(null)

  const openEditNote = (n: ProgressNote) => {
    setEditingNote({
      id: n.id!,
      tanggal: n.tanggal,
      S: n.S || '',
      O_pemfis: n.O_pemfis || '',
      O_penunjang: n.O_penunjang || '',
      A: Array.isArray(n.A) ? n.A.map((a) => a.nama_diagnosis).join('\n') : String(n.A || ''),
    })
  }

  const handleSaveEditNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingNote) return
    const targetNote = notes.find((n) => n.id === editingNote.id)
    if (!targetNote) return

    const aItems = editingNote.A.split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((diag, i) => ({
        kategori: (i === 0 ? 'Utama' : 'Sekunder') as 'Utama' | 'Sekunder',
        nama_diagnosis: diag,
        icd10: '',
      }))

    await db.progressNotes.update(editingNote.id, {
      tanggal: editingNote.tanggal,
      S: editingNote.S.trim(),
      O_pemfis: editingNote.O_pemfis.trim(),
      O_penunjang: editingNote.O_penunjang.trim(),
      A: aItems.length > 0 ? aItems : targetNote.A,
    })
    notify('Catatan CPPT berhasil diperbarui ✓')
    setEditingNote(null)
  }

  const handleDeleteNote = async (noteId: number, tgl: string) => {
    if (window.confirm(`Hapus catatan CPPT tanggal ${formatDate(tgl)}?`)) {
      await db.progressNotes.delete(noteId)
      notify('Catatan CPPT berhasil dihapus')
    }
  }

  /* Chat & Instruksi Mikro */
  const [chatOpen, setChatOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingEdit, setPendingEdit] = useState('')
  const [listening, setListening] = useState(false)

  const dikte = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return notify('Browser tidak mendukung dikte suara.')
    const rec = new SR()
    rec.lang = 'id-ID'
    rec.onresult = (e: SpeechRecognitionEvent) => {
      setPendingEdit((prev) => (prev ? `${prev}, ${e.results[0][0].transcript}` : e.results[0][0].transcript))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.start()
    setListening(true)
  }

  if (!patient) return <main className="p-5 text-sm text-ink-muted">Memuat data rekam medis…</main>

  const latest = notes[notes.length - 1]
  const farmako = latest?.P.filter((p) => p.kategori === 'Farmakologi') ?? []
  const nonFarmako = latest?.P.filter((p) => p.kategori === 'Non-Farmakologi') ?? []
  const diagnostik = latest?.P.filter((p) => p.kategori === 'Diagnostik') ?? []
  const monitoring = latest?.P.filter((p) => p.kategori === 'Monitoring') ?? []
  const edukasi = latest?.P.filter((p) => p.kategori === 'Edukasi') ?? []

  const cleanUsia = (patient.usia || '').replace(/\s*(th|tahun)\b/gi, '').trim()

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

  const filteredWardsForEdit = (allWards ?? []).filter(
    (w) => w.hospital_id === Number(editPatientForm.hospital_id)
  )

  return (
    <main className="space-y-5 p-5">
      {/* Header Pasien Hero */}
      <div className="glass-blue-hero rounded-3xl p-6 text-white shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft size={15} /> Kembali
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleMask}
              aria-label={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
              title={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
              className="flex size-8 cursor-pointer items-center justify-center rounded-xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
            >
              {unmasked ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              type="button"
              onClick={openEditPatientModal}
              aria-label="Edit Data Pasien"
              title="Edit Data Pasien"
              className="flex size-8 cursor-pointer items-center justify-center rounded-xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-3xl font-black text-xl text-white shadow-lg ring-4 ring-white/20"
            style={{ backgroundColor: ward?.kode_warna || '#1D4ED8' }}
          >
            {patient.nama_depan?.[0]?.toUpperCase() || (patient as any).inisial?.[0]?.toUpperCase() || 'P'}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="h1 text-2xl font-black text-white flex flex-wrap items-center gap-2">
              <span>{patient.title}</span>
              <Masked value={patient.nama_depan || (patient as any).inisial} type="name" className="text-white" />
              {cleanUsia && <span className="text-base font-medium text-white/80">({cleanUsia} th)</span>}
            </h1>

            <p className="caption text-xs font-semibold text-white/85 mt-0.5">
              No. RM: <Masked value={patient.no_rm} type="rm" />
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/10 backdrop-blur-md p-3 border border-white/20 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="caption font-semibold text-white/75 uppercase tracking-wider">Diagnosis Utama</p>
            <p className="text-sm font-bold text-white mt-0.5">{patient.diagnosis_utama}</p>
          </div>
          <button
            type="button"
            onClick={openEditPatientModal}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Edit diagnosis & data pasien"
          >
            <Pencil size={14} />
          </button>
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
      <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between">
          <p className="h2 text-sm font-bold text-ink">Planning & Terapi Berjalan</p>
          {latest && (
            <span className="caption text-xs font-semibold text-ink-muted">
              CPPT: {formatDate(latest.tanggal)}
            </span>
          )}
        </div>

        {/* Bilah Instruksi Cepat / Micro-Update Terapi */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-surface/70 border border-slate-200/80 py-1 pl-3.5 pr-1 focus-within:bg-white focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <input
            value={pendingEdit}
            onChange={(e) => setPendingEdit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && terapkanEdit()}
            placeholder='Instruksi: mis. "stop ceftriaxone, + valsartan 1x80"'
            className="h-8 w-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-ink-muted/50 font-medium"
          />
          <button
            onClick={dikte}
            type="button"
            aria-label="Dikte suara"
            className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors ${
              listening ? 'bg-rose-100 text-rose-600' : 'text-ink-muted hover:text-ink hover:bg-white/80'
            }`}
          >
            <Mic size={15} className={listening ? 'animate-pulse' : ''} />
          </button>
          <button
            onClick={terapkanEdit}
            type="button"
            disabled={!pendingEdit.trim()}
            aria-label="Kirim instruksi"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-xs disabled:opacity-30 active:scale-95 transition-all"
          >
            <Send size={14} />
          </button>
        </div>

        {/* Tombol Tambah Item Terapi Manual */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (latest?.id) {
                setAddingTerapiNoteId(latest.id)
              } else {
                notify('Belum ada catatan CPPT aktif. Silakan gunakan instruksi di atas untuk membuat catatan hari ini.')
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={14} /> Tambah Terapi / Plan Manual
          </button>
        </div>

        {!latest?.P.length && <p className="caption text-xs text-ink-muted">Belum ada terapi aktif tercatat.</p>}
        
        {/* PDX */}
        {diagnostik.length > 0 && (
          <div className="space-y-1.5">
            <p className="h3 flex items-center gap-1.5 text-xs font-bold text-sky-600">
              <Stethoscope size={14} /> Plan Diagnostik & Prosedur (PDX)
            </p>
            <div className="space-y-1 pl-1 divide-y divide-surface">
              {diagnostik.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
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
              {farmako.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
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
              {nonFarmako.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
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
              {monitoring.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
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
              {edukasi.map((it, i) => (
                <TerapiRow
                  key={i}
                  item={it}
                  index={latest!.P.indexOf(it)}
                  noteId={latest!.id!}
                  noteDate={latest!.tanggal}
                  onEdit={openEditTerapi}
                  onDelete={handleDeleteTerapi}
                  onToggleStatus={handleToggleTerapiStatus}
                />
              ))}
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
        <div className="flex items-center justify-between px-1">
          <p className="h2 text-sm font-bold text-ink">Riwayat CPPT</p>
          <button
            type="button"
            onClick={() => setVisiteModalOpen(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white px-3 py-1.5 text-xs font-bold shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
          >
            <Stethoscope size={14} />
            <span>+ Visite Hari Ini</span>
          </button>
        </div>
        {[...notes].reverse().map((n) => (
          <div key={n.id} className="glass-card rounded-3xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="h3 text-xs font-bold text-primary">{formatDate(n.tanggal)}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditNote(n)}
                  title="Edit Catatan CPPT"
                  aria-label="Edit Catatan CPPT"
                  className="p-1.5 rounded-xl text-ink-muted hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(n.id!, n.tanggal)}
                  title="Hapus Catatan CPPT"
                  aria-label="Hapus Catatan CPPT"
                  className="p-1.5 rounded-xl text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
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
                {n.P.map((it, i) => (
                  <TerapiRow
                    key={i}
                    item={it}
                    index={i}
                    noteId={n.id!}
                    noteDate={n.tanggal}
                    onEdit={openEditTerapi}
                    onDelete={handleDeleteTerapi}
                    onToggleStatus={handleToggleTerapiStatus}
                  />
                ))}
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

      {/* Modal Edit Data Pasien */}
      {showEditPatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in" onClick={() => setShowEditPatientModal(false)}>
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Edit Data Pasien</h3>
                <p className="text-[11px] text-ink-muted">Perbarui profil dan administrasi rawat</p>
              </div>
              <button type="button" onClick={() => setShowEditPatientModal(false)} className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePatient} className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Panggilan</label>
                  <select
                    value={editPatientForm.title}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, title: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    {['Tn.', 'Ny.', 'An.', 'Sdr.', 'By.', 'dr.', 'Prof.'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Nama Pasien</label>
                  <input
                    required
                    value={editPatientForm.nama_depan}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, nama_depan: e.target.value })}
                    placeholder="Nama lengkap"
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">No. RM</label>
                  <input
                    value={editPatientForm.no_rm}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, no_rm: e.target.value })}
                    placeholder="mis. 12-34-56"
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Usia (Tahun)</label>
                  <input
                    value={editPatientForm.usia}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, usia: e.target.value })}
                    placeholder="mis. 65"
                    className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Diagnosis Utama</label>
                <input
                  required
                  value={editPatientForm.diagnosis_utama}
                  onChange={(e) => setEditPatientForm({ ...editPatientForm, diagnosis_utama: e.target.value })}
                  placeholder="mis. Stroke Iskemik Akut"
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Faskes / RS</label>
                  <select
                    value={editPatientForm.hospital_id}
                    onChange={(e) => {
                      const newHId = Number(e.target.value)
                      const firstW = (allWards ?? []).find((w) => w.hospital_id === newHId)
                      setEditPatientForm({
                        ...editPatientForm,
                        hospital_id: newHId,
                        lokasi_sekarang: firstW?.id || 0,
                      })
                    }}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    {allHospitals?.map((h) => (
                      <option key={h.id} value={h.id}>{h.nama}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Ruangan</label>
                  <select
                    value={editPatientForm.lokasi_sekarang}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, lokasi_sekarang: Number(e.target.value) })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    {filteredWardsForEdit.map((w) => (
                      <option key={w.id} value={w.id}>{w.nama}</option>
                    ))}
                    {!filteredWardsForEdit.length && (
                      <option value={0}>Belum ada ruangan</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Jaminan</label>
                  <select
                    value={editPatientForm.jaminan}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, jaminan: e.target.value as Jaminan })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    <option value="BPJS">BPJS</option>
                    <option value="Umum">Umum</option>
                    <option value="Asuransi">Asuransi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Status Rawat</label>
                  <select
                    value={editPatientForm.status_rawat}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, status_rawat: e.target.value as StatusRawat })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    <option value="aktif">Rawat Inap (Aktif)</option>
                    <option value="krs">Sudah KRS</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tgl MRS</label>
                  <input
                    type="date"
                    value={editPatientForm.tgl_mrs}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, tgl_mrs: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tgl Onset</label>
                  <input
                    type="date"
                    value={editPatientForm.tgl_onset}
                    onChange={(e) => setEditPatientForm({ ...editPatientForm, tgl_onset: e.target.value })}
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleDeletePatient}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} /> Hapus Pasien
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditPatientModal(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Item Terapi */}
      {editingTerapi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in" onClick={() => setEditingTerapi(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Edit Item Terapi</h3>
                <p className="text-[11px] text-ink-muted">Ubah nama obat, dosis, atau kategori</p>
              </div>
              <button type="button" onClick={() => setEditingTerapi(null)} className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditTerapi} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Kategori</label>
                <select
                  value={editingTerapi.item.kategori}
                  onChange={(e) =>
                    setEditingTerapi({
                      ...editingTerapi,
                      item: { ...editingTerapi.item, kategori: e.target.value as KategoriTerapi },
                    })
                  }
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-ink outline-none focus:border-primary"
                >
                  {KATEGORI_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Nama Item / Obat</label>
                <input
                  required
                  value={editingTerapi.item.nama_item}
                  onChange={(e) =>
                    setEditingTerapi({
                      ...editingTerapi,
                      item: { ...editingTerapi.item, nama_item: e.target.value },
                    })
                  }
                  placeholder="mis. Ceftriaxone"
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Dosis / Keterangan</label>
                <input
                  value={editingTerapi.item.dosis_keterangan}
                  onChange={(e) =>
                    setEditingTerapi({
                      ...editingTerapi,
                      item: { ...editingTerapi.item, dosis_keterangan: e.target.value },
                    })
                  }
                  placeholder="mis. 2 x 1 gr iv"
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">Status</label>
                  <select
                    value={editingTerapi.item.status}
                    onChange={(e) =>
                      setEditingTerapi({
                        ...editingTerapi,
                        item: {
                          ...editingTerapi.item,
                          status: e.target.value as 'aktif' | 'stop',
                          tgl_stop: e.target.value === 'stop' ? (editingTerapi.item.tgl_stop || getLocalDateString()) : null,
                        },
                      })
                    }
                    className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs bg-white text-ink outline-none focus:border-primary"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="stop">Stop</option>
                  </select>
                </div>
                {editingTerapi.item.status === 'stop' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tgl Stop</label>
                    <input
                      type="date"
                      value={editingTerapi.item.tgl_stop || ''}
                      onChange={(e) =>
                        setEditingTerapi({
                          ...editingTerapi,
                          item: { ...editingTerapi.item, tgl_stop: e.target.value },
                        })
                      }
                      className="w-full h-9 rounded-xl border border-slate-200 px-2 text-xs text-ink outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTerapi(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
                >
                  Simpan Terapi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Terapi Manual */}
      {addingTerapiNoteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in" onClick={() => setAddingTerapiNoteId(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Tambah Terapi / Plan Manual</h3>
                <p className="text-[11px] text-ink-muted">Tambahkan rencana terapi atau tindakan ke CPPT</p>
              </div>
              <button type="button" onClick={() => setAddingTerapiNoteId(null)} className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddTerapi} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Kategori</label>
                <select
                  value={newTerapiForm.kategori}
                  onChange={(e) => setNewTerapiForm({ ...newTerapiForm, kategori: e.target.value as KategoriTerapi })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-2.5 text-xs bg-white text-ink outline-none focus:border-primary"
                >
                  {KATEGORI_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Nama Item / Obat</label>
                <input
                  required
                  autoFocus
                  value={newTerapiForm.nama_item}
                  onChange={(e) => setNewTerapiForm({ ...newTerapiForm, nama_item: e.target.value })}
                  placeholder="mis. Ondansetron, Fisioterapi dada, CT Scan..."
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Dosis / Instruksi</label>
                <input
                  value={newTerapiForm.dosis_keterangan}
                  onChange={(e) => setNewTerapiForm({ ...newTerapiForm, dosis_keterangan: e.target.value })}
                  placeholder="mis. 3 x 4 mg iv, evaluasi per 8 jam..."
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddingTerapiNoteId(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newTerapiForm.nama_item.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                >
                  Tambah Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Catatan CPPT */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in" onClick={() => setEditingNote(null)}>
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Edit Catatan CPPT</h3>
                <p className="text-[11px] text-ink-muted">Tanggal: {formatDate(editingNote.tanggal)}</p>
              </div>
              <button type="button" onClick={() => setEditingNote(null)} className="rounded-full p-1.5 text-ink-muted hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditNote} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Tanggal CPPT</label>
                <input
                  type="date"
                  value={editingNote.tanggal}
                  onChange={(e) => setEditingNote({ ...editingNote, tanggal: e.target.value })}
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs text-ink outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Subjective (S)</label>
                <textarea
                  rows={2}
                  value={editingNote.S}
                  onChange={(e) => setEditingNote({ ...editingNote, S: e.target.value })}
                  placeholder="Keluhan subjektif pasien..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Objective - Pemeriksaan Fisik (O Pemfis)</label>
                <textarea
                  rows={2}
                  value={editingNote.O_pemfis}
                  onChange={(e) => setEditingNote({ ...editingNote, O_pemfis: e.target.value })}
                  placeholder="Tanda vital, kesadaran, status lokalis..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Objective - Penunjang (O Penunjang)</label>
                <textarea
                  rows={2}
                  value={editingNote.O_penunjang}
                  onChange={(e) => setEditingNote({ ...editingNote, O_penunjang: e.target.value })}
                  placeholder="Hasil lab, radiologi, EKG..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Assessment (A) - 1 baris per diagnosis</label>
                <textarea
                  rows={2}
                  value={editingNote.A}
                  onChange={(e) => setEditingNote({ ...editingNote, A: e.target.value })}
                  placeholder="Diagnosis kerja / komorbiditas..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-ink outline-none focus:border-primary resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
                >
                  Simpan CPPT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visite Harian (Salin SOAP Cepat) */}
      {visiteModalOpen && patient && (
        <VisiteModal
          patient={patient}
          latestNote={notes && notes.length > 0 ? notes[notes.length - 1] : undefined}
          onClose={() => setVisiteModalOpen(false)}
          onSaved={(msg) => notify(msg)}
        />
      )}

      {toast && (
        <aside aria-label="Notifikasi" className="fixed inset-x-0 bottom-24 z-[60] mx-auto w-fit max-w-[90%] rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </aside>
      )}
    </main>
  )
}
