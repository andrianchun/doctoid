import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Eye,
  EyeOff,
  ChevronRight,
  Plus,
  Settings,
} from 'lucide-react'
import { db, type Patient, type Hospital, type ProgressNote, type PoliLog, type TerapiItem } from '../db'
import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'
import { formatDate, hariKe, getLocalDateString } from '../utils/dateFormat'
import PoliEntryModal from '../components/PoliEntryModal'

// Regex untuk deteksi otomatis obat yang butuh tapering atau durasi terbatas jika belum diset eksplisit
const RE_TAPER_MANITOL = /manitol|mannitol/i
const RE_TAPER_DEXA = /dexa|dexamethasone/i
const RE_DURASI_CEFTRIAXONE = /ceftriaxone|ceftri/i
const RE_DURASI_NIMODIPINE = /nimodipine|nimotop/i
const RE_DURASI_DAPT = /clopidogrel.*(?:aspirin|asetosal)|(?:aspirin|asetosal).*clopidogrel|dapt/i

interface DrugAlertItem {
  patient: Patient
  terapi: TerapiItem
  tipe: 'tapering' | 'durasi'
  namaObat: string
  dosis: string
  hari: number
  targetHari?: number
  isUrgent: boolean
  pesan: string
}

export default function Dasbor() {
  const navigate = useNavigate()
  const { user, unmasked, setUnmasked } = useUi()

  // State filter & preferensi
  const [filterHospitalId, setFilterHospitalId] = useState<number>(() => {
    try {
      const s = sessionStorage.getItem('doctoid_dasbor_filter_rs')
      return s ? parseInt(s, 10) : 0
    } catch {
      return 0
    }
  })
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d'>('7d')
  const [hideIncome, setHideIncome] = useState<boolean>(() => {
    return localStorage.getItem('doctoid_hide_income') === 'true'
  })
  const [showPoliModal, setShowPoliModal] = useState(false)
  const [selectedPoliForEdit, setSelectedPoliForEdit] = useState<PoliLog | undefined>(undefined)

  const handleFilterClick = (id: number) => {
    setFilterHospitalId(id)
    sessionStorage.setItem('doctoid_dasbor_filter_rs', String(id))
  }

  const handleToggleMask = async () => {
    if (unmasked) {
      setUnmasked(false)
    } else {
      const ok = await verifyBiometric()
      if (ok) setUnmasked(true)
    }
  }

  const toggleHideIncome = () => {
    const next = !hideIncome
    setHideIncome(next)
    localStorage.setItem('doctoid_hide_income', String(next))
  }

  // Live queries dari IndexedDB (dengan default array konstan agar referensi dependensi stabil)
  const hospitals = useLiveQuery(() => db.hospitals.toArray().then(arr => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))), [], [] as Hospital[])
  const activePatients = useLiveQuery(() => db.patients.where('status_rawat').equals('aktif').toArray(), [], [] as Patient[])
  const allPatients = useLiveQuery(() => db.patients.toArray(), [], [] as Patient[])
  const allNotes = useLiveQuery(() => db.progressNotes.toArray(), [], [] as ProgressNote[])
  const poliLogs = useLiveQuery(() => db.poliLogs.toArray(), [], [] as PoliLog[])

  const todayStr = getLocalDateString()

  // Filter faskes untuk pasien & log
  const filteredActivePatients = useMemo(() => {
    if (!filterHospitalId) return activePatients
    return activePatients.filter(p => p.hospital_id === filterHospitalId)
  }, [activePatients, filterHospitalId])

  const filteredAllPatients = useMemo(() => {
    if (!filterHospitalId) return allPatients
    return allPatients.filter(p => p.hospital_id === filterHospitalId)
  }, [allPatients, filterHospitalId])

  const filteredPoliLogs = useMemo(() => {
    if (!filterHospitalId) return poliLogs
    return poliLogs.filter(p => p.hospital_id === filterHospitalId)
  }, [poliLogs, filterHospitalId])

  // Total SELURUH pasien yang pernah ditangani (Kumulatif Ranap + Poli All-Time)
  const totalPasienAllTime = useMemo(() => {
    const ranapAllCount = filteredAllPatients.length
    const poliAllCount = filteredPoliLogs.reduce((acc, curr) => acc + (curr.jumlah_pasien || 0), 0)
    return ranapAllCount + poliAllCount
  }, [filteredAllPatients, filteredPoliLogs])

  // Beban Kasus PieChart per Faskes (Total Kumulatif Seluruh Pasien Ranap + Poli per Faskes)
  const hospitalStats = useMemo(() => {
    return hospitals.map((h) => {
      const ranapCount = allPatients.filter((p) => p.hospital_id === h.id).length
      const poliCount = poliLogs
        .filter((pl) => pl.hospital_id === h.id)
        .reduce((acc, curr) => acc + (curr.jumlah_pasien || 0), 0)
      return {
        id: h.id!,
        name: h.nama,
        value: ranapCount + poliCount,
        ranapCount,
        poliCount,
        fill: h.kode_warna || '#3B82F6',
      }
    })
  }, [hospitals, allPatients, poliLogs])

  const chartSlices = useMemo(() => hospitalStats.filter((d) => d.value > 0), [hospitalStats])

  // Map progress notes per pasien (ambil note terakhir untuk cek terapi & status visite hari ini)
  const patientLatestNoteMap = useMemo(() => {
    const map = new Map<number, ProgressNote>()
    for (const note of allNotes) {
      const existing = map.get(note.patient_id)
      if (!existing || note.tanggal > existing.tanggal) {
        map.set(note.patient_id, note)
      }
    }
    return map
  }, [allNotes])

  // Pasien rawat inap yang sudah divisite hari ini
  const visitedTodayPatientIds = useMemo(() => {
    const set = new Set<number>()
    for (const note of allNotes) {
      if (note.tanggal && note.tanggal.startsWith(todayStr)) {
        set.add(note.patient_id)
      }
    }
    return set
  }, [allNotes, todayStr])

  const visitedCountToday = filteredActivePatients.filter(p => visitedTodayPatientIds.has(p.id!)).length

  // Pasien poli hari ini
  const poliTodayLogs = useMemo(() => {
    return filteredPoliLogs.filter(p => p.tanggal === todayStr)
  }, [filteredPoliLogs, todayStr])

  const poliTodayCount = poliTodayLogs.reduce((acc, curr) => acc + (curr.jumlah_pasien || 0), 0)

  // Total pasien dikelola hari ini (Inap Aktif + Poli Hari Ini)
  const totalPasienToday = filteredActivePatients.length + poliTodayCount

  // ==================== ALERTS: TAPERING & DURASI OBAT ====================
  const drugAlerts = useMemo<DrugAlertItem[]>(() => {
    const alerts: DrugAlertItem[] = []

    for (const p of filteredActivePatients) {
      const note = patientLatestNoteMap.get(p.id!)
      if (!note || !note.P) continue

      const activeTherapies = note.P.filter(item => item.status === 'aktif' && item.kategori === 'Farmakologi')

      for (const t of activeTherapies) {
        const tglMulai = t.tracking?.tgl_mulai || t.tgl_mulai || p.tgl_mrs || todayStr
        const dayCount = hariKe(tglMulai)

        // 1. Cek explicit tracking
        if (t.tracking) {
          if (t.tracking.tipe === 'tapering') {
            const isUrgent = dayCount >= 3
            alerts.push({
              patient: p,
              terapi: t,
              tipe: 'tapering',
              namaObat: t.nama_item,
              dosis: t.dosis_keterangan,
              hari: dayCount,
              isUrgent,
              pesan: isUrgent
                ? `H-${dayCount}: Waktunya evaluasi klinis untuk tap down dosis / weaning.`
                : `H-${dayCount}: Dalam pemantauan tapering (${t.tracking.tahap_taper || t.dosis_keterangan}).`,
            })
            continue
          } else if (t.tracking.tipe === 'durasi') {
            const target = t.tracking.target_hari || 7
            const isUrgent = dayCount >= target
            alerts.push({
              patient: p,
              terapi: t,
              tipe: 'durasi',
              namaObat: t.nama_item,
              dosis: t.dosis_keterangan,
              hari: dayCount,
              targetHari: target,
              isUrgent,
              pesan: dayCount >= target
                ? `H-${dayCount}/${target}: Target durasi telah tercapai! Evaluasi stop atau switch.`
                : `H-${dayCount}/${target}: Berjalan menuju target hari ke-${target}.`,
            })
            continue
          }
        }

        // 2. Deteksi Heuristik Otomatis (Manitol, Dexa, Ceftriaxone, Nimodipine, DAPT)
        const combined = `${t.nama_item} ${t.dosis_keterangan}`

        if (RE_TAPER_MANITOL.test(combined)) {
          const isUrgent = dayCount >= 3
          alerts.push({
            patient: p,
            terapi: t,
            tipe: 'tapering',
            namaObat: t.nama_item,
            dosis: t.dosis_keterangan,
            hari: dayCount,
            isUrgent,
            pesan: isUrgent
              ? `H-${dayCount}: Manitol sudah ${dayCount} hari. Waktunya evaluasi tap-down per hari / stop bila klinis membaik!`
              : `H-${dayCount}: Manitol dalam pemantauan ICP/klinis.`,
          })
        } else if (RE_TAPER_DEXA.test(combined)) {
          const isUrgent = dayCount >= 4
          alerts.push({
            patient: p,
            terapi: t,
            tipe: 'tapering',
            namaObat: t.nama_item,
            dosis: t.dosis_keterangan,
            hari: dayCount,
            isUrgent,
            pesan: isUrgent
              ? `H-${dayCount}: Dexamethasone telah ${dayCount} hari. Pertimbangkan penurunan dosis bertahap.`
              : `H-${dayCount}: Dexamethasone aktif.`,
          })
        } else if (RE_DURASI_CEFTRIAXONE.test(combined)) {
          const target = 7
          const isUrgent = dayCount >= 6
          alerts.push({
            patient: p,
            terapi: t,
            tipe: 'durasi',
            namaObat: t.nama_item,
            dosis: t.dosis_keterangan,
            hari: dayCount,
            targetHari: target,
            isUrgent,
            pesan: dayCount >= target
              ? `H-${dayCount}/${target}: Ceftriaxone telah mencapai batas 7 hari standar. Evaluasi stop/ganti.`
              : `H-${dayCount}/${target}: Menuju target 7 hari antibiotik empiris.`,
          })
        } else if (RE_DURASI_NIMODIPINE.test(combined)) {
          const target = 21
          const isUrgent = dayCount >= 19
          alerts.push({
            patient: p,
            terapi: t,
            tipe: 'durasi',
            namaObat: t.nama_item,
            dosis: t.dosis_keterangan,
            hari: dayCount,
            targetHari: target,
            isUrgent,
            pesan: dayCount >= target
              ? `H-${dayCount}/${target}: Profilaksis vasospasme PSA Nimodipine selesai (21 hari).`
              : `H-${dayCount}/${target}: Nimodipine target 21 hari pasca-PSA.`,
          })
        } else if (RE_DURASI_DAPT.test(combined)) {
          const target = 21
          const isUrgent = dayCount >= 20
          alerts.push({
            patient: p,
            terapi: t,
            tipe: 'durasi',
            namaObat: t.nama_item,
            dosis: t.dosis_keterangan,
            hari: dayCount,
            targetHari: target,
            isUrgent,
            pesan: dayCount >= target
              ? `H-${dayCount}/${target}: DAPT (Aspirin+Clopidogrel) mencapai 21 hari (CHANCE/POINT protocol). Evaluasi de-eskalasi ke monoterapi.`
              : `H-${dayCount}/${target}: Protokol DAPT 21 hari stroke minor / TIA risiko tinggi.`,
          })
        }
      }
    }

    return alerts.sort((a, b) => (b.isUrgent ? 1 : 0) - (a.isUrgent ? 1 : 0))
  }, [filteredActivePatients, patientLatestNoteMap, todayStr])

  // ==================== GRAFIK TREN BEBAN PASIEN (DARKA-STYLE) ====================
  const chartData = useMemo(() => {
    const days = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30
    const result = []

    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const dateKey = `${year}-${month}-${day}`

      // Hitung pasien rawat inap yang divisite pada hari itu
      const visitedInapOnDate = new Set<number>()
      for (const n of allNotes) {
        if (n.tanggal && n.tanggal.startsWith(dateKey)) {
          visitedInapOnDate.add(n.patient_id)
        }
      }

      // Hitung pasien poli pada hari itu
      let poliCountOnDate = 0
      for (const pl of filteredPoliLogs) {
        if (pl.tanggal === dateKey) {
          poliCountOnDate += (pl.jumlah_pasien || 0)
        }
      }

      const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' })
      const dateLabel = `${dayName}, ${d.getDate()}`

      result.push({
        date: dateKey,
        label: dateLabel,
        inap: visitedInapOnDate.size,
        poli: poliCountOnDate,
        total: visitedInapOnDate.size + poliCountOnDate,
      })
    }

    return result
  }, [timeRange, allNotes, filteredPoliLogs])

  // ==================== PROYEKSI FINANSIAL / JASA MEDIS ====================
  const financialProjection = useMemo(() => {
    const hospitalMap = new Map<number, Hospital>()
    for (const h of hospitals) {
      if (h.id) hospitalMap.set(h.id, h)
    }

    // 1. Penghasilan Hari Ini
    let todayVisiteNominal = 0
    for (const p of filteredActivePatients) {
      if (visitedTodayPatientIds.has(p.id!)) {
        const h = hospitalMap.get(p.hospital_id)
        const isRaberOrKonsul = p.peran_rawat === 'Raber' || p.peran_rawat === 'Konsul'
        const tarif = isRaberOrKonsul
          ? (h?.tarif_visite_raber ?? 0)
          : (h?.tarif_visite_leader ?? 0)
        todayVisiteNominal += tarif
      }
    }

    let todayPoliNominal = 0
    for (const pl of poliTodayLogs) {
      const h = hospitalMap.get(pl.hospital_id)
      const tarif = pl.tipe_poli === 'eksekutif'
        ? (h?.tarif_poli_eksekutif ?? 0)
        : (h?.tarif_poli_reguler ?? 0)
      todayPoliNominal += (pl.jumlah_pasien || 0) * tarif
    }

    const todayTotal = todayVisiteNominal + todayPoliNominal

    // 2. Bulan Ini Berjalan (Month to Date)
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() // 0-based
    const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

    let mtdVisiteNominal = 0
    for (const n of allNotes) {
      if (n.tanggal && n.tanggal.startsWith(currentMonthPrefix)) {
        const p = activePatients.find(item => item.id === n.patient_id)
        if (p) {
          const h = hospitalMap.get(p.hospital_id)
          const isRaberOrKonsul = p.peran_rawat === 'Raber' || p.peran_rawat === 'Konsul'
          const tarif = isRaberOrKonsul
            ? (h?.tarif_visite_raber ?? 0)
            : (h?.tarif_visite_leader ?? 0)
          mtdVisiteNominal += tarif
        }
      }
    }

    let mtdPoliNominal = 0
    for (const pl of filteredPoliLogs) {
      if (pl.tanggal && pl.tanggal.startsWith(currentMonthPrefix)) {
        const h = hospitalMap.get(pl.hospital_id)
        const tarif = pl.tipe_poli === 'eksekutif'
          ? (h?.tarif_poli_eksekutif ?? 0)
          : (h?.tarif_poli_reguler ?? 0)
        mtdPoliNominal += (pl.jumlah_pasien || 0) * tarif
      }
    }

    const mtdTotal = mtdVisiteNominal + mtdPoliNominal

    // 3. Proyeksi Akhir Bulan
    const dayOfMonth = new Date().getDate()
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const projectedMonthEnd = dayOfMonth > 0 ? Math.round((mtdTotal / dayOfMonth) * totalDaysInMonth) : 0

    return {
      todayVisiteNominal,
      todayPoliNominal,
      todayTotal,
      mtdTotal,
      projectedMonthEnd,
      dayOfMonth,
      totalDaysInMonth,
    }
  }, [hospitals, filteredActivePatients, visitedTodayPatientIds, poliTodayLogs, allNotes, filteredPoliLogs, activePatients])

  const formatRupiah = (num: number) => {
    if (hideIncome) return 'Rp ••••••••'
    return 'Rp ' + num.toLocaleString('id-ID')
  }

  return (
    <main className="space-y-5 p-3.5 sm:p-5 pb-8">
      
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
            {/* Atas: Nama Dokter & Spesialisasi (Full Width — tidak terpotong) */}
            <div className="min-w-0 w-full">
              <h2 className="text-sm sm:text-base font-black text-white leading-tight break-words">
                {user?.displayName || 'Dokter'}
              </h2>
              <p className="text-xs font-semibold text-white/80 leading-snug break-words mt-0.5">
                {user?.specialty || 'Spesialis Neurologi (Sp.N)'}
              </p>
            </div>

            {/* Bawah: Total Seluruh Pasien Ditangani di Kiri & Tombol Aksi Cepat (Mata + Gir) di Kanan */}
            <div className="flex items-end justify-between pt-3 border-t border-white/15 gap-2">
              <div>
                <h1 className="h1 text-2xl sm:text-3xl font-black text-white leading-none">
                  {totalPasienAllTime}
                </h1>
                <p className="text-xs font-bold text-white/95 mt-1 tracking-wide">
                  Total Pasien Ditangani
                </p>
              </div>

              {/* Tombol Aksi Cepat (Eye & Settings) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleMask}
                  aria-label={unmasked ? 'Sensor Identitas Pasien' : 'Tampilkan Identitas Pasien (Biometrik)'}
                  className="flex size-8 sm:size-9 cursor-pointer items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
                  title={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
                >
                  {unmasked ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/pengaturan')}
                  aria-label="Pengaturan"
                  title="Pengaturan"
                  className="flex size-8 sm:size-9 cursor-pointer items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
                >
                  <Settings size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* Beban Kasus Donut Chart (Distribusi Pasien per Faskes) */}
      {hospitalStats.length > 0 && (
        <div className="glass-card rounded-3xl p-3.5 sm:p-4 shadow-sm">
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartSlices.length > 0 ? chartSlices : [{ name: 'Belum ada pasien', value: 1, fill: '#BFDBFE' }]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={34}
                  outerRadius={58}
                  paddingAngle={chartSlices.length > 1 ? 4 : 0}
                  stroke="none"
                  style={{ outline: 'none' }}
                >
                  {(chartSlices.length > 0 ? chartSlices : [{ name: 'Belum ada pasien', fill: '#BFDBFE' }]).map((d) => (
                    <Cell key={d.name} fill={d.fill} stroke="transparent" style={{ outline: 'none' }} />
                  ))}
                </Pie>
                {chartSlices.length > 0 && (
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const item = payload[0]
                      const stat = hospitalStats.find((s) => s.name === item.name)
                      return (
                        <div className="rounded-xl border border-primary/20 bg-white/95 px-3 py-1.5 shadow-md pointer-events-none">
                          <p className="text-xs font-bold text-primary">
                            {item.name} : {item.value} pasien
                          </p>
                          {stat && (
                            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                              {stat.ranapCount} Ranap · {stat.poliCount} Poli
                            </p>
                          )}
                        </div>
                      )
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1 text-xs">
            {hospitalStats.map((d) => {
              const isSelected = filterHospitalId === d.id
              return (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => handleFilterClick(filterHospitalId === d.id ? 0 : d.id)}
                  className={`flex items-center gap-1.5 font-bold cursor-pointer transition-all px-3 py-1 rounded-full ${
                    isSelected
                      ? 'bg-gradient-to-r from-primary to-primary-deep text-white shadow-sm shadow-primary/25'
                      : 'bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 border border-primary/15'
                  }`}
                >
                  <span
                    className={`size-2 rounded-full shrink-0 ${isSelected ? 'bg-white' : ''}`}
                    style={isSelected ? undefined : { backgroundColor: d.fill }}
                  />
                  <span>
                    {d.name} ({d.value})
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 4 Kartu KPI Ringkasan Beban & Pendapatan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Card 1: Rawat Inap Aktif */}
        <Link
          to="/rawatinap"
          className="group block p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs hover:border-primary/40 hover:shadow-md transition-all relative overflow-hidden"
        >
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Rawat Inap Aktif
          </span>
          <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mt-1">
            {filteredActivePatients.length}
            <span className="text-xs font-bold text-slate-400 ml-1">pasien</span>
          </div>
          <div className="mt-2.5 flex items-center">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
              visitedCountToday >= filteredActivePatients.length && filteredActivePatients.length > 0
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-primary/10 text-primary border border-primary/20'
            }`}>
              {visitedCountToday}/{filteredActivePatients.length} Visite
            </span>
          </div>
        </Link>

        {/* Card 2: Pasien Poli Hari Ini */}
        <Link
          to="/rawatjalan"
          className="group block p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs hover:border-primary/40 hover:shadow-md transition-all relative overflow-hidden cursor-pointer"
        >
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Poli Hari Ini
          </span>
          <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mt-1">
            {poliTodayCount}
            <span className="text-xs font-bold text-slate-400 ml-1">pasien</span>
          </div>
          <div className="mt-2.5 text-[11px] text-slate-500 font-medium truncate flex items-center justify-between min-h-[18px]">
            <span>{poliTodayLogs.length > 0 ? `${poliTodayLogs.length} sesi tercatat` : ''}</span>
            <ChevronRight size={14} className="text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all ml-auto" />
          </div>
        </Link>

        {/* Card 3: Total Pasien Dikelola Hari Ini */}
        <div className="p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Hari Ini
          </span>
          <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mt-1">
            {totalPasienToday}
            <span className="text-xs font-bold text-slate-400 ml-1">pasien</span>
          </div>
          <div className="mt-2.5 text-[11px] text-slate-500 font-medium truncate">
            {filteredActivePatients.length} Inap · {poliTodayCount} Poli
          </div>
        </div>

        {/* Card 4: Proyeksi Jasa Medis Hari Ini */}
        <div className="p-4 rounded-3xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Jasa Medis
            </span>
            <button
              type="button"
              onClick={toggleHideIncome}
              className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title={hideIncome ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
            >
              {hideIncome ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight mt-1 truncate">
            {formatRupiah(financialProjection.todayTotal)}
          </div>
          <div className="mt-2.5 text-[11px] font-medium text-slate-500 truncate">
            Bulan Ini: <span className="font-bold text-slate-700">{formatRupiah(financialProjection.mtdTotal)}</span>
          </div>
        </div>

      </div>

      {/* SECTION: ALERT TAPERING & DURASI OBAT */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
            <span>Alert Obat (Tapering & Durasi)</span>
            {drugAlerts.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-black">
                {drugAlerts.length}
              </span>
            )}
          </h2>
        </div>

        {drugAlerts.length === 0 ? (
          <div className="py-6 text-center text-slate-400">
            <p className="text-xs font-semibold text-slate-500">Semua terapi obat dalam batas aman</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 mt-1">
            {drugAlerts.map((alert, idx) => (
              <div
                key={idx}
                onClick={() => navigate(`/pasien/${alert.patient.id}`)}
                className="py-3 px-2 -mx-2 rounded-2xl hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-800">
                      {alert.patient.nama_depan || 'Pasien'}
                    </span>
                    {alert.patient.no_rm && (
                      <span className="text-[11px] font-mono text-slate-400">
                        ({alert.patient.no_rm})
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      alert.isUrgent
                        ? 'bg-rose-500 text-white'
                        : 'bg-amber-100 text-amber-900 border border-amber-200'
                    }`}>
                      {alert.tipe === 'tapering' ? `⚡ Tapering H-${alert.hari}` : `⏱ Durasi H-${alert.hari}${alert.targetHari ? `/${alert.targetHari}` : ''}`}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-700 mt-1">
                    {alert.namaObat} {alert.dosis ? `(${alert.dosis})` : ''}
                  </div>

                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {alert.pesan}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0 text-xs font-bold text-primary group-hover:translate-x-0.5 transition-transform">
                  <span>CPPT</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION: GRAFIK TREN PASIEN */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <h2 className="text-sm sm:text-base font-bold text-slate-800">
            Tren Pasien
          </h2>

          {/* Time range selector pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
            {(['7d', '14d', '30d'] as const).map(tr => (
              <button
                key={tr}
                type="button"
                onClick={() => setTimeRange(tr)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  timeRange === tr
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tr === '7d' ? '7 Hari' : tr === '14d' ? '14 Hari' : '30 Hari'}
              </button>
            ))}
          </div>
        </div>

        {/* Area Chart Container */}
        <div className="h-64 sm:h-72 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorPoli" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#14B8A6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="rounded-2xl bg-slate-900/90 backdrop-blur-md p-3 text-white shadow-xl text-xs space-y-1 border border-slate-700">
                        <div className="font-bold text-slate-300">{data.label}</div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-blue-300">Rawat Inap (Visite):</span>
                          <span className="font-bold">{data.inap} px</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-teal-300">Rawat Jalan (Poli):</span>
                          <span className="font-bold">{data.poli} px</span>
                        </div>
                        <div className="border-t border-slate-700 pt-1 flex items-center justify-between gap-4 font-black">
                          <span>Total Pasien:</span>
                          <span className="text-amber-400">{data.total} px</span>
                        </div>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#3B82F6"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorTotal)"
                name="Total Pasien"
              />
              <Area
                type="monotone"
                dataKey="poli"
                stroke="#14B8A6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPoli)"
                name="Poli"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-center gap-6 pt-3 text-xs text-slate-500 font-semibold">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-blue-500" />
            <span>Total Pasien Dilayani</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-teal-500" />
            <span>Pasien Rawat Jalan (Poli)</span>
          </div>
        </div>
      </div>

      {/* SECTION: REKAP PASIEN POLI HARI INI */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-800">
              Rekap Poli Hari Ini
            </h2>
            <Link
              to="/rawatjalan"
              className="text-[11px] font-bold text-teal-700 hover:text-teal-900 hover:underline flex items-center gap-0.5"
            >
              Buka Rawat Jalan <ChevronRight size={12} />
            </Link>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedPoliForEdit(undefined)
              setShowPoliModal(true)
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs transition-colors cursor-pointer"
          >
            <Plus size={14} />
            <span>Tambah</span>
          </button>
        </div>

        {poliTodayLogs.length === 0 ? (
          <div className="py-6 text-center text-slate-400 space-y-2">
            <p className="text-xs font-semibold text-slate-500">Belum ada sesi poli hari ini</p>
            <button
              type="button"
              onClick={() => {
                setSelectedPoliForEdit(undefined)
                setShowPoliModal(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-deep transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span>Catat Pasien Poli</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 mt-2">
            {poliTodayLogs.map((log) => {
              const h = hospitals.find(item => item.id === log.hospital_id)
              return (
                <div
                  key={log.id}
                  onClick={() => {
                    setSelectedPoliForEdit(log)
                    setShowPoliModal(true)
                  }}
                  className="py-3 px-2 -mx-2 rounded-2xl hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 font-bold text-base shrink-0">
                      {log.jumlah_pasien}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {h?.nama || 'Rumah Sakit'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.tipe_poli === 'eksekutif'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          Poli {log.tipe_poli === 'eksekutif' ? 'Eksekutif' : 'Reguler'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {log.catatan || (log.daftar_pasien ? `${log.daftar_pasien.length} nama pasien terdaftar` : 'Hitung cepat')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-teal-700 hover:text-teal-900">
                      Edit
                    </span>
                    <ChevronRight size={14} className="text-slate-400" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SECTION: PROYEKSI PENGHASILAN / JASA MEDIS */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-sm sm:text-base font-bold text-slate-800">
            Proyeksi Jasa Medis
          </h2>
          <button
            type="button"
            onClick={toggleHideIncome}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
          >
            {hideIncome ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{hideIncome ? 'Buka' : 'Samarkan'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Hari Ini ({formatDate(todayStr)})
            </span>
            <div className="text-lg font-black text-slate-800 mt-1">
              {formatRupiah(financialProjection.todayTotal)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
              <div>Visite: {formatRupiah(financialProjection.todayVisiteNominal)}</div>
              <div>Poli: {formatRupiah(financialProjection.todayPoliNominal)}</div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Bulan Berjalan (H-{financialProjection.dayOfMonth})
            </span>
            <div className="text-lg font-black text-slate-800 mt-1">
              {formatRupiah(financialProjection.mtdTotal)}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              Proyeksi Akhir Bulan
            </span>
            <div className="text-lg font-black text-emerald-900 mt-1">
              {formatRupiah(financialProjection.projectedMonthEnd)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-1">
          <Link
            to="/pengaturan"
            className="text-primary text-xs font-bold hover:underline flex items-center gap-0.5"
          >
            <span>Atur Tarif Faskes</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* Modal Input/Edit Rekap Poli */}
      {showPoliModal && (
        <PoliEntryModal
          isOpen={showPoliModal}
          onClose={() => setShowPoliModal(false)}
          initialData={selectedPoliForEdit}
        />
      )}

    </main>
  )
}
