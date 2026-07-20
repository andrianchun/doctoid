import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, Plus, Trash2, Hospital as HospitalIcon, KeyRound, Copy, ChevronDown, ChevronUp, User, Settings as SettingsIcon, Building, Edit2, Check, LayoutDashboard, GripVertical } from 'lucide-react'
import { db } from '../db'
import { useUi, PALETTE } from '../store'
import SecuritySection from './SecuritySection'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const AVAILABLE_ICONS = [
  { path: '/icons/hospital.png', label: 'Rumah Sakit' },
  { path: '/icons/clinic.png', label: 'Klinik' },
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={`Warna ${c}`}
          className={`size-5 cursor-pointer rounded-full transition-transform ${value === c ? 'scale-110 ring-2 ring-ink/40 ring-offset-1' : ''}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

function ApiKeyInput({ label, storageKey }: { label: string; storageKey: string }) {
  const [val, setVal] = useState(localStorage.getItem(storageKey) ?? '')
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      <input
        type="password"
        value={val}
        placeholder="sk-..."
        onChange={(e) => {
          setVal(e.target.value)
          localStorage.setItem(storageKey, e.target.value)
        }}
        className="w-full rounded-xl border-none bg-surface/80 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
      />
    </label>
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
  }

  const handleCopy = async () => {
    await db.wards.add({
      hospital_id: ward.hospital_id,
      nama: `${ward.nama} (Copy)`,
      kode_warna: ward.kode_warna,
      order: (ward.order ?? 0) + 1
    })
    notify('Ruangan diduplikasi')
  }

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 rounded-xl bg-card border border-surface p-2.5 shadow-sm transition-all hover:shadow-md ${isDragging ? 'shadow-xl relative' : ''}`}>
      <button {...attributes} {...listeners} className="cursor-grab text-ink-muted touch-none p-1">
        <GripVertical size={16} />
      </button>
      <div className="relative">
        <input 
          type="color" 
          value={ward.kode_warna} 
          onChange={(e) => db.wards.update(ward.id, { kode_warna: e.target.value })}
          className="absolute inset-0 opacity-0 cursor-pointer size-6" 
        />
        <div className="size-6 rounded-full border border-surface shadow-inner" style={{ backgroundColor: ward.kode_warna }} />
      </div>
      
      {isEditing ? (
        <div className="flex-1 flex gap-2">
          <input 
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="flex-1 rounded-lg border-none bg-surface/50 px-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button onClick={handleSave} className="text-green-500 p-1 hover:bg-green-50 rounded-lg"><Check size={14} /></button>
        </div>
      ) : (
        <div className="flex-1 text-sm font-medium">{ward.nama}</div>
      )}

      {!isEditing && (
        <div className="flex items-center gap-1">
          <button onClick={() => setIsEditing(true)} className="p-1.5 text-ink-muted hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"><Edit2 size={14} /></button>
          <button onClick={handleCopy} className="p-1.5 text-ink-muted hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Copy size={14} /></button>
          <button onClick={() => db.wards.delete(ward.id)} className="p-1.5 text-ink-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
        </div>
      )}
    </div>
  )
}

function HospitalAccordion({ hospital, allWards, notify }: { hospital: any, allWards: any[], notify: (m: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(hospital.nama)
  
  const [newWardName, setNewWardName] = useState('')
  const [newWardColor, setNewWardColor] = useState(PALETTE[1])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: hospital.id })
  
  useEffect(() => {
    if (isDragging && isOpen) {
      setIsOpen(false)
    }
  }, [isDragging, isOpen])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  }

  const wards = useMemo(() => {
    return allWards.filter(w => w.hospital_id === hospital.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [allWards, hospital.id])

  const handleSaveRs = async () => {
    if (!name.trim()) return
    await db.hospitals.update(hospital.id, { nama: name.trim() })
    setIsEditing(false)
  }

  const handleCopyRs = async () => {
    const newRsId = await db.hospitals.add({
      nama: `${hospital.nama} (Copy)`,
      kode_warna: hospital.kode_warna,
      icon: hospital.icon,
      order: (hospital.order ?? 0) + 1
    })
    for (let i = 0; i < wards.length; i++) {
      const w = wards[i];
      await db.wards.add({
        hospital_id: newRsId as number,
        nama: w.nama,
        kode_warna: w.kode_warna,
        order: i
      })
    }
    notify('Faskes diduplikasi')
  }

  const handleDeleteRs = async () => {
    if (!window.confirm(`Hapus ${hospital.nama} beserta seluruh ruangannya?`)) return
    await db.wards.where('hospital_id').equals(hospital.id).delete()
    await db.hospitals.delete(hospital.id)
    notify('Faskes dihapus')
  }

  const handleAddWard = async () => {
    if (!newWardName.trim()) return
    await db.wards.add({ hospital_id: hospital.id, nama: newWardName.trim(), kode_warna: newWardColor, order: wards.length })
    setNewWardName('')
  }

  const handleDragEndWards = async (e: DragEndEvent) => {
    const { active, over } = e
    if (over && active.id !== over.id) {
      const oldIdx = wards.findIndex(w => w.id === active.id)
      const newIdx = wards.findIndex(w => w.id === over.id)
      const reordered = arrayMove(wards, oldIdx, newIdx)
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order !== i) {
          await db.wards.update(reordered[i].id!, { order: i })
        }
      }
    }
  }

  return (
    <div ref={setNodeRef} style={style} className={`rounded-2xl border border-surface bg-card shadow-sm overflow-hidden mb-3 transition-all hover:shadow-md ${isDragging ? 'shadow-xl relative' : ''}`}>
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer bg-gradient-to-r from-card to-surface/30"
        onClick={() => !isEditing && setIsOpen(!isOpen)}
      >
        <button {...attributes} {...listeners} className="cursor-grab text-ink-muted touch-none p-1" onClick={e => e.stopPropagation()}>
          <GripVertical size={20} />
        </button>

        <div className="relative group shrink-0">
          <div className="size-10 rounded-xl bg-surface flex items-center justify-center overflow-hidden border border-surface/50 relative">
            {hospital.icon ? (
              <img src={hospital.icon} alt="Icon" className="size-full object-cover p-1" />
            ) : (
              <Building size={20} className="text-ink-muted" />
            )}
          </div>
          <div className="absolute top-full left-0 mt-1 bg-card border border-surface shadow-xl rounded-xl p-2 hidden group-hover:flex gap-2 z-10 w-max" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => db.hospitals.update(hospital.id, { icon: '' })}
              className="size-10 rounded-lg bg-surface flex items-center justify-center hover:ring-2 ring-primary/50"
            >
              <Building size={16} />
            </button>
            {AVAILABLE_ICONS.map(ic => (
              <button 
                key={ic.path}
                onClick={() => db.hospitals.update(hospital.id, { icon: ic.path })}
                className="size-10 rounded-lg bg-surface flex items-center justify-center hover:ring-2 ring-primary/50 overflow-hidden p-1"
                title={ic.label}
              >
                <img src={ic.path} className="size-full object-contain" />
              </button>
            ))}
          </div>
        </div>

        {isEditing ? (
          <div className="flex-1 flex gap-2" onClick={e => e.stopPropagation()}>
            <input 
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveRs()}
              className="flex-1 rounded-lg border-none bg-surface px-2.5 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button onClick={handleSaveRs} className="text-green-500 p-1.5 hover:bg-green-50 rounded-lg"><Check size={16} /></button>
          </div>
        ) : (
          <div className="flex-1">
            <h4 className="text-sm font-bold text-ink">{hospital.nama}</h4>
            <p className="text-[11px] text-ink-muted">{wards.length} Ruangan</p>
          </div>
        )}

        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {!isEditing && (
            <>
              <button onClick={() => setIsEditing(true)} className="p-2 text-ink-muted hover:text-primary hover:bg-primary/5 rounded-xl transition-colors"><Edit2 size={16} /></button>
              <button onClick={handleCopyRs} className="p-2 text-ink-muted hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"><Copy size={16} /></button>
              <button onClick={handleDeleteRs} className="p-2 text-ink-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /></button>
            </>
          )}
          <div className="w-px h-6 bg-surface mx-1" />
          <button className="p-1 text-ink-muted" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 border-t border-surface bg-surface/10 cursor-default" onClick={e => e.stopPropagation()}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndWards}>
            <SortableContext items={wards.map(w => w.id!)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 mb-4">
                {wards.length === 0 && <p className="text-xs text-ink-muted text-center py-2">Belum ada ruangan.</p>}
                {wards.map(w => <WardItem key={w.id} ward={w} notify={notify} />)}
              </div>
            </SortableContext>
          </DndContext>

          <div className="bg-card rounded-xl p-3 border border-surface shadow-sm mt-2">
            <h5 className="text-xs font-semibold text-ink-muted mb-2">Tambah Ruangan Baru</h5>
            <div className="flex gap-2 mb-2">
              <input
                value={newWardName}
                onChange={(e) => setNewWardName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddWard()}
                placeholder="Nama ruangan (mis: ICU, Melati...)"
                className="flex-1 rounded-lg border-none bg-surface/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <div className="flex items-center justify-between">
              <ColorPicker value={newWardColor} onChange={setNewWardColor} />
              <button
                disabled={!newWardName.trim()}
                onClick={handleAddWard}
                className="flex items-center gap-1 rounded-lg bg-ink text-white px-3 py-1.5 text-xs font-semibold shadow-md disabled:opacity-40 transition-transform active:scale-95"
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

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useUi()
  const hospitalsQuery = useLiveQuery(() => db.hospitals.toArray(), [], [])
  const wards = useLiveQuery(() => db.wards.toArray(), [], [])
  
  const [activeTab, setActiveTab] = useState<'rs' | 'profil' | 'lanjutan'>('rs')
  const [rsNama, setRsNama] = useState('')
  const [rsWarna, setRsWarna] = useState(PALETTE[0])
  const [rsIcon, setRsIcon] = useState(AVAILABLE_ICONS[0].path)

  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  const hospitals = useMemo(() => {
    return (hospitalsQuery || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }, [hospitalsQuery])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  const handleDragEndHospitals = async (e: DragEndEvent) => {
    const { active, over } = e
    if (over && active.id !== over.id) {
      const oldIdx = hospitals.findIndex(h => h.id === active.id)
      const newIdx = hospitals.findIndex(h => h.id === over.id)
      const reordered = arrayMove(hospitals, oldIdx, newIdx)
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order !== i) {
          await db.hospitals.update(reordered[i].id!, { order: i })
        }
      }
    }
  }

  if (!settingsOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-md transition-opacity" onClick={() => setSettingsOpen(false)}>
      <div
        className="max-h-[90dvh] w-full max-w-xl flex flex-col rounded-t-[2rem] bg-[#f8f9fc] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 bg-white">
          <h2 className="text-xl font-extrabold text-ink tracking-tight flex items-center gap-2">
            <SettingsIcon className="text-primary" size={24} /> Pengaturan
          </h2>
          <button onClick={() => setSettingsOpen(false)} aria-label="Tutup" className="rounded-full p-2 text-ink-muted hover:bg-surface/80 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 bg-white border-b border-surface">
          <button 
            onClick={() => setActiveTab('rs')} 
            className={`flex-1 flex items-center justify-center gap-1.5 pb-3 pt-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'rs' ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            <HospitalIcon size={16} /> Faskes
          </button>
          <button 
            onClick={() => setActiveTab('profil')} 
            className={`flex-1 flex items-center justify-center gap-1.5 pb-3 pt-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'profil' ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            <User size={16} /> Profil
          </button>
          <button 
            onClick={() => setActiveTab('lanjutan')} 
            className={`flex-1 flex items-center justify-center gap-1.5 pb-3 pt-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'lanjutan' ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            <KeyRound size={16} /> Lanjutan
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 pb-10">
          
          {/* TAB: FASKES */}
          {activeTab === 'rs' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-surface/50 mb-6">
                <h3 className="text-sm font-bold text-ink mb-3 flex items-center gap-1.5">
                  <Plus size={16} className="text-primary" /> Tambah Faskes
                </h3>
                <div className="flex gap-2 mb-3">
                  <div className="relative group shrink-0">
                    <button className="size-10 rounded-xl bg-surface flex items-center justify-center hover:ring-2 ring-primary/50 overflow-hidden p-1 border border-surface">
                       <img src={rsIcon} className="size-full object-contain" />
                    </button>
                    <div className="absolute top-full left-0 mt-1 bg-white border border-surface shadow-xl rounded-xl p-2 hidden group-hover:flex gap-2 z-10 w-max">
                      {AVAILABLE_ICONS.map(ic => (
                        <button 
                          key={ic.path}
                          onClick={() => setRsIcon(ic.path)}
                          className={`size-10 rounded-lg bg-surface flex items-center justify-center hover:ring-2 ring-primary/50 overflow-hidden p-1 ${rsIcon === ic.path ? 'ring-2 ring-primary' : ''}`}
                        >
                          <img src={ic.path} className="size-full object-contain" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    value={rsNama}
                    onChange={(e) => setRsNama(e.target.value)}
                    placeholder="Nama Faskes baru…"
                    className="flex-1 rounded-xl border-none bg-surface/50 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <ColorPicker value={rsWarna} onChange={setRsWarna} />
                  <button
                    disabled={!rsNama.trim()}
                    onClick={async () => {
                      await db.hospitals.add({ nama: rsNama.trim(), kode_warna: rsWarna, icon: rsIcon, order: hospitals.length })
                      setRsNama('')
                      notify('Faskes ditambahkan')
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white shadow-md shadow-ink/20 disabled:opacity-40 transition-transform active:scale-95"
                  >
                    <Plus size={14} /> Simpan
                  </button>
                </div>
              </div>

              <div>
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted ml-1">
                  Daftar Faskes
                </h3>
                
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndHospitals}>
                  <SortableContext items={hospitals.map(h => h.id!)} strategy={verticalListSortingStrategy}>
                    <div>
                      {hospitals.map(h => (
                        <HospitalAccordion key={h.id} hospital={h} allWards={wards || []} notify={notify} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {hospitals.length === 0 && (
                  <div className="text-center p-8 bg-white rounded-2xl border border-surface border-dashed mt-2">
                    <Building size={32} className="mx-auto text-surface mb-2" />
                    <p className="text-sm font-medium text-ink-muted">Belum ada fasilitas kesehatan.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: PROFIL & KEAMANAN */}
          {activeTab === 'profil' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-surface/50">
                <SecuritySection notify={notify} />
              </div>
            </div>
          )}

          {/* TAB: PENGATURAN LANJUTAN */}
          {activeTab === 'lanjutan' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-surface/50 space-y-4">
                <div className="pb-3 border-b border-surface">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-ink mb-1">
                    <LayoutDashboard size={16} className="text-primary" /> API Keys
                  </h3>
                  <p className="text-xs text-ink-muted">Kunci API disimpan secara lokal di perangkat Anda dan tidak disinkronkan.</p>
                </div>
                <div className="space-y-4">
                  <ApiKeyInput label="OpenAI API Key (Mode Rapikan)" storageKey="doctoid_openai_key" />
                  <ApiKeyInput label="Perplexity API Key (Mode Deep Search)" storageKey="doctoid_pplx_key" />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Toast */}
        {toast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[70] rounded-full bg-ink/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
