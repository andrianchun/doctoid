import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronLeft, Plus, Trash2, Building, Copy, ChevronDown, ChevronUp,
  Edit2, Check, GripVertical, Calendar, Clock,
  Sparkles, ShieldCheck, Eye, EyeOff, CheckCircle2, HelpCircle
} from 'lucide-react'
import { db } from '../db'
import { PALETTE } from '../store'
import SecuritySection from '../components/SecuritySection'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getStoredDateFormat, getStoredTimeFormat, saveDateFormat, saveTimeFormat, type DateFormat, type TimeFormat } from '../utils/dateFormat'

const AVAILABLE_ICONS = [
  { path: '/icons/hospital.png', label: 'Rumah Sakit' },
  { path: '/icons/clinic.png', label: 'Klinik' },
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Warna ${c}`}
          className={`size-6 cursor-pointer rounded-full transition-transform ${value === c ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'hover:scale-105'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

function ApiKeyCard({ notify }: { notify: (m: string) => void }) {
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('doctoid_gemini_key') ?? '')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    localStorage.setItem('doctoid_gemini_key', geminiKey.trim())
    setSaved(true)
    notify('Kunci API Gemini berhasil disimpan ✓')
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-primary/10 border border-primary/20 p-4">
        <Sparkles size={20} className="text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-ink space-y-1">
          <p className="font-bold text-primary-deep">Google Gemini AI Engine</p>
          <p className="text-ink-muted leading-relaxed">
            Kunci API disimpan secara aman di perangkat lokal Anda (Local Encrypted Storage) dan tidak pernah dikirimkan ke server pihak ketiga manapun.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-bold text-ink">
          Google Gemini API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full rounded-2xl border border-surface bg-surface/80 pl-4 pr-12 py-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-ink cursor-pointer"
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          <HelpCircle size={14} /> Dapatkan API Key Gratis di Google AI Studio
        </a>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
        >
          {saved ? <CheckCircle2 size={16} /> : null}
          <span>{saved ? 'Tersimpan' : 'Simpan Kunci API'}</span>
        </button>
      </div>
    </div>
  )
}

function WardItem({ ward, notify }: { ward: any, notify: (m: string) => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(ward.nama)
  
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ward.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  }

  const handleSave = async () => {
    if (!name.trim()) return
    await db.wards.update(ward.id, { nama: name.trim() })
    setIsEditing(false)
    notify('Nama ruangan diperbarui ✓')
  }

  const handleCopy = async () => {
    await db.wards.add({
      hospital_id: ward.hospital_id,
      nama: `${ward.nama} (Copy)`,
      kode_warna: ward.kode_warna,
      order: (ward.order ?? 0) + 1
    })
    notify('Ruangan diduplikasi ✓')
  }

  return (
    <div ref={setNodeRef} style={style} className={`flex flex-col gap-2 rounded-2xl bg-card border border-surface p-3 shadow-xs transition-all ${isDragging ? 'shadow-xl relative' : ''}`}>
      {isEditing ? (
        <div className="flex flex-col gap-2 p-1">
          <input 
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Nama ruangan…"
            className="w-full rounded-xl border border-primary/40 bg-surface px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex items-center justify-end gap-2">
            <button 
              type="button" 
              onClick={() => { setIsEditing(false); setName(ward.nama) }} 
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Batal
            </button>
            <button 
              type="button" 
              onClick={handleSave} 
              className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-deep"
            >
              Simpan
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab text-ink-muted/50 hover:text-ink p-1 touch-none">
            <GripVertical size={16} />
          </button>
          
          <span className="size-3 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: ward.kode_warna }} />
          
          <span className="flex-1 text-xs font-bold text-ink truncate">{ward.nama}</span>
          
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setIsEditing(true)} title="Ubah Nama" className="p-1.5 text-ink-muted hover:text-primary hover:bg-surface rounded-xl transition-colors cursor-pointer"><Edit2 size={14} /></button>
            <button onClick={handleCopy} title="Duplikat" className="p-1.5 text-ink-muted hover:text-blue-500 hover:bg-surface rounded-xl transition-colors cursor-pointer"><Copy size={14} /></button>
            <button 
              onClick={async () => {
                if (window.confirm(`Hapus ruangan "${ward.nama}"?`)) {
                  await db.wards.delete(ward.id)
                  notify('Ruangan dihapus')
                }
              }} 
              title="Hapus" 
              className="p-1.5 text-ink-muted hover:text-red-500 hover:bg-surface rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function HospitalAccordion({ hospital, notify }: { hospital: any, notify: (m: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(hospital.nama)
  const [color, setColor] = useState(hospital.kode_warna)
  const [icon, setIcon] = useState(hospital.icon || '/icons/hospital.png')
  
  const [newWardName, setNewWardName] = useState('')
  const [newWardColor, setNewWardColor] = useState(PALETTE[1])

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: hospital.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  }

  const wards = useLiveQuery(
    async () => (await db.wards.where('hospital_id').equals(hospital.id).toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [hospital.id],
    []
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  )

  const handleSaveHospital = async () => {
    if (!name.trim()) return
    await db.hospitals.update(hospital.id, {
      nama: name.trim(),
      kode_warna: color,
      icon: icon
    })
    setIsEditing(false)
    notify('Faskes diperbarui ✓')
  }

  const handleCopyRs = async () => {
    const newHId = await db.hospitals.add({
      nama: `${hospital.nama} (Copy)`,
      kode_warna: hospital.kode_warna,
      icon: hospital.icon,
      order: (hospital.order ?? 0) + 1
    })
    if (wards && wards.length > 0) {
      for (const w of wards) {
        await db.wards.add({
          hospital_id: newHId as number,
          nama: w.nama,
          kode_warna: w.kode_warna,
          order: w.order
        })
      }
    }
    notify('Faskes beserta ruangan diduplikasi ✓')
  }

  const handleDeleteRs = async () => {
    if (window.confirm(`Hapus faskes "${hospital.nama}" beserta seluruh ruangannya?`)) {
      await db.wards.where('hospital_id').equals(hospital.id).delete()
      await db.hospitals.delete(hospital.id)
      notify('Faskes dan seluruh ruangannya dihapus')
    }
  }

  const handleAddWard = async () => {
    if (!newWardName.trim()) return
    await db.wards.add({
      hospital_id: hospital.id,
      nama: newWardName.trim(),
      kode_warna: newWardColor,
      order: (wards?.length ?? 0) + 1
    })
    setNewWardName('')
    notify('Ruangan baru ditambahkan ✓')
  }

  const handleDragEndWards = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id && wards) {
      const oldIndex = wards.findIndex(w => w.id === active.id)
      const newIndex = wards.findIndex(w => w.id === over.id)
      const newOrder = arrayMove(wards, oldIndex, newIndex)
      
      for (let i = 0; i < newOrder.length; i++) {
        await db.wards.update(newOrder[i].id!, { order: i + 1 })
      }
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-3xl border border-surface bg-card shadow-sm overflow-hidden transition-all">
      {isEditing ? (
        <div className="p-4 bg-surface/40 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 bg-surface p-1 rounded-xl border border-surface">
              {AVAILABLE_ICONS.map((ic) => (
                <button
                  key={ic.path}
                  type="button"
                  onClick={() => setIcon(ic.path)}
                  className={`p-1 rounded-lg transition-all ${icon === ic.path ? 'bg-primary/20 ring-2 ring-primary' : 'opacity-60 hover:opacity-100'}`}
                >
                  <img src={ic.path} alt={ic.label} className="size-5 object-contain" />
                </button>
              ))}
            </div>
            <input 
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama Rumah Sakit / Klinik…"
              className="flex-1 rounded-xl border border-primary/40 bg-card px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-surface/80">
            <ColorPicker value={color} onChange={setColor} />
            <div className="flex items-center gap-2 self-end">
              <button 
                type="button" 
                onClick={() => { setIsEditing(false); setName(hospital.nama); setColor(hospital.kode_warna) }} 
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={handleSaveHospital} 
                className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-deep cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-surface/30 transition-colors" onClick={() => setIsOpen(!isOpen)}>
          <button {...attributes} {...listeners} className="cursor-grab text-ink-muted/50 hover:text-ink p-1 touch-none" onClick={e => e.stopPropagation()}>
            <GripVertical size={18} />
          </button>

          <div className="relative size-10 rounded-2xl flex items-center justify-center shrink-0 shadow-xs" style={{ backgroundColor: `${hospital.kode_warna}15` }}>
            {hospital.icon ? (
              <img src={hospital.icon} alt="Icon" className="size-6 object-contain" />
            ) : (
              <Building size={20} style={{ color: hospital.kode_warna }} />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card" style={{ backgroundColor: hospital.kode_warna }} />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-ink truncate">{hospital.nama}</h4>
            <p className="caption text-ink-muted">{wards.length} Ruangan</p>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsEditing(true)} title="Ubah Nama" className="p-1.5 text-ink-muted hover:text-primary hover:bg-surface rounded-xl transition-colors cursor-pointer"><Edit2 size={15} /></button>
            <button onClick={handleCopyRs} title="Duplikat" className="p-1.5 text-ink-muted hover:text-blue-500 hover:bg-surface rounded-xl transition-colors cursor-pointer"><Copy size={15} /></button>
            <button onClick={handleDeleteRs} title="Hapus" className="p-1.5 text-ink-muted hover:text-red-500 hover:bg-surface rounded-xl transition-colors cursor-pointer"><Trash2 size={15} /></button>
            <div className="w-px h-5 bg-surface mx-1" />
            <button className="p-1.5 text-ink-muted cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="p-4 border-t border-surface bg-surface/20 cursor-default" onClick={e => e.stopPropagation()}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndWards}>
            <SortableContext items={wards.map(w => w.id!)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 mb-4">
                {wards.length === 0 && <p className="caption text-ink-muted text-center py-2">Belum ada ruangan di faskes ini.</p>}
                {wards.map(w => <WardItem key={w.id} ward={w} notify={notify} />)}
              </div>
            </SortableContext>
          </DndContext>

          <div className="bg-card rounded-2xl p-3 border border-surface shadow-xs space-y-2">
            <h5 className="caption font-bold text-ink-muted">Tambah Ruangan Baru</h5>
            <input
              value={newWardName}
              onChange={(e) => setNewWardName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddWard()}
              placeholder="Nama ruangan (mis: ICU, Melati...)"
              className="w-full rounded-xl border border-surface bg-surface/60 px-3 py-2 text-xs outline-none focus:border-primary"
            />
            <div className="flex items-center justify-between pt-1">
              <ColorPicker value={newWardColor} onChange={setNewWardColor} />
              <button
                type="button"
                onClick={handleAddWard}
                disabled={!newWardName.trim()}
                className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs disabled:opacity-40 hover:bg-primary-deep cursor-pointer"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  const rawTab = searchParams.get('tab')
  const normalizeTab = (t: string | null): 'manajemen' | 'preferensi' | 'lanjutan' => {
    if (t === 'waktu' || t === 'preferensi') return 'preferensi'
    if (t === 'keamanan' || t === 'ai' || t === 'lanjutan') return 'lanjutan'
    return 'manajemen'
  }
  const [activeTab, setActiveTab] = useState<'manajemen' | 'preferensi' | 'lanjutan'>(
    normalizeTab(rawTab)
  )

  // Update query param when activeTab changes with history replacement
  const switchTab = (tab: 'manajemen' | 'preferensi' | 'lanjutan') => {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/dasbor')
    }
  }

  // Faskes State
  const [newRsName, setNewRsName] = useState('')
  const [newRsColor, setNewRsColor] = useState(PALETTE[0])
  const [newRsIcon, setNewRsIcon] = useState('/icons/hospital.png')

  // Date & Time State
  const [dateFormat, setDateFormat] = useState<DateFormat>(getStoredDateFormat())
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(getStoredTimeFormat())

  const handleSaveDateFormat = (f: DateFormat) => {
    saveDateFormat(f)
    setDateFormat(f)
    notify(`Format tanggal diubah ke ${f} ✓`)
  }

  const handleSaveTimeFormat = (f: TimeFormat) => {
    saveTimeFormat(f)
    setTimeFormat(f)
    notify(`Format jam diubah ke ${f === '24h' ? '24 Jam' : '12 Jam'} ✓`)
  }

  const hospitals = useLiveQuery(
    async () => (await db.hospitals.toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [],
    []
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  )

  const handleAddRs = async () => {
    if (!newRsName.trim()) return
    await db.hospitals.add({
      nama: newRsName.trim(),
      kode_warna: newRsColor,
      icon: newRsIcon,
      order: (hospitals?.length ?? 0) + 1
    })
    setNewRsName('')
    notify('Faskes baru berhasil ditambahkan ✓')
  }

  const handleDragEndHospitals = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id && hospitals) {
      const oldIndex = hospitals.findIndex(h => h.id === active.id)
      const newIndex = hospitals.findIndex(h => h.id === over.id)
      const newOrder = arrayMove(hospitals, oldIndex, newIndex)
      
      for (let i = 0; i < newOrder.length; i++) {
        await db.hospitals.update(newOrder[i].id!, { order: i + 1 })
      }
    }
  }

  return (
    <main className="space-y-5 p-5 pb-36">
      {/* Header Halaman — 1 Baris dengan Tombol Kembali */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          aria-label="Kembali"
          className="flex size-11 items-center justify-center rounded-2xl glass-card text-ink-muted hover:text-ink active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="glass-blue-hero rounded-3xl px-5 py-4 text-white shadow-xl flex-1">
          <h1 className="h1 text-2xl font-black text-white">Pengaturan</h1>
        </div>
      </div>

      {/* Navigasi 3 Tab Tetap (Fit Layar Tanpa Scroll Horizontal) */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { id: 'manajemen' as const, label: 'Manajemen', icon: Building },
          { id: 'preferensi' as const, label: 'Preferensi', icon: Calendar },
          { id: 'lanjutan' as const, label: 'Lanjutan', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center justify-center gap-1.5 rounded-2xl py-3 text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/20'
                  : 'glass-card text-ink-muted hover:text-ink hover:bg-surface/80'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: MANAJEMEN FASKES & RUANGAN */}
      {activeTab === 'manajemen' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Card Tambah Faskes Baru */}
          <div className="glass-card rounded-3xl p-5 shadow-sm space-y-3">
            <p className="text-xs font-bold text-ink flex items-center gap-2">
              <Plus size={16} className="text-primary" /> Tambah Faskes Baru
            </p>

            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 bg-surface p-1 rounded-2xl border border-surface shrink-0">
                {AVAILABLE_ICONS.map((ic) => (
                  <button
                    key={ic.path}
                    type="button"
                    onClick={() => setNewRsIcon(ic.path)}
                    className={`p-1.5 rounded-xl transition-all cursor-pointer ${newRsIcon === ic.path ? 'bg-primary/20 ring-2 ring-primary' : 'opacity-60 hover:opacity-100'}`}
                    title={ic.label}
                  >
                    <img src={ic.path} alt={ic.label} className="size-6 object-contain" />
                  </button>
                ))}
              </div>

              <input
                value={newRsName}
                onChange={(e) => setNewRsName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRs()}
                placeholder="Nama Rumah Sakit / Klinik..."
                className="w-full rounded-2xl border border-surface bg-surface/60 px-4 py-3 text-xs outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <ColorPicker value={newRsColor} onChange={setNewRsColor} />
              <button
                type="button"
                onClick={handleAddRs}
                disabled={!newRsName.trim()}
                className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-40 hover:brightness-110 active:scale-95 transition-all cursor-pointer self-end"
              >
                <Plus size={16} /> Simpan Faskes
              </button>
            </div>
          </div>

          {/* Daftar Faskes Tersimpan */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="caption font-bold uppercase tracking-wider text-ink-muted">
                Daftar Faskes ({hospitals?.length ?? 0})
              </p>
              <span className="caption text-ink-muted">Tahan & geser untuk atur urutan</span>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndHospitals}>
              <SortableContext items={hospitals?.map(h => h.id!) ?? []} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {hospitals?.map((h) => (
                    <HospitalAccordion key={h.id} hospital={h} notify={notify} />
                  ))}
                  {(!hospitals || hospitals.length === 0) && (
                    <div className="glass-card rounded-3xl p-8 text-center text-xs text-ink-muted">
                      Belum ada faskes terdaftar. Tambahkan RS atau Klinik di atas.
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      {/* TAB 2: PREFERENSI (TANGGAL & JAM) */}
      {activeTab === 'preferensi' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="glass-card rounded-3xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="h3 text-xs font-bold text-ink flex items-center gap-2 mb-1">
                <Calendar size={18} className="text-primary" /> Format Tanggal Klinis
              </h3>
              <p className="caption text-ink-muted">
                Pilih format baku tampilan tanggal MRS, Onset, dan CPPT di seluruh aplikasi.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'DD/MM/YYYY' as DateFormat, label: 'DD/MM/YYYY', contoh: '27/08/2026' },
                { id: 'DD MMM YYYY' as DateFormat, label: 'DD MMM YYYY', contoh: '27 Agt 2026' },
                { id: 'YYYY-MM-DD' as DateFormat, label: 'YYYY-MM-DD (ISO)', contoh: '2026-08-27' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSaveDateFormat(item.id)}
                  className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    dateFormat === item.id
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-surface bg-surface/50 text-ink hover:bg-surface'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold">{item.label}</p>
                    <p className="caption text-ink-muted">{item.contoh}</p>
                  </div>
                  {dateFormat === item.id && <Check size={18} className="text-primary shrink-0" />}
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-surface space-y-3">
              <div>
                <h3 className="h3 text-xs font-bold text-ink flex items-center gap-2 mb-1">
                  <Clock size={18} className="text-primary" /> Format Jam & Waktu
                </h3>
                <p className="caption text-ink-muted">
                  Pilih format penulisan jam operan, konsultasi, dan timestamp klinis.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: '24h' as TimeFormat, label: '24 Jam', contoh: '14:30' },
                  { id: '12h' as TimeFormat, label: '12 Jam (AM/PM)', contoh: '02:30 PM' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSaveTimeFormat(item.id)}
                    className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                      timeFormat === item.id
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                        : 'border-surface bg-surface/50 text-ink hover:bg-surface'
                    }`}
                  >
                    <p className="text-xs font-bold">{item.label}</p>
                    <p className="caption text-ink-muted mt-0.5">{item.contoh}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LANJUTAN (API GEMINI + KEAMANAN, CADANGAN & UPDATE OTA) */}
      {activeTab === 'lanjutan' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Section 1: Asisten AI & Kunci API Google Gemini */}
          <div className="glass-card rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="flex items-center gap-2 text-xs font-bold text-ink">
              <Sparkles size={16} className="text-primary" /> Asisten AI & Kunci API
            </h3>
            <ApiKeyCard notify={notify} />
          </div>

          {/* Section 2: Keamanan & Privasi Klinis, Kunci Layar, Cadangan & OTA */}
          <div className="glass-card rounded-3xl p-5 shadow-sm">
            <SecuritySection notify={notify} />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <aside aria-label="Notifikasi" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </aside>
      )}
    </main>
  )
}
