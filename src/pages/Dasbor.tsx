import { useState, useMemo, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
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
  ChevronDown,
  Check,
  Settings,
  LineChart as LineChartIcon,
  BarChart3 as BarChart3Icon,
} from 'lucide-react'
import { db, type Patient, type Hospital, type ProgressNote, type PoliLog, type PenunjangItem } from '../db'
import Masked from '../components/Masked'
import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'
import { formatDate, hariKe, getLocalDateString } from '../utils/dateFormat'

// Regex untuk deteksi otomatis obat yang butuh tapering atau durasi terbatas jika belum diset eksplisit
const RE_TAPER_MANITOL = /manitol|mannitol/i
const RE_TAPER_DEXA = /dexa|dexamethasone/i
const RE_DURASI_CEFTRIAXONE = /ceftriaxone|ceftri/i
const RE_DURASI_NIMODIPINE = /nimodipine|nimotop/i
const RE_DURASI_DAPT = /clopidogrel.*(?:aspirin|asetosal)|(?:aspirin|asetosal).*clopidogrel|dapt/i
const RE_LOADING = /\b(loading|bolus)\b/i
const RE_LASA = /\b(lasa|look-alike|sound-alike|high[\s-]alert)\b/i
const RE_PDX = /\b(ct\s*scan|mri|rontgen|foto\s*thorax|bacaan|radiologi|laboratorium|darah\s*lengkap|elektrolit|lumbal\s*pungsi|eeg|emg|usg|doppler|penunjang|pdx|evaluasi\s*lab|pa|patologi|ekg|biopsi)\b/i
const RE_KONSUL = /\b(konsul|rujuk|alih\s*rawat|jawaban\s*ts|ts\s*sp|evaluasi\s*ts|koordinasi\s*ts|ts\b)/i
const RE_URGENT = /\b(cito|segera|urgent|hari\s*ini|evaluasi\s*segera)\b/i

interface PlanCheckItem {
  id: string
  kategori: 'penunjang' | 'terapi'
  judul: string
  badgeLabel?: string
  badgeClass?: string
  penunjangId?: number
  noteId?: number
  itemNama?: string
  isUrgent?: boolean
}

interface PatientPlansGroup {
  patient: Patient
  penunjang: PlanCheckItem[]
  terapi: PlanCheckItem[]
  totalCount: number
  hasUrgent: boolean
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
  const [timeRange, setTimeRange] = useState<'minggu' | 'bulan' | 'tahun'>('minggu')
  const [chartType, setChartType] = useState<'area' | 'bar'>('area')

  // Multi-select Faskes untuk Grafik Tren (default [] artinya semua faskes)
  const [selectedHospitalIds, setSelectedHospitalIds] = useState<number[]>(() => {
    try {
      const s = sessionStorage.getItem('doctoid_dasbor_filter_rs_multi')
      return s ? JSON.parse(s) : []
    } catch {
      return []
    }
  })
  const [faskesDropdownOpen, setFaskesDropdownOpen] = useState(false)
  const faskesDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (faskesDropdownRef.current && !faskesDropdownRef.current.contains(e.target as Node)) {
        setFaskesDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  // Live queries dari IndexedDB (dengan default array konstan agar referensi dependensi stabil)
  const hospitals = useLiveQuery(() => db.hospitals.toArray().then(arr => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))), [], [] as Hospital[])
  const activePatients = useLiveQuery(() => db.patients.where('status_rawat').equals('aktif').toArray(), [], [] as Patient[])
  const allPatients = useLiveQuery(() => db.patients.toArray(), [], [] as Patient[])
  const allNotes = useLiveQuery(() => db.progressNotes.toArray(), [], [] as ProgressNote[])
  const poliLogs = useLiveQuery(() => db.poliLogs.toArray(), [], [] as PoliLog[])
  const allPenunjang = useLiveQuery(() => db.penunjang.toArray(), [], [] as PenunjangItem[])

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

  // Filter khusus untuk Grafik Tren Pasien (Multi-Select Faskes)
  const toggleHospital = (id: number) => {
    setSelectedHospitalIds(prev => {
      let next: number[]
      if (prev.length === 0) {
        // Sebelumnya pilih semua, sekarang uncheck faskes ini
        next = hospitals.map(h => h.id!).filter(hid => hid !== id)
      } else if (prev.includes(id)) {
        next = prev.filter(hid => hid !== id)
      } else {
        next = [...prev, id]
        if (next.length === hospitals.length) next = []
      }
      try {
        sessionStorage.setItem('doctoid_dasbor_filter_rs_multi', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const selectAllHospitals = () => {
    setSelectedHospitalIds([])
    try {
      sessionStorage.setItem('doctoid_dasbor_filter_rs_multi', JSON.stringify([]))
    } catch {}
  }

  const selectedFaskesLabel = useMemo(() => {
    if (selectedHospitalIds.length === 0 || selectedHospitalIds.length === hospitals.length) {
      return 'Semua Faskes'
    }
    if (selectedHospitalIds.length === 1) {
      const found = hospitals.find(h => h.id === selectedHospitalIds[0])
      return found?.nama || '1 Faskes'
    }
    return `${selectedHospitalIds.length} Faskes Terpilih`
  }, [selectedHospitalIds, hospitals])

  const chartFilteredPatients = useMemo(() => {
    if (selectedHospitalIds.length === 0) return allPatients
    return allPatients.filter(p => selectedHospitalIds.includes(p.hospital_id))
  }, [allPatients, selectedHospitalIds])

  const chartFilteredPoliLogs = useMemo(() => {
    if (selectedHospitalIds.length === 0) return poliLogs
    return poliLogs.filter(p => selectedHospitalIds.includes(p.hospital_id))
  }, [poliLogs, selectedHospitalIds])

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

  // ==================== DAFTAR PLANNING (PENUNJANG & TERAPI) ====================
  const [planTab, setPlanTab] = useState<'semua' | 'penunjang' | 'terapi'>('semua')
  const [completedPlanIds, setCompletedPlanIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`doctoid_completed_plans_${todayStr}`)
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [undoItem, setUndoItem] = useState<PlanCheckItem | null>(null)
  const [undoTimer, setUndoTimer] = useState<any>(null)

  const handleCompletePlan = async (item: PlanCheckItem) => {
    // 1. Tambahkan ke state dan localStorage untuk auto-dismiss instan tanpa latency
    setCompletedPlanIds(prev => {
      const next = new Set(prev)
      next.add(item.id)
      try {
        localStorage.setItem(`doctoid_completed_plans_${todayStr}`, JSON.stringify(Array.from(next)))
      } catch {}
      return next
    })

    // 2. Set timer undo (4 detik)
    if (undoTimer) clearTimeout(undoTimer)
    setUndoItem(item)
    const timer = setTimeout(() => {
      setUndoItem(null)
    }, 4000)
    setUndoTimer(timer)

    // 3. Update status pemeriksaan di db.penunjang bila berasal dari tabel penunjang
    if (item.penunjangId) {
      try {
        await db.penunjang.update(item.penunjangId, { status: 'selesai' })
      } catch (err) {
        console.error('Failed to update penunjang status:', err)
      }
    }

    // 4. Update status item di db.progressNotes bila berasal dari P note aktif
    if (item.noteId && item.itemNama) {
      try {
        const note = await db.progressNotes.get(item.noteId)
        if (note && note.P) {
          const updatedP = note.P.map(pItem => {
            if (pItem.nama_item === item.itemNama) {
              return { ...pItem, status: 'stop' as const }
            }
            return pItem
          })
          await db.progressNotes.update(item.noteId, { P: updatedP })
        }
      } catch (err) {
        console.error('Failed to update progressNote P item:', err)
      }
    }
  }

  const handleUndoComplete = async () => {
    if (!undoItem) return
    if (undoTimer) clearTimeout(undoTimer)

    // Kembalikan ke state aktif
    setCompletedPlanIds(prev => {
      const next = new Set(prev)
      next.delete(undoItem.id)
      try {
        localStorage.setItem(`doctoid_completed_plans_${todayStr}`, JSON.stringify(Array.from(next)))
      } catch {}
      return next
    })

    // Kembalikan status di db.penunjang
    if (undoItem.penunjangId) {
      try {
        await db.penunjang.update(undoItem.penunjangId, { status: 'menunggu' })
      } catch {}
    }

    // Kembalikan status di db.progressNotes
    if (undoItem.noteId && undoItem.itemNama) {
      try {
        const note = await db.progressNotes.get(undoItem.noteId)
        if (note && note.P) {
          const updatedP = note.P.map(pItem => {
            if (pItem.nama_item === undoItem.itemNama) {
              return { ...pItem, status: 'aktif' as const }
            }
            return pItem
          })
          await db.progressNotes.update(undoItem.noteId, { P: updatedP })
        }
      } catch {}
    }

    setUndoItem(null)
  }

  const patientPlansList = useMemo<PatientPlansGroup[]>(() => {
    const groups: PatientPlansGroup[] = []

    for (const p of filteredActivePatients) {
      if (!p.id) continue
      const note = patientLatestNoteMap.get(p.id)
      const seenTestNames = new Set<string>()

      const penunjang: PlanCheckItem[] = []
      const terapi: PlanCheckItem[] = []

      // 1. Pending Penunjang dari db.penunjang (status: 'menunggu')
      const pendingPenunjang = allPenunjang.filter(it => it.patient_id === p.id && it.status === 'menunggu')
      for (const item of pendingPenunjang) {
        const norm = item.nama_pemeriksaan.trim().toLowerCase()
        seenTestNames.add(norm)
        const isUrgent = RE_URGENT.test(item.nama_pemeriksaan) || /ct\s*scan|mri/i.test(item.nama_pemeriksaan)
        const itemId = `penunjang-${item.id || norm}`
        if (!completedPlanIds.has(itemId)) {
          penunjang.push({
            id: itemId,
            kategori: 'penunjang',
            judul: item.nama_pemeriksaan,
            badgeLabel: isUrgent ? 'Cito' : undefined,
            badgeClass: isUrgent ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-teal-50 text-teal-700 border border-teal-200',
            penunjangId: item.id,
            isUrgent,
          })
        }
      }

      // 2. Pasien Peran Rawat Konsul (yang belum divisite hari ini - digabung ke Terapi)
      if (p.peran_rawat === 'Konsul' && !visitedTodayPatientIds.has(p.id)) {
        const itemId = `konsul-role-${p.id}`
        if (!completedPlanIds.has(itemId)) {
          terapi.push({
            id: itemId,
            kategori: 'terapi',
            judul: p.dpjp_utama && p.dpjp_utama !== 'Neuro' ? `Konsul dari ${p.dpjp_utama}` : 'Pasien Konsulan Baru',
            isUrgent: true,
          })
        }
      }

      // 3. Dari P (Plan) pada Note Terakhir Pasien
      if (note && note.P && Array.isArray(note.P)) {
        const activeItems = note.P.filter(item => item.status === 'aktif')

        for (const t of activeItems) {
          const combined = `${t.nama_item} ${t.dosis_keterangan || ''}`.trim()
          const tglMulai = t.tracking?.tgl_mulai || t.tgl_mulai || p.tgl_mrs || todayStr
          const dayCount = hariKe(tglMulai)

          // 3a. Konsul / Rujukan TS (digabung ke Terapi, tanpa badge konsul redundant)
          if ((t.kategori as string) === 'Konsul' || RE_KONSUL.test(combined)) {
            const isUrgent = RE_URGENT.test(combined)
            const itemId = `konsul-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: isUrgent ? 'Cito' : undefined,
                badgeClass: isUrgent ? 'bg-rose-50 text-rose-700 border border-rose-200' : undefined,
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent,
              })
            }
            continue
          }

          // 3b. PDx / Penunjang (CT scan, Lab, Ro, MRI, EEG, PA, dsb)
          if (t.kategori === 'Diagnostik' || RE_PDX.test(combined)) {
            const norm = t.nama_item.trim().toLowerCase()
            if (!seenTestNames.has(norm)) {
              seenTestNames.add(norm)
              const isFollowUp = /bacaan|follow\s*up|evaluasi|menunggu|pending|ulang/i.test(combined)
              const isUrgent = isFollowUp || RE_URGENT.test(combined)
              const itemId = `pdx-${p.id}-${t.nama_item}`
              if (!completedPlanIds.has(itemId)) {
                penunjang.push({
                  id: itemId,
                  kategori: 'penunjang',
                  judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                  badgeLabel: isUrgent ? 'Cito' : undefined,
                  badgeClass: isUrgent
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-teal-50 text-teal-700 border border-teal-200',
                  noteId: note.id,
                  itemNama: t.nama_item,
                  isUrgent,
                })
              }
            }
            continue
          }

          // 3c. Explicit Tracking (Tapering / Durasi)
          if (t.tracking) {
            if (t.tracking.tipe === 'tapering') {
              const isUrgent = dayCount >= 3
              const itemId = `track-taper-${p.id}-${t.nama_item}`
              if (!completedPlanIds.has(itemId)) {
                terapi.push({
                  id: itemId,
                  kategori: 'terapi',
                  judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                  badgeLabel: `Tapering H-${dayCount}`,
                  badgeClass: isUrgent
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200',
                  noteId: note.id,
                  itemNama: t.nama_item,
                  isUrgent,
                })
              }
              continue
            } else if (t.tracking.tipe === 'durasi') {
              const target = t.tracking.target_hari || 7
              const isUrgent = dayCount >= target
              const itemId = `track-dur-${p.id}-${t.nama_item}`
              if (!completedPlanIds.has(itemId)) {
                terapi.push({
                  id: itemId,
                  kategori: 'terapi',
                  judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                  badgeLabel: `Durasi H-${dayCount}/${target}`,
                  badgeClass: isUrgent
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200',
                  noteId: note.id,
                  itemNama: t.nama_item,
                  isUrgent,
                })
              }
              continue
            }
          }

          // 3d. Loading Dose
          if (RE_LOADING.test(combined)) {
            const isUrgent = RE_URGENT.test(combined)
            const itemId = `loading-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: isUrgent ? 'Cito' : undefined,
                badgeClass: isUrgent ? 'bg-rose-50 text-rose-700 border border-rose-200' : undefined,
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent: true,
              })
            }
            continue
          }

          // 3e. LASA / High-Alert
          if (RE_LASA.test(combined)) {
            const itemId = `lasa-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: 'LASA',
                badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200',
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent: false,
              })
            }
            continue
          }

          // 3f. Deteksi Heuristik Otomatis Obat (Manitol, Dexa, Ceftriaxone, Nimodipine, DAPT)
          if (RE_TAPER_MANITOL.test(combined)) {
            const isUrgent = dayCount >= 3
            const itemId = `manitol-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: `Tapering H-${dayCount}`,
                badgeClass: isUrgent
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200',
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent,
              })
            }
            continue
          }

          if (RE_TAPER_DEXA.test(combined)) {
            const isUrgent = dayCount >= 4
            const itemId = `dexa-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: `Tapering H-${dayCount}`,
                badgeClass: isUrgent
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200',
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent,
              })
            }
            continue
          }

          if (RE_DURASI_CEFTRIAXONE.test(combined)) {
            const target = 7
            const isUrgent = dayCount >= 6
            const itemId = `ceftri-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: `Durasi H-${dayCount}/${target}`,
                badgeClass: isUrgent
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200',
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent,
              })
            }
            continue
          }

          if (RE_DURASI_NIMODIPINE.test(combined)) {
            const target = 21
            const isUrgent = dayCount >= 19
            const itemId = `nimo-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: `Durasi H-${dayCount}/${target}`,
                badgeClass: isUrgent
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200',
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent,
              })
            }
            continue
          }

          if (RE_DURASI_DAPT.test(combined)) {
            const target = 21
            const isUrgent = dayCount >= 20
            const itemId = `dapt-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: `Durasi H-${dayCount}/${target}`,
                badgeClass: isUrgent
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200',
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent,
              })
            }
            continue
          }

          // 3g. Monitoring / Tindakan Non-Farmakologi
          if (t.kategori === 'Monitoring' || (t.kategori === 'Non-Farmakologi' && /fisioterapi|rehab|kateter|ngt|aff|rawat\s*luka|mobilisasi/i.test(combined))) {
            const itemId = `tindakan-${p.id}-${t.nama_item}`
            if (!completedPlanIds.has(itemId)) {
              terapi.push({
                id: itemId,
                kategori: 'terapi',
                judul: t.nama_item + (t.dosis_keterangan ? ` (${t.dosis_keterangan})` : ''),
                badgeLabel: t.kategori === 'Monitoring' ? 'Monitoring' : 'Tindakan',
                badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
                noteId: note.id,
                itemNama: t.nama_item,
                isUrgent: false,
              })
            }
            continue
          }
        }
      }

      // 4. Catatan Bebas CPPT (note.catatan) jika ada rencana belum selesai
      if (note && note.catatan) {
        const lines = note.catatan.split('\n').map(l => l.trim()).filter(Boolean)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (/^(?:[-*•]\s*)?(rencana|plan|konsul|follow\s*up|evaluasi|usul|jadwal|target krs)/i.test(line)) {
            const clean = line.replace(/^[-*•]\s*/, '')
            const isKonsul = RE_KONSUL.test(clean)
            const isPDx = RE_PDX.test(clean)
            const isUrgent = RE_URGENT.test(clean)
            const itemId = `catatan-${p.id}-${i}`

            if (!completedPlanIds.has(itemId)) {
              if (isKonsul) {
                terapi.push({
                  id: itemId,
                  kategori: 'terapi',
                  judul: clean,
                  badgeLabel: isUrgent ? 'Cito' : undefined,
                  badgeClass: isUrgent
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : undefined,
                  isUrgent,
                })
              } else if (isPDx) {
                penunjang.push({
                  id: itemId,
                  kategori: 'penunjang',
                  judul: clean,
                  badgeLabel: isUrgent ? 'Cito' : undefined,
                  badgeClass: isUrgent
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-teal-50 text-teal-700 border border-teal-200',
                  isUrgent,
                })
              } else {
                terapi.push({
                  id: itemId,
                  kategori: 'terapi',
                  judul: clean,
                  badgeLabel: 'Rencana',
                  badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
                  isUrgent: false,
                })
              }
            }
          }
        }
      }

      const totalCount = penunjang.length + terapi.length
      const hasUrgent = penunjang.some(it => it.isUrgent) || terapi.some(it => it.isUrgent)

      if (totalCount > 0) {
        groups.push({
          patient: p,
          penunjang,
          terapi,
          totalCount,
          hasUrgent,
        })
      }
    }

    // Urutkan pasien: yang memiliki item urgent di paling atas
    return groups.sort((a, b) => (b.hasUrgent ? 1 : 0) - (a.hasUrgent ? 1 : 0))
  }, [filteredActivePatients, patientLatestNoteMap, allPenunjang, visitedTodayPatientIds, todayStr, completedPlanIds])

  // Filter kelompok pasien sesuai tab yang dipilih
  const filteredPatientPlans = useMemo(() => {
    if (planTab === 'penunjang') {
      return patientPlansList.filter(g => g.penunjang.length > 0)
    }
    if (planTab === 'terapi') {
      return patientPlansList.filter(g => g.terapi.length > 0)
    }
    return patientPlansList
  }, [patientPlansList, planTab])

  // ==================== GRAFIK TREN PASIEN (RANAP & POLI) ====================
  const chartData = useMemo(() => {
    const result = []

    if (timeRange === 'minggu' || timeRange === 'bulan') {
      const days = timeRange === 'minggu' ? 7 : 30
      const now = new Date()

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const dateKey = `${year}-${month}-${day}`

        // Hitung seluruh pasien rawat inap yang dirawat pada tanggal tersebut (sesuai faskes terpilih)
        let inapCount = 0
        for (const p of chartFilteredPatients) {
          const tglMrs = p.tgl_mrs ? p.tgl_mrs.slice(0, 10) : ''
          const tglKrs = p.tgl_krs ? p.tgl_krs.slice(0, 10) : ''

          let isInap = false
          // Cek episode rawat saat ini
          if (tglMrs && tglMrs <= dateKey) {
            if (p.status_rawat === 'aktif') {
              if (dateKey <= todayStr) isInap = true
            } else if (!tglKrs || tglKrs >= dateKey) {
              isInap = true
            }
          }

          // Cek riwayat episode rawat inap sebelumnya
          if (!isInap && p.riwayat_rawat && p.riwayat_rawat.length > 0) {
            for (const ep of p.riwayat_rawat) {
              if (selectedHospitalIds.length > 0 && !selectedHospitalIds.includes(ep.hospital_id)) continue
              const epMrs = ep.tgl_mrs ? ep.tgl_mrs.slice(0, 10) : ''
              const epKrs = ep.tgl_krs ? ep.tgl_krs.slice(0, 10) : ''
              if (epMrs && epMrs <= dateKey && (!epKrs || epKrs >= dateKey)) {
                isInap = true
                break
              }
            }
          }

          if (isInap) inapCount++
        }

        // Hitung pasien rawat jalan (poli) pada tanggal tersebut (sesuai faskes terpilih)
        let poliCount = 0
        for (const pl of chartFilteredPoliLogs) {
          if (pl.tanggal === dateKey) {
            poliCount += (pl.jumlah_pasien || 0)
          }
        }

        const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' })
        const dateLabel = timeRange === 'minggu' ? `${dayName}, ${d.getDate()}` : `${d.getDate()}/${d.getMonth() + 1}`

        result.push({
          date: dateKey,
          label: dateLabel,
          inap: inapCount,
          poli: poliCount,
          total: inapCount + poliCount,
        })
      }
    } else {
      // timeRange === 'tahun' (12 Bulan Terakhir)
      const now = new Date()
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const year = d.getFullYear()
        const monthNum = d.getMonth() + 1
        const monthPrefix = `${year}-${String(monthNum).padStart(2, '0')}`
        const lastDayOfMonth = new Date(year, monthNum, 0).getDate()
        const startOfMonth = `${monthPrefix}-01`
        const endOfMonth = `${monthPrefix}-${String(lastDayOfMonth).padStart(2, '0')}`

        // Hitung pasien rawat inap yang dirawat pada bulan tersebut (sesuai faskes terpilih)
        let inapCount = 0
        for (const p of chartFilteredPatients) {
          const tglMrs = p.tgl_mrs ? p.tgl_mrs.slice(0, 10) : ''
          const tglKrs = p.tgl_krs ? p.tgl_krs.slice(0, 10) : ''

          let isInap = false
          if (tglMrs && tglMrs <= endOfMonth) {
            if (p.status_rawat === 'aktif') {
              isInap = true
            } else if (!tglKrs || tglKrs >= startOfMonth) {
              isInap = true
            }
          }

          if (!isInap && p.riwayat_rawat && p.riwayat_rawat.length > 0) {
            for (const ep of p.riwayat_rawat) {
              if (selectedHospitalIds.length > 0 && !selectedHospitalIds.includes(ep.hospital_id)) continue
              const epMrs = ep.tgl_mrs ? ep.tgl_mrs.slice(0, 10) : ''
              const epKrs = ep.tgl_krs ? ep.tgl_krs.slice(0, 10) : ''
              if (epMrs && epMrs <= endOfMonth && (!epKrs || epKrs >= startOfMonth)) {
                isInap = true
                break
              }
            }
          }

          if (isInap) inapCount++
        }

        // Hitung pasien poli pada bulan tersebut (sesuai faskes terpilih)
        let poliCount = 0
        for (const pl of chartFilteredPoliLogs) {
          if (pl.tanggal && pl.tanggal.startsWith(monthPrefix)) {
            poliCount += (pl.jumlah_pasien || 0)
          }
        }

        const monthName = d.toLocaleDateString('id-ID', { month: 'short' })
        const label = `${monthName} ${String(year).slice(2)}`

        result.push({
          date: monthPrefix,
          label,
          inap: inapCount,
          poli: poliCount,
          total: inapCount + poliCount,
        })
      }
    }

    return result
  }, [timeRange, chartFilteredPatients, chartFilteredPoliLogs, selectedHospitalIds, todayStr])

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
    if (!unmasked) return 'Rp ••••••••'
    return 'Rp ' + num.toLocaleString('id-ID')
  }

  return (
    <main className="space-y-5 p-3.5 sm:p-5 pb-8">
      
      {/* Hero Banner: Foto Profil Dokter & Metrik Pasien */}
      <div className="glass-blue-hero rounded-3xl text-white shadow-xl overflow-hidden relative">
        <div className="flex items-stretch min-h-[148px]">
          {/* Sisi Kiri: Foto Profil Dokter (Full Height terisi rapi menyatu dengan frame) */}
          <button
            type="button"
            onClick={() => navigate('/profil')}
            title="Buka Profil Dokter"
            aria-label="Buka Profil Dokter"
            className="relative w-28 sm:w-36 shrink-0 cursor-pointer group active:scale-98 transition-all overflow-hidden bg-primary-deep/40 border-r border-white/15"
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

          {/* Sisi Kanan: Identitas Dokter + Metrik + Tombol Aksi */}
          <div className="flex-1 p-3.5 sm:p-5 flex flex-col justify-between min-w-0">
            {/* Atas: Nama Dokter & Spesialisasi */}
            <div className="min-w-0 w-full">
              <h2 className="text-sm sm:text-base font-black text-white leading-tight break-words">
                {user?.displayName || 'Dokter'}
              </h2>
              <p className="text-xs font-semibold text-white/80 leading-snug break-words mt-0.5">
                {user?.specialty || 'Spesialis Neurologi (Sp.N)'}
              </p>
            </div>

            {/* Bawah: Total Seluruh Pasien Ditangani di Kiri & Tombol Aksi Cepat di Kanan */}
            <div className="flex items-end justify-between gap-2 pt-2">
              <div className="min-w-0">
                <span className="h1 text-2xl sm:text-3xl font-black text-white leading-none tracking-tight block">
                  {totalPasienAllTime}
                </span>
                <span className="text-xs font-bold text-white/95 mt-1 tracking-wide block">
                  Total Pasien Ditangani
                </span>
              </div>

              {/* Tombol Aksi Cepat (Eye & Settings) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleMask}
                  aria-label={unmasked ? 'Sensor Identitas Pasien' : 'Tampilkan Identitas Pasien (Biometrik)'}
                  className="flex size-8 sm:size-9 cursor-pointer items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all border border-white/20"
                  title={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
                >
                  {unmasked ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/pengaturan')}
                  aria-label="Pengaturan"
                  title="Pengaturan"
                  className="flex size-8 sm:size-9 cursor-pointer items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all border border-white/20"
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

      {/* SECTION: GRAFIK TREN PASIEN (RANAP & POLI) */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs p-4 sm:p-5">
        <div className="pb-3 border-b border-slate-100 space-y-2">
          {/* Baris 1: Dropdown RS di Atas Rata Kanan */}
          <div className="flex items-center justify-end">
            {/* Dropdown Faskes Multi-Select (Di atas rata kanan) */}
            <div className="relative" ref={faskesDropdownRef}>
              <button
                type="button"
                onClick={() => setFaskesDropdownOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <span className="truncate max-w-[140px] sm:max-w-[200px]">
                  {selectedFaskesLabel}
                </span>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${faskesDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {faskesDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-60 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={selectAllHospitals}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer text-left"
                  >
                    <span>Semua Faskes</span>
                    {(selectedHospitalIds.length === 0 || selectedHospitalIds.length === hospitals.length) && (
                      <Check size={14} className="text-primary font-bold" />
                    )}
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  {hospitals.map(h => {
                    const isChecked = selectedHospitalIds.length === 0 || selectedHospitalIds.includes(h.id!)
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => toggleHospital(h.id!)}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: h.kode_warna || '#3B82F6' }}
                          />
                          <span className="truncate">{h.nama}</span>
                        </div>
                        <div className={`size-3.5 rounded-md border flex items-center justify-center transition-colors shrink-0 ml-2 ${
                          isChecked ? 'bg-primary border-primary text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {isChecked && <Check size={10} strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Baris 2: Sejajar di Bawahnya (Rentang Waktu & Ikon Mode Visual Rata Kanan) */}
          <div className="flex items-center justify-end gap-2">
            {/* Rentang Waktu: Minggu, Bulan, Tahun */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-full border border-slate-200/60">
              {(['minggu', 'bulan', 'tahun'] as const).map(tr => (
                <button
                  key={tr}
                  type="button"
                  onClick={() => setTimeRange(tr)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    timeRange === tr
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tr === 'minggu' ? 'Minggu' : tr === 'bulan' ? 'Bulan' : 'Tahun'}
                </button>
              ))}
            </div>

            {/* Visual Mode: Ikon Garis Area vs Ikon Batang (Ala Darka) */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-full border border-slate-200/60">
              <button
                type="button"
                onClick={() => setChartType('area')}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  chartType === 'area'
                    ? 'bg-white text-primary shadow-xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Grafik Garis Area"
              >
                <LineChartIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  chartType === 'bar'
                    ? 'bg-white text-primary shadow-xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Grafik Batang"
              >
                <BarChart3Icon size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="h-60 sm:h-72 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 6, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRanap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorPoli" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#14B8A6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  interval={timeRange === 'bulan' ? 3 : 0}
                  dy={4}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <div className="rounded-2xl bg-slate-900/90 backdrop-blur-md p-3 text-white shadow-xl text-xs space-y-1.5 border border-slate-700 min-w-[150px]">
                          <div className="font-bold text-slate-300 border-b border-slate-700/60 pb-1">{data.label}</div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-blue-300">
                              <span className="size-2 rounded-full bg-blue-500" />
                              Rawat Inap
                            </span>
                            <span className="font-bold">{data.inap} px</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-teal-300">
                              <span className="size-2 rounded-full bg-teal-500" />
                              Rawat Jalan
                            </span>
                            <span className="font-bold">{data.poli} px</span>
                          </div>
                          <div className="border-t border-slate-700/80 pt-1 flex items-center justify-between gap-4 font-black">
                            <span className="text-slate-200">Total:</span>
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
                  dataKey="inap"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorRanap)"
                  name="Rawat Inap"
                />
                <Area
                  type="monotone"
                  dataKey="poli"
                  stroke="#14B8A6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorPoli)"
                  name="Rawat Jalan"
                />
              </AreaChart>
            ) : (
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 6, left: -24, bottom: 0 }}
                barCategoryGap={timeRange === 'minggu' ? '20%' : timeRange === 'bulan' ? '12%' : '18%'}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  interval={timeRange === 'bulan' ? 3 : 0}
                  dy={4}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <div className="rounded-2xl bg-slate-900/90 backdrop-blur-md p-3 text-white shadow-xl text-xs space-y-1.5 border border-slate-700 min-w-[150px]">
                          <div className="font-bold text-slate-300 border-b border-slate-700/60 pb-1">{data.label}</div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-blue-300">
                              <span className="size-2 rounded-full bg-blue-500" />
                              Rawat Inap
                            </span>
                            <span className="font-bold">{data.inap} px</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-teal-300">
                              <span className="size-2 rounded-full bg-teal-500" />
                              Rawat Jalan
                            </span>
                            <span className="font-bold">{data.poli} px</span>
                          </div>
                          <div className="border-t border-slate-700/80 pt-1 flex items-center justify-between gap-4 font-black">
                            <span className="text-slate-200">Total:</span>
                            <span className="text-amber-400">{data.total} px</span>
                          </div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar
                  dataKey="inap"
                  name="Rawat Inap"
                  fill="#3B82F6"
                  stackId="pasienStack"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={timeRange === 'minggu' ? 24 : timeRange === 'bulan' ? 10 : 16}
                />
                <Bar
                  dataKey="poli"
                  name="Rawat Jalan"
                  fill="#14B8A6"
                  stackId="pasienStack"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={timeRange === 'minggu' ? 24 : timeRange === 'bulan' ? 10 : 16}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* 1 Baris Legenda Bersih & Rapi di Bawah Grafik */}
        <div className="flex items-center justify-center gap-6 pt-3 text-xs text-slate-500 font-semibold">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="size-2.5 rounded-full bg-blue-500" />
            <span>Rawat Inap</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="size-2.5 rounded-full bg-teal-500" />
            <span>Rawat Jalan</span>
          </div>
        </div>
      </div>

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
              onClick={handleToggleMask}
              className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title={unmasked ? 'Sensor Identitas & Jasa Medis' : 'Buka Sensor Identitas & Jasa Medis (Biometrik)'}
            >
              {unmasked ? <Eye size={15} /> : <EyeOff size={15} />}
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

      {/* SECTION: DAFTAR PLANNING */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-800">
              Daftar Planning
            </h2>
          </div>

          {/* Kategori Tabs: Semua, Penunjang, Terapi */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setPlanTab('semua')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                planTab === 'semua'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setPlanTab('penunjang')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                planTab === 'penunjang'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-500 hover:text-teal-800'
              }`}
            >
              Penunjang
            </button>
            <button
              type="button"
              onClick={() => setPlanTab('terapi')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                planTab === 'terapi'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-500 hover:text-amber-800'
              }`}
            >
              Terapi
            </button>
          </div>
        </div>

        {filteredPatientPlans.length === 0 ? (
          <div className="py-6 text-center text-slate-400">
            <p className="text-xs font-semibold text-slate-500">
              Tidak ada planning aktif yang menunggu tindak lanjut
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPatientPlans.map((group) => (
              <div key={group.patient.id} className="py-3.5 space-y-2">
                {/* Header Pasien: Nama dan Diagnosis Utama (Tanpa Clutter) */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/pasien/${group.patient.id}`)}
                    className="text-left group/p cursor-pointer min-w-0 flex items-center gap-1.5 flex-wrap"
                  >
                    <span className="text-xs sm:text-sm font-bold text-slate-800 group-hover/p:text-primary transition-colors">
                      <Masked value={group.patient.nama_depan || 'Pasien'} type="name" />
                    </span>
                    {group.patient.diagnosis_utama && (
                      <span className="text-xs text-slate-500 font-medium">
                        · {group.patient.diagnosis_utama}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/pasien/${group.patient.id}`)}
                    className="text-[11px] font-semibold text-primary hover:text-primary-deep flex items-center gap-0.5 shrink-0 cursor-pointer"
                  >
                    <span>Buka</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                {/* Daftar Item Checklist per Kategori */}
                <div className="space-y-2 pl-0.5">
                  {/* Penunjang: Lab, Radiologi, EEG, PA, dsb */}
                  {(planTab === 'semua' || planTab === 'penunjang') && group.penunjang.length > 0 && (
                    <div className="space-y-1">
                      {planTab === 'semua' && (
                        <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">
                          Penunjang
                        </span>
                      )}
                      <div className="space-y-1">
                        {group.penunjang.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-3 py-1 group/row">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleCompletePlan(item)}
                                className="size-4.5 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 active:scale-90 transition-all shrink-0 cursor-pointer flex items-center justify-center"
                                title="Tandai selesai"
                              />
                              <span className="text-xs font-medium text-slate-800 truncate">
                                {item.judul}
                              </span>
                            </div>
                            {item.badgeLabel && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${item.badgeClass}`}>
                                {item.badgeLabel}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Terapi: Loading, Tapering, Durasi, Konsul TS, dsb */}
                  {(planTab === 'semua' || planTab === 'terapi') && group.terapi.length > 0 && (
                    <div className="space-y-1">
                      {planTab === 'semua' && (
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                          Terapi
                        </span>
                      )}
                      <div className="space-y-1">
                        {group.terapi.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-3 py-1 group/row">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleCompletePlan(item)}
                                className="size-4.5 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 active:scale-90 transition-all shrink-0 cursor-pointer flex items-center justify-center"
                                title="Tandai selesai"
                              />
                              <span className="text-xs font-medium text-slate-800 truncate">
                                {item.judul}
                              </span>
                            </div>
                            {item.badgeLabel && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${item.badgeClass}`}>
                                {item.badgeLabel}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION: PROYEKSI PENGHASILAN / JASA MEDIS */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs p-5 space-y-2">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-sm sm:text-base font-bold text-slate-800">
            Proyeksi Jasa Medis
          </h2>
          <button
            type="button"
            onClick={handleToggleMask}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title={unmasked ? 'Sensor Identitas & Jasa Medis' : 'Buka Sensor Identitas & Jasa Medis (Biometrik)'}
          >
            {unmasked ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>

        {/* Daftar Metrik (Single Surface, Tanpa Kotak di Dalam Kotak) */}
        <div className="divide-y divide-slate-100">
          {/* Hari Ini */}
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-700 block">
                Hari Ini ({formatDate(todayStr)})
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block truncate">
                Visite: {formatRupiah(financialProjection.todayVisiteNominal)} · Poli: {formatRupiah(financialProjection.todayPoliNominal)}
              </span>
            </div>
            <div className="text-base sm:text-lg font-black text-slate-800 shrink-0 text-right">
              {formatRupiah(financialProjection.todayTotal)}
            </div>
          </div>

          {/* Bulan Ini */}
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-700 block">
                Bulan Ini (H-{financialProjection.dayOfMonth})
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Akumulasi penerimaan berjalan
              </span>
            </div>
            <div className="text-base sm:text-lg font-black text-slate-800 shrink-0 text-right">
              {formatRupiah(financialProjection.mtdTotal)}
            </div>
          </div>

          {/* Proyeksi Akhir Bulan */}
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-bold text-emerald-700 block">
                Proyeksi Akhir Bulan
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Estimasi capaian ({financialProjection.totalDaysInMonth} hari)
              </span>
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-600 shrink-0 text-right">
              {formatRupiah(financialProjection.projectedMonthEnd)}
            </div>
          </div>
        </div>

        {/* Tombol Biru Ala Docto.id */}
        <div className="pt-2">
          <Link
            to="/pengaturan?tab=manajemen"
            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-primary to-primary-deep hover:from-primary-deep hover:to-primary text-white text-xs font-bold shadow-xs hover:shadow-md active:scale-98 transition-all cursor-pointer"
          >
            <span>Atur Tarif Faskes</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* Floating Undo Notification Toast */}
      {undoItem && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <span>Planning diselesaikan</span>
          <button
            type="button"
            onClick={handleUndoComplete}
            className="text-primary-light font-bold hover:underline cursor-pointer"
          >
            Urungkan
          </button>
        </div>
      )}

    </main>
  )
}
