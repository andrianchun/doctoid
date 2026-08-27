import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronLeft, Plus, Trash2, Building2, Copy, ChevronDown, ChevronUp,
  Edit2, Check, GripVertical, Calendar, Clock,
  Sparkles, Eye, EyeOff, CheckCircle2, HelpCircle,
  Stethoscope, Brain, HeartPulse, Activity, ShieldPlus, Cross,
  Pill, Ambulance, FlaskConical, UserCheck, BriefcaseMedical,
  X
} from 'lucide-react'
import { db } from '../db'
import { PALETTE } from '../store'
import SecuritySection from '../components/SecuritySection'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getStoredDateFormat, getStoredTimeFormat, saveDateFormat, saveTimeFormat, type DateFormat, type TimeFormat } from '../utils/dateFormat'
import { convertToWebP } from '../utils/mediaCompress'

export const PRESET_ICONS = [
  { id: 'hospital-building', icon: Building2 },
  { id: 'stethoscope', icon: Stethoscope },
  { id: 'brain', icon: Brain },
  { id: 'heart-pulse', icon: HeartPulse },
  { id: 'activity', icon: Activity },
  { id: 'shield-plus', icon: ShieldPlus },
  { id: 'cross', icon: Cross },
  { id: 'pill', icon: Pill },
  { id: 'ambulance', icon: Ambulance },
  { id: 'flask', icon: FlaskConical },
  { id: 'user-check', icon: UserCheck },
  { id: 'briefcase', icon: BriefcaseMedical },
]

export function RenderFaskesIcon({
  icon,
  color = '#3B82F6',
  size = 20,
  className = '',
}: {
  icon?: string
  color?: string
  size?: number
  className?: string
}) {
  if (icon?.startsWith('data:') || icon?.startsWith('http')) {
    return (
      <img
        src={icon}
        alt="Faskes"
        className={`object-contain rounded-lg ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  const match = PRESET_ICONS.find((p) => p.id === icon)
  if (match) {
    const IconComp = match.icon
    return <IconComp size={size} style={{ color }} className={className} />
  }
  return <Building2 size={size} style={{ color }} className={className} />
}

function FaskesIconColorModal({
  open,
  onClose,
  color,
  onColorChange,
  icon,
  onIconChange,
}: {
  open: boolean
  onClose: () => void
  color: string
  onColorChange: (c: string) => void
  icon: string
  onIconChange: (i: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const webp = await convertToWebP(file, 256, 0.85)
      onIconChange(webp)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      alert('Gagal memproses gambar. Coba gambar lain.')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-md rounded-3xl bg-card border border-surface p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6">
        {/* Header Bersih Tanpa Ikon */}
        <div className="flex items-center justify-between pb-2 border-b border-surface">
          <h4 className="text-sm font-bold text-ink">Ikon & Warna Faskes</h4>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pilihan Warna Faskes (Langsung Warna Tanpa Tulisan) */}
        <div className="flex flex-wrap gap-2.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              aria-label={`Warna ${c}`}
              className={`size-7 cursor-pointer rounded-full transition-transform ${
                color === c ? 'scale-110 ring-3 ring-primary ring-offset-2' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Pilihan Ikon Medis */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink">Ikon</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              Unggah
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1">
            {icon?.startsWith('data:') && (
              <button
                type="button"
                className="flex items-center justify-center p-2.5 rounded-2xl border-2 border-primary bg-primary/10 shadow-xs"
                title="Foto Unggahan Anda"
              >
                <img src={icon} alt="Foto" className="size-6 object-contain rounded-md" />
              </button>
            )}
            {PRESET_ICONS.map((p) => {
              const isSelected = icon === p.id
              const IconComp = p.icon
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onIconChange(p.id)}
                  className={`flex items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-xs'
                      : 'border-surface bg-surface/50 hover:bg-surface hover:border-surface/80'
                  }`}
                >
                  <IconComp size={20} style={{ color: isSelected ? color : '#64748B' }} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Tombol Selesai */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all cursor-pointer"
        >
          Selesai & Terapkan
        </button>
      </div>
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

function WardItem({
  ward,
  notify,
  isOverlay = false,
}: {
  ward: any
  notify?: (m: string) => void
  isOverlay?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(ward.nama)
  const [color, setColor] = useState(ward.kode_warna || PALETTE[0])
  const [showColorPicker, setShowColorPicker] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ward.id })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.25 : 1,
  }

  const handleSave = async () => {
    if (!name.trim()) return
    await db.wards.update(ward.id, {
      nama: name.trim(),
      kode_warna: color,
    })
    setIsEditing(false)
    setShowColorPicker(false)
    notify?.('Ruangan diperbarui ✓')
  }

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      className={`flex items-center justify-between gap-2.5 rounded-2xl bg-white border px-3.5 py-2.5 transition-all ${
        isOverlay
          ? 'border-2 border-primary/50 shadow-2xl scale-[1.02] opacity-95'
          : 'border-slate-200/80 shadow-xs hover:border-slate-300'
      }`}
    >
      {isEditing ? (
        <div className="flex items-center gap-1.5 w-full min-w-0 relative">
          {/* Color Selector saat Edit */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Ganti warna ruangan"
              className="size-6 rounded-lg flex items-center justify-center border border-slate-200 bg-slate-50 hover:scale-105 cursor-pointer shadow-2xs"
            >
              <span
                className="size-3.5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: color }}
              />
            </button>
            {showColorPicker && (
              <div className="absolute left-0 bottom-full mb-2 z-50 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl flex items-center gap-1.5 animate-in fade-in zoom-in-95">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setColor(c)
                      setShowColorPicker(false)
                    }}
                    aria-label={`Pilih warna ${c}`}
                    className={`size-5 rounded-full transition-transform cursor-pointer ${
                      color === c ? 'scale-110 ring-2 ring-primary ring-offset-1' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>

          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Nama ruangan..."
            className="flex-1 min-w-0 rounded-xl border border-primary/40 bg-slate-50 px-2.5 py-1.5 text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 text-slate-800"
          />
          <button
            type="button"
            onClick={() => {
              setIsEditing(false)
              setName(ward.nama)
              setColor(ward.kode_warna || PALETTE[0])
              setShowColorPicker(false)
            }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 shrink-0 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-deep shrink-0 cursor-pointer"
          >
            Simpan
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab text-slate-300 hover:text-slate-600 p-1 touch-none select-none shrink-0"
              title="Geser urutan"
            >
              <GripVertical size={15} />
            </button>

            {/* Titik Warna Ruangan */}
            <span
              className="size-3 rounded-full shrink-0 shadow-2xs ring-1 ring-black/10"
              style={{ backgroundColor: ward.kode_warna || '#3B82F6' }}
            />

            <span className="text-xs font-bold text-slate-800 truncate">{ward.nama}</span>
          </div>

          {!isOverlay && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsEditing(true)}
                title="Ubah Nama & Warna"
                className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={async () => {
                  if (window.confirm(`Hapus ruangan "${ward.nama}"?`)) {
                    await db.wards.delete(ward.id)
                    notify?.('Ruangan dihapus')
                  }
                }}
                title="Hapus"
                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function HospitalAccordion({
  hospital,
  notify,
  isOverlay = false,
}: {
  hospital: any
  notify?: (m: string) => void
  isOverlay?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [name, setName] = useState(hospital.nama)
  const [color, setColor] = useState(hospital.kode_warna)
  const [icon, setIcon] = useState(hospital.icon || 'hospital-building')

  const [newWardName, setNewWardName] = useState('')
  const [newWardColor, setNewWardColor] = useState(hospital.kode_warna || PALETTE[0])
  const [showWardColorPicker, setShowWardColorPicker] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: hospital.id,
  })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.25 : 1,
  }

  const rawWards = useLiveQuery(
    async () =>
      (await db.wards.where('hospital_id').equals(hospital.id).toArray()).sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      ),
    [hospital.id],
    []
  )

  const [localWards, setLocalWards] = useState<any[]>([])
  const [activeWardId, setActiveWardId] = useState<number | null>(null)

  useEffect(() => {
    if (rawWards) {
      setLocalWards(rawWards)
    }
  }, [rawWards])

  const wardSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleSaveHospital = async () => {
    if (!name.trim()) return
    await db.hospitals.update(hospital.id, {
      nama: name.trim(),
      kode_warna: color,
      icon: icon,
    })
    setShowEditModal(false)
    notify?.('Faskes diperbarui ✓')
  }

  const handleCopyRs = async () => {
    const newHId = await db.hospitals.add({
      nama: `${hospital.nama} (Copy)`,
      kode_warna: hospital.kode_warna,
      icon: hospital.icon,
      order: (hospital.order ?? 0) + 1,
    })
    if (localWards && localWards.length > 0) {
      for (const w of localWards) {
        await db.wards.add({
          hospital_id: newHId as number,
          nama: w.nama,
          kode_warna: w.kode_warna,
          order: w.order,
        })
      }
    }
    notify?.('Faskes beserta ruangan diduplikasi ✓')
  }

  const handleDeleteRs = async () => {
    if (window.confirm(`Hapus faskes "${hospital.nama}" beserta seluruh ruangannya?`)) {
      await db.wards.where('hospital_id').equals(hospital.id).delete()
      await db.hospitals.delete(hospital.id)
      notify?.('Faskes dan seluruh ruangannya dihapus')
    }
  }

  const handleAddWard = async () => {
    if (!newWardName.trim()) return
    await db.wards.add({
      hospital_id: hospital.id,
      nama: newWardName.trim(),
      kode_warna: newWardColor,
      order: (localWards?.length ?? 0) + 1,
    })
    setNewWardName('')
    setShowWardColorPicker(false)
    notify?.('Ruangan baru ditambahkan ✓')
  }

  const handleDragEndWards = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveWardId(null)
    if (over && active.id !== over.id && localWards) {
      const oldIndex = localWards.findIndex((w) => w.id === active.id)
      const newIndex = localWards.findIndex((w) => w.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(localWards, oldIndex, newIndex)
        setLocalWards(newOrder)

        await db.transaction('rw', db.wards, async () => {
          for (let i = 0; i < newOrder.length; i++) {
            await db.wards.update(newOrder[i].id!, { order: i + 1 })
          }
        })
      }
    }
  }

  const activeWard = activeWardId ? localWards?.find((w) => w.id === activeWardId) : null

  return (
    <>
      <div
        ref={isOverlay ? undefined : setNodeRef}
        style={isOverlay ? undefined : style}
        className={`rounded-3xl border bg-white transition-all overflow-hidden ${
          isOverlay
            ? 'border-2 border-primary/50 shadow-2xl scale-[1.02] opacity-95'
            : 'border-slate-200/80 shadow-xs hover:border-slate-300'
        }`}
      >
        {/* Faskes Header Row: Bersih, Lega & Luas */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50/70 transition-colors"
          onClick={() => !isOverlay && setIsOpen(!isOpen)}
        >
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-slate-300 hover:text-slate-600 p-1 touch-none select-none shrink-0"
            onClick={(e) => e.stopPropagation()}
            title="Geser urutan"
          >
            <GripVertical size={16} />
          </button>

          {/* Faskes Icon Avatar */}
          <div
            className="size-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
            style={{ backgroundColor: `${hospital.kode_warna || '#3B82F6'}15` }}
          >
            <RenderFaskesIcon icon={hospital.icon} color={hospital.kode_warna} size={20} />
          </div>

          {/* Faskes Name & Ward Count */}
          <div className="flex-1 min-w-0 pr-2">
            <h4 className="h3 text-ink truncate leading-snug">
              {hospital.nama}
            </h4>
            <p className="caption text-ink-muted mt-0.5">
              {localWards?.length ?? 0} Ruangan
            </p>
          </div>

          {/* Action Buttons Sederhana: Edit & Chevron */}
          {!isOverlay && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  setName(hospital.nama)
                  setColor(hospital.kode_warna)
                  setIcon(hospital.icon || 'hospital-building')
                  setShowEditModal(true)
                }}
                title="Ubah Faskes"
                className="p-2 text-slate-400 hover:text-primary hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <Edit2 size={15} />
              </button>
              <button
                className="p-2 text-slate-400 hover:text-slate-700 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
                title={isOpen ? 'Tutup Ruangan' : 'Buka Ruangan'}
              >
                {isOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>
            </div>
          )}
        </div>

        {/* Accordion Content: Background Abu-abu Sunken (#EEF1F6) untuk Hirarki Jelas */}
        {!isOverlay && isOpen && (
          <div
            className="p-4 border-t border-slate-200/70 bg-[#EEF1F6] space-y-3 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Dalam: Label Ruangan */}
            <div className="flex items-center justify-between px-1">
              <p className="caption font-bold text-ink uppercase tracking-wider">
                Daftar Ruangan ({localWards?.length ?? 0})
              </p>
            </div>

            {/* List Ruangan (Kartu Putih di atas Background Abu-abu) */}
            <DndContext
              sensors={wardSensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={(event) => setActiveWardId(event.active.id as number)}
              onDragEnd={handleDragEndWards}
              onDragCancel={() => setActiveWardId(null)}
            >
              <SortableContext items={localWards?.map((w) => w.id!) ?? []} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {(!localWards || localWards.length === 0) && (
                    <div className="rounded-2xl border border-dashed border-slate-300/80 bg-white/70 p-4 text-center text-xs text-slate-400 font-medium">
                      Belum ada ruangan.
                    </div>
                  )}
                  {localWards?.map((w) => (
                    <WardItem key={w.id} ward={w} notify={notify} />
                  ))}
                </div>
              </SortableContext>

              <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                {activeWard ? <WardItem ward={activeWard} isOverlay /> : null}
              </DragOverlay>
            </DndContext>

            {/* Form Tambah Ruangan Ringkas & Rapi 1 Baris */}
            <div className="bg-white rounded-2xl p-2 border border-slate-200/80 shadow-xs flex items-center gap-2 relative">
              {/* Selector Warna Ruangan */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowWardColorPicker(!showWardColorPicker)}
                  title="Pilih warna ruangan"
                  className="size-7 rounded-xl flex items-center justify-center border border-slate-200 bg-slate-50 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-2xs"
                >
                  <span
                    className="size-4 rounded-full shadow-2xs ring-1 ring-black/10"
                    style={{ backgroundColor: newWardColor }}
                  />
                </button>

                {showWardColorPicker && (
                  <div className="absolute left-0 bottom-full mb-2 z-50 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl flex items-center gap-1.5 animate-in fade-in zoom-in-95">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setNewWardColor(c)
                          setShowWardColorPicker(false)
                        }}
                        aria-label={`Pilih warna ${c}`}
                        className={`size-6 rounded-full transition-transform cursor-pointer ${
                          newWardColor === c ? 'scale-110 ring-2 ring-primary ring-offset-1' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <input
                value={newWardName}
                onChange={(e) => setNewWardName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWard()}
                placeholder="Nama Ruang Baru..."
                className="flex-1 min-w-0 rounded-xl bg-slate-50 px-3.5 py-2 text-xs font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-primary text-slate-800 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleAddWard}
                disabled={!newWardName.trim()}
                className="flex items-center gap-1 rounded-xl bg-gradient-to-br from-primary to-primary-deep px-4 py-2 text-xs font-bold text-white shadow-xs disabled:opacity-40 hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Faskes Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-card border border-surface p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-surface">
              <h4 className="text-sm font-bold text-ink">Ubah Data Faskes</h4>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    handleCopyRs()
                    setShowEditModal(false)
                  }}
                  title="Duplikat Faskes"
                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <Copy size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    handleDeleteRs()
                  }}
                  title="Hapus Faskes"
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-3.5">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveHospital()}
                placeholder="Nama Faskes..."
                className="w-full rounded-2xl border border-surface bg-surface/70 px-4 py-2.5 text-xs font-bold outline-none focus:border-primary text-ink"
              />

              {/* Warna (Langsung Baris Warna) */}
              <div className="flex flex-wrap gap-2.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Warna ${c}`}
                    className={`size-7 cursor-pointer rounded-full transition-transform ${
                      color === c ? 'scale-110 ring-3 ring-primary ring-offset-2' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              {/* Ikon */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">Ikon</span>
                  <label className="text-xs font-bold text-primary hover:underline cursor-pointer">
                    Unggah
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          try {
                            const webp = await convertToWebP(file, 256, 0.85)
                            setIcon(webp)
                          } catch {
                            alert('Gagal memproses gambar.')
                          }
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-1">
                  {icon?.startsWith('data:') && (
                    <button
                      type="button"
                      className="flex items-center justify-center p-2.5 rounded-2xl border-2 border-primary bg-primary/10 shadow-xs"
                      title="Foto Unggahan"
                    >
                      <img src={icon} alt="Foto" className="size-6 object-contain rounded-md" />
                    </button>
                  )}
                  {PRESET_ICONS.map((p) => {
                    const isSelected = icon === p.id
                    const IconComp = p.icon
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setIcon(p.id)}
                        className={`flex items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-xs'
                            : 'border-surface bg-surface/50 hover:bg-surface hover:border-surface/80'
                        }`}
                      >
                        <IconComp size={20} style={{ color: isSelected ? color : '#64748B' }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-muted hover:bg-surface cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveHospital}
                className="px-5 py-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white text-xs font-bold shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
  const [newRsIcon, setNewRsIcon] = useState('hospital-building')
  const [showIconPicker, setShowIconPicker] = useState(false)

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

  const rawHospitals = useLiveQuery(
    async () => (await db.hospitals.toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [],
    []
  )

  const [localHospitals, setLocalHospitals] = useState<any[]>([])
  const [activeHospitalId, setActiveHospitalId] = useState<number | null>(null)

  useEffect(() => {
    if (rawHospitals) {
      setLocalHospitals(rawHospitals)
    }
  }, [rawHospitals])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleAddRs = async () => {
    if (!newRsName.trim()) return
    await db.hospitals.add({
      nama: newRsName.trim(),
      kode_warna: newRsColor,
      icon: newRsIcon,
      order: (localHospitals?.length ?? 0) + 1,
    })
    setNewRsName('')
    notify('Faskes baru berhasil ditambahkan ✓')
  }

  const handleDragEndHospitals = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveHospitalId(null)
    if (over && active.id !== over.id && localHospitals) {
      const oldIndex = localHospitals.findIndex((h) => h.id === active.id)
      const newIndex = localHospitals.findIndex((h) => h.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(localHospitals, oldIndex, newIndex)
        setLocalHospitals(newOrder)

        await db.transaction('rw', db.hospitals, async () => {
          for (let i = 0; i < newOrder.length; i++) {
            await db.hospitals.update(newOrder[i].id!, { order: i + 1 })
          }
        })
      }
    }
  }

  const activeHospital = activeHospitalId
    ? localHospitals?.find((h) => h.id === activeHospitalId)
    : null

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

      {/* Navigasi 3 Tab Tetap (Bersih Tanpa Ikon Sesuai Permintaan) */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { id: 'manajemen' as const, label: 'Manajemen' },
          { id: 'preferensi' as const, label: 'Preferensi' },
          { id: 'lanjutan' as const, label: 'Lanjutan' },
        ].map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center justify-center rounded-2xl py-3 text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/20'
                  : 'glass-card text-ink-muted hover:text-ink hover:bg-surface/80'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: MANAJEMEN FASKES & RUANGAN */}
      {activeTab === 'manajemen' && (
        <div className="animate-in fade-in">
          {/* Satu Kartu Utama Terpadu untuk Fasilitas Kesehatan */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
            {/* Header Kartu */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="h3 text-ink font-bold">Fasilitas Kesehatan</h3>
                <p className="caption text-ink-muted mt-0.5">
                  Daftar Faskes ({localHospitals?.length ?? 0})
                </p>
              </div>
            </div>

            {/* List Faskes (Sortable) */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={(event) => setActiveHospitalId(event.active.id as number)}
              onDragEnd={handleDragEndHospitals}
              onDragCancel={() => setActiveHospitalId(null)}
            >
              <SortableContext items={localHospitals?.map((h) => h.id!) ?? []} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {localHospitals?.map((h) => (
                    <HospitalAccordion key={h.id} hospital={h} notify={notify} />
                  ))}
                  {(!localHospitals || localHospitals.length === 0) && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400 font-medium">
                      Belum ada faskes terdaftar.
                    </div>
                  )}
                </div>
              </SortableContext>

              <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                {activeHospital ? <HospitalAccordion hospital={activeHospital} isOverlay /> : null}
              </DragOverlay>
            </DndContext>

            {/* Form Tambah Faskes di Paling Bawah (Sama Persis Logikanya dengan Tambah Ruangan) */}
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              {/* Trigger Icon & Color Button */}
              <button
                type="button"
                onClick={() => setShowIconPicker(true)}
                title="Pilih Ikon & Warna Faskes"
                className="size-11 rounded-2xl flex items-center justify-center shrink-0 border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer shadow-xs"
                style={{ backgroundColor: `${newRsColor}15` }}
              >
                <RenderFaskesIcon icon={newRsIcon} color={newRsColor} size={20} />
              </button>

              <input
                value={newRsName}
                onChange={(e) => setNewRsName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRs()}
                placeholder="Nama Faskes Baru..."
                className="flex-1 min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs font-semibold outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-slate-800 placeholder:text-slate-400"
              />

              <button
                type="button"
                onClick={handleAddRs}
                disabled={!newRsName.trim()}
                className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 disabled:opacity-40 hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
              >
                <Plus size={16} />
                <span>Simpan</span>
              </button>
            </div>
          </div>

          {/* Modal Picker Ikon & Warna Baru */}
          <FaskesIconColorModal
            open={showIconPicker}
            onClose={() => setShowIconPicker(false)}
            color={newRsColor}
            onColorChange={setNewRsColor}
            icon={newRsIcon}
            onIconChange={setNewRsIcon}
          />
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
        <aside
          aria-label="Notifikasi"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2"
        >
          {toast}
        </aside>
      )}
    </main>
  )
}

