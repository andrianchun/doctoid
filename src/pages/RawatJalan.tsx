import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Stethoscope, Plus, Search,
  Edit3, Trash2, Eye, EyeOff, Settings as SettingsIcon,
  ChevronDown, ChevronUp, X
} from 'lucide-react'
import { db, type PoliLog, type Hospital } from '../db'
import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'
import Masked from '../components/Masked'
import PoliEntryModal from '../components/PoliEntryModal'
import DateInput from '../components/DateInput'
import { formatDate, getLocalDateString } from '../utils/dateFormat'

export default function RawatJalan() {
  const navigate = useNavigate()
  const { unmasked, setUnmasked } = useUi()

  // Data dari Dexie
  const hospitals = useLiveQuery(() => db.hospitals.toArray(), [], [] as Hospital[])
  const poliLogs = useLiveQuery(
    () => db.poliLogs.toArray().then((arr) => arr.sort((a, b) => (b.tanggal > a.tanggal ? 1 : b.tanggal < a.tanggal ? -1 : (b.id || 0) - (a.id || 0)))),
    [],
    [] as PoliLog[]
  )

  // Filter States
  const [filterHospitalId, setFilterHospitalId] = useState<number>(0)
  const [filterTipePoli, setFilterTipePoli] = useState<'semua' | 'reguler' | 'eksekutif'>('semua')
  const [filterPeriod, setFilterPeriod] = useState<'hari_ini' | '7_hari' | 'bulan_ini' | 'custom' | 'semua'>('hari_ini')
  const [customDate, setCustomDate] = useState<string>(getLocalDateString())
  const [searchQuery, setSearchQuery] = useState('')

  // State Modal Entry & Edit
  const [showPoliModal, setShowPoliModal] = useState(false)
  const [selectedPoliForEdit, setSelectedPoliForEdit] = useState<PoliLog | undefined>(undefined)

  // Preview Gambar
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Expanded card sesi untuk melihat rincian nama pasien
  const [expandedSesiIds, setExpandedSesiIds] = useState<Set<number>>(new Set())

  // Toast
  const [toast, setToast] = useState('')
  const notify = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const handleToggleMask = async () => {
    if (unmasked) {
      setUnmasked(false)
    } else {
      const ok = await verifyBiometric()
      if (ok) setUnmasked(true)
    }
  }

  const toggleExpandSesi = (id: number) => {
    setExpandedSesiIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDeleteSesi = async (log: PoliLog) => {
    if (!log.id) return
    const h = hospitals.find((item) => item.id === log.hospital_id)
    const confirmed = window.confirm(
      `Hapus catatan sesi poli ${h?.nama || 'Faskes'} tanggal ${formatDate(log.tanggal)} (${log.jumlah_pasien} pasien)?`
    )
    if (confirmed) {
      await db.poliLogs.delete(log.id)
      notify('Sesi poli berhasil dihapus')
    }
  }

  // Perhitungan tanggal
  const todayStr = getLocalDateString()
  const sevenDaysAgoStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return getLocalDateString(d)
  }, [])
  const startOfMonthStr = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    return getLocalDateString(d)
  }, [])

  // Filter Poli Logs
  const filteredLogs = useMemo(() => {
    return poliLogs.filter((log) => {
      // Filter Faskes
      if (filterHospitalId && log.hospital_id !== filterHospitalId) return false

      // Filter Tipe Poli
      if (filterTipePoli !== 'semua' && log.tipe_poli !== filterTipePoli) return false

      // Filter Periode
      if (filterPeriod === 'hari_ini' && log.tanggal !== todayStr) return false
      if (filterPeriod === '7_hari' && log.tanggal < sevenDaysAgoStr) return false
      if (filterPeriod === 'bulan_ini' && log.tanggal < startOfMonthStr) return false
      if (filterPeriod === 'custom' && log.tanggal !== customDate) return false

      // Filter Search (Nama Pasien / No RM / Catatan)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchCatatan = log.catatan?.toLowerCase().includes(q)
        const matchPatients = log.daftar_pasien?.some(
          (p) =>
            p.nama?.toLowerCase().includes(q) ||
            p.no_rm?.toLowerCase().includes(q) ||
            p.keterangan?.toLowerCase().includes(q)
        )
        if (!matchCatatan && !matchPatients) return false
      }

      return true
    })
  }, [
    poliLogs,
    filterHospitalId,
    filterTipePoli,
    filterPeriod,
    todayStr,
    sevenDaysAgoStr,
    startOfMonthStr,
    customDate,
    searchQuery,
  ])

  // Metrik & Statistik Berdasarkan Filter
  const stats = useMemo(() => {
    let totalPasien = 0
    let countReguler = 0
    let countEksekutif = 0
    let countBpjs = 0
    let countUmum = 0
    let countAsuransi = 0
    let totalEstimasiJasa = 0

    filteredLogs.forEach((log) => {
      const pasien = log.jumlah_pasien || 0
      totalPasien += pasien

      if (log.tipe_poli === 'eksekutif') {
        countEksekutif += pasien
      } else {
        countReguler += pasien
      }

      // Hitung Jaminan jika ada rincian
      if (log.daftar_pasien && log.daftar_pasien.length > 0) {
        log.daftar_pasien.forEach((p) => {
          if (p.jaminan === 'Umum') countUmum++
          else if (p.jaminan === 'Asuransi') countAsuransi++
          else countBpjs++
        })
      }

      // Estimasi Tarif
      const h = hospitals.find((item) => item.id === log.hospital_id)
      if (h) {
        const tarif =
          log.tipe_poli === 'eksekutif'
            ? h.tarif_poli_eksekutif || 0
            : h.tarif_poli_reguler || 0
        totalEstimasiJasa += pasien * tarif
      }
    })

    return {
      totalPasien,
      totalSesi: filteredLogs.length,
      countReguler,
      countEksekutif,
      countBpjs,
      countUmum,
      countAsuransi,
      totalEstimasiJasa,
    }
  }, [filteredLogs, hospitals])

  const formatRupiah = (num: number) => {
    if (!unmasked) return 'Rp •••••••'
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num)
  }

  return (
    <main className="space-y-4 p-4 sm:p-5">
      {/* Header Banner Rawat Jalan */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 p-5 text-white shadow-xl shadow-teal-900/20">
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md text-teal-200">
                <Stethoscope size={18} />
              </span>
              <div>
                <h1 className="h1 text-xl sm:text-2xl font-black tracking-tight text-white">
                  Rawat Jalan (Poli)
                </h1>
                <p className="caption text-xs text-teal-100/80 font-medium">
                  {formatDate(todayStr, 'DD MMM YYYY')}
                </p>
              </div>
            </div>

            {/* Tombol Aksi Header */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleMask}
                aria-label={unmasked ? 'Sensor Identitas Pasien' : 'Buka Sensor Identitas'}
                className="flex size-8 sm:size-9 cursor-pointer items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
                title={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas'}
              >
                {unmasked ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>

              <button
                type="button"
                onClick={() => navigate('/pengaturan')}
                aria-label="Pengaturan"
                className="flex size-8 sm:size-9 cursor-pointer items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
                title="Pengaturan"
              >
                <SettingsIcon size={15} />
              </button>
            </div>
          </div>

          {/* Quick CTA di Banner */}
          <div className="flex items-center justify-between pt-1 border-t border-white/15">
            <div className="text-xs font-semibold text-teal-100">
              Hari ini:{' '}
              <span className="font-black text-white">
                {poliLogs.filter((p) => p.tanggal === todayStr).reduce((acc, curr) => acc + (curr.jumlah_pasien || 0), 0)}{' '}
                pasien
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPoliForEdit(undefined)
                setShowPoliModal(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-white text-teal-900 text-xs font-extrabold shadow-md hover:bg-teal-50 active:scale-95 transition-all cursor-pointer"
            >
              <Plus size={15} className="text-teal-700" />
              <span>Catat Pasien Poli</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Faskes (Pill Horizontal) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
        <button
          type="button"
          onClick={() => setFilterHospitalId(0)}
          className={`h-8.5 rounded-full px-3.5 text-xs font-bold shrink-0 transition-all cursor-pointer whitespace-nowrap ${
            !filterHospitalId
              ? 'bg-gradient-to-br from-teal-700 to-teal-800 text-white shadow-sm shadow-teal-700/25'
              : 'glass-card text-ink-muted hover:text-ink'
          }`}
        >
          Semua RS
        </button>
        {hospitals?.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setFilterHospitalId(h.id!)}
            className={`flex h-8.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition-all whitespace-nowrap ${
              filterHospitalId === h.id
                ? 'text-white shadow-sm'
                : 'glass-card text-ink-muted hover:text-ink'
            }`}
            style={filterHospitalId === h.id ? { backgroundColor: h.kode_warna } : undefined}
          >
            <span
              className={`size-2 rounded-full shrink-0 ${filterHospitalId === h.id ? 'bg-white' : ''}`}
              style={filterHospitalId === h.id ? undefined : { backgroundColor: h.kode_warna }}
            />
            <span>{h.nama}</span>
          </button>
        ))}
      </div>

      {/* Filter Baris 2: Periode & Tipe Poli */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Pilihan Periode */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/90 text-xs">
          {[
            { id: 'hari_ini' as const, label: 'Hari Ini' },
            { id: '7_hari' as const, label: '7 Hari' },
            { id: 'bulan_ini' as const, label: 'Bulan Ini' },
            { id: 'semua' as const, label: 'Semua' },
            { id: 'custom' as const, label: 'Pilih Tanggal' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilterPeriod(item.id)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterPeriod === item.id
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Pilihan Tipe Poli */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/90 text-xs">
          {[
            { id: 'semua' as const, label: 'Semua Tipe' },
            { id: 'reguler' as const, label: 'Reguler' },
            { id: 'eksekutif' as const, label: 'Eksekutif' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilterTipePoli(t.id)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterTipePoli === t.id
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* DateInput jika memilih tanggal custom */}
      {filterPeriod === 'custom' && (
        <div className="w-48 animate-in fade-in">
          <DateInput
            value={customDate}
            onChange={(val) => setCustomDate(val)}
            className="h-9 rounded-2xl border border-slate-200 px-3 text-xs text-ink bg-white shadow-2xs"
          />
        </div>
      )}

      {/* Search Input Bar */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari pasien poli (Nama, No RM, atau catatan)..."
          className="w-full h-10 rounded-2xl border border-slate-200 bg-white pl-9 pr-9 text-xs font-medium text-ink outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 shadow-2xs transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Ringkasan Kartu Metrik Rawat Jalan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Total Pasien */}
        <div className="p-3.5 sm:p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Pasien
          </span>
          <div className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">
            {stats.totalPasien}
            <span className="text-xs font-normal text-slate-400 ml-1">orang</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium">
            {stats.totalSesi} sesi tercatat
          </div>
        </div>

        {/* Reguler vs Eksekutif */}
        <div className="p-3.5 sm:p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Tipe Layanan
          </span>
          <div className="text-sm font-bold text-slate-800 mt-1.5 space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-700 font-semibold">Reguler:</span>
              <span className="font-extrabold">{stats.countReguler}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-purple-700 font-semibold">Eksekutif:</span>
              <span className="font-extrabold">{stats.countEksekutif}</span>
            </div>
          </div>
        </div>

        {/* Jaminan Pasien */}
        <div className="p-3.5 sm:p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Jaminan Terdata
          </span>
          <div className="text-xs font-semibold text-slate-700 mt-1.5 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-emerald-700">BPJS:</span>
              <span className="font-bold">{stats.countBpjs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-700">Umum:</span>
              <span className="font-bold">{stats.countUmum}</span>
            </div>
          </div>
        </div>

        {/* Proyeksi Jasa Medis */}
        <div className="p-3.5 sm:p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Jasa Medis
            </span>
            <button
              type="button"
              onClick={handleToggleMask}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
              title={unmasked ? 'Sensor Identitas & Jasa Medis' : 'Buka Sensor Identitas & Jasa Medis (Biometrik)'}
            >
              {unmasked ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
          <div className="text-base sm:text-lg font-black text-emerald-700 tracking-tight mt-1 truncate">
            {formatRupiah(stats.totalEstimasiJasa)}
          </div>
          <div className="mt-1 text-[10px] text-slate-400 font-medium">
            Estimasi tarif faskes
          </div>
        </div>
      </div>

      {/* Daftar Sesi Poli */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Daftar Sesi Poli ({filteredLogs.length})
          </h2>
          <button
            type="button"
            onClick={() => {
              setSelectedPoliForEdit(undefined)
              setShowPoliModal(true)
            }}
            className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
          >
            <Plus size={14} /> Tambah Sesi
          </button>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="rounded-3xl border border-slate-200/90 bg-white p-8 text-center space-y-3 shadow-xs">
            <div className="size-12 mx-auto rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Stethoscope size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">Belum ada catatan rawat jalan</p>
              <p className="caption text-[11px] text-slate-400 mt-0.5">
                {searchQuery
                  ? 'Tidak ada data poli yang cocok dengan pencarian'
                  : 'Catat sesi poli hari ini dengan scan foto berkas atau hitung cepat'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPoliForEdit(undefined)
                setShowPoliModal(true)
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold shadow-sm hover:bg-teal-800 transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>Catat Pasien Poli Sekarang</span>
            </button>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const h = hospitals.find((item) => item.id === log.hospital_id)
            const isExpanded = log.id ? expandedSesiIds.has(log.id) : false
            const hasPatients = Boolean(log.daftar_pasien && log.daftar_pasien.length > 0)
            const hasPhotos = Boolean(log.foto_urls && log.foto_urls.length > 0)

            return (
              <div
                key={log.id}
                className="rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-3 transition-all hover:border-slate-300"
              >
                {/* Header Sesi */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-800 font-black text-lg shrink-0 shadow-2xs">
                      {log.jumlah_pasien}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {h?.nama || 'Faskes RS'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.tipe_poli === 'eksekutif'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          Poli {log.tipe_poli === 'eksekutif' ? 'Eksekutif' : 'Reguler'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium mt-0.5">
                        <span>{formatDate(log.tanggal)}</span>
                        <span>•</span>
                        <span>
                          {hasPatients ? `${log.daftar_pasien!.length} nama terdata` : 'Metode hitung cepat'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Edit & Hapus */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPoliForEdit(log)
                        setShowPoliModal(true)
                      }}
                      className="flex size-8 items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 hover:text-teal-700 transition-colors cursor-pointer"
                      title="Ubah Sesi Poli"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSesi(log)}
                      className="flex size-8 items-center justify-center rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Hapus Sesi Poli"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Catatan Sesi jika ada */}
                {log.catatan && (
                  <div className="rounded-2xl bg-slate-50/90 p-2.5 text-xs text-slate-700 border border-slate-100 font-medium">
                    {log.catatan}
                  </div>
                )}

                {/* Thumbnail Foto Berkas jika ada */}
                {hasPhotos && (
                  <div className="flex items-center gap-2 pt-1">
                    {log.foto_urls!.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPreviewImage(url)}
                        className="group relative size-14 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer shadow-2xs hover:opacity-90 transition-opacity shrink-0"
                      >
                        <img
                          src={url}
                          alt="Berkas Poli"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                          <Eye size={14} />
                        </span>
                      </button>
                    ))}
                    <span className="text-[11px] text-slate-400 font-medium">
                      Foto lembar registrasi / rekap
                    </span>
                  </div>
                )}

                {/* Accordion Rincian Pasien jika ada data nama */}
                {hasPatients && (
                  <div className="pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => log.id && toggleExpandSesi(log.id)}
                      className="w-full flex items-center justify-between text-xs font-bold text-teal-800 hover:text-teal-950 py-1 cursor-pointer"
                    >
                      <span>
                        {isExpanded
                          ? `Sembunyikan ${log.daftar_pasien!.length} Pasien`
                          : `Lihat Rincian ${log.daftar_pasien!.length} Pasien`}
                      </span>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 divide-y divide-slate-100 rounded-2xl bg-slate-50/80 p-2 border border-slate-200/80 max-h-72 overflow-y-auto animate-in fade-in">
                        {log.daftar_pasien!.map((p, pIdx) => (
                          <div key={pIdx} className="py-2 flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {pIdx + 1}. <Masked value={p.nama} type="name" />
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                {p.no_rm && <span>RM: {p.no_rm}</span>}
                                {p.keterangan && <span>• {p.keterangan}</span>}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                p.jaminan === 'Umum'
                                  ? 'bg-amber-100 text-amber-800'
                                  : p.jaminan === 'Asuransi'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {p.jaminan || 'BPJS'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modal Input/Edit Sesi Poli */}
      {showPoliModal && (
        <PoliEntryModal
          isOpen={showPoliModal}
          onClose={() => setShowPoliModal(false)}
          initialData={selectedPoliForEdit}
          onSaved={() => {
            setShowPoliModal(false)
            notify('Sesi poli berhasil disimpan ✓')
          }}
        />
      )}

      {/* Preview Foto Berkas Fullscreen */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-h-[85dvh] max-w-lg bg-white rounded-3xl p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-3 top-3 p-1.5 rounded-full bg-slate-900/60 text-white hover:bg-slate-900 cursor-pointer z-10"
            >
              <X size={18} />
            </button>
            <img
              src={previewImage}
              alt="Preview Berkas"
              className="max-h-[80dvh] w-auto rounded-2xl object-contain mx-auto"
            />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <aside
          aria-label="Notifikasi"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-2xl bg-gradient-to-r from-teal-700 to-teal-800 px-5 py-2.5 text-xs font-bold text-white shadow-xl shadow-teal-900/35 border border-white/20 animate-in fade-in slide-in-from-bottom-2"
        >
          {toast}
        </aside>
      )}
    </main>
  )
}
