import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  isHeader?: boolean
  dotColor?: string
}

export interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: (string | SelectOption)[]
  placeholder?: string
  className?: string
  buttonClassName?: string
  dropdownClassName?: string
  ariaLabel?: string
  disabled?: boolean
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  className = '',
  buttonClassName,
  dropdownClassName = '',
  ariaLabel,
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Normalisasi opsi string atau SelectOption
  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  )

  const selectedOption = normalizedOptions.find((opt) => !opt.isHeader && opt.value === value)
  const firstSelectable = normalizedOptions.find((opt) => !opt.isHeader)
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || (firstSelectable?.label ?? ''))

  // Auto upward positioning jika mepet bawah
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      let spaceBelow = window.innerHeight - rect.bottom
      let spaceAbove = rect.top

      let parent = containerRef.current.parentElement
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent)
        const overflowY = style.overflowY
        if (
          overflowY === 'auto' ||
          overflowY === 'scroll' ||
          overflowY === 'hidden' ||
          parent.getAttribute('role') === 'dialog'
        ) {
          const parentRect = parent.getBoundingClientRect()
          spaceBelow = Math.min(spaceBelow, parentRect.bottom - rect.bottom)
          spaceAbove = Math.min(spaceAbove, rect.top - parentRect.top)
          break
        }
        parent = parent.parentElement
      }

      setOpenUpward(spaceBelow < 240 && spaceAbove > 180)
    }
  }, [isOpen])

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [isOpen])

  // Tutup dropdown saat tekan Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || displayLabel}
        className={
          buttonClassName
            ? `flex w-full items-center justify-between gap-1.5 transition-all cursor-pointer ${buttonClassName} ${
                isOpen ? 'border-primary ring-2 ring-primary/20 bg-white' : ''
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
            : `flex w-full items-center justify-between gap-1.5 rounded-2xl border border-slate-300 bg-slate-100/90 px-3 py-3 text-xs font-bold text-slate-900 outline-none transition-all cursor-pointer ${
                isOpen
                  ? 'bg-white border-primary ring-2 ring-primary/20 shadow-xs'
                  : 'hover:bg-slate-200/60 focus:bg-white focus:border-primary'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
        }
      >
        <span className="flex items-center gap-2 min-w-0 truncate text-left">
          {selectedOption?.dotColor && (
            <span
              className="size-2.5 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: selectedOption.dotColor }}
            />
          )}
          <span className={`truncate ${!selectedOption && placeholder ? 'text-slate-400 font-normal' : ''}`}>
            {displayLabel}
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2.4}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}
        />
      </button>

      {/* Floating Popover Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          className={`absolute left-0 ${openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} z-50 w-full min-w-[120px] rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto overscroll-contain hide-scrollbar ${dropdownClassName}`}
        >
          {placeholder && !normalizedOptions.some((o) => o.value === '') && (
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              onClick={() => {
                onChange('')
                setIsOpen(false)
              }}
              className={`w-full text-left rounded-xl px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition-colors ${
                value === '' ? 'bg-slate-100 text-slate-700 font-bold' : ''
              }`}
            >
              {placeholder}
            </button>
          )}
          {normalizedOptions.map((opt, idx) => {
            if (opt.isHeader) {
              return (
                <div
                  key={`hdr-${idx}-${opt.value || opt.label}`}
                  className="px-3 pt-2.5 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none"
                >
                  {opt.label}
                </div>
              )
            }
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`flex items-center gap-2 w-full text-left rounded-xl px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-slate-800 hover:bg-primary/10 hover:text-primary'
                }`}
              >
                {opt.dotColor && (
                  <span
                    className={`size-2.5 rounded-full shrink-0 shadow-xs ${isSelected ? 'ring-1 ring-white/60' : ''}`}
                    style={{ backgroundColor: opt.dotColor }}
                  />
                )}
                <span className="truncate">{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
