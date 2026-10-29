import React, { useState, useEffect } from 'react'

export interface TimeInputProps {
  value: string // 'HH:MM'
  onChange: (val: string) => void
  className?: string
  placeholder?: string
  title?: string
  disabled?: boolean
}

export function cleanTimeOnBlur(val: string): string {
  const digits = val.replace(/\D/g, '')
  if (!digits) {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }

  if (digits.length === 1) {
    return `0${digits}:00`
  }

  if (digits.length === 2) {
    let h = parseInt(digits, 10)
    if (h > 23) h = 23
    return `${String(h).padStart(2, '0')}:00`
  }

  if (digits.length === 3) {
    let h = parseInt(digits.slice(0, 2), 10)
    let m = parseInt(digits.slice(2) + '0', 10)
    if (h > 23) h = 23
    if (m > 59) m = 59
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  let h = parseInt(digits.slice(0, 2), 10)
  let m = parseInt(digits.slice(2, 4), 10)
  if (h > 23) h = 23
  if (m > 59) m = 59
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const TimeInput: React.FC<TimeInputProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'HH:MM',
  title = 'Jam (Format 24 Jam)',
  disabled = false,
}) => {
  const [displayValue, setDisplayValue] = useState(value || '')

  useEffect(() => {
    setDisplayValue(value || '')
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const digits = raw.replace(/\D/g, '')

    let formatted = ''
    if (digits.length <= 2) {
      formatted = digits
    } else {
      let h = parseInt(digits.slice(0, 2), 10)
      let hStr = digits.slice(0, 2)
      if (h > 23) hStr = '23'

      let mStr = digits.slice(2, 4)
      if (mStr.length === 2) {
        let m = parseInt(mStr, 10)
        if (m > 59) mStr = '59'
      }
      formatted = `${hStr}:${mStr}`
    }

    setDisplayValue(formatted)
    onChange(formatted)
  }

  const handleBlur = () => {
    const cleaned = cleanTimeOnBlur(displayValue)
    setDisplayValue(cleaned)
    onChange(cleaned)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      maxLength={5}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
      className={className}
      autoComplete="off"
    />
  )
}

export default TimeInput
