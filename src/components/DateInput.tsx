import React, { useState, useEffect, useRef } from 'react'
import { Calendar, Zap, Clock } from 'lucide-react'
import { toDisplayDate, parseToIsoDate, getLocalDateString } from '../utils/dateFormat'

export interface DateInputProps {
  value: string
  onChange: (isoDate: string) => void
  className?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
  name?: string
  autoFocus?: boolean
}

export default function DateInput({
  value,
  onChange,
  className = '',
  placeholder = 'DD/MM/YY',
  required = false,
  disabled = false,
  id,
  name,
  autoFocus,
}: DateInputProps) {
  const [text, setText] = useState(() => toDisplayDate(value))
  const [showMenu, setShowMenu] = useState(false)
  const hiddenDateRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setText(toDisplayDate(value))
  }, [value])

  useEffect(() => {
    if (!showMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [showMenu])

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value

    // Auto-bantu format jika user mengetik 6 digit berurutan tanpa separator (misal: 111026 -> 11/10/26)
    const digitsOnly = raw.replace(/\D/g, '')
    if (digitsOnly.length === 6 && !raw.includes('/') && !raw.includes('-')) {
      raw = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4, 6)}`
    } else if (digitsOnly.length === 8 && !raw.includes('/') && !raw.includes('-')) {
      raw = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(6, 8)}`
    }

    setText(raw)
    const iso = parseToIsoDate(raw)
    if (iso) {
      onChange(iso)
    }
  }

  const handleBlur = () => {
    const iso = parseToIsoDate(text)
    if (iso) {
      onChange(iso)
      setText(toDisplayDate(iso))
    } else if (!text.trim() && !required) {
      onChange('')
      setText('')
    } else {
      setText(toDisplayDate(value))
    }
  }

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value
    if (iso) {
      onChange(iso)
      setText(toDisplayDate(iso))
    }
  }

  const setToday = () => {
    const todayIso = getLocalDateString()
    onChange(todayIso)
    setText(toDisplayDate(todayIso))
    setShowMenu(false)
  }

  const setYesterday = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yesterdayIso = getLocalDateString(d)
    onChange(yesterdayIso)
    setText(toDisplayDate(yesterdayIso))
    setShowMenu(false)
  }

  const openNativePicker = () => {
    setShowMenu(false)
    if (hiddenDateRef.current) {
      if (typeof hiddenDateRef.current.showPicker === 'function') {
        hiddenDateRef.current.showPicker()
      } else {
        hiddenDateRef.current.focus()
        hiddenDateRef.current.click()
      }
    }
  }

  const pickerValue = value ? (parseToIsoDate(value) || value.slice(0, 10)) : ''

  return (
    <div ref={containerRef} className="relative flex items-center w-full">
      <input
        type="text"
        id={id}
        name={name}
        inputMode="numeric"
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        className={`${className} pr-9 font-medium tracking-wide`}
      />

      <button
        type="button"
        onClick={() => setShowMenu((prev) => !prev)}
        disabled={disabled}
        className="absolute right-1 top-1/2 -translate-y-1/2 size-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-primary hover:bg-slate-100 transition-colors cursor-pointer"
        title="Opsi tanggal (Hari ini / Kemarin / Kalender HP)"
      >
        <Calendar size={15} className="text-slate-400 hover:text-primary" />
      </button>

      {/* Hidden native date input for when user selects 'Kalender Lengkap' */}
      <input
        type="date"
        ref={hiddenDateRef}
        value={pickerValue}
        onChange={handlePickerChange}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only pointer-events-none"
      />

      {/* Popover Pilihan Cepat */}
      {showMenu && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md p-1 shadow-xl animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={setToday}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer text-left"
          >
            <span className="flex items-center gap-1.5">
              <Zap size={13} className="text-emerald-600 fill-emerald-600" />
              Hari Ini
            </span>
            <span className="text-[10px] font-semibold text-emerald-600/80">
              {toDisplayDate(getLocalDateString())}
            </span>
          </button>

          <button
            type="button"
            onClick={setYesterday}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-left"
          >
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-slate-400" />
              Kemarin
            </span>
            <span className="text-[10px] text-slate-400">
              {(() => {
                const d = new Date()
                d.setDate(d.getDate() - 1)
                return toDisplayDate(getLocalDateString(d))
              })()}
            </span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={openNativePicker}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-xl transition-colors cursor-pointer text-left"
          >
            <Calendar size={13} />
            <span>Pilih Kalender HP...</span>
          </button>
        </div>
      )}
    </div>
  )
}
