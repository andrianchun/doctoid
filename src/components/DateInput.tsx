import React, { useState, useEffect, useRef } from 'react'
import { Calendar } from 'lucide-react'
import { toDisplayDate, parseToIsoDate } from '../utils/dateFormat'

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
  const hiddenDateRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText(toDisplayDate(value))
  }, [value])

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
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

  return (
    <div className="relative flex items-center w-full">
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
      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center text-ink-muted hover:text-primary transition-colors cursor-pointer"
        title="Pilih tanggal dari kalender"
      >
        <Calendar size={16} className="pointer-events-none text-slate-400 group-hover:text-primary" />
        <input
          type="date"
          ref={hiddenDateRef}
          value={value ? value.slice(0, 10) : ''}
          onChange={handlePickerChange}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
    </div>
  )
}
