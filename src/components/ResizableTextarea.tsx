import { useRef, useEffect } from 'react'

interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minHeight?: number
  highlightClass?: string
  textareaRef?: React.RefObject<HTMLTextAreaElement | null> | React.MutableRefObject<HTMLTextAreaElement | null>
}

export default function ResizableTextarea({
  minHeight = 100,
  className = '',
  highlightClass = '',
  rows = 4,
  textareaRef: externalRef,
  ...props
}: Props) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null)
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  const setRefs = (node: HTMLTextAreaElement | null) => {
    internalRef.current = node
    if (externalRef) {
      (externalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (!internalRef.current) return
    isDraggingRef.current = true
    startYRef.current = e.touches[0].clientY
    startHeightRef.current = internalRef.current.offsetHeight
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (!internalRef.current) return
    isDraggingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = internalRef.current.offsetHeight
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !internalRef.current) return
      const delta = ev.clientY - startYRef.current
      const newHeight = Math.max(minHeight, startHeightRef.current + delta)
      internalRef.current.style.height = `${newHeight}px`
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || !internalRef.current) return
      const delta = e.touches[0].clientY - startYRef.current
      const newHeight = Math.max(minHeight, startHeightRef.current + delta)
      internalRef.current.style.height = `${newHeight}px`
    }

    const onTouchEnd = () => {
      isDraggingRef.current = false
    }

    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [minHeight])

  return (
    <div className="relative w-full group">
      <textarea
        ref={setRefs}
        rows={rows}
        className={`${className} ${highlightClass} pr-10`}
        {...props}
      />
      {/* Prominent Touch & Mouse Drag Handle di Pojok Kanan Bawah */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        title="Tarik untuk ubah tinggi"
        aria-label="Tarik ukuran teks"
        className="absolute bottom-2.5 right-2.5 flex size-7 cursor-ns-resize touch-none items-center justify-center rounded-xl bg-slate-200/95 text-slate-700 hover:bg-primary hover:text-white active:bg-primary-deep active:text-white transition-all shadow-xs select-none ring-1 ring-slate-300"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14 14H12V12H14V14ZM14 10H12V8H14V10ZM10 14H8V12H10V14ZM14 6H12V4H14V6ZM10 10H8V8H10V10ZM6 14H4V12H6V14Z" />
        </svg>
      </div>
    </div>
  )
}
