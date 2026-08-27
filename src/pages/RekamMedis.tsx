import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, ChevronRight, Pill, Clock } from 'lucide-react'
import { db } from '../db'
import Masked from '../components/Masked'
import { formatDate } from '../utils/dateFormat'

const hariKe = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1)

const inputCls =
  'w-full rounded-2xl border border-primary-soft/30 bg-card px-4 py-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all'

export default function RekamMedis() {
  const [q, setQ] = useState('')
  const [isRingkas, setIsRingkas] = useState(false) // Default lengkap di rekam medis
  const [filterJaminan, setFilterJaminan] = useState<string>('semua')
  const [filterStatus, setFilterStatus] = useState<string>('semua')

  const patients = useLiveQuery(() => db.patients.toArray(), [], [])
  const wards = useLiveQuery(() => db.wards.toArray(), [], [])
  const hospitals = useLiveQuery(() => db.hospitals.toArray(), [], [])
  const allNotes = useLiveQuery(() => db.progressNotes.toArray(), [], [])

  const wardMap = useMemo(() => {
    const map = new Map<number, { nama: string; warna: string }>()
    wards?.forEach((w) => {
      if (w.id) map.set(w.id, { nama: w.nama, warna: w.kode_warna })
    })
    return map
  }, [wards])

  const hospitalMap = useMemo(() => {
    const map = new Map<number, string>()
    hospitals?.forEach((h) => {
      if (h.id) map.set(h.id, h.nama)
    })
    return map
  }, [hospitals])

  const latestNoteMap = useMemo(() => {
    const map = new Map<number, any>()
    allNotes?.forEach((n) => {
      const existing = map.get(n.patient_id)
      if (!existing || new Date(n.tanggal) > new Date(existing.tanggal)) {
        map.set(n.patient_id, n)
      }
    })
    return map
  }, [allNotes])

  const hasil = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (patients ?? []).filter((p) => {
      const pastDx = p.riwayat_rawat?.map((r) => r.diagnosis_utama).join(' ') || ''
      const matchesSearch = !s || [p.nama_depan, (p as any).inisial, p.no_rm, p.diagnosis_utama, p.jaminan, pastDx].some(
        (v) => v && v.toLowerCase().includes(s)
      )
      const matchesJaminan = filterJaminan === 'semua' || p.jaminan === filterJaminan
      const matchesStatus = filterStatus === 'semua' || p.status_rawat === filterStatus
      return matchesSearch && matchesJaminan && matchesStatus
    })
  }, [q, patients, filterJaminan, filterStatus])

  return (
    <main className="space-y-5 p-5">
      {/* Banner — 1 Baris */}
      <div className="glass-blue-hero rounded-3xl px-5 py-4 text-white shadow-xl flex items-center justify-between">
        <h1 className="h1 text-2xl font-black text-white">Rekam Medis</h1>
        <span className="text-xs font-bold text-white/90">Total {patients?.length ?? 0} Pasien</span>
      </div>

      {/* Kontrol & Toggle Tampilan Lengkap / Ringkas */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Filter Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-primary-soft/30 bg-card px-2.5 py-1.5 text-xs font-bold text-ink outline-none focus:border-primary"
          >
            <option value="semua">Semua Status</option>
            <option value="aktif">Rawat Aktif</option>
            <option value="krs">Sudah KRS</option>
          </select>

          {/* Filter Jaminan */}
          <select
            value={filterJaminan}
            onChange={(e) => setFilterJaminan(e.target.value)}
            className="rounded-xl border border-primary-soft/30 bg-card px-2.5 py-1.5 text-xs font-bold text-ink outline-none focus:border-primary"
          >
            <option value="semua">Semua Jaminan</option>
            <option value="BPJS">BPJS</option>
            <option value="Umum">Umum</option>
            <option value="Asuransi">Asuransi</option>
          </select>
        </div>

        {/* Toggle Lengkap / Ringkas */}
        <label className="flex cursor-pointer items-center gap-2 rounded-2xl bg-card border border-surface px-3 py-1.5 shadow-xs hover:bg-surface/50 transition-all">
          <span className="text-xs font-bold text-ink">
            {isRingkas ? 'Tampilan Ringkas' : 'Tampilan Lengkap'}
          </span>
          <div
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              isRingkas ? 'bg-primary' : 'bg-primary/20'
            }`}
          >
            <input
              type="checkbox"
              checked={isRingkas}
              onChange={(e) => setIsRingkas(e.target.checked)}
              className="sr-only"
            />
            <span
              className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${
                isRingkas ? 'translate-x-4.5' : 'translate-x-1 shadow-sm'
              }`}
            />
          </div>
        </label>
      </div>

      {/* Pencarian */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama pasien, no. RM, diagnosis, jaminan…"
          className={inputCls + ' pl-10 h-11'}
        />
      </div>

      {/* Daftar Pasien */}
      <div className="space-y-3">
        {hasil.map((p) => {
          const wardInfo = p.lokasi_sekarang ? wardMap.get(p.lokasi_sekarang) : undefined
          const hospitalNama = p.hospital_id ? hospitalMap.get(p.hospital_id) : undefined
          const warna = wardInfo?.warna || '#2563EB'
          const latestNote = p.id ? latestNoteMap.get(p.id) : undefined
          const activeMeds = (latestNote?.P ?? []).filter((it: any) => it.status === 'aktif' && it.kategori === 'Farmakologi')

          return (
            <Link
              key={p.id}
              to={`/pasien/${p.id}`}
              className="glass-card glass-card-hover block rounded-3xl p-4 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Squircle Avatar */}
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-2xl font-black text-sm text-white shadow-sm ring-2 ring-white"
                    style={{ backgroundColor: warna }}
                  >
                    {p.nama_depan?.[0]?.toUpperCase() || (p as any).inisial?.[0]?.toUpperCase() || 'P'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-ink">
                        {p.title} <Masked value={p.nama_depan || (p as any).inisial} type="name" />
                      </span>
                      {p.usia && <span className="caption font-normal">({p.usia} th)</span>}
                      <span className="caption">· RM <Masked value={p.no_rm} type="rm" /></span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <p className="text-xs font-bold text-primary truncate">{p.diagnosis_utama || '—'}</p>
                      <span className="caption flex items-center gap-1 text-xs font-extrabold text-slate-700 bg-slate-100 border border-slate-200/90 rounded-md px-1.5 py-0.5 shrink-0 shadow-2xs">
                        {p.tgl_onset && <span>OH-{hariKe(p.tgl_onset)}</span>}
                        {p.tgl_onset && <span className="text-slate-400">·</span>}
                        <span>P-{hariKe(p.tgl_mrs)}</span>
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                        {p.jaminan}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          p.status_rawat === 'aktif'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-surface text-ink-muted'
                        }`}
                      >
                        {p.status_rawat === 'aktif' ? `Perawatan P-${hariKe(p.tgl_mrs)}` : 'Sudah KRS'}
                      </span>
                      {p.tgl_onset && (
                        <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 px-2.5 py-0.5 text-xs font-bold">
                          Onset OH-{hariKe(p.tgl_onset)}
                        </span>
                      )}
                      {wardInfo && (
                        <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
                          {hospitalNama ? `${hospitalNama} · ` : ''}{wardInfo.nama}
                        </span>
                      )}
                      {p.riwayat_rawat && p.riwayat_rawat.length > 0 && (
                        <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 px-2.5 py-0.5 text-xs font-bold">
                          Rawat #{p.riwayat_rawat.length + 1}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <ChevronRight size={18} className="text-ink-muted/70 shrink-0 mt-1" />
              </div>

              {/* Tampilan Lengkap: Rincian Diagnosa, Obat Aktif & Tanggal */}
              {!isRingkas && (
                <div className="mt-3 pt-3 border-t border-surface space-y-2 text-xs text-ink animate-in fade-in">
                  <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
                    <p className="flex items-center gap-1">
                      <Clock size={14} className="text-primary" /> MRS: <b>{formatDate(p.tgl_mrs)}</b>
                    </p>
                    {p.tgl_onset && (
                      <p className="flex items-center gap-1">
                        <Clock size={14} className="text-amber-600" /> Onset: <b>{formatDate(p.tgl_onset)}</b>
                      </p>
                    )}
                  </div>

                  {/* Terapi Aktif */}
                  {activeMeds.length > 0 && (
                    <div className="rounded-2xl bg-surface/60 p-2.5 space-y-1">
                      <p className="caption font-bold flex items-center gap-1 text-primary">
                        <Pill size={14} /> Terapi Berjalan ({activeMeds.length}):
                      </p>
                      <p className="text-xs text-ink truncate leading-tight">
                        {activeMeds.slice(0, 3).map((m: any) => `${m.nama_item} ${m.dosis_keterangan}`).join(' · ')}
                        {activeMeds.length > 3 ? ` (+${activeMeds.length - 3} lainnya)` : ''}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Link>
          )
        })}

        {!hasil.length && (
          <div className="glass-card rounded-3xl p-8 text-center text-xs font-medium text-ink-muted">
            Tidak ada pasien yang cocok dengan kriteria pencarian.
          </div>
        )}
      </div>
    </main>
  )
}
