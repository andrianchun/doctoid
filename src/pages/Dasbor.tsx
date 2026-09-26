import { useState, useRef, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay,
  pointerWithin, closestCenter, type CollisionDetection, type DragEndEvent, type DragStartEvent,
  defaultDropAnimationSideEffects, type DropAnimation,
} from '@dnd-kit/core'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  BedDouble, Plus, Check,
  ChevronRight, Pencil, Eye, EyeOff, Settings, Building2, ChevronDown, X
} from 'lucide-react'
import { db, type Patient, type Ward, type Hospital, type ProgressNote, type TerapiItem } from '../db'
import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'
import Masked from '../components/Masked'
import { formatDate, getLocalDateString } from '../utils/dateFormat'
import { extractClinicalHighlights } from '../utils/clinicalExtractor'
import VisiteModal from '../components/VisiteModal'

const hariKe = (iso: string) =>
  Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) + 1)

function cleanSubjective(raw?: string): string {
  if (!raw) return ''
  return raw
    .trim()
    .replace(/^(?:s|subjektif|keluhan)\s*:\s*/i, '')
    .trim()
}

function formatNoteDate(iso?: string): string {
  if (!iso) return ''
  const todayStr = getLocalDateString()
  if (iso.startsWith(todayStr)) {
    return 'Hari ini'
  }
  return formatDate(iso)
}

const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.3',
      },
    },
  }),
  duration: 150,
  easing: 'ease-out',
}

const customCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) {
    return pointerCollisions
  }
  return closestCenter(args)
}

const triggerHaptic = (type: 'start' | 'drop' | 'cancel') => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'start') {
        navigator.vibrate(25)
      } else if (type === 'drop') {
        navigator.vibrate([15, 30, 20])
      } else {
        navigator.vibrate(10)
      }
    } catch {
      // ignore unsupported
    }
  }
}

function getPatientDiagnoses(patient: Patient, latestNote?: ProgressNote): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  // 1. Diagnosis utama pasien
  if (patient.diagnosis_utama) {
    const parts = patient.diagnosis_utama.split(/[\n;]+/)
    for (const p of parts) {
      const name = p.trim().replace(/^(?:[-•*]|\d+[\.)])\s*/, '')
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase())
        result.push(name)
      }
    }
  }

  // 2. Seluruh diagnosis dari CPPT / catatan medis terkini (termasuk sekunder)
  if (latestNote?.A) {
    if (Array.isArray(latestNote.A)) {
      for (const item of latestNote.A) {
        const name = (typeof item === 'string' ? item : item?.nama_diagnosis)?.trim()
        if (name) {
          const cleanName = name.replace(/^(?:[-•*]|\d+[\.)])\s*/, '')
          if (cleanName && !seen.has(cleanName.toLowerCase())) {
            seen.add(cleanName.toLowerCase())
            result.push(cleanName)
          }
        }
      }
    } else if (typeof latestNote.A === 'string') {
      const parts = (latestNote.A as string).split(/[\n;]+/)
      for (const p of parts) {
        const name = p.trim().replace(/^(?:[-•*]|\d+[\.)])\s*/, '')
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase())
          result.push(name)
        }
      }
    }
  }

  return result
}

function PatientCardContent({
  patient,
  latestNote,
  latestNoteWithS,
  unmasked,
  isVisitedToday,
  onOpenVisite,
  handleToggleMask,
}: {
  patient: Patient
  latestNote?: ProgressNote
  latestNoteWithS?: ProgressNote
  unmasked: boolean
  isVisitedToday?: boolean
  onOpenVisite?: (e: React.MouseEvent) => void
  handleToggleMask?: (e: React.MouseEvent) => void
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const cleanUsia = patient.usia?.toString().replace(/\s*(th|tahun)\b/gi, '').trim()
  const diagnoses = getPatientDiagnoses(patient, latestNote)
  const activeNote = cleanSubjective(latestNote?.S) ? latestNote : (latestNoteWithS || latestNote)
  const noteForS = activeNote
  const keluhan = cleanSubjective(noteForS?.S)
  const clinical = extractClinicalHighlights(noteForS)

  const toggleSection = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // S: Subjektif
  const sFull = cleanSubjective(noteForS?.S)
  const sSummary = clinical.sList.length > 0 ? clinical.sList.join(' · ') : keluhan
  const hasS = !!(sSummary || sFull)
  const canExpandS = !!(sFull && (sFull !== sSummary || sFull.length > 50))

  // O: Objektif
  const oPemfis = noteForS?.O_pemfis?.trim() || ''
  const oPenunjang = noteForS?.O_penunjang?.trim() || ''
  const oSummary = clinical.oList.length > 0 ? clinical.oList.join(' · ') : [oPemfis, oPenunjang].filter(Boolean).join(' · ')
  const hasO = !!(clinical.oList.length > 0 || oPemfis || oPenunjang)
  const canExpandO = !!(oPemfis || oPenunjang)

  // A: Assessment
  const aSummary = diagnoses.join(' · ')
  const hasA = diagnoses.length > 0
  const canExpandA = diagnoses.length > 1 || (Array.isArray(noteForS?.A) && noteForS.A.length > 0)

  // P: Plan (Terapi)
  const allTherapies = useMemo(() => (noteForS?.P || []) as TerapiItem[], [noteForS?.P])
  const activeTherapies = useMemo(() => allTherapies.filter((p) => p.status === 'aktif'), [allTherapies])
  const pSummary = activeTherapies.length > 0
    ? activeTherapies.map((p) => `${p.nama_item}${p.dosis_keterangan ? ' ' + p.dosis_keterangan : ''}`).join(' · ')
    : ''
  const hasP = activeTherapies.length > 0 || allTherapies.length > 0
  const canExpandP = allTherapies.length > 0

  const hasSoap = !!noteForS && (hasS || hasO || hasA || hasP)

  return (
    <div>
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <span className="text-xs font-bold text-ink truncate">
            {patient.title} <Masked value={patient.nama_depan || (patient as any).inisial} type="name" />
          </span>
          {cleanUsia && <span className="caption text-xs font-medium shrink-0">({cleanUsia} th)</span>}
        </div>

        {/* Tombol Dedicated Sensor / Biometrik di Kanan Atas Kartu */}
        {handleToggleMask ? (
          <button
            type="button"
            onClick={handleToggleMask}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={unmasked ? 'Sensor Identitas Pasien' : 'Tampilkan Identitas Pasien (Biometrik)'}
            title={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-muted/70 hover:text-primary hover:bg-primary/10 active:scale-90 transition-all -mr-1"
          >
            {unmasked ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        ) : (
          <div className="flex size-7 shrink-0 items-center justify-center text-primary/70 -mr-1">
            {unmasked ? <Eye size={15} /> : <EyeOff size={15} />}
          </div>
        )}
      </div>

      {/* No. RM: Jika kosong tidak dicantumkan, jika ada langsung angkanya tanpa 'RM: ' */}
      {patient.no_rm?.trim() && (
        <p className="caption text-xs text-ink-muted mt-0.5">
          <Masked value={patient.no_rm} type="rm" />
        </p>
      )}

      {/* Daftar Diagnosis bila belum ada catatan SOAP */}
      {!hasSoap && (
        diagnoses.length > 0 ? (
          <div className="mt-2 space-y-1">
            {diagnoses.map((dx, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-xs leading-snug">
                <span className="text-primary font-bold shrink-0 mt-0.5 leading-none">•</span>
                <span
                  className={`break-words whitespace-normal text-left ${
                    idx === 0 ? 'font-bold text-primary' : 'font-medium text-ink'
                  }`}
                >
                  {dx}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="group mt-1.5 flex items-center justify-between gap-1 text-xs font-bold text-primary py-0.5">
            <span className="truncate">Lihat Rekam Medis</span>
            <ChevronRight size={14} className="shrink-0 text-primary/70 group-hover:translate-x-0.5 transition-transform" />
          </div>
        )
      )}

      {/* Format SOAP Temuan Positif dengan Separator Line Antar Baris & Klik Area Toggle */}
      {hasSoap && (
        <div className="mt-2 pt-1 border-t border-slate-100 divide-y divide-slate-100 text-xs">
          {noteForS?.tanggal && (
            <div className="flex items-center justify-between pb-1 text-xs font-semibold text-ink-muted/80">
              <span>{formatNoteDate(noteForS.tanggal)}</span>
            </div>
          )}

          {/* S: Subjektif */}
          {hasS && (
            <div
              onClick={(e) => {
                if (canExpandS) toggleSection('S', e)
              }}
              className={`py-1.5 -mx-1 px-1 rounded-xl transition-colors ${
                canExpandS ? 'cursor-pointer hover:bg-slate-50/70 active:bg-slate-100/70' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span className="font-bold text-primary text-xs shrink-0 mt-0.5">S:</span>
                  <div className="min-w-0 flex-1">
                    {!expandedSections['S'] ? (
                      <span className="text-ink font-medium break-words text-xs line-clamp-2">
                        {sSummary}
                      </span>
                    ) : (
                      <p className="text-ink font-medium break-words leading-relaxed whitespace-pre-line bg-slate-50/90 p-2.5 rounded-xl text-xs">
                        {sFull || sSummary}
                      </p>
                    )}
                  </div>
                </div>
                {canExpandS && (
                  <button
                    type="button"
                    onClick={(e) => toggleSection('S', e)}
                    className="text-ink-muted hover:text-ink p-0.5 shrink-0 cursor-pointer mt-0.5"
                    aria-label="Toggle detail S"
                    title={expandedSections['S'] ? 'Tutup detail' : 'Buka detail'}
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${
                        expandedSections['S'] ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* O: Objektif */}
          {hasO && (
            <div
              onClick={(e) => {
                if (canExpandO) toggleSection('O', e)
              }}
              className={`py-1.5 -mx-1 px-1 rounded-xl transition-colors ${
                canExpandO ? 'cursor-pointer hover:bg-slate-50/70 active:bg-slate-100/70' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span className="font-bold text-primary text-xs shrink-0 mt-0.5">O:</span>
                  <div className="min-w-0 flex-1">
                    {!expandedSections['O'] ? (
                      <span className="text-ink font-medium break-words text-xs line-clamp-2">
                        {oSummary}
                      </span>
                    ) : (
                      <div className="space-y-1.5 text-ink font-medium break-words bg-slate-50/90 p-2.5 rounded-xl text-xs">
                        {oPemfis && (
                          <p className="leading-relaxed whitespace-pre-line">
                            <span className="font-semibold text-primary">Fisik: </span>
                            {oPemfis}
                          </p>
                        )}
                        {oPenunjang && (
                          <p className={`leading-relaxed whitespace-pre-line ${oPemfis ? 'border-t border-slate-200/60 pt-1.5' : ''}`}>
                            <span className="font-semibold text-primary">Penunjang: </span>
                            {oPenunjang}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {canExpandO && (
                  <button
                    type="button"
                    onClick={(e) => toggleSection('O', e)}
                    className="text-ink-muted hover:text-ink p-0.5 shrink-0 cursor-pointer mt-0.5"
                    aria-label="Toggle detail O"
                    title={expandedSections['O'] ? 'Tutup detail' : 'Buka detail'}
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${
                        expandedSections['O'] ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* A: Assessment */}
          {hasA && (
            <div
              onClick={(e) => {
                if (canExpandA) toggleSection('A', e)
              }}
              className={`py-1.5 -mx-1 px-1 rounded-xl transition-colors ${
                canExpandA ? 'cursor-pointer hover:bg-slate-50/70 active:bg-slate-100/70' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span className="font-bold text-primary text-xs shrink-0 mt-0.5">A:</span>
                  <div className="min-w-0 flex-1">
                    {!expandedSections['A'] ? (
                      <span className="text-ink font-medium break-words text-xs line-clamp-2">
                        {aSummary}
                      </span>
                    ) : (
                      <div className="space-y-1 bg-slate-50/90 p-2.5 rounded-xl text-xs">
                        {diagnoses.map((dx, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-ink font-medium">
                            <span className="text-primary font-bold shrink-0 mt-0.5">•</span>
                            <span className="break-words">{dx}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {canExpandA && (
                  <button
                    type="button"
                    onClick={(e) => toggleSection('A', e)}
                    className="text-ink-muted hover:text-ink p-0.5 shrink-0 cursor-pointer mt-0.5"
                    aria-label="Toggle detail A"
                    title={expandedSections['A'] ? 'Tutup detail' : 'Buka detail'}
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${
                        expandedSections['A'] ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* P: Plan */}
          {hasP && (
            <div
              onClick={(e) => {
                if (canExpandP) toggleSection('P', e)
              }}
              className={`py-1.5 -mx-1 px-1 rounded-xl transition-colors ${
                canExpandP ? 'cursor-pointer hover:bg-slate-50/70 active:bg-slate-100/70' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span className="font-bold text-primary text-xs shrink-0 mt-0.5">P:</span>
                  <div className="min-w-0 flex-1">
                    {!expandedSections['P'] ? (
                      <span className="text-ink font-medium break-words text-xs line-clamp-2">
                        {pSummary || 'Belum ada terapi aktif'}
                      </span>
                    ) : (
                      <div className="space-y-1.5 bg-slate-50/90 p-2.5 rounded-xl text-xs">
                        {allTherapies.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 text-ink">
                            <span className={`font-medium break-words ${item.status === 'stop' ? 'line-through text-ink-muted' : 'text-ink'}`}>
                              • {item.nama_item} {item.dosis_keterangan}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                                item.status === 'stop'
                                  ? 'bg-rose-50 text-rose-600 border border-rose-200/60'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {canExpandP && (
                  <button
                    type="button"
                    onClick={(e) => toggleSection('P', e)}
                    className="text-ink-muted hover:text-ink p-0.5 shrink-0 cursor-pointer mt-0.5"
                    aria-label="Toggle detail P"
                    title={expandedSections['P'] ? 'Tutup detail' : 'Buka detail'}
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${
                        expandedSections['P'] ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Badges & Tombol Visite di Kanan Bawah */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
            {patient.jaminan}
          </span>
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
            P-{hariKe(patient.tgl_mrs)}
          </span>
          {patient.tgl_onset && (
            <span className="rounded-full bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-xs font-bold text-amber-700">
              OH-{hariKe(patient.tgl_onset)}
            </span>
          )}
        </div>

        {onOpenVisite ? (
          <button
            type="button"
            onClick={onOpenVisite}
            onPointerDown={(e) => e.stopPropagation()}
            title={isVisitedToday ? 'Sudah divisite hari ini (Klik untuk edit)' : 'Belum divisite hari ini (Klik untuk catat visite)'}
            className={`shrink-0 h-7.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 justify-center cursor-pointer select-none ${
              isVisitedToday
                ? 'bg-slate-100 hover:bg-slate-200/90 text-slate-500 hover:text-slate-700 border border-slate-200/90 shadow-2xs'
                : 'bg-gradient-to-r from-primary to-primary-deep text-white shadow-sm shadow-primary/25 hover:shadow-md hover:shadow-primary/35 hover:brightness-105 animate-flicker-blue'
            }`}
          >
            {isVisitedToday && <Check size={13} className="stroke-[2.5]" />}
            <span>Visite</span>
          </button>
        ) : (
          <span
            className={`shrink-0 h-7.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 justify-center select-none ${
              isVisitedToday
                ? 'bg-slate-100 text-slate-400 border border-slate-200/60'
                : 'bg-gradient-to-r from-primary to-primary-deep text-white shadow-sm shadow-primary/25 opacity-80'
            }`}
          >
            {isVisitedToday && <Check size={13} className="stroke-[2.5]" />}
            <span>Visite</span>
          </span>
        )}
      </div>
    </div>
  )
}

function PatientCard({
  patient,
  latestNote,
  latestNoteWithS,
  isAnyDragging,
  isHighlighted,
  onOpenVisite,
}: {
  patient: Patient
  latestNote?: ProgressNote
  latestNoteWithS?: ProgressNote
  isAnyDragging?: boolean
  isHighlighted?: boolean
  onOpenVisite?: (patient: Patient, latestNote?: ProgressNote) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: patient.id!,
  })
  const navigate = useNavigate()
  const { unmasked, setUnmasked } = useUi()
  const todayStr = getLocalDateString()
  const isVisitedToday = latestNote?.tanggal === todayStr

  const handleToggleMask = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (unmasked) {
      setUnmasked(false)
    } else {
      const ok = await verifyBiometric()
      if (ok) setUnmasked(true)
    }
  }

  const handleOpenVisiteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenVisite?.(patient, latestNote)
  }

  return (
    <div
      id={`patient-card-${patient.id}`}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-no-swipe="true"
      onClick={() => {
        if (!isDragging && !isAnyDragging) {
          sessionStorage.setItem('doctoid_dasbor_scroll_y', String(window.scrollY))
          sessionStorage.setItem('doctoid_last_patient_id', String(patient.id))
          navigate(`/rekammedis/${patient.id}`)
        }
      }}
      className={`rounded-2xl p-3.5 sm:p-4 select-none touch-manipulation transition-colors duration-150 ${
        isHighlighted
          ? 'ring-2 ring-primary/80 shadow-md shadow-primary/15 bg-primary/[0.04]'
          : ''
      } ${
        isDragging
          ? 'opacity-25 grayscale-[30%] border-2 border-dashed border-primary/50 bg-primary/5 shadow-none pointer-events-none'
          : isVisitedToday
          ? 'bg-slate-50/80 border border-slate-200/80 opacity-70 hover:opacity-100 hover:border-primary/40 cursor-pointer shadow-2xs hover:shadow-md'
          : 'glass-card border border-white/80 cursor-pointer hover:border-primary/40 shadow-xs hover:shadow-md'
      }`}
    >
      <PatientCardContent
        patient={patient}
        latestNote={latestNote}
        latestNoteWithS={latestNoteWithS}
        unmasked={unmasked}
        isVisitedToday={isVisitedToday}
        onOpenVisite={handleOpenVisiteClick}
        handleToggleMask={handleToggleMask}
      />
    </div>
  )
}

function WardColumn({
  ward,
  patients,
  latestNoteMap,
  latestNoteWithSMap,
  isAnyDragging,
  lastMovedWardId,
  highlightPatientId,
  onOpenVisite,
}: {
  ward: Ward
  patients: Patient[]
  latestNoteMap?: Map<number, ProgressNote>
  latestNoteWithSMap?: Map<number, ProgressNote>
  isAnyDragging?: boolean
  lastMovedWardId?: number | null
  highlightPatientId?: number | null
  onOpenVisite?: (patient: Patient, latestNote?: ProgressNote) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ward.id! })
  const { collapsedWards, toggleCollapsedWard, expandWard } = useUi()

  // Otomatis buka ruangan bila ada pasien yang baru saja dipindahkan ke ruangan ini
  useEffect(() => {
    if (lastMovedWardId === ward.id && ward.id !== undefined) {
      expandWard(ward.id)
    }
  }, [lastMovedWardId, ward.id, expandWard])

  const collapsed =
    ward.id !== undefined && collapsedWards[ward.id] !== undefined
      ? collapsedWards[ward.id]
      : patients.length === 0

  const todayStr = getLocalDateString()
  const unvisitedCount = useMemo(() => {
    return patients.filter((p) => {
      const note = latestNoteMap?.get(p.id!)
      return note?.tanggal !== todayStr
    }).length
  }, [patients, latestNoteMap, todayStr])
  const hasUnvisited = unvisitedCount > 0

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 transition-all duration-150 p-1.5 ${
        isOver
          ? 'border-primary/60 bg-primary/8 shadow-md ring-2 ring-primary/25'
          : 'border-transparent bg-transparent'
      }`}
    >
      <button
        type="button"
        onClick={() => ward.id !== undefined && toggleCollapsedWard(ward.id, collapsed)}
        className="w-full mb-1.5 flex items-center justify-between px-1 cursor-pointer select-none group text-left"
        aria-label={`Sembunyikan atau tampilkan ruangan ${ward.nama}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="size-2.5 rounded-full ring-2 ring-white shadow-xs shrink-0"
            style={{ backgroundColor: ward.kode_warna }}
          />
          <h3 className="text-xs font-bold text-ink tracking-tight truncate group-hover:text-primary transition-colors">
            {ward.nama}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow-2xs min-w-[1.4rem] text-center transition-all ${
              isOver
                ? 'bg-primary text-white font-extrabold'
                : hasUnvisited
                ? 'bg-primary/10 border border-primary/30 text-primary animate-flicker-blue-badge'
                : patients.length > 0
                ? 'bg-slate-100 border border-slate-200/80 text-slate-500'
                : 'bg-white/90 border border-slate-200/60 text-ink-muted'
            }`}
            title={
              hasUnvisited
                ? `${unvisitedCount} dari ${patients.length} pasien belum divisite hari ini`
                : patients.length > 0
                ? `Semua ${patients.length} pasien sudah divisite hari ini`
                : 'Belum ada pasien'
            }
          >
            {patients.length}
          </span>
          <ChevronDown
            size={15}
            className={`text-ink-muted group-hover:text-ink transition-transform duration-200 ${
              collapsed ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </div>
      </button>

      {!collapsed && (
        <div className="space-y-2.5">
          {patients.map((p) => (
            <PatientCard
              key={p.id}
              patient={p}
              latestNote={latestNoteMap?.get(p.id!)}
              latestNoteWithS={latestNoteWithSMap?.get(p.id!)}
              isAnyDragging={isAnyDragging}
              isHighlighted={highlightPatientId === p.id}
              onOpenVisite={onOpenVisite}
            />
          ))}

          {!patients.length && (
            <div
              className={`rounded-2xl border-2 border-dashed py-3.5 px-4 text-center text-xs font-medium transition-all ${
                isOver
                  ? 'border-primary bg-primary/10 text-primary font-bold animate-pulse'
                  : 'border-slate-300/80 bg-white/40 text-ink-muted/70'
              }`}
            >
              {isOver ? `Lepas untuk menempatkan di ${ward.nama}` : 'Belum ada pasien di ruangan ini'}
            </div>
          )}

          {patients.length > 0 && isOver && (
            <div className="rounded-xl border-2 border-dashed border-primary bg-primary/10 py-2.5 text-center text-xs font-bold text-primary animate-pulse">
              Pindahkan ke {ward.nama}
            </div>
          )}
        </div>
      )}

      {collapsed && isOver && (
        <div className="rounded-xl border-2 border-dashed border-primary bg-primary/15 py-3 text-center text-xs font-bold text-primary animate-pulse">
          Pindahkan ke {ward.nama} (Akan dibuka otomatis)
        </div>
      )}
    </div>
  )
}

export default function Dasbor() {
  const navigate = useNavigate()
  const {
    user,
    unmasked,
    setUnmasked,
    collapsedRs,
    toggleCollapsedRs,
    expandHospital,
    expandWard,
  } = useUi()
  const [filterRs, setFilterRs] = useState<number>(() => {
    try {
      const s = sessionStorage.getItem('doctoid_dasbor_filter_rs')
      return s ? parseInt(s, 10) : 0
    } catch {
      return 0
    }
  })
  const [toast, setToast] = useState('')
  const [activePatient, setActivePatient] = useState<Patient | null>(null)
  const [lastMovedWardId, setLastMovedWardId] = useState<number | null>(null)
  const [addWardHospital, setAddWardHospital] = useState<Hospital | null>(null)
  const [newWardInput, setNewWardInput] = useState('')
  const [visiteTarget, setVisiteTarget] = useState<{ patient: Patient; latestNote?: ProgressNote } | null>(null)
  const filterScrollRef = useRef<HTMLDivElement>(null)

  const centerElement = (el: HTMLElement) => {
    const container = filterScrollRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const relativeLeft = elRect.left - containerRect.left
    const targetScrollLeft = container.scrollLeft + relativeLeft - container.clientWidth / 2 + elRect.width / 2
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth)
    container.scrollTo({ left: Math.max(0, Math.min(maxScroll, targetScrollLeft)), behavior: 'smooth' })
  }

  const handleFilterClick = (id: number, e?: React.MouseEvent<HTMLButtonElement>) => {
    setFilterRs(id)
    sessionStorage.setItem('doctoid_dasbor_filter_rs', String(id))
    if (e?.currentTarget) {
      centerElement(e.currentTarget)
    }
  }

  const toggleRs = (id: number, currentCollapsed: boolean) => {
    toggleCollapsedRs(id, currentCollapsed)
  }
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 4000)
  }

  const handleToggleMask = async () => {
    if (unmasked) {
      setUnmasked(false)
    } else {
      const ok = await verifyBiometric()
      if (ok) setUnmasked(true)
    }
  }

  const hospitals = useLiveQuery(
    async () => (await db.hospitals.toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [],
    []
  )

  useEffect(() => {
    if (!filterScrollRef.current) return
    const activeEl = filterScrollRef.current.querySelector<HTMLElement>('[data-active="true"]')
    if (activeEl) {
      const timer = setTimeout(() => {
        centerElement(activeEl)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [filterRs, hospitals?.length])
  const wards = useLiveQuery(
    async () => (await db.wards.toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [],
    []
  )
  const aktif = useLiveQuery(() => db.patients.where('status_rawat').equals('aktif').toArray(), [], [])
  const allNotes = useLiveQuery(() => db.progressNotes.toArray(), [], [])

  // Restorasi dan pencatatan posisi scroll
  const [highlightPatientId, setHighlightPatientId] = useState<number | null>(null)
  const hasRestoredScroll = useRef(false)
  const isRestoringScroll = useRef(false)

  // Rekam posisi scroll Dasbor saat user scrolling
  useEffect(() => {
    let timeoutId: any
    const handleScroll = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (isRestoringScroll.current) return
        sessionStorage.setItem('doctoid_dasbor_scroll_y', String(window.scrollY))
      }, 100)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('scroll', handleScroll)
      if (!isRestoringScroll.current && window.scrollY > 0) {
        sessionStorage.setItem('doctoid_dasbor_scroll_y', String(window.scrollY))
      }
    }
  }, [])

  // Restorasi posisi scroll & highlight kartu pasien saat kembali ke Dasbor
  useEffect(() => {
    if (hasRestoredScroll.current) return
    if (aktif === undefined || wards === undefined || hospitals === undefined) return

    const savedYStr = sessionStorage.getItem('doctoid_dasbor_scroll_y')
    const savedPatientId = sessionStorage.getItem('doctoid_last_patient_id')
    const savedY = savedYStr ? parseInt(savedYStr, 10) : 0

    if (!savedY && !savedPatientId) {
      hasRestoredScroll.current = true
      return
    }

    // Pastikan faskes & ruangan pasien target dalam keadaan terbuka (expanded)
    if (savedPatientId) {
      const pId = parseInt(savedPatientId, 10)
      const targetP = aktif.find((p) => p.id === pId)
      if (targetP) {
        if (targetP.hospital_id) expandHospital(targetP.hospital_id)
        if (targetP.lokasi_sekarang) expandWard(targetP.lokasi_sekarang)
      }
    }

    isRestoringScroll.current = true

    const timer = setTimeout(() => {
      let restored = false
      if (savedPatientId) {
        const pId = parseInt(savedPatientId, 10)
        const el = document.getElementById(`patient-card-${savedPatientId}`)
        if (el) {
          if (savedY > 0) {
            window.scrollTo({ top: savedY, behavior: 'instant' })
          } else {
            el.scrollIntoView({ block: 'center', behavior: 'instant' })
          }
          setHighlightPatientId(pId)
          setTimeout(() => {
            setHighlightPatientId(null)
            sessionStorage.removeItem('doctoid_last_patient_id')
          }, 2500)
          restored = true
        }
      }

      if (!restored && savedY > 0) {
        window.scrollTo({ top: savedY, behavior: 'instant' })
      }

      hasRestoredScroll.current = true

      setTimeout(() => {
        isRestoringScroll.current = false
      }, 150)
    }, 60)

    return () => clearTimeout(timer)
  }, [aktif, wards, hospitals, expandHospital, expandWard])

  const { latestNoteMap, latestNoteWithSMap } = useMemo(() => {
    const latestMap = new Map<number, ProgressNote>()
    const withSMap = new Map<number, ProgressNote>()
    if (!allNotes) return { latestNoteMap: latestMap, latestNoteWithSMap: withSMap }

    const sorted = [...allNotes].sort((a, b) => {
      const tA = a.tanggal ? new Date(a.tanggal).getTime() : 0
      const tB = b.tanggal ? new Date(b.tanggal).getTime() : 0
      if (tA !== tB) return tA - tB
      return (a.id ?? 0) - (b.id ?? 0)
    })

    for (const note of sorted) {
      latestMap.set(note.patient_id, note)
      if (cleanSubjective(note.S)) {
        withSMap.set(note.patient_id, note)
      }
    }

    return { latestNoteMap: latestMap, latestNoteWithSMap: withSMap }
  }, [allNotes])

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 400, // Durasi long-press standar (400ms) agar tidak terpicu saat scrolling atau tap biasa
        tolerance: 5, // Batas pergeseran jari (5px) sebelum membatalkan mode drag untuk scrolling alami
      },
    }),
  )

  const onDragStart = (e: DragStartEvent) => {
    const found = (aktif ?? []).find((p) => p.id === e.active.id)
    setActivePatient(found || null)
    triggerHaptic('start')
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActivePatient(null)

    if (over && active.id) {
      const patientId = active.id as number
      const targetWardId = over.id as number
      const currentPatient = (aktif ?? []).find((p) => p.id === patientId)

      if (currentPatient && currentPatient.lokasi_sekarang !== targetWardId) {
        triggerHaptic('drop')
        const targetWard = (wards ?? []).find((w) => w.id === targetWardId)
        const targetHospital = targetWard
          ? (hospitals ?? []).find((h) => h.id === targetWard.hospital_id)
          : null

        setLastMovedWardId(targetWardId)
        expandWard(targetWardId)
        if (targetHospital) {
          expandHospital(targetHospital.id!)
        }

        await db.patients.update(patientId, {
          lokasi_sekarang: targetWardId,
          ...(targetHospital ? { hospital_id: targetHospital.id } : {}),
        })

        notify(
          `Pasien ${currentPatient.title ? currentPatient.title + ' ' : ''}${
            currentPatient.nama_depan || 'terpilih'
          } dipindahkan ke ${targetWard?.nama || 'ruangan baru'}`
        )
      }
    }
  }

  const onDragCancel = () => {
    setActivePatient(null)
    triggerHaptic('cancel')
  }

  const hospitalStats = (hospitals ?? []).map((h) => ({
    id: h.id!,
    name: h.nama,
    value: (aktif ?? []).filter((p) => p.hospital_id === h.id).length,
    fill: h.kode_warna,
  }))

  const chartSlices = hospitalStats.filter((d) => d.value > 0)

  return (
    <main className="space-y-5 p-5">
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

            {/* Bawah: Pasien Dirawat di Kiri & Tombol Aksi Cepat (Mata + Gir) di Kanan */}
            <div className="flex items-end justify-between pt-3 border-t border-white/15 gap-2">
              <div>
                <h1 className="h1 text-2xl sm:text-3xl font-black text-white leading-none">
                  {aktif?.length ?? 0}
                </h1>
                <p className="text-xs font-bold text-white/95 mt-1 tracking-wide">
                  Pasien Dirawat
                </p>
              </div>

              {/* Tombol Aksi Cepat (Eye & Settings) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleToggleMask}
                  aria-label={unmasked ? 'Sensor Identitas Pasien' : 'Tampilkan Identitas Pasien (Biometrik)'}
                  className="flex size-8 sm:size-9 cursor-pointer items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md text-white hover:bg-white/25 active:scale-95 transition-all"
                  title={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
                >
                  {unmasked ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>

                <button
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

      {/* Filter Faskes / RS + Tombol Kelola Faskes (Pencil) */}
      <div className="flex items-center gap-2">
        <div
          ref={filterScrollRef}
          className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar scroll-smooth"
        >
          <button
            type="button"
            data-active={!filterRs}
            onClick={(e) => handleFilterClick(0, e)}
            className={`h-9 cursor-pointer rounded-full px-4 text-xs font-bold shrink-0 transition-all whitespace-nowrap ${
              !filterRs
                ? 'bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/30'
                : 'glass-card text-ink-muted hover:text-ink'
            }`}
          >
            Semua
          </button>
          {hospitals?.map((h) => (
            <button
              key={h.id}
              type="button"
              data-active={filterRs === h.id}
              onClick={(e) => handleFilterClick(h.id!, e)}
              className={`flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-xs font-bold transition-all whitespace-nowrap ${
                filterRs === h.id ? 'text-white shadow-md' : 'glass-card text-ink-muted hover:text-ink'
              }`}
              style={filterRs === h.id ? { backgroundColor: h.kode_warna } : undefined}
            >
              <span
                className={`size-2 rounded-full shrink-0 ${filterRs === h.id ? 'bg-white' : ''}`}
                style={filterRs === h.id ? undefined : { backgroundColor: h.kode_warna }}
              />
              <span>{h.nama}</span>
            </button>
          ))}
        </div>

        {/* Tombol Kelola Faskes (Icon Pensil Tanpa Teks) - Posisi tetap di kanan */}
        <button
          onClick={() => navigate('/pengaturan?tab=manajemen')}
          title="Kelola Faskes & Ruangan"
          aria-label="Kelola Faskes & Ruangan"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full glass-card text-ink-muted hover:text-primary hover:bg-primary/10 active:scale-95 transition-all shadow-xs"
        >
          <Pencil size={15} />
        </button>
      </div>

      {/* Beban Kasus Chart */}
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
                      return (
                        <div className="rounded-xl border border-primary/20 bg-white/95 px-3 py-1.5 shadow-md pointer-events-none">
                          <span className="text-xs font-bold text-primary">
                            {item.name} : {item.value}
                          </span>
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
              const isSelected = filterRs === d.id
              return (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => handleFilterClick(filterRs === d.id ? 0 : d.id)}
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

      {/* Board Ruangan & Pasien */}
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="space-y-5" data-no-swipe="true">
          {hospitals?.filter((h) => !filterRs || h.id === filterRs).map((h) => {
            const wardsInH = (wards ?? []).filter((w) => w.hospital_id === h.id)
            const wardIds = new Set(wardsInH.map((w) => w.id))
            const totalPasienRs = (aktif ?? []).filter((p) => wardIds.has(p.lokasi_sekarang)).length
            const isRsCollapsed = collapsedRs[h.id!] !== undefined ? collapsedRs[h.id!] : totalPasienRs === 0

            return (
              <div key={h.id} className="space-y-3">
                {!filterRs && (
                  <div className="pt-2 pb-0.5">
                    <button
                      type="button"
                      onClick={() => toggleRs(h.id!, isRsCollapsed)}
                      className="w-full flex items-center justify-between gap-2 rounded-full bg-gradient-to-r from-primary to-primary-deep text-white px-4 py-2 shadow-sm shadow-primary/25 cursor-pointer select-none active:scale-[0.99] transition-all text-left"
                      aria-label={`Sembunyikan atau tampilkan faskes ${h.nama}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 size={16} className="text-white/90 shrink-0" />
                        <h2 className="text-xs sm:text-sm font-black tracking-tight truncate text-white">
                          {h.nama}
                        </h2>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full bg-white/20 backdrop-blur-md px-2 py-0.5 text-xs font-bold text-white min-w-[1.5rem] text-center">
                          {totalPasienRs}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`text-white transition-transform duration-200 ${
                            isRsCollapsed ? 'rotate-180' : 'rotate-0'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                )}

                {(!isRsCollapsed || !!filterRs) && (
                  <div className="space-y-3.5 animate-in fade-in duration-150">
                    {wardsInH.length > 0 ? (
                      wardsInH.map((w) => (
                        <WardColumn
                          key={w.id}
                          ward={w}
                          patients={(aktif ?? []).filter((p) => p.lokasi_sekarang === w.id)}
                          latestNoteMap={latestNoteMap}
                          latestNoteWithSMap={latestNoteWithSMap}
                          isAnyDragging={!!activePatient}
                          lastMovedWardId={lastMovedWardId}
                          highlightPatientId={highlightPatientId}
                          onOpenVisite={(patient, note) => setVisiteTarget({ patient, latestNote: note })}
                        />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2.5 rounded-3xl glass-card p-6 text-center">
                        <BedDouble size={28} className="text-primary-soft" />
                        <p className="body-md text-xs text-ink-muted">
                          Belum ada ruangan di <span className="font-bold text-ink">{h.nama}</span>.
                        </p>
                        <p className="caption text-[11px] text-ink-muted/70 max-w-xs">
                          Buat ruangan terlebih dahulu untuk mulai menempatkan pasien di faskes ini.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAddWardHospital(h)
                              setNewWardInput('')
                            }}
                            className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-4 py-2 text-xs font-bold text-white shadow-md shadow-primary/20 active:scale-95 transition-all cursor-pointer"
                          >
                            <Plus size={15} /> Buat Ruangan
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate('/pengaturan?tab=manajemen')}
                            className="flex items-center gap-1.5 rounded-2xl glass-card px-3.5 py-2 text-xs font-semibold text-ink-muted hover:text-ink active:scale-95 transition-all cursor-pointer"
                          >
                            Pengaturan Faskes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {!hospitals?.length && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl glass-card p-8 text-center">
              <Building2 size={32} className="text-primary-soft" />
              <p className="body-md text-xs text-ink-muted">Belum ada faskes yang terdaftar.</p>
              <Link to="/pengaturan?tab=manajemen" className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-deep px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20">
                <Plus size={16} /> Tambah Faskes Baru
              </Link>
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={dropAnimationConfig}>
          {activePatient ? (
            <div className="glass-card rounded-2xl p-3.5 sm:p-4 bg-white/95 border-2 border-primary shadow-xl ring-2 ring-primary/20 select-none pointer-events-none cursor-grabbing">
              <PatientCardContent
                patient={activePatient}
                latestNote={latestNoteMap.get(activePatient.id!)}
                latestNoteWithS={latestNoteWithSMap.get(activePatient.id!)}
                unmasked={unmasked}
                isVisitedToday={latestNoteMap.get(activePatient.id!)?.tanggal === getLocalDateString()}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modal Cepat Buat Ruangan */}
      {addWardHospital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-ink">Buat Ruangan Baru</h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Faskes: <span className="font-semibold text-primary">{addWardHospital.nama}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddWardHospital(null)}
                className="rounded-full p-1 text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!newWardInput.trim()) return
                const existingWards = await db.wards.where('hospital_id').equals(addWardHospital.id!).toArray()
                await db.wards.add({
                  hospital_id: addWardHospital.id!,
                  nama: newWardInput.trim(),
                  kode_warna: addWardHospital.kode_warna || '#3B82F6',
                  order: existingWards.length + 1,
                })
                notify(`Ruangan "${newWardInput.trim()}" berhasil dibuat`)
                setAddWardHospital(null)
                setNewWardInput('')
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  Nama Ruangan
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newWardInput}
                  onChange={(e) => setNewWardInput(e.target.value)}
                  placeholder="mis. Ruang Anggrek, ICU, IGD, Poli Umum..."
                  className="w-full h-10 rounded-2xl border border-slate-200 px-3.5 text-xs text-ink placeholder:text-ink-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddWardHospital(null)}
                  className="h-9 px-4 rounded-xl text-xs font-bold text-ink-muted hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newWardInput.trim()}
                  className="h-9 px-4 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                >
                  Simpan Ruangan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visite Harian (SOAP Cepat) */}
      {visiteTarget && (
        <VisiteModal
          patient={visiteTarget.patient}
          latestNote={visiteTarget.latestNote}
          onClose={() => setVisiteTarget(null)}
          onSaved={(msg) => notify(msg)}
        />
      )}

      {toast && (
        <aside aria-label="Notifikasi" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-2xl bg-ink/90 backdrop-blur-md px-5 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </aside>
      )}
    </main>
  )
}
