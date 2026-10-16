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
        className={`${className.replace(/\bresize-\S+/g, '')} ${highlightClass} resize-none pr-8`}
        {...props}
      />
      {/* Single Touch & Mouse Drag Handle di Pojok Kanan Bawah */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        title="Tarik untuk ubah tinggi"
        aria-label="Tarik ukuran teks"
        className="absolute bottom-1.5 right-1.5 flex size-6 cursor-ns-resize touch-none items-center justify-center rounded-lg text-slate-400 hover:text-primary active:text-primary-deep transition-colors select-none"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M10 3L3 10M10 7L7 10" />
        </svg>
      </div>
    </div>
  )
}
