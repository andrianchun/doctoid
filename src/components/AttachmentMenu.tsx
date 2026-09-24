import { useState, useRef, useEffect } from 'react'
import { Plus, Camera, Image as ImageIcon, Mic } from 'lucide-react'

export interface AttachmentMenuProps {
  onSelectCamera: () => void
  onSelectGallery: () => void
  onSelectMic: () => void
  disabled?: boolean
  isListening?: boolean
}

export default function AttachmentMenu({
  onSelectCamera,
  onSelectGallery,
  onSelectMic,
  disabled = false,
  isListening = false,
}: AttachmentMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeItem, setActiveItem] = useState<'camera' | 'gallery' | 'mic' | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const startPos = useRef({ x: 0, y: 0 })
  const hasMoved = useRef(false)
  const wasOpenOnDown = useRef(false)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setActiveItem(null)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [isOpen])

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (isListening) {
      onSelectMic()
      return
    }
    startPos.current = { x: e.clientX, y: e.clientY }
    hasMoved.current = false
    wasOpenOnDown.current = isOpen
    setIsOpen(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isOpen || disabled) return
    const dx = e.clientX - startPos.current.x
    const dy = startPos.current.y - e.clientY // y axis is inverted on screen
    const distance = Math.sqrt(dx * dx + dy * dy)

    const threshold = 20

    if (distance > threshold) {
      hasMoved.current = true
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI
      if (angle < 0) angle += 360

      // Camera: 337.5 - 360 or 0 - 22.5
      // Gallery: 22.5 - 67.5
      // Mic: 67.5 - 112.5
      if (angle >= 337.5 || angle <= 22.5) {
        setActiveItem('camera')
      } else if (angle > 22.5 && angle <= 67.5) {
        setActiveItem('gallery')
      } else if (angle > 67.5 && angle <= 112.5) {
        setActiveItem('mic')
      } else {
        setActiveItem(null)
      }
    } else {
      setActiveItem(null)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    if (activeItem) {
      if (activeItem === 'camera') onSelectCamera()
      if (activeItem === 'gallery') onSelectGallery()
      if (activeItem === 'mic') onSelectMic()
      setIsOpen(false)
    } else if (!hasMoved.current) {
      // Just a tap
      if (wasOpenOnDown.current) {
        setIsOpen(false)
      } else {
        setIsOpen(true)
      }
    } else {
      setIsOpen(false)
    }

    setActiveItem(null)
  }

  // Trigger directly from button when menu is open
  const triggerItem = (e: React.MouseEvent, item: 'camera' | 'gallery' | 'mic') => {
    e.stopPropagation()
    if (item === 'camera') onSelectCamera()
    if (item === 'gallery') onSelectGallery()
    if (item === 'mic') onSelectMic()
    setIsOpen(false)
    setActiveItem(null)
  }

  return (
    <div className="relative flex items-center justify-center size-10 shrink-0 mb-0.5" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label={isListening ? 'Matikan Dikte' : 'Menu Alat AI & Dikte'}
        className={`relative z-20 flex size-10 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-50 cursor-pointer ${
          isListening
            ? 'bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/40'
            : isOpen
              ? 'bg-white border-0 shadow-none'
              : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 hover:text-primary shadow-sm'
        }`}
        style={{ touchAction: 'none' }}
      >
        {isListening ? (
          <Mic size={20} className="animate-pulse" />
        ) : isOpen ? null : (
          <Plus size={20} className="transition-transform duration-200" />
        )}
      </button>

      {/* Floating Radial Menu (MOBA Style Fan ala Lomeal) */}
      <div className="absolute pointer-events-none inset-0 flex items-end justify-start z-30">
        <div
          className={`absolute bottom-0 left-0 w-[150px] h-[150px] origin-bottom-left transition-all duration-300 ease-out ${
            isOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-50 pointer-events-none'
          }`}
        >
          {/* Active Tooltip / Label */}
          {activeItem && (
            <div className="absolute -top-3 left-10 -translate-y-full px-2.5 py-1 rounded-full bg-slate-900/90 text-white text-[11px] font-semibold whitespace-nowrap shadow-lg pointer-events-none animate-in fade-in zoom-in-95 duration-100 z-40">
              {activeItem === 'camera' && 'Ekstrak Kamera'}
              {activeItem === 'gallery' && 'Ekstrak Galeri'}
              {activeItem === 'mic' && 'Dikte Suara'}
            </div>
          )}

          {/* Fan Background SVG */}
          <svg width="150" height="150" viewBox="0 0 150 150" className="absolute inset-0 drop-shadow-2xl">
            {/* Center Hub — Putih menyatu dengan fan shape */}
            <path
              d="M 0 150 L 32 150 A 32 32 0 0 0 0 118 Z"
              className="fill-white"
            />
            {/* Slice 1: Camera (0-30 deg) */}
            <path
              d="M 32 150 L 150 150 A 150 150 0 0 0 129.9 75 L 27.71 134 A 32 32 0 0 1 32 150 Z"
              className={`transition-colors duration-200 stroke-slate-200/90 stroke-[1.5px] ${
                isOpen ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
              } ${activeItem === 'camera' ? 'fill-emerald-500' : 'fill-white/95 backdrop-blur-md'}`}
              onPointerEnter={() => setActiveItem('camera')}
              onPointerLeave={() => setActiveItem(null)}
              onClick={(e) => triggerItem(e, 'camera')}
            />
            {/* Slice 2: Gallery (30-60 deg) */}
            <path
              d="M 27.71 134 L 129.9 75 A 150 150 0 0 0 75 20.1 L 16 122.29 A 32 32 0 0 1 27.71 134 Z"
              className={`transition-colors duration-200 stroke-slate-200/90 stroke-[1.5px] ${
                isOpen ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
              } ${activeItem === 'gallery' ? 'fill-sky-500' : 'fill-white/95 backdrop-blur-md'}`}
              onPointerEnter={() => setActiveItem('gallery')}
              onPointerLeave={() => setActiveItem(null)}
              onClick={(e) => triggerItem(e, 'gallery')}
            />
            {/* Slice 3: Mic (60-90 deg) */}
            <path
              d="M 16 122.29 L 75 20.1 A 150 150 0 0 0 0 0 L 0 118 A 32 32 0 0 1 16 122.29 Z"
              className={`transition-colors duration-200 stroke-slate-200/90 stroke-[1.5px] ${
                isOpen ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
              } ${activeItem === 'mic' ? 'fill-rose-500' : 'fill-white/95 backdrop-blur-md'}`}
              onPointerEnter={() => setActiveItem('mic')}
              onPointerLeave={() => setActiveItem(null)}
              onClick={(e) => triggerItem(e, 'mic')}
            />
          </svg>

          {/* Radial Icons */}
          {/* CAMERA - 15 deg */}
          <div
            className="absolute bottom-0 left-0 w-10 h-10 -ml-5 -mb-5 flex items-center justify-center transition-transform pointer-events-none"
            style={{ transform: `rotate(-15deg) translateX(110px) rotate(15deg) scale(${activeItem === 'camera' ? 1.2 : 1})` }}
          >
            <div className={`w-full h-full flex items-center justify-center rounded-full transition-colors ${activeItem === 'camera' ? 'text-white' : 'text-emerald-600'}`}>
              <Camera size={20} />
            </div>
          </div>

          {/* GALLERY - 45 deg */}
          <div
            className="absolute bottom-0 left-0 w-10 h-10 -ml-5 -mb-5 flex items-center justify-center transition-transform pointer-events-none"
            style={{ transform: `rotate(-45deg) translateX(110px) rotate(45deg) scale(${activeItem === 'gallery' ? 1.2 : 1})` }}
          >
            <div className={`w-full h-full flex items-center justify-center rounded-full transition-colors ${activeItem === 'gallery' ? 'text-white' : 'text-sky-600'}`}>
              <ImageIcon size={20} />
            </div>
          </div>

          {/* MIC - 75 deg */}
          <div
            className="absolute bottom-0 left-0 w-10 h-10 -ml-5 -mb-5 flex items-center justify-center transition-transform pointer-events-none"
            style={{ transform: `rotate(-75deg) translateX(110px) rotate(75deg) scale(${activeItem === 'mic' ? 1.2 : 1})` }}
          >
            <div className={`w-full h-full flex items-center justify-center rounded-full transition-colors ${activeItem === 'mic' ? 'text-white' : 'text-rose-500'}`}>
              <Mic size={20} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
