import { useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, PenLine, FolderOpen, FileText } from 'lucide-react'

const TABS = [
  { to: '/dasbor', label: 'Dasbor', Icon: LayoutDashboard },
  { to: '/brainstorm', label: 'Catat Pasien', Icon: PenLine },
  { to: '/rekammedis', label: 'Rekam Medis', Icon: FolderOpen },
  { to: '/template', label: 'Template', Icon: FileText },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  const isDasbor = location.pathname === '/dasbor' || location.pathname === '/'
  const isBrainstorm = location.pathname === '/brainstorm'
  const isRekamMedis =
    location.pathname === '/rekammedis' ||
    location.pathname.startsWith('/rekammedis/') ||
    location.pathname === '/rekap' ||
    location.pathname.startsWith('/pasien/')
  const isTemplate = location.pathname === '/template'
  const isMainTab = isDasbor || isBrainstorm || isRekamMedis || isTemplate
  const activeIndex = isDasbor
    ? 0
    : isBrainstorm
    ? 1
    : isRekamMedis
    ? 2
    : isTemplate
    ? 3
    : -1

  // Gestur Swipe Horizontal antar Tab Utama
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest('input, textarea, select, button, [role="button"], [data-no-swipe="true"]') ||
      target.closest('.cursor-grab') ||
      !isMainTab
    ) {
      touchStartX.current = null
      touchStartY.current = null
      return
    }

    touchStartX.current = e.clientX
    touchStartY.current = e.clientY
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return

    const deltaX = e.clientX - touchStartX.current
    const deltaY = e.clientY - touchStartY.current

    touchStartX.current = null
    touchStartY.current = null

    if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      const currentIndex = TABS.findIndex((t) => t.to === location.pathname)
      if (currentIndex === -1) return

      if (deltaX < 0 && currentIndex < TABS.length - 1) {
        navigate(TABS[currentIndex + 1].to)
      } else if (deltaX > 0 && currentIndex > 0) {
        navigate(TABS[currentIndex - 1].to)
      }
    }
  }

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-lg flex-col touch-pan-y pt-safe"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Konten Utama */}
      <div className="flex-1 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
        <Outlet />
      </div>

      {/* Floating Unified Dock Container */}
      <div
        id="bottom-dock-container"
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-40 mx-auto max-w-sm pointer-events-none flex flex-col items-center"
      >
        {/* Slot Input AI di bagian atas (hanya saat di Brainstorm) */}
        <div id="bottom-dock-addon" className="w-full pointer-events-auto" />

        {/* Floating Blue Navigation Bar (Konsisten di Semua Tab) */}
        <nav
          aria-label="Navigasi Utama"
          className="w-full pointer-events-auto"
        >
          <div
            className={`bg-gradient-to-br from-primary via-primary to-primary-deep text-white p-1.5 shadow-2xl shadow-primary/35 backdrop-blur-xl transition-all ${
              isBrainstorm
                ? 'rounded-b-3xl rounded-t-none border-b border-x border-slate-200/80'
                : 'rounded-3xl border border-white/25'
            }`}
          >
            <div className="relative flex h-12 items-center justify-around">
              {/* Sliding White Indicator Pill (GPU Accelerated 60-120fps) */}
              {activeIndex >= 0 && (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1/4 flex items-center justify-center pointer-events-none z-10 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
                  style={{
                    transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
                  }}
                >
                  <div
                    className={`w-[70px] h-9.5 rounded-2xl bg-white shadow-sm shadow-black/10 transition-opacity duration-200 ${
                      isBrainstorm ? 'opacity-0' : 'opacity-100'
                    }`}
                  />
                </div>
              )}

              {TABS.map(({ to, label, Icon }) => {
                const isActive =
                  to === '/dasbor'
                    ? isDasbor
                    : to === '/brainstorm'
                    ? isBrainstorm
                    : to === '/rekammedis'
                    ? isRekamMedis
                    : to === '/template'
                    ? isTemplate
                    : false

                const isBrainstormActive = isActive && isBrainstorm && to === '/brainstorm'

                return (
                  <NavLink
                    key={to}
                    to={to}
                    title={label}
                    aria-label={label}
                    className="relative flex h-12 flex-1 items-center justify-center select-none group focus:outline-none"
                  >
                    {isBrainstormActive && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-3 inset-x-0 mx-auto w-[70px] bottom-0 bg-white rounded-b-2xl pointer-events-none z-10"
                      >
                        {/* Lengkungan sudut kiri (inverted concave fillet) */}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          className="absolute right-full top-1.5 w-3.5 h-3.5 fill-white pointer-events-none -mr-[0.5px]"
                          aria-hidden="true"
                        >
                          <path d="M 0 0 L 14 0 L 14 14 A 14 14 0 0 0 0 0 Z" />
                        </svg>

                        {/* Lengkungan sudut kanan (inverted concave fillet) */}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          className="absolute left-full top-1.5 w-3.5 h-3.5 fill-white pointer-events-none -ml-[0.5px]"
                          aria-hidden="true"
                        >
                          <path d="M 14 0 L 0 0 L 0 14 A 14 14 0 0 1 14 0 Z" />
                        </svg>
                      </span>
                    )}

                    <div
                      className={`relative z-20 flex items-center justify-center transition-colors duration-200 w-[70px] h-9.5 rounded-2xl ${
                        isActive
                          ? 'text-primary'
                          : 'text-white/70 group-hover:text-white group-hover:bg-white/10 group-active:bg-white/15'
                      }`}
                    >
                      <Icon size={23} strokeWidth={2.2} />
                    </div>
                  </NavLink>
                )
              })}
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}
