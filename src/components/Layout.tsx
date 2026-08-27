import { useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Sparkles, FolderOpen, FileText } from 'lucide-react'
import UpdaterAlert from './UpdaterAlert'

const TABS = [
  { to: '/dasbor', label: 'Dasbor', Icon: LayoutDashboard },
  { to: '/brainstorm', label: 'SOAP & AI', Icon: Sparkles },
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
      {/* In-app OTA Updater Alert */}
      <UpdaterAlert />

      {/* Konten Utama */}
      <div className="flex-1 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
        <Outlet />
      </div>

      {/* Floating Frosted Glass Navigation Bar (4 Tab Baku - Icon Only) */}
      <nav
        aria-label="Navigasi Utama"
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-40 mx-auto max-w-sm"
      >
        <div className="glass-nav rounded-3xl p-1.5 shadow-2xl">
          <div className="flex items-center justify-around">
            {TABS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={label}
                aria-label={label}
                className={({ isActive }) =>
                  `flex h-12 flex-1 items-center justify-center rounded-2xl transition-all active:scale-90 ${
                    isActive
                      ? 'bg-gradient-to-br from-primary to-primary-deep text-white shadow-lg shadow-primary/30'
                      : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                  }`
                }
              >
                <Icon size={24} strokeWidth={2.2} />
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
