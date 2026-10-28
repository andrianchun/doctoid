import React, { useState, useRef } from 'react'
import {
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  type PemfisState,
  type LokalisMarker,
  generatePemfisText,
  parsePemfisFromText,
} from '../utils/pemfisParser'

interface PemfisVisualizerProps {
  value: string
  onChange: (newValue: string) => void
  label?: string
  placeholder?: string
  rows?: number
  className?: string
  highlightClass?: string
  headerRight?: React.ReactNode
}

type TabCategory = 'ttv' | 'interna' | 'lokalis' | 'neuro'

export const PemfisVisualizer: React.FC<PemfisVisualizerProps> = ({
  value,
  onChange,
  label = 'O - Pemeriksaan Fisik',
  placeholder = 'TTV, status generalis, status neurologis...',
  rows = 6,
  className = '',
  highlightClass = '',
  headerRight,
}) => {
  const [mode, setMode] = useState<'text' | 'visual'>('text')
  const [activeTab, setActiveTab] = useState<TabCategory>('ttv')
  const [state, setState] = useState<PemfisState>(() => parsePemfisFromText(value))
  const [lokalisView, setLokalisView] = useState<'anterior' | 'posterior'>('anterior')
  const [showLivePreview, setShowLivePreview] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Ketika berpindah ke mode visual, parse teks yang ada
  const handleSwitchToVisual = () => {
    const parsed = parsePemfisFromText(value)
    setState(parsed)
    setMode('visual')
  }

  // Update state dan sinkronisasi ke teks
  const updateState = (updater: (prev: PemfisState) => PemfisState) => {
    setState((prev) => {
      const next = updater(prev)
      const text = generatePemfisText(next)
      onChange(text)
      return next
    })
  }

  // Handle klik pada siluet anatomi Status Lokalis
  const handleBodyClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100)

    // Tentukan nama regio otomatis berdasarkan koordinat Y
    let region = 'Badan'
    if (y < 16) region = 'Kepala / Wajah'
    else if (y < 24) region = 'Leher'
    else if (y < 46 && x >= 30 && x <= 70) region = lokalisView === 'anterior' ? 'Thorax' : 'Punggung Atas'
    else if (y < 62 && x >= 30 && x <= 70) region = lokalisView === 'anterior' ? 'Abdomen' : 'Punggung Bawah / Pinggang'
    else if (y < 70 && x >= 35 && x <= 65) region = 'Pelvis / Gluteal'
    else if (y < 65 && (x < 30 || x > 70)) region = x < 30 ? 'Ekstremitas Superior Dextra' : 'Ekstremitas Superior Sinistra'
    else if (y >= 65) region = x < 50 ? 'Ekstremitas Inferior Dextra' : 'Ekstremitas Inferior Sinistra'

    const newMarker: LokalisMarker = {
      id: crypto.randomUUID(),
      view: lokalisView,
      x,
      y,
      region,
      jenis: 'luka',
      catatan: '',
    }

    updateState((prev) => ({
      ...prev,
      markers: [...prev.markers, newMarker],
    }))
  }

  const removeMarker = (id: string) => {
    updateState((prev) => ({
      ...prev,
      markers: prev.markers.filter((m) => m.id !== id),
    }))
  }

  const updateMarker = (id: string, updates: Partial<LokalisMarker>) => {
    updateState((prev) => ({
      ...prev,
      markers: prev.markers.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }))
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Header bar dengan Mode Switcher */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="font-bold text-xs text-slate-800 truncate">
          {label}
        </label>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Segmented Toggle: Teks vs Visual */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-semibold border border-slate-200/60">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer text-[11px] ${
                mode === 'text'
                  ? 'bg-white text-primary font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Teks
            </button>
            <button
              type="button"
              onClick={handleSwitchToVisual}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer text-[11px] ${
                mode === 'visual'
                  ? 'bg-primary text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Visual
            </button>
          </div>

          {headerRight}
        </div>
      </div>

      {/* MODE 1: TEKS TRADISIONAL */}
      {mode === 'text' && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`w-full rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none transition-colors ${highlightClass} ${className}`}
        />
      )}

      {/* MODE 2: VISUAL INTERAKTIF */}
      {mode === 'visual' && (
        <div className="border border-primary/20 rounded-2xl bg-white shadow-xs overflow-hidden flex flex-col">
          {/* Navigasi Tab (Urutan: TTV -> Interna -> Lokalis -> Neuro) */}
          <div className="flex items-center border-b border-slate-100 bg-slate-50/80 p-1.5 gap-1 overflow-x-auto text-xs font-bold no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('ttv')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'ttv'
                  ? 'bg-white text-primary shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              1. TTV & GCS
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('interna')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'interna'
                  ? 'bg-white text-primary shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              2. Status Interna
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('lokalis')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'lokalis'
                  ? 'bg-white text-primary shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>3. Status Lokalis</span>
              {state.markers.length > 0 && (
                <span className="size-4 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">
                  {state.markers.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('neuro')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'neuro'
                  ? 'bg-white text-primary shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              4. Status Neurologis
            </button>
          </div>

          {/* ISI KONTEN TAB */}
          <div className="p-3.5 space-y-4 max-h-[500px] overflow-y-auto">
            {/* TAB 1: TTV & GCS */}
            {activeTab === 'ttv' && (
              <div className="space-y-4">
                {/* GCS Card */}
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-ink">Glasgow Coma Scale (GCS)</span>
                    <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary font-bold text-xs">
                      E{state.gcs_e}V{state.gcs_v}M{state.gcs_m} ={' '}
                      {(typeof state.gcs_v === 'number' ? state.gcs_v : 1) + state.gcs_e + state.gcs_m}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* E */}
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block mb-1">Eye (E 1-4)</span>
                      <div className="grid grid-cols-4 gap-1">
                        {[1, 2, 3, 4].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => updateState((p) => ({ ...p, gcs_e: v }))}
                            className={`py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                              state.gcs_e === v
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* V */}
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block mb-1">Verbal (V 1-5 / ett)</span>
                      <div className="grid grid-cols-6 gap-1">
                        {[1, 2, 3, 4, 5, 'ett'].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => updateState((p) => ({ ...p, gcs_v: v }))}
                            className={`py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              state.gcs_v === v
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* M */}
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block mb-1">Motor (M 1-6)</span>
                      <div className="grid grid-cols-6 gap-1">
                        {[1, 2, 3, 4, 5, 6].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => updateState((p) => ({ ...p, gcs_m: v }))}
                            className={`py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              state.gcs_m === v
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* TTV Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Tekanan Darah (mmHg)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={state.td_systolic}
                        onChange={(e) => updateState((p) => ({ ...p, td_systolic: e.target.value }))}
                        className="w-full text-center text-xs font-bold border border-slate-200 rounded-lg py-1 focus:border-primary outline-none"
                        placeholder="120"
                      />
                      <span className="text-slate-400">/</span>
                      <input
                        type="text"
                        value={state.td_diastolic}
                        onChange={(e) => updateState((p) => ({ ...p, td_diastolic: e.target.value }))}
                        className="w-full text-center text-xs font-bold border border-slate-200 rounded-lg py-1 focus:border-primary outline-none"
                        placeholder="80"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Nadi / HR (x/menit)</span>
                    <input
                      type="text"
                      value={state.hr}
                      onChange={(e) => updateState((p) => ({ ...p, hr: e.target.value }))}
                      className="w-full text-center text-xs font-bold border border-slate-200 rounded-lg py-1 focus:border-primary outline-none"
                      placeholder="80"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Respirasi / RR (x/mnt)</span>
                    <input
                      type="text"
                      value={state.rr}
                      onChange={(e) => updateState((p) => ({ ...p, rr: e.target.value }))}
                      className="w-full text-center text-xs font-bold border border-slate-200 rounded-lg py-1 focus:border-primary outline-none"
                      placeholder="18"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">Suhu (°C) & SpO2 (%)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={state.suhu}
                        onChange={(e) => updateState((p) => ({ ...p, suhu: e.target.value }))}
                        className="w-full text-center text-xs font-bold border border-slate-200 rounded-lg py-1 focus:border-primary outline-none"
                        placeholder="36.5"
                      />
                      <input
                        type="text"
                        value={state.spo2}
                        onChange={(e) => updateState((p) => ({ ...p, spo2: e.target.value }))}
                        className="w-full text-center text-xs font-bold border border-slate-200 rounded-lg py-1 focus:border-primary outline-none"
                        placeholder="98%"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: STATUS INTERNA */}
            {activeTab === 'interna' && (
              <div className="space-y-3">
                {/* Kepala & Leher */}
                <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                  <span className="text-[11px] font-bold text-ink block mb-1.5">Kepala & Leher (K/L)</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateState((p) => ({ ...p, ca: !p.ca }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        state.ca ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Anemis: {state.ca ? '(+/+)' : '(-/-)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateState((p) => ({ ...p, si: !p.si }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        state.si ? 'bg-amber-50 text-amber-600 border-amber-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Ikterik: {state.si ? '(+/+)' : '(-/-)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateState((p) => ({ ...p, sianosis: !p.sianosis }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        state.sianosis ? 'bg-blue-50 text-blue-600 border-blue-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Sianosis: {state.sianosis ? '(+)' : '(-)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateState((p) => ({ ...p, kgb: !p.kgb }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        state.kgb ? 'bg-purple-50 text-purple-600 border-purple-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Pembesaran KGB: {state.kgb ? '(+)' : '(-)'}
                    </button>
                  </div>
                </div>

                {/* Thorax: Cor & Pulmo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                    <span className="text-[11px] font-bold text-ink block mb-1.5">Thorax - Jantung (Cor)</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, cor_reguler: !p.cor_reguler }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.cor_reguler ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'bg-rose-50 text-rose-600 border-rose-300'
                        }`}
                      >
                        Irama: {state.cor_reguler ? 'Reguler' : 'Irreguler'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, cor_murmur: !p.cor_murmur }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.cor_murmur ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Murmur: {state.cor_murmur ? '(+)' : '(-)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, cor_gallop: !p.cor_gallop }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.cor_gallop ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Gallop: {state.cor_gallop ? '(+)' : '(-)'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                    <span className="text-[11px] font-bold text-ink block mb-1.5">Thorax - Paru (Pulmo)</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, pulmo_vesikuler: !p.pulmo_vesikuler }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.pulmo_vesikuler ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'bg-rose-50 text-rose-600 border-rose-300'
                        }`}
                      >
                        Vesikuler: {state.pulmo_vesikuler ? '(+/+)' : '(-/-)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, pulmo_rhonki: !p.pulmo_rhonki }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.pulmo_rhonki ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Rhonki: {state.pulmo_rhonki ? '(+/+)' : '(-/-)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, pulmo_wheezing: !p.pulmo_wheezing }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.pulmo_wheezing ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Wheezing: {state.pulmo_wheezing ? '(+/+)' : '(-/-)'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Abdomen & Ekstremitas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                    <span className="text-[11px] font-bold text-ink block mb-1.5">Abdomen</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, abd_supel: !p.abd_supel }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.abd_supel ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'bg-rose-50 text-rose-600 border-rose-300'
                        }`}
                      >
                        {state.abd_supel ? 'Supel' : 'Defans / Tegang'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, abd_nt: !p.abd_nt }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.abd_nt ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Nyeri Tekan: {state.abd_nt ? '(+)' : '(-)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, abd_hepar_teraba: !p.abd_hepar_teraba }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.abd_hepar_teraba ? 'bg-amber-50 text-amber-600 border-amber-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Hepar/Lien: {state.abd_hepar_teraba ? 'Teraba' : 'ttb'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white">
                    <span className="text-[11px] font-bold text-ink block mb-1.5">Ekstremitas Interna</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, akral_hangat: !p.akral_hangat }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.akral_hangat ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'bg-rose-50 text-rose-600 border-rose-300'
                        }`}
                      >
                        Akral: {state.akral_hangat ? 'Hangat' : 'Dingin / Basah'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, crt_cepat: !p.crt_cepat }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.crt_cepat ? 'bg-emerald-50 text-emerald-600 border-emerald-300' : 'bg-rose-50 text-rose-600 border-rose-300'
                        }`}
                      >
                        CRT: {state.crt_cepat ? '< 2s' : '> 2s'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, edema_ekstremitas: !p.edema_ekstremitas }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          state.edema_ekstremitas ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Edema: {state.edema_ekstremitas ? '(+/+)' : '(-/-)'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: STATUS LOKALIS (PETA ANATOMI) */}
            {activeTab === 'lokalis' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setLokalisView('anterior')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        lokalisView === 'anterior' ? 'bg-white text-primary shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Tampak Depan (Anterior)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLokalisView('posterior')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        lokalisView === 'posterior' ? 'bg-white text-primary shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Tampak Belakang (Posterior)
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400">
                    💡 Ketuk pada tubuh untuk menaruh pin marker
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  {/* Mannequin SVG Siluet Interaktif */}
                  <div className="relative size-64 sm:size-72 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center">
                    <svg
                      ref={svgRef}
                      onClick={handleBodyClick}
                      viewBox="0 0 200 400"
                      className="size-full cursor-crosshair select-none"
                    >
                      {/* Siluet Tubuh Manusia Sederhana */}
                      <g className="fill-slate-200 stroke-slate-300 stroke-1 hover:fill-slate-300/80 transition-colors">
                        {/* Kepala & Leher */}
                        <circle cx="100" cy="35" r="22" />
                        <rect x="94" y="55" width="12" height="12" rx="2" />

                        {/* Thorax & Abdomen */}
                        <path d="M 68 67 Q 100 60 132 67 L 126 185 Q 100 190 74 185 Z" />

                        {/* Lengan Kanan & Tangan */}
                        <path d="M 66 68 Q 40 100 34 165 L 44 167 Q 50 105 72 75 Z" />
                        <circle cx="36" cy="175" r="6" />

                        {/* Lengan Kiri & Tangan */}
                        <path d="M 134 68 Q 160 100 166 165 L 156 167 Q 150 105 128 75 Z" />
                        <circle cx="164" cy="175" r="6" />

                        {/* Kaki Kanan & Kiri */}
                        <path d="M 76 185 Q 70 270 72 360 L 88 360 Q 94 270 98 188 Z" />
                        <rect x="68" y="360" width="22" height="8" rx="2" />

                        <path d="M 124 185 Q 130 270 128 360 L 112 360 Q 106 270 102 188 Z" />
                        <rect x="110" y="360" width="22" height="8" rx="2" />
                      </g>

                      {/* Render Pin Markers */}
                      {state.markers
                        .filter((m) => m.view === lokalisView)
                        .map((m) => {
                          const cx = (m.x / 100) * 200
                          const cy = (m.y / 100) * 400
                          return (
                            <g key={m.id} className="animate-in fade-in zoom-in duration-150">
                              <circle
                                cx={cx}
                                cy={cy}
                                r="8"
                                className="fill-rose-500/30 stroke-rose-500 stroke-2"
                              />
                              <circle cx={cx} cy={cy} r="4" className="fill-rose-600" />
                            </g>
                          )
                        })}
                    </svg>
                  </div>

                  {/* Daftar Marker yang Terpasang */}
                  <div className="flex-1 w-full space-y-2">
                    <span className="text-xs font-bold text-ink block">
                      Daftar Temuan Lokalis ({state.markers.length})
                    </span>

                    {state.markers.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        Belum ada penanda lesi. Ketuk bagian tubuh pada gambar manekin di samping untuk menambahkan luka, benjolan, nyeri tekan, dll.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {state.markers.map((m) => (
                          <div
                            key={m.id}
                            className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-primary">{m.region} ({m.view})</span>
                              <button
                                type="button"
                                onClick={() => removeMarker(m.id)}
                                className="text-slate-400 hover:text-rose-500 p-0.5 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] text-slate-500 block mb-0.5">Jenis Temuan:</span>
                                <select
                                  value={m.jenis}
                                  onChange={(e) => updateMarker(m.id, { jenis: e.target.value as any })}
                                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-1 outline-none"
                                >
                                  <option value="luka">Luka / Vulnus</option>
                                  <option value="nyeri">Nyeri Tekan</option>
                                  <option value="fraktur">Fraktur / Deformitas</option>
                                  <option value="benjolan">Benjolan / Tumor</option>
                                  <option value="ruam">Ruam / Eritema</option>
                                  <option value="edema">Edema</option>
                                  <option value="lainnya">Lainnya</option>
                                </select>
                              </div>

                              <div>
                                <span className="text-[10px] text-slate-500 block mb-0.5">Deskripsi Singkat:</span>
                                <input
                                  type="text"
                                  value={m.catatan}
                                  onChange={(e) => updateMarker(m.id, { catatan: e.target.value })}
                                  placeholder="mis. Vulnus laceratum 3 cm"
                                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-1 outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: STATUS NEUROLOGIS */}
            {activeTab === 'neuro' && (
              <div className="space-y-4">
                {/* 1. N. Cranialis: Wajah, Pupil, Lidah */}
                <div className="rounded-xl border border-slate-200 p-3 bg-white space-y-3">
                  <span className="text-xs font-bold text-ink block">Nervus Cranialis (N.VII, Pupil N.III, N.XII)</span>

                  {/* N. VII Wajah */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-600 block mb-1">
                      N. VII (Fasialis / Parese Wajah):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      {[
                        { id: 'normal', label: 'Wajah Simetris (Normal)' },
                        { id: 'parese_dextra_sentral', label: 'Parese Dextra (Sentral)' },
                        { id: 'parese_dextra_perifer', label: "Parese Dextra (Perifer/Bell's)" },
                        { id: 'parese_sinistra_sentral', label: 'Parese Sinistra (Sentral)' },
                        { id: 'parese_sinistra_perifer', label: "Parese Sinistra (Perifer/Bell's)" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateState((p) => ({ ...p, n7_wajah: item.id as any }))}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors text-left cursor-pointer ${
                            state.n7_wajah === item.id
                              ? 'bg-purple-100 text-purple-800 border-purple-400'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pupil & Mata */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-slate-600">Pupil & Refleks Cahaya:</span>
                        <button
                          type="button"
                          onClick={() => updateState((p) => ({ ...p, isokor: !p.isokor }))}
                          className={`text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer ${
                            state.isokor ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {state.isokor ? 'Isokor' : 'Anisokor'}
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Mata Kanan */}
                        <div className="flex flex-col items-center p-2 rounded-xl bg-slate-50 border border-slate-200 flex-1">
                          <span className="text-[10px] font-bold text-slate-500 mb-1">Kanan</span>
                          <div className="size-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-[11px] font-bold">
                            {state.pupil_kanan_mm}mm
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="7"
                            value={state.pupil_kanan_mm}
                            onChange={(e) => updateState((p) => ({ ...p, pupil_kanan_mm: parseInt(e.target.value) }))}
                            className="w-full mt-1.5 accent-primary cursor-pointer"
                          />
                        </div>

                        {/* Mata Kiri */}
                        <div className="flex flex-col items-center p-2 rounded-xl bg-slate-50 border border-slate-200 flex-1">
                          <span className="text-[10px] font-bold text-slate-500 mb-1">Kiri</span>
                          <div className="size-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-[11px] font-bold">
                            {state.pupil_kiri_mm}mm
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="7"
                            value={state.pupil_kiri_mm}
                            onChange={(e) => updateState((p) => ({ ...p, pupil_kiri_mm: parseInt(e.target.value) }))}
                            className="w-full mt-1.5 accent-primary cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="flex gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() => updateState((p) => ({ ...p, rcl_kanan: !p.rcl_kanan, rcl_kiri: !p.rcl_kiri }))}
                          className="px-2 py-1 rounded bg-slate-100 text-[11px] font-semibold text-slate-600 border border-slate-200 cursor-pointer"
                        >
                          RCL: {state.rcl_kanan ? '(+/+)' : '(-/-)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateState((p) => ({ ...p, rctl_kanan: !p.rctl_kanan, rctl_kiri: !p.rctl_kiri }))}
                          className="px-2 py-1 rounded bg-slate-100 text-[11px] font-semibold text-slate-600 border border-slate-200 cursor-pointer"
                        >
                          RCTL: {state.rctl_kanan ? '(+/+)' : '(-/-)'}
                        </button>
                      </div>
                    </div>

                    {/* N.XII Lidah */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-600 block mb-1">
                        N. XII (Hipoglosus / Deviasi Lidah):
                      </span>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: 'normal', label: 'Di Tengah' },
                          { id: 'deviasi_kanan', label: 'Deviasi Kanan' },
                          { id: 'deviasi_kiri', label: 'Deviasi Kiri' },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => updateState((p) => ({ ...p, n12_lidah: item.id as any }))}
                            className={`py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                              state.n12_lidah === item.id
                                ? 'bg-primary text-white border-primary'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Motorik 4 Kuadran */}
                <div className="rounded-xl border border-slate-200 p-3 bg-white space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink">Kekuatan Motorik 4 Ekstremitas (0 - 5)</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateState((p) => ({
                            ...p,
                            motorik_sk: 5,
                            motorik_ski: 5,
                            motorik_ik: 5,
                            motorik_iki: 5,
                          }))
                        }
                        className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                      >
                        Reset 5/5
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateState((p) => ({
                            ...p,
                            motorik_sk: 5,
                            motorik_ski: 3,
                            motorik_ik: 5,
                            motorik_iki: 3,
                          }))
                        }
                        className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-700 cursor-pointer"
                      >
                        Hemiparesis Sinistra (5/3)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto p-2 bg-slate-50 rounded-2xl border border-slate-200">
                    {/* Tangan Kanan */}
                    <div className="flex flex-col items-center p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-500 mb-1">Tangan Kanan</span>
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateState((p) => ({ ...p, motorik_sk: val }))}
                            className={`size-6 rounded font-bold text-xs cursor-pointer ${
                              state.motorik_sk === val
                                ? val >= 4
                                  ? 'bg-emerald-600 text-white'
                                  : val >= 3
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-rose-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tangan Kiri */}
                    <div className="flex flex-col items-center p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-500 mb-1">Tangan Kiri</span>
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateState((p) => ({ ...p, motorik_ski: val }))}
                            className={`size-6 rounded font-bold text-xs cursor-pointer ${
                              state.motorik_ski === val
                                ? val >= 4
                                  ? 'bg-emerald-600 text-white'
                                  : val >= 3
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-rose-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Kaki Kanan */}
                    <div className="flex flex-col items-center p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-500 mb-1">Kaki Kanan</span>
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateState((p) => ({ ...p, motorik_ik: val }))}
                            className={`size-6 rounded font-bold text-xs cursor-pointer ${
                              state.motorik_ik === val
                                ? val >= 4
                                  ? 'bg-emerald-600 text-white'
                                  : val >= 3
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-rose-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Kaki Kiri */}
                    <div className="flex flex-col items-center p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-500 mb-1">Kaki Kiri</span>
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateState((p) => ({ ...p, motorik_iki: val }))}
                            className={`size-6 rounded font-bold text-xs cursor-pointer ${
                              state.motorik_iki === val
                                ? val >= 4
                                  ? 'bg-emerald-600 text-white'
                                  : val >= 3
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-rose-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Tonus */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-slate-600">Tonus Otot:</span>
                    <div className="flex gap-1">
                      {['normotonus', 'spastik', 'hipotonus', 'rigid'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateState((p) => ({ ...p, tonus: t as any }))}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold capitalize border cursor-pointer ${
                            state.tonus === t
                              ? 'bg-primary text-white border-primary'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Sensorik & Refleks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Sensorik */}
                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white space-y-1.5">
                    <span className="text-[11px] font-bold text-ink block">Pemeriksaan Sensorik</span>
                    <div className="flex flex-col gap-1">
                      {[
                        { id: 'normal', label: 'Dalam Batas Normal' },
                        { id: 'hemi_kanan', label: 'Hemihipestesi Dextra' },
                        { id: 'hemi_kiri', label: 'Hemihipestesi Sinistra' },
                        { id: 'parahipestesi', label: 'Parahipestesi (Level Lesi)' },
                        { id: 'glove_stocking', label: 'Pola Glove & Stocking' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateState((p) => ({ ...p, sensorik_tipe: item.id as any }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold text-left border cursor-pointer ${
                            state.sensorik_tipe === item.id
                              ? 'bg-purple-100 text-purple-800 border-purple-400'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Refleks & Meningeal */}
                  <div className="rounded-xl border border-slate-200 p-2.5 bg-white space-y-2">
                    <span className="text-[11px] font-bold text-ink block">Refleks Patologis & Meningeal</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, babinski_kanan: !p.babinski_kanan }))}
                        className={`px-2 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                          state.babinski_kanan ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Babinski Dextra: {state.babinski_kanan ? '(+)' : '(-)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, babinski_kiri: !p.babinski_kiri }))}
                        className={`px-2 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                          state.babinski_kiri ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Babinski Sinistra: {state.babinski_kiri ? '(+)' : '(-)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateState((p) => ({ ...p, kaku_kuduk: !p.kaku_kuduk }))}
                        className={`px-2 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                          state.kaku_kuduk ? 'bg-rose-50 text-rose-600 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Kaku Kuduk: {state.kaku_kuduk ? '(+)' : '(-)'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* FOOTER: Live Narasi Text Preview (Dua Arah) */}
          <div className="border-t border-slate-200 bg-slate-50 p-2.5">
            <button
              type="button"
              onClick={() => setShowLivePreview(!showLivePreview)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-ink cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span>Pratinjau Hasil Catatan Rekam Medis (Auto-Generated)</span>
              </span>
              {showLivePreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showLivePreview && (
              <div className="mt-2 p-2 rounded-xl bg-white border border-slate-200 text-[11px] font-mono leading-relaxed text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {value || generatePemfisText(state)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
