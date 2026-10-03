import { useState, useMemo } from 'react'
import {
  type ProgressNote,
  type ClinicalMetrics,
} from '../db'
import { extractClinicalMetrics } from '../utils/clinicalExtractor'
import { formatDate } from '../utils/dateFormat'
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  HeartPulse,
  Flame,
  CheckCircle2,
  Info,
} from 'lucide-react'

interface ClinicalTrendingViewProps {
  notes: ProgressNote[]
}

interface TrendPoint {
  date: string
  noteId?: number
  metrics: ClinicalMetrics
}

export default function ClinicalTrendingView({ notes }: ClinicalTrendingViewProps) {
  const [activeMetricTab, setActiveMetricTab] = useState<'ttv' | 'gcs' | 'motorik' | 'gejala'>('ttv')

  // Sort notes chronologically (oldest to newest for trend analysis)
  const timelineData: TrendPoint[] = useMemo(() => {
    const sorted = [...notes].sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime())
    return sorted.map((n) => ({
      date: n.tanggal,
      noteId: n.id,
      metrics: n.metrics || extractClinicalMetrics(n),
    }))
  }, [notes])

  // Valid points for TTV
  const ttvPoints = useMemo(() => {
    return timelineData.filter((p) => p.metrics.ttv?.td_systolic || p.metrics.ttv?.spo2 || p.metrics.ttv?.hr)
  }, [timelineData])

  // Valid points for GCS
  const gcsPoints = useMemo(() => {
    return timelineData.filter((p) => p.metrics.gcs?.total !== undefined)
  }, [timelineData])

  // Valid points for Motorik
  const motorikPoints = useMemo(() => {
    return timelineData.filter((p) => p.metrics.motorik?.raw)
  }, [timelineData])

  // Unique symptoms tracked across all notes
  const symptomList = useMemo(() => {
    const names = new Set<string>()
    for (const p of timelineData) {
      if (p.metrics.gejala) {
        for (const g of p.metrics.gejala) {
          names.add(g.nama)
        }
      }
    }
    return Array.from(names)
  }, [timelineData])

  // Latest vs previous for delta computation
  const latestTtv = ttvPoints[ttvPoints.length - 1]?.metrics.ttv
  const prevTtv = ttvPoints.length >= 2 ? ttvPoints[ttvPoints.length - 2]?.metrics.ttv : undefined

  const latestGcs = gcsPoints[gcsPoints.length - 1]?.metrics.gcs
  const prevGcs = gcsPoints.length >= 2 ? gcsPoints[gcsPoints.length - 2]?.metrics.gcs : undefined

  const latestMotorik = motorikPoints[motorikPoints.length - 1]?.metrics.motorik

  if (timelineData.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-6 text-center space-y-2">
        <Activity size={32} className="mx-auto text-ink-muted/50" />
        <p className="text-sm font-bold text-ink">Belum Ada Riwayat Klinis</p>
        <p className="text-xs text-ink-muted max-w-sm mx-auto">
          Catatan perkembangan CPPT atau visite harian belum tersedia untuk pasien ini.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Kartu Ringkasan Tanda Vital & Status Terakhir */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* GCS Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-3.5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-semibold flex items-center gap-1">
              <Brain size={13} className="text-violet-600" /> Kesadaran
            </span>
            {latestGcs && prevGcs && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                (latestGcs.total || 0) > (prevGcs.total || 0)
                  ? 'text-emerald-600'
                  : (latestGcs.total || 0) < (prevGcs.total || 0)
                  ? 'text-rose-600'
                  : 'text-slate-500'
              }`}>
                {(latestGcs.total || 0) > (prevGcs.total || 0) ? (
                  <TrendingUp size={12} />
                ) : (latestGcs.total || 0) < (prevGcs.total || 0) ? (
                  <TrendingDown size={12} />
                ) : (
                  <Minus size={12} />
                )}
                {Math.abs((latestGcs.total || 0) - (prevGcs.total || 0))}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="text-lg font-bold text-ink">
              {latestGcs?.total ? `GCS ${latestGcs.total}` : '—'}
            </p>
            {latestGcs?.raw && (
              <span className="text-[11px] font-mono text-ink-muted/80">({latestGcs.raw})</span>
            )}
          </div>
          <p className="text-[10px] font-medium text-slate-400">
            {latestGcs?.total === 15 ? 'Compos Mentis' : latestGcs?.total ? 'Penurunan Kesadaran' : 'Belum diukur'}
          </p>
        </div>

        {/* Tekanan Darah (TD) Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-3.5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-semibold flex items-center gap-1">
              <Activity size={13} className="text-primary" /> Tensi (TD)
            </span>
            {latestTtv?.td_systolic && prevTtv?.td_systolic && (
              <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                latestTtv.td_systolic < prevTtv.td_systolic
                  ? 'text-emerald-600'
                  : latestTtv.td_systolic > prevTtv.td_systolic
                  ? 'text-rose-600'
                  : 'text-slate-500'
              }`}>
                {latestTtv.td_systolic < prevTtv.td_systolic ? 'Turun' : latestTtv.td_systolic > prevTtv.td_systolic ? 'Naik' : 'Tetap'}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-lg font-bold text-ink">
              {latestTtv?.td_raw || (latestTtv?.td_systolic ? `${latestTtv.td_systolic}/${latestTtv.td_diastolic}` : '—')}
            </p>
            <span className="text-[10px] text-ink-muted">mmHg</span>
          </div>
          <p className="text-[10px] font-medium text-slate-400">
            {latestTtv?.td_systolic
              ? latestTtv.td_systolic >= 180 || (latestTtv.td_diastolic && latestTtv.td_diastolic >= 110)
                ? 'Krisis Hipertensi'
                : latestTtv.td_systolic >= 140
                ? 'Hipertensi'
                : 'Terkontrol'
              : 'Belum diukur'}
          </p>
        </div>

        {/* SpO2 Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-3.5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-semibold flex items-center gap-1">
              <HeartPulse size={13} className="text-sky-600" /> SpO2 & Nadi
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="text-lg font-bold text-ink">
              {latestTtv?.spo2 ? `${latestTtv.spo2}%` : '—'}
            </p>
            {latestTtv?.hr && (
              <span className="text-[11px] font-bold text-slate-500">
                · {latestTtv.hr} <span className="text-[9px] font-normal">x/m</span>
              </span>
            )}
          </div>
          <p className="text-[10px] font-medium text-slate-400">
            {latestTtv?.spo2 ? (latestTtv.spo2 >= 95 ? 'Normal (>=95%)' : 'Desaturasi (<95%)') : 'Belum diukur'}
          </p>
        </div>

        {/* Motorik Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-3.5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-semibold flex items-center gap-1">
              <Flame size={13} className="text-amber-600" /> Kekuatan Motorik
            </span>
          </div>
          <p className="text-base font-bold font-mono text-ink truncate">
            {latestMotorik?.raw || '—'}
          </p>
          <p className="text-[10px] font-medium text-slate-400">
            {latestMotorik?.raw ? (latestMotorik.raw.includes('5555/5555') || latestMotorik.raw === '5/5' ? 'Penuh (5555)' : 'Defisit Paresis') : 'Belum dievaluasi'}
          </p>
        </div>
      </div>

      {/* Tab Navigasi Tren */}
      <div className="glass-card rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-ink">Visualisasi Progresi Klinis</h3>
              <p className="text-[10px] text-ink-muted">Analisis tren data obyektif & subjektif antar hari</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-surface p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setActiveMetricTab('ttv')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                activeMetricTab === 'ttv'
                  ? 'bg-white text-primary shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              TTV (Tensi/Nadi)
            </button>
            <button
              type="button"
              onClick={() => setActiveMetricTab('gcs')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                activeMetricTab === 'gcs'
                  ? 'bg-white text-violet-700 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              GCS
            </button>
            <button
              type="button"
              onClick={() => setActiveMetricTab('motorik')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                activeMetricTab === 'motorik'
                  ? 'bg-white text-amber-700 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Motorik
            </button>
            <button
              type="button"
              onClick={() => setActiveMetricTab('gejala')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                activeMetricTab === 'gejala'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Gejala (+/-)
            </button>
          </div>
        </div>

        {/* Content 1: TTV Chart (Tekanan Darah & HR) */}
        {activeMetricTab === 'ttv' && (
          <div className="space-y-4">
            {ttvPoints.length >= 2 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-ink-muted">
                  <span className="font-semibold text-ink">Grafik Tekanan Darah (Sistolik & Diastolik)</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[10px]">
                      <span className="size-2 rounded-full bg-primary" /> Sistolik
                    </span>
                    <span className="flex items-center gap-1 text-[10px]">
                      <span className="size-2 rounded-full bg-sky-400" /> Diastolik
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span className="w-3 border-t border-dashed border-rose-400" /> Target &lt;140/90
                    </span>
                  </div>
                </div>

                {/* Inline SVG Chart */}
                <div className="relative w-full h-48 bg-slate-50/70 rounded-2xl p-4 border border-slate-100 overflow-hidden">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 140" preserveAspectRatio="none">
                    {/* Grid lines */}
                    <line x1="0" y1="20" x2="500" y2="20" stroke="#e2e8f0" strokeDasharray="3 3" />
                    <line x1="0" y1="55" x2="500" y2="55" stroke="#fca5a5" strokeDasharray="4 4" strokeWidth="1" />
                    <line x1="0" y1="90" x2="500" y2="90" stroke="#e2e8f0" strokeDasharray="3 3" />
                    <line x1="0" y1="125" x2="500" y2="125" stroke="#cbd5e1" strokeWidth="1" />

                    {/* Left Axis Labels */}
                    <text x="5" y="24" fontSize="9" fill="#94a3b8" fontFamily="monospace">180</text>
                    <text x="5" y="58" fontSize="9" fill="#f87171" fontFamily="monospace">140</text>
                    <text x="5" y="93" fontSize="9" fill="#94a3b8" fontFamily="monospace">90</text>
                    <text x="5" y="128" fontSize="9" fill="#94a3b8" fontFamily="monospace">60</text>

                    {/* Target line label */}
                    <text x="440" y="52" fontSize="8" fill="#f87171" fontWeight="bold">HT: 140</text>

                    {/* Compute points for Sistolik & Diastolik */}
                    {(() => {
                      const count = ttvPoints.length
                      const step = count > 1 ? 440 / (count - 1) : 440
                      const minVal = 50
                      const maxVal = 200
                      const range = maxVal - minVal

                      const getY = (val?: number) => {
                        if (!val) return 125
                        const clamped = Math.max(minVal, Math.min(maxVal, val))
                        return 130 - ((clamped - minVal) / range) * 115
                      }

                      const sysCoords = ttvPoints.map((p, i) => ({
                        x: 40 + i * step,
                        y: getY(p.metrics.ttv?.td_systolic),
                        val: p.metrics.ttv?.td_systolic,
                        date: p.date,
                      }))

                      const diaCoords = ttvPoints.map((p, i) => ({
                        x: 40 + i * step,
                        y: getY(p.metrics.ttv?.td_diastolic),
                        val: p.metrics.ttv?.td_diastolic,
                        date: p.date,
                      }))

                      const sysPath = sysCoords.reduce(
                        (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`,
                        ''
                      )
                      const diaPath = diaCoords.reduce(
                        (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`,
                        ''
                      )

                      return (
                        <>
                          {/* Lines */}
                          <path d={diaPath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                          <path d={sysPath} fill="none" stroke="#105891" strokeWidth="3" strokeLinecap="round" />

                          {/* Data points */}
                          {sysCoords.map((pt, i) => (
                            <g key={`sys-${i}`}>
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="4"
                                fill="#105891"
                                stroke="#ffffff"
                                strokeWidth="2"
                              />
                              <text
                                x={pt.x}
                                y={pt.y - 8}
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight="bold"
                                fill="#105891"
                              >
                                {pt.val}
                              </text>
                            </g>
                          ))}

                          {diaCoords.map((pt, i) => (
                            <g key={`dia-${i}`}>
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="3.5"
                                fill="#38bdf8"
                                stroke="#ffffff"
                                strokeWidth="2"
                              />
                              <text
                                x={pt.x}
                                y={pt.y + 12}
                                textAnchor="middle"
                                fontSize="8"
                                fontWeight="bold"
                                fill="#0284c7"
                              >
                                {pt.val}
                              </text>
                            </g>
                          ))}

                          {/* Bottom Date labels */}
                          {sysCoords.map((pt, i) => (
                            <text
                              key={`lbl-${i}`}
                              x={pt.x}
                              y="138"
                              textAnchor="middle"
                              fontSize="8"
                              fill="#64748b"
                            >
                              {formatDate(pt.date).slice(0, 5)}
                            </text>
                          ))}
                        </>
                      )
                    })()}
                  </svg>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-ink-muted border border-slate-100 space-y-1">
                <Info size={18} className="mx-auto text-primary" />
                <p className="font-semibold text-ink">Grafik membutuhkan minimal 2 catatan visite</p>
                <p className="text-[11px]">
                  Catat visite hari ini atau impor foto CPPT untuk melihat garis grafik fluktuasi tensi.
                </p>
              </div>
            )}

            {/* Riwayat TTV Tabel Ringkas */}
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50/80 text-[11px] font-bold text-ink-muted border-b border-slate-100">
                  <tr>
                    <th className="py-2 px-3">Tanggal</th>
                    <th className="py-2 px-3">Tensi (TD)</th>
                    <th className="py-2 px-3">Nadi (HR)</th>
                    <th className="py-2 px-3">Nafas (RR)</th>
                    <th className="py-2 px-3">SpO2</th>
                    <th className="py-2 px-3">Suhu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...ttvPoints].reverse().map((p, idx) => {
                    const t = p.metrics.ttv
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-semibold text-ink">
                          {formatDate(p.date)}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-primary">
                          {t?.td_raw || (t?.td_systolic ? `${t.td_systolic}/${t.td_diastolic}` : '—')}
                        </td>
                        <td className="py-2 px-3">
                          {t?.hr ? `${t.hr} x/m` : '—'}
                        </td>
                        <td className="py-2 px-3">
                          {t?.rr ? `${t.rr} x/m` : '—'}
                        </td>
                        <td className="py-2 px-3">
                          {t?.spo2 ? (
                            <span className={`font-semibold ${t.spo2 < 95 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {t.spo2}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2 px-3">
                          {t?.suhu ? `${t.suhu} °C` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Content 2: GCS Progression */}
        {activeMetricTab === 'gcs' && (
          <div className="space-y-4">
            {gcsPoints.length >= 2 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-ink-muted">
                  <span className="font-semibold text-ink">Trajektori Skor GCS (Glasgow Coma Scale)</span>
                  <span className="text-[10px] text-slate-400">Target Normal: 15 (E4V5M6)</span>
                </div>

                <div className="relative w-full h-44 bg-violet-50/40 rounded-2xl p-4 border border-violet-100 overflow-hidden">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 130" preserveAspectRatio="none">
                    {/* Horizontal reference bands */}
                    <line x1="0" y1="20" x2="500" y2="20" stroke="#cbd5e1" strokeDasharray="3 3" />
                    <line x1="0" y1="65" x2="500" y2="65" stroke="#cbd5e1" strokeDasharray="3 3" />
                    <line x1="0" y1="110" x2="500" y2="110" stroke="#cbd5e1" strokeDasharray="3 3" />

                    <text x="5" y="24" fontSize="9" fill="#64748b" fontFamily="monospace">15</text>
                    <text x="5" y="69" fontSize="9" fill="#64748b" fontFamily="monospace">9</text>
                    <text x="5" y="114" fontSize="9" fill="#64748b" fontFamily="monospace">3</text>

                    {(() => {
                      const count = gcsPoints.length
                      const step = count > 1 ? 440 / (count - 1) : 440
                      const minVal = 3
                      const maxVal = 15
                      const range = maxVal - minVal

                      const getY = (val = 15) => {
                        const clamped = Math.max(minVal, Math.min(maxVal, val))
                        return 115 - ((clamped - minVal) / range) * 95
                      }

                      const pts = gcsPoints.map((p, i) => ({
                        x: 40 + i * step,
                        y: getY(p.metrics.gcs?.total),
                        val: p.metrics.gcs?.total || 15,
                        raw: p.metrics.gcs?.raw || '',
                        date: p.date,
                      }))

                      const pathStr = pts.reduce(
                        (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`,
                        ''
                      )

                      return (
                        <>
                          <path d={pathStr} fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" />

                          {pts.map((pt, i) => (
                            <g key={`gcs-${i}`}>
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="4.5"
                                fill="#7c3aed"
                                stroke="#ffffff"
                                strokeWidth="2"
                              />
                              <text
                                x={pt.x}
                                y={pt.y - 8}
                                textAnchor="middle"
                                fontSize="10"
                                fontWeight="bold"
                                fill="#6d28d9"
                              >
                                {pt.val}
                              </text>
                              <text
                                x={pt.x}
                                y="126"
                                textAnchor="middle"
                                fontSize="8"
                                fill="#64748b"
                              >
                                {formatDate(pt.date).slice(0, 5)}
                              </text>
                            </g>
                          ))}
                        </>
                      )
                    })()}
                  </svg>
                </div>
              </div>
            ) : null}

            {/* Riwayat Detail GCS */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink">Riwayat Pemeriksaan Kesadaran Harian</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[...gcsPoints].reverse().map((p, idx) => {
                  const g = p.metrics.gcs
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-white/70">
                      <div>
                        <p className="text-xs font-bold text-ink">{formatDate(p.date)}</p>
                        <p className="text-[11px] text-ink-muted">
                          {g?.e ? `E${g.e} V${g.v} M${g.m}` : g?.raw || 'Kesadaran compos mentis'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
                          (g?.total || 15) >= 14
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : (g?.total || 15) >= 9
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          GCS {g?.total || 15}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Content 3: Matriks Progresi Motorik */}
        {activeMetricTab === 'motorik' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink">Matriks Evaluasi Kekuatan Otot (4 Ekstremitas)</span>
              <span className="text-[11px] text-ink-muted">Skala 0 s/d 5 (Plegia &rarr; Normal)</span>
            </div>

            {motorikPoints.length > 0 ? (
              <div className="space-y-2.5">
                {[...motorikPoints].reverse().map((p, idx) => {
                  const m = p.metrics.motorik
                  return (
                    <div key={idx} className="rounded-2xl border border-slate-100 bg-surface/40 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink">{formatDate(p.date)}</span>
                        <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded-lg bg-white border border-slate-200">
                          {m?.raw}
                        </span>
                      </div>

                      {/* 4 Quadrants Visual representation */}
                      <div className="grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-white border border-slate-100 space-y-0.5">
                          <p className="text-[10px] text-slate-400 font-semibold">Tangan Kanan (Sup Ka)</p>
                          <p className="text-sm font-bold font-mono text-ink">
                            {m?.superior_kanan || '5'}
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-slate-100 space-y-0.5">
                          <p className="text-[10px] text-slate-400 font-semibold">Tangan Kiri (Sup Ki)</p>
                          <p className="text-sm font-bold font-mono text-ink">
                            {m?.superior_kiri || '5'}
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-slate-100 space-y-0.5">
                          <p className="text-[10px] text-slate-400 font-semibold">Kaki Kanan (Inf Ka)</p>
                          <p className="text-sm font-bold font-mono text-ink">
                            {m?.inferior_kanan || '5'}
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-slate-100 space-y-0.5">
                          <p className="text-[10px] text-slate-400 font-semibold">Kaki Kiri (Inf Ki)</p>
                          <p className="text-sm font-bold font-mono text-ink">
                            {m?.inferior_kiri || '5'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-ink-muted border border-slate-100">
                Pemeriksaan fisik motorik belum tercatat pada catatan CPPT pasien.
              </div>
            )}
          </div>
        )}

        {/* Content 4: Matriks Evaluasi Keluhan & Gejala (+ / -) */}
        {activeMetricTab === 'gejala' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink">Matriks Evaluasi Keluhan Subjektif Pasien</span>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                  (+) Ada
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  (-) Nihil
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                  Membaik
                </span>
              </div>
            </div>

            {symptomList.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/80 text-[11px] font-bold text-ink-muted border-b border-slate-100">
                    <tr>
                      <th className="py-2.5 px-3 whitespace-nowrap">Keluhan / Gejala</th>
                      {timelineData.map((tp, idx) => (
                        <th key={idx} className="py-2.5 px-2.5 text-center whitespace-nowrap">
                          {formatDate(tp.date).slice(0, 5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {symptomList.map((symName, sIdx) => (
                      <tr key={sIdx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-semibold text-ink whitespace-nowrap">
                          {symName}
                        </td>
                        {timelineData.map((tp, tIdx) => {
                          const item = tp.metrics.gejala?.find((g) => g.nama === symName)
                          if (!item) {
                            return (
                              <td key={tIdx} className="py-2 px-2 text-center text-slate-300 font-mono">
                                —
                              </td>
                            )
                          }
                          const isPos = item.status === '+'
                          const isMembaik = item.keterangan?.includes('Membaik')
                          return (
                            <td key={tIdx} className="py-2 px-2 text-center whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                isMembaik
                                  ? 'bg-amber-100 text-amber-800'
                                  : isPos
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {isMembaik ? 'Membaik' : isPos ? '(+) Ada' : '(-) Nihil'}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-ink-muted border border-slate-100 space-y-1">
                <CheckCircle2 size={18} className="mx-auto text-emerald-500" />
                <p className="font-semibold text-ink">Belum ada evaluasi keluhan khusus (+/-)</p>
                <p className="text-[11px]">
                  Evaluasi keluhan visite (misal: "mual -", "pusing (+)", "lemah tangan kiri membaik") akan otomatis tercatat di sini.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
