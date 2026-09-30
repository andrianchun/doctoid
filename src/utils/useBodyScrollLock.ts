import { useEffect } from 'react'

let lockCount = 0
let originalBodyOverflow = ''
let originalHtmlOverflow = ''
let originalBodyOverscroll = ''
let originalHtmlOverscroll = ''

export function lockBodyScroll() {
  if (typeof document === 'undefined') return
  if (lockCount === 0) {
    originalBodyOverflow = document.body.style.overflow
    originalHtmlOverflow = document.documentElement.style.overflow
    originalBodyOverscroll = document.body.style.overscrollBehavior
    originalHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.documentElement.classList.add('scroll-locked')
    document.body.classList.add('scroll-locked')
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'
  }
  lockCount++
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.documentElement.classList.remove('scroll-locked')
    document.body.classList.remove('scroll-locked')
    document.body.style.overflow = originalBodyOverflow
    document.body.style.overscrollBehavior = originalBodyOverscroll
    document.documentElement.style.overflow = originalHtmlOverflow
    document.documentElement.style.overscrollBehavior = originalHtmlOverscroll
  }
}

/**
 * Hook to lock body and document scrolling while a modal/dialog is open.
 * Supports reference counting for stacked or sequential modals.
 *
 * @param isLocked Whether scrolling should be locked (defaults to true)
 */
export function useBodyScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return

    lockBodyScroll()
    return () => {
      unlockBodyScroll()
    }
  }, [isLocked])
}
