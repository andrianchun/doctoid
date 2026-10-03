import { useState, useRef, useEffect, useId } from 'react'
import {
  searchStandardDrugs,
  searchStandardProcedures,
  searchStandardDiagnoses,
  type StandardDrug,
  type StandardProcedure,
  type StandardDiagnosis,
} from '../utils/clinicalDictionary'
import { Sparkles, Check, ChevronRight } from 'lucide-react'

export interface PredictiveSelection {
  name: string
  detail?: string
  code?: string
  category?: string
}

interface PredictiveInputProps {
  type: 'drug' | 'procedure' | 'diagnosis'
  value: string
  onChange: (val: string) => void
  onSelect?: (item: PredictiveSelection) => void
  placeholder?: string
  procedureCategory?: 'Laboratorium' | 'Radiologi' | 'Lainnya'
  className?: string
  inputClassName?: string
  autoFocus?: boolean
  required?: boolean
  id?: string
  name?: string
  disabled?: boolean
}

export default function PredictiveInput({
  type,
  value,
  onChange,
  onSelect,
  placeholder,
  procedureCategory,
  className = '',
  inputClassName = '',
  autoFocus = false,
  required = false,
  id,
  name,
  disabled = false,
}: PredictiveInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const [activeDrugForDosage, setActiveDrugForDosage] = useState<StandardDrug | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const generatedId = useId()
  const inputId = id || generatedId

  // Compute suggestions based on type
  const suggestions = (() => {
    if (!value || value.trim().length < 2) return []
    if (type === 'drug') {
      return searchStandardDrugs(value, 5)
    }
    if (type === 'procedure') {
      return searchStandardProcedures(value, procedureCategory, 5)
    }
    if (type === 'diagnosis') {
      return searchStandardDiagnoses(value, 5)
    }
    return []
  })()

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setActiveDrugForDosage(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault()
        handlePick(suggestions[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveDrugForDosage(null)
    }
  }

  const handlePick = (item: StandardDrug | StandardProcedure | StandardDiagnosis) => {
    if (type === 'drug') {
      const drug = item as StandardDrug
      if (drug.commonDosages && drug.commonDosages.length > 0 && !activeDrugForDosage) {
        // Expand dosage sub-options if present
        setActiveDrugForDosage(drug)
        onChange(drug.name)
        return
      }
      onChange(drug.name)
      if (onSelect) {
        onSelect({
          name: drug.name,
          detail: drug.commonDosages?.[0] || '',
          category: drug.category,
        })
      }
    } else if (type === 'procedure') {
      const proc = item as StandardProcedure
      onChange(proc.name)
      if (onSelect) {
        onSelect({
          name: proc.name,
          code: proc.icd9,
          category: proc.category,
        })
      }
    } else if (type === 'diagnosis') {
      const diag = item as StandardDiagnosis
      onChange(diag.name)
      if (onSelect) {
        onSelect({
          name: diag.name,
          code: diag.icd10,
          category: diag.category,
        })
      }
    }

    setIsOpen(false)
    setActiveDrugForDosage(null)
  }

  const handlePickDosage = (drug: StandardDrug, dosage: string) => {
    onChange(drug.name)
    if (onSelect) {
      onSelect({
        name: drug.name,
        detail: dosage,
        category: drug.category,
      })
    }
    setIsOpen(false)
    setActiveDrugForDosage(null)
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setIsOpen(true)
          setSelectedIndex(-1)
          setActiveDrugForDosage(null)
        }}
        onFocus={() => {
          if (value.trim().length >= 2) setIsOpen(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />

      {/* Floating Suggestions List */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl backdrop-blur-md animate-in fade-in duration-100 divide-y divide-slate-100">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <Sparkles size={11} className="text-primary" />
            <span>Rekomendasi Standar {type === 'drug' ? 'Fornas' : type === 'procedure' ? 'ICD-9-CM' : 'ICD-10'}</span>
          </div>

          <div className="py-1 space-y-0.5">
            {suggestions.map((item, idx) => {
              const isSelected = idx === selectedIndex
              const isDrug = type === 'drug'
              const drug = item as StandardDrug
              const proc = item as StandardProcedure
              const diag = item as StandardDiagnosis

              return (
                <div key={idx} className="rounded-xl overflow-hidden transition-colors">
                  <div
                    onClick={() => handlePick(item)}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer text-xs rounded-xl transition-all ${
                      isSelected
                        ? 'bg-primary text-white font-semibold'
                        : 'text-ink hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-semibold">{item.name}</span>
                      {type === 'procedure' && proc.icd9 && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono shrink-0 ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          ICD-9: {proc.icd9}
                        </span>
                      )}
                      {type === 'diagnosis' && diag.icd10 && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono shrink-0 ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {diag.icd10}
                        </span>
                      )}
                    </div>

                    {isDrug && drug.commonDosages && drug.commonDosages.length > 0 && (
                      <span className={`text-[11px] flex items-center gap-0.5 shrink-0 ${
                        isSelected ? 'text-white/80' : 'text-slate-400'
                      }`}>
                        Dosis <ChevronRight size={13} />
                      </span>
                    )}
                  </div>

                  {/* Expanded Common Dosages for Drug */}
                  {isDrug && activeDrugForDosage?.name === drug.name && (
                    <div className="bg-slate-50/90 rounded-xl p-2 my-1 border border-slate-200/80 space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 mb-1">
                        Pilih Dosis Lazim {drug.name}:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {drug.commonDosages.map((dos, dIdx) => (
                          <button
                            key={dIdx}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handlePickDosage(drug, dos)
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-primary hover:text-white border border-slate-200 text-ink text-[11px] font-medium transition-all shadow-2xs cursor-pointer"
                          >
                            <Check size={11} className="text-primary group-hover:text-white" />
                            <span>{dos}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
