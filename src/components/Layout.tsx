import { useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Sparkles, FolderOpen, FileText } from 'lucide-react'

const TABS = [
  { to: '/dasbor', label: 'Dasbor', Icon: LayoutDashboard },
  { to: '/brainstorm', label: 'Catat Pasien', Icon: Sparkles },
  { to: '/rekammedis', label: 'Rekam Medis', Icon: FolderOpen },
  { to: '/template', label: 'Template', Icon: FileText },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  const isDasbor = location.pathname === '/dasbor' || location.pathname === '/'
  const isBrainstorm = location.pathname === '/brainstorm'
  const isRekamMedis = location.pathname === '/rekammedis' || location.pathname === '/rekap'
  const isTemplate = location.pathname === '/template'
  const isMainTab = isDasbor || isBrainstorm || isRekamMedis || isTemplate

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
                ? 'rounded-b-3xl rounded-t-none border-b border-x border-white/25'
                : 'rounded-3xl border border-white/25'
            }`}
          >
            <div className="flex items-center justify-around">
              {TABS.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={label}
                  aria-label={label}
                  className={({ isActive }) =>
                    `relative flex h-12 flex-1 items-center justify-center transition-all active:scale-90 ${
                      isActive
                        ? isBrainstorm && to === '/brainstorm'
                          ? 'text-primary font-bold z-20'
                          : 'bg-white text-primary shadow-lg shadow-black/15 font-bold rounded-2xl'
                        : 'text-white/70 hover:text-white hover:bg-white/10 rounded-2xl'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && isBrainstorm && to === '/brainstorm' && (
                        <span
                          aria-hidden="true"
                          className="absolute -top-1.5 inset-x-0 bottom-0 bg-white rounded-b-2xl pointer-events-none"
                        >
                          {/* Lengkungan sudut kiri (inverted concave fillet) */}
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            className="absolute right-full top-0 w-3.5 h-3.5 fill-white pointer-events-none -mr-[0.5px]"
                            aria-hidden="true"
                          >
                            <path d="M 0 0 L 14 0 L 14 14 A 14 14 0 0 0 0 0 Z" />
                          </svg>

                          {/* Lengkungan sudut kanan (inverted concave fillet) */}
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            className="absolute left-full top-0 w-3.5 h-3.5 fill-white pointer-events-none -ml-[0.5px]"
                            aria-hidden="true"
                          >
                            <path d="M 14 0 L 0 0 L 0 14 A 14 14 0 0 1 14 0 Z" />
                          </svg>
                        </span>
                      )}
                      <Icon size={24} strokeWidth={2.2} className="relative z-10" />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}
