import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent,
} from '@dnd-kit/core'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { GripVertical, Mic, Send, BedDouble } from 'lucide-react'
import { db, type Patient, type Ward } from '../db'
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
        borderLeftColor: warna,
      }}
      className={`rounded-xl border-l-4 bg-card p-3 shadow-sm ${isDragging ? 'z-50 opacity-80 shadow-xl' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button {...listeners} {...attributes} aria-label="Geser kartu" className="touch-none cursor-grab pt-0.5 text-ink-muted">
          <GripVertical size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold flex items-center gap-1 flex-wrap">
            <span>{patient.title}</span>
            <Masked value={patient.nama_depan || (patient as any).inisial} type="name" />
            {patient.usia && <span className="text-xs font-normal text-ink-muted">({patient.usia})</span>}
            <span className="font-normal text-ink-muted">· RM <Masked value={patient.no_rm} type="rm" /></span>
          </p>
          <Link to={`/pasien/${patient.id}`} className="block truncate text-xs text-primary-deep underline-offset-2 hover:underline">
            {patient.diagnosis_utama || 'Lihat profil'} →
          </Link>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary-deep">{patient.jaminan}</span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-ink-muted">Rawat H-{hariKe(patient.tgl_mrs)}</span>
            {patient.tgl_onset && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Stroke H-{hariKe(patient.tgl_onset)}</span>
            )}
          </div>
        </div>
      </div>
      {/* Micro-Update */}
      <div className="mt-2 flex gap-1.5">
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && kirim()}
          placeholder='mis. "stop ceftriaxone, tambah valsartan 1x80"'
          className="w-full min-w-0 flex-1 rounded-lg border border-primary-soft/40 bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button onClick={dikte} aria-label="Dikte perintah" className={`cursor-pointer rounded-lg px-2 ${listening ? 'bg-red-100 text-red-500' : 'bg-surface text-ink-muted'}`}>
          <Mic size={14} className={listening ? 'animate-pulse' : ''} />
        </button>
        <button onClick={kirim} disabled={!cmd.trim()} aria-label="Kirim update" className="cursor-pointer rounded-lg bg-gradient-to-br from-primary to-primary-deep px-2 text-white shadow-sm disabled:opacity-40">
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

function WardColumn({ ward, patients, onToast }: { ward: Ward; patients: Patient[]; onToast: (m: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: ward.id! })
  return (
    <div ref={setNodeRef} className={`rounded-2xl p-3 transition-colors ${isOver ? 'bg-primary/10' : 'bg-surface/60'}`}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: ward.kode_warna }} />
        {ward.nama}
        <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-[10px] text-ink-muted">{patients.length}</span>
      </p>
      <div className="space-y-2">
        {patients.map((p) => (
          <PatientCard key={p.id} patient={p} warna={ward.kode_warna} onToast={onToast} />
        ))}
        {!patients.length && <p className="py-2 text-center text-[11px] text-ink-muted">Kosong — geser pasien ke sini</p>}
      </div>
    </div>
  )
}

export default function Dasbor() {
  const [filterRs, setFilterRs] = useState<number>(0) // 0 = semua
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
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
    <main className="space-y-4 p-5">
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary-deep p-5 text-white shadow-lg shadow-primary/30">
        <p className="text-sm text-white/80">Selamat bertugas, Dok 👋</p>
        <h1 className="text-xl font-bold">Monitor Operasional</h1>
        <p className="mt-1 text-xs text-white/70">{aktif?.length ?? 0} pasien aktif dalam perawatan</p>
      </div>

      {/* Filter RS */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterRs(0)}
          className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${!filterRs ? 'bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/30' : 'bg-card text-ink-muted'}`}
        >
          Semua Faskes
        </button>
        {hospitals?.map((h) => (
          <button
            key={h.id}
            onClick={() => setFilterRs(h.id!)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${filterRs === h.id ? 'text-white shadow-md' : 'bg-card text-ink-muted'}`}
            style={filterRs === h.id ? { backgroundColor: h.kode_warna } : undefined}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: h.kode_warna }} />
            {h.nama}
          </button>
        ))}
      </div>

      {/* Beban kasus per Faskes */}
      {chartData.length > 0 && (
        <div className="rounded-2xl bg-card p-4 shadow-sm">
          <p className="mb-1 text-xs font-bold text-ink-muted">Beban Kasus Aktif per Faskes</p>
          <div className="h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={35} outerRadius={65} paddingAngle={3}>
                  {chartData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-[11px]">
            {chartData.map((d) => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: d.fill }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Board ruangan */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div>
          {hospitals?.filter((h) => !filterRs || h.id === filterRs).map((h) => {
            const wardsInH = shownWards.filter((w) => w.hospital_id === h.id)
            if (wardsInH.length === 0) return null
            return (
              <div key={h.id} className="mb-6 space-y-3">
                {!filterRs && (
                  <div className="flex items-center gap-2 px-1">
                    <span className="size-2 rounded-full" style={{ backgroundColor: h.kode_warna }} />
                    <h3 className="text-sm font-bold text-ink-muted uppercase tracking-wider">{h.nama}</h3>
                    <div className="h-px flex-1 bg-surface" />
                  </div>
                )}
                {wardsInH.map((w) => (
                  <WardColumn
                    key={w.id}
                    ward={w}
                    patients={(aktif ?? []).filter((p) => p.lokasi_sekarang === w.id)}
                    onToast={notify}
                  />
                ))}
              </div>
            )
          })}
          {!shownWards.length && (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-card p-6 text-sm text-ink-muted">
              <BedDouble size={16} /> Belum ada ruangan — tambah lewat Pengaturan
            </p>
          )}
        </div>
      </DndContext>

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  )
}
