import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent,
} from '@dnd-kit/core'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  GripVertical, Mic, Send, BedDouble, Plus,
  ChevronRight, Pencil, Eye, EyeOff, Settings
} from 'lucide-react'
import { db, type Patient, type Ward } from '../db'
import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'
import Masked from '../components/Masked'
import { applyMicroUpdate } from '../microUpdate'

const hariKe = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1)

function PatientCard({ patient, warna, onToast }: { patient: Patient; warna: string; onToast: (m: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: patient.id!,
  })
  const [cmd, setCmd] = useState('')
  const [listening, setListening] = useState(false)

  const kirim = async () => {
    if (!cmd.trim()) return
    const { applied, ignored } = await applyMicroUpdate(patient.id!, cmd)
    onToast(
      [
        applied.length ? `✓ ${applied.join(', ')}` : '',
        ignored.length ? `? tak dikenali: ${ignored.join(', ')}` : '',
      ].filter(Boolean).join(' · ') || 'Tidak ada perubahan',
    )
    setCmd('')
  }

  const dikte = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return onToast('Browser tidak mendukung dikte suara.')
    const rec = new SR()
    rec.lang = 'id-ID'
    rec.onresult = (e: SpeechRecognitionEvent) => setCmd(e.results[0][0].transcript)
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.start()
    setListening(true)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
      className={`glass-card glass-card-hover rounded-3xl p-4 transition-all ${
        isDragging ? 'z-50 opacity-90 shadow-2xl scale-105 ring-2 ring-primary' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar Squircle Pasien */}
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl font-black text-sm text-white shadow-sm"
          style={{ backgroundColor: warna || '#2563EB' }}
        >
          {patient.nama_depan?.[0]?.toUpperCase() || (patient as any).inisial?.[0]?.toUpperCase() || 'P'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-xs font-bold text-ink">
                {patient.title} <Masked value={patient.nama_depan || (patient as any).inisial} type="name" />
              </span>
              {patient.usia && <span className="caption text-xs font-medium">({patient.usia})</span>}
            </div>

            {/* Drag Handle */}
            <button
              {...listeners}
              {...attributes}
              aria-label="Geser pasien"
              className="cursor-grab text-ink-muted/60 p-1 hover:text-ink transition-colors touch-none"
            >
              <GripVertical size={16} />
            </button>
          </div>

          <p className="caption text-ink-muted">
            RM: <Masked value={patient.no_rm} type="rm" />
          </p>

          <Link
            to={`/pasien/${patient.id}`}
            className="mt-1 flex items-center justify-between rounded-xl bg-surface/80 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
          >
            <span className="truncate">{patient.diagnosis_utama || 'Lihat Rekam Medis'}</span>
            <ChevronRight size={14} className="shrink-0" />
          </Link>

          {/* Badges */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              {patient.jaminan}
            </span>
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
              P-{hariKe(patient.tgl_mrs)}
            </span>
            {patient.tgl_onset && (
              <span className="rounded-full bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-xs font-bold text-amber-700">
                OH-{hariKe(patient.tgl_onset)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Micro-Update input */}
      <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-surface">
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && kirim()}
          placeholder='mis. "stop ceftriaxone, + valsartan 1x80"'
          className="h-9 w-full min-w-0 flex-1 rounded-xl border border-primary-soft/30 bg-card px-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-ink-muted/50"
        />
        <button
          onClick={dikte}
          aria-label="Dikte suara"
          className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors ${
            listening ? 'bg-rose-100 text-rose-600' : 'bg-surface text-ink-muted hover:text-ink'
          }`}
        >
          <Mic size={15} className={listening ? 'animate-pulse' : ''} />
        </button>
        <button
          onClick={kirim}
          disabled={!cmd.trim()}
          aria-label="Kirim instruksi"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-sm shadow-primary/30 disabled:opacity-40 active:scale-95 transition-all"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

function WardColumn({ ward, patients, onToast }: { ward: Ward; patients: Patient[]; onToast: (m: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: ward.id! })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-3xl p-4 transition-all ${
        isOver ? 'bg-primary/10 ring-2 ring-primary/40' : 'bg-surface/50 border border-white/60'
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full shadow-sm ring-2 ring-white" style={{ backgroundColor: ward.kode_warna }} />
          <h3 className="h3 text-xs font-bold text-ink">{ward.nama}</h3>
        </div>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-primary shadow-xs">
          {patients.length} Pasien
        </span>
      </div>

      <div className="space-y-3">
        {patients.map((p) => (
          <PatientCard key={p.id} patient={p} warna={ward.kode_warna} onToast={onToast} />
        ))}
        {!patients.length && (
          <div className="rounded-2xl border border-dashed border-primary-soft/40 py-5 text-center text-xs font-medium text-ink-muted/80 bg-white/40">
            Belum ada pasien di ruangan ini
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dasbor() {
  const navigate = useNavigate()
  const { user, unmasked, setUnmasked } = useUi()
  const [filterRs, setFilterRs] = useState<number>(0)
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  const handleToggleMask = async () => {
    if (unmasked) {
      setUnmasked(false)
    } else {
      const ok = await verifyBiometric()
      if (ok) setUnmasked(true)
    }
  }

  const hospitals = useLiveQuery(
    async () => (await db.hospitals.toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [],
    []
  )
  const wards = useLiveQuery(
    async () => (await db.wards.toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [],
    []
  )
  const aktif = useLiveQuery(() => db.patients.where('status_rawat').equals('aktif').toArray(), [], [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const onDragEnd = async (e: DragEndEvent) => {
    if (e.over && e.active.id) {
      await db.patients.update(e.active.id as number, { lokasi_sekarang: e.over.id as number })
    }
  }

  const shownWards = (wards ?? []).filter((w) => !filterRs || w.hospital_id === filterRs)
  const chartData = (hospitals ?? [])
    .map((h) => ({ name: h.nama, value: (aktif ?? []).filter((p) => p.hospital_id === h.id).length, fill: h.kode_warna }))
    .filter((d) => d.value > 0)

  return (
    <main className="space-y-5 p-5">
      {/* Hero Banner: Foto Besar Mengisi Sisi Kiri dengan Lengkungan Kanan Bawah */}
      <div className="glass-blue-hero rounded-3xl text-white shadow-xl overflow-hidden relative">
        <div className="flex items-stretch min-h-[148px]">
          {/* Sisi Kiri: Foto Profil Dokter (Top & Left habis ke tepi frame, Kanan Bawah melengkung rounded-br-3xl) */}
          <button
            type="button"
            onClick={() => navigate('/profil')}
            title="Buka Profil Dokter"
            aria-label="Buka Profil Dokter"
            className="relative w-32 sm:w-36 shrink-0 cursor-pointer group active:scale-98 transition-all overflow-hidden bg-primary-deep/40 rounded-br-3xl shadow-md border-r border-b border-white/20"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Dokter'}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-white/20 backdrop-blur-md text-white font-black text-3xl">
                {user?.displayName?.[0]?.toUpperCase() || 'D'}
              </div>
            )}
            {/* Gradient halus di bawah foto */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
          </button>

          {/* Sisi Kanan: Identitas Dokter + Tombol Aksi + Metrik Pasien Dirawat */}
          <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between min-w-0">
            {/* Atas: Nama Dokter & Role di bawahnya, Tombol Mata/Gir */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-base font-black text-white leading-tight break-words">
                  {user?.displayName || 'Dokter'}
                </h2>
                <p className="text-[11px] sm:text-xs font-semibold text-white/80 leading-tight truncate mt-0.5">
                  {user?.specialty || 'Spesialis Neurologi (Sp.N)'}
                </p>
              </div>

              {/* Tombol Aksi Cepat (Eye & Settings) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleToggleMask}
                  aria-label={unmasked ? 'Sensor Identitas Pasien' : 'Tampilkan Identitas Pasien (Biometrik)'}
                  className={`flex size-9 cursor-pointer items-center justify-center rounded-2xl transition-all ${
                    unmasked
                      ? 'bg-amber-400 text-amber-950 shadow-md'
                      : 'bg-white/15 backdrop-blur-md text-white hover:bg-white/25'
                  }`}
                  title={unmasked ? 'Sensor Identitas (Aktif)' : 'Buka Sensor Identitas (Biometrik)'}
                >
                  {unmasked ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>

                <button
                  onClick={() => navigate('/pengaturan')}
                  aria-label="Pengaturan"
                  title="Pengaturan"
                  className="flex size-9 cursor-pointer items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>

            {/* Bawah: Pasien Dirawat (di sebelah kanan foto) & Tanggal */}
            <div className="flex items-end justify-between pt-3 border-t border-white/15">
              <div>
                <h1 className="h1 text-3xl font-black text-white leading-none">
                  {aktif?.length ?? 0}
                </h1>
                <p className="text-xs font-bold text-white/95 mt-1 tracking-wide">
                  Pasien Dirawat
                </p>
              </div>
              <span className="text-[11px] sm:text-xs font-semibold text-white/80 pb-0.5">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Faskes / RS + Tombol Kelola Faskes (Pencil) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
        <button
          onClick={() => setFilterRs(0)}
          className={`h-9 cursor-pointer rounded-full px-4 text-xs font-bold shrink-0 transition-all ${
            !filterRs
              ? 'bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/30'
              : 'glass-card text-ink-muted hover:text-ink'
          }`}
        >
          Semua Faskes
        </button>
        {hospitals?.map((h) => (
          <button
            key={h.id}
            onClick={() => setFilterRs(h.id!)}
            className={`flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-xs font-bold transition-all ${
              filterRs === h.id ? 'text-white shadow-md' : 'glass-card text-ink-muted hover:text-ink'
            }`}
            style={filterRs === h.id ? { backgroundColor: h.kode_warna } : undefined}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: h.kode_warna }} />
            <span>{h.nama}</span>
          </button>
        ))}

        {/* Tombol Kelola Faskes (Icon Pensil Tanpa Teks) */}
        <button
          onClick={() => navigate('/pengaturan?tab=faskes')}
          title="Kelola Faskes & Ruangan"
          aria-label="Kelola Faskes & Ruangan"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full glass-card text-ink-muted hover:text-primary hover:bg-primary/10 active:scale-95 transition-all ml-auto"
        >
          <Pencil size={15} />
        </button>
      </div>

      {/* Beban Kasus Chart */}
      {chartData.length > 0 && (
        <div className="glass-card rounded-3xl p-4 shadow-sm">
          <p className="h3 mb-2 text-xs font-bold text-ink-muted">Distribusi Pasien per Faskes</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={58} paddingAngle={4}>
                  {chartData.map((d) => <Cell key={d.name} fill={d.fill} stroke="transparent" />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-1 text-xs">
            {chartData.map((d) => (
              <span key={d.name} className="flex items-center gap-1.5 font-semibold text-ink">
                <span className="size-2 rounded-full" style={{ backgroundColor: d.fill }} />
                <span>{d.name} ({d.value})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Board Ruangan & Pasien */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="space-y-4">
          {hospitals?.filter((h) => !filterRs || h.id === filterRs).map((h) => {
            const wardsInH = shownWards.filter((w) => w.hospital_id === h.id)
            if (wardsInH.length === 0) return null
            return (
              <div key={h.id} className="space-y-3">
                {!filterRs && (
                  <div className="flex items-center gap-2 px-1 pt-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: h.kode_warna }} />
                    <h3 className="h3 text-xs font-bold text-ink-muted">{h.nama}</h3>
                    <div className="h-px flex-1 bg-primary-soft/20" />
                  </div>
                )}
                <div className="space-y-3">
                  {wardsInH.map((w) => (
                    <WardColumn
                      key={w.id}
                      ward={w}
                      patients={(aktif ?? []).filter((p) => p.lokasi_sekarang === w.id)}
                      onToast={notify}
                    />
                  ))}
                </div>
              </div>
            )
          })}
          {!shownWards.length && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl glass-card p-8 text-center">
              <BedDouble size={32} className="text-primary-soft" />
              <p className="body-md text-xs text-ink-muted">Belum ada ruangan di faskes ini.</p>
              <Link to="/brainstorm" className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20">
                <Plus size={16} /> Input Pasien Baru
              </Link>
            </div>
          )}
        </div>
      </DndContext>

      {toast && (
        <aside aria-label="Notifikasi" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </aside>
      )}
    </main>
  )
}
