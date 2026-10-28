import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useUi } from '../store'
import { verifyBiometric } from '../webauthn'
import { normalizeMediaUrl } from './ClinicalMediaCard'

export interface ViewerImage {
  url: string
  dataUrl?: string
  name?: string
  type?: string
}

interface ImageViewerModalProps {
  isOpen: boolean
  onClose: () => void
  images: ViewerImage[]
  initialIndex?: number
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
}) => {
  const { unmasked, setUnmasked } = useUi()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)

  const handleToggleMask = async () => {
    if (unmasked) {
      setUnmasked(false)
    } else {
      if (await verifyBiometric()) {
        setUnmasked(true)
      }
    }
  }
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Touch gesture state (pinch-to-zoom)
  const lastTouchDistance = useRef<number | null>(null)
  const lastTapRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)))
      setScale(1)
      setPosition({ x: 0, y: 0 })
      setRotation(0)
    }
  }, [isOpen, initialIndex, images.length])

  // Reset transform saat pindah foto
  const resetTransform = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
  }, [])

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
      resetTransform()
    }
  }, [currentIndex, resetTransform])

  const handleNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex((prev) => prev + 1)
      resetTransform()
    }
  }, [currentIndex, images.length, resetTransform])

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 4))
  }

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.5, 1)
      if (next === 1) setPosition({ x: 0, y: 0 })
      return next
    })
  }

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  // Double tap / double click to toggle zoom (1x <-> 2.5x)
  const handleDoubleTap = (clientX: number, clientY: number) => {
    if (scale > 1) {
      resetTransform()
    } else {
      setScale(2.5)
      // Pusatkan zoom ke titik tap jika memungkinkan
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const offsetX = (rect.width / 2 - clientX) * 1.5
        const offsetY = (rect.height / 2 - clientY) * 1.5
        setPosition({ x: offsetX, y: offsetY })
      }
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') handlePrev()
      else if (e.key === 'ArrowRight') handleNext()
      else if (e.key === '+' || e.key === '=') handleZoomIn()
      else if (e.key === '-') handleZoomOut()
      else if (e.key === 'r' || e.key === 'R') handleRotate()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handlePrev, handleNext, onClose])

  if (!isOpen || images.length === 0) return null

  const currentImage = images[currentIndex] || images[0]

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev + 0.25, 4))
    } else {
      setScale((prev) => {
        const next = Math.max(prev - 0.25, 1)
        if (next === 1) setPosition({ x: 0, y: 0 })
        return next
      })
    }
  }

  // Touch handlers (Mobile pinch to zoom & pan)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      lastTouchDistance.current = dist
    } else if (e.touches.length === 1) {
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        handleDoubleTap(e.touches[0].clientX, e.touches[0].clientY)
      }
      lastTapRef.current = now

      if (scale > 1) {
        setIsDragging(true)
        setDragStart({
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y,
        })
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const diff = dist - lastTouchDistance.current
      setScale((prev) => {
        const next = Math.min(Math.max(prev + diff * 0.01, 1), 4)
        if (next === 1) setPosition({ x: 0, y: 0 })
        return next
      })
      lastTouchDistance.current = dist
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      })
    }
  }

  const handleTouchEnd = () => {
    lastTouchDistance.current = null
    setIsDragging(false)
  }

  const handleDownload = () => {
    if (!currentImage.url) return
    const a = document.createElement('a')
    a.href = currentImage.url
    a.download = currentImage.name || `lampiran-${Date.now()}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!isOpen || images.length === 0) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/98 backdrop-blur-md animate-in fade-in duration-200 select-none overflow-hidden overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Top Header Bar (Safe Area Padding agar tidak tertabrak jam & status bar) */}
      <div
        className="flex items-center justify-between px-4 pb-3 bg-slate-900/90 border-b border-slate-800 text-white z-10 shrink-0"
        style={{
          paddingTop: Capacitor.isNativePlatform()
            ? 'calc(max(env(safe-area-inset-top, 0px), 36px) + 0.5rem)'
            : 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          {images.length > 1 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-bold text-slate-300 shrink-0">
              {currentIndex + 1} / {images.length}
            </span>
          )}
          <span className="text-xs font-semibold text-slate-200 truncate">
            {currentImage.name || 'Foto Lampiran Medis'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleMask}
            aria-label={unmasked ? 'Sensor Identitas Pasien' : 'Buka Sensor Identitas (Biometrik)'}
            title={unmasked ? 'Sensor Identitas' : 'Buka Sensor Identitas (Biometrik)'}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {unmasked ? <Eye size={17} /> : <EyeOff size={17} />}
          </button>
          <button
            type="button"
            onClick={handleRotate}
            aria-label="Putar 90 Derajat"
            title="Putar 90° (R)"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCw size={17} />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Unduh Berkas"
            title="Unduh Berkas"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Download size={17} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Galeri"
            title="Tutup (Esc)"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-600 text-slate-300 hover:text-white transition-colors cursor-pointer ml-1"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Interactive Image Viewport */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative flex-1 flex items-center justify-center overflow-hidden touch-none ${
          scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        onDoubleClick={(e) => handleDoubleTap(e.clientX, e.clientY)}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 150ms ease-out',
          }}
          className="max-h-full max-w-full flex items-center justify-center will-change-transform"
        >
          {currentImage.type?.startsWith('video/') || currentImage.url?.endsWith('.mp4') || currentImage.url?.endsWith('.webm') ? (
            <video
              src={currentImage.url}
              controls
              autoPlay
              playsInline
              className={`max-h-[82vh] max-w-[96vw] rounded-lg shadow-2xl transition-all duration-200 pointer-events-auto ${
                !unmasked ? 'blur-md scale-105' : ''
              }`}
            />
          ) : (
            <img
              src={currentImage.dataUrl || normalizeMediaUrl(currentImage.url) || currentImage.url}
              alt={currentImage.name || 'Lampiran'}
              onError={(e) => {
                const norm = normalizeMediaUrl(currentImage.url)
                const vmUrl = (currentImage.url || '').replace(
                  /http:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):3001/i,
                  'http://35.255.95.161:3001'
                )
                const fallback = (currentImage as any).dataUrl || norm || vmUrl
                if (fallback && e.currentTarget.src !== fallback) {
                  e.currentTarget.src = fallback
                }
              }}
              draggable={false}
              className={`max-h-[82vh] max-w-[96vw] object-contain rounded-lg shadow-2xl pointer-events-none transition-all duration-200 ${
                !unmasked ? 'blur-md scale-105' : ''
              }`}
            />
          )}
        </div>

        {/* Master Sensor Overlay saat belum dibuka */}
        {!unmasked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-2xs z-20 p-4">
            <button
              type="button"
              onClick={handleToggleMask}
              className="px-4 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white font-bold text-xs flex items-center gap-2 shadow-2xl active:scale-95 transition-all cursor-pointer"
            >
              <EyeOff size={16} className="text-primary" />
              <span>Buka Sensor Pasien</span>
            </button>
          </div>
        )}

        {/* Previous Button */}
        {images.length > 1 && currentIndex > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePrev()
            }}
            aria-label="Foto Sebelumnya"
            className="absolute left-3 top-1/2 -translate-y-1/2 size-11 rounded-full bg-slate-900/70 border border-slate-700/60 text-white flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all cursor-pointer shadow-lg z-10"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Next Button */}
        {images.length > 1 && currentIndex < images.length - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleNext()
            }}
            aria-label="Foto Berikutnya"
            className="absolute right-3 top-1/2 -translate-y-1/2 size-11 rounded-full bg-slate-900/70 border border-slate-700/60 text-white flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all cursor-pointer shadow-lg z-10"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Bottom Floating Control Dock (Safe Area Padding untuk Nav Pill HP) */}
      <div
        className="flex items-center justify-center px-4 py-2 bg-slate-900/90 border-t border-slate-800 z-10 shrink-0"
        style={{
          paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 0.5rem) + 0.25rem)',
        }}
      >
        <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-3 py-1 rounded-xl shadow-xl">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 1}
            aria-label="Perkecil"
            title="Perkecil (-)"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ZoomOut size={16} />
          </button>

          <span className="text-xs font-mono font-bold text-slate-300 min-w-[45px] text-center select-none">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 4}
            aria-label="Perbesar"
            title="Perbesar (+)"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ZoomIn size={16} />
          </button>

          {scale !== 1 || rotation !== 0 ? (
            <button
              type="button"
              onClick={resetTransform}
              aria-label="Reset Tampilan"
              title="Reset Tampilan (100%)"
              className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-slate-700 transition-colors cursor-pointer ml-1"
            >
              <RefreshCw size={15} />
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}
