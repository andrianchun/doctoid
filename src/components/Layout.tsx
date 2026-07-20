import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, LayoutDashboard, Sparkles, FolderOpen, UserRound } from 'lucide-react'
import { useUi } from '../store'
import SettingsModal from './SettingsModal'

const tabs = [
  { to: '/dasbor', label: 'Dasbor', Icon: LayoutDashboard },
  { to: '/brainstorm', label: 'Brainstorm', Icon: Sparkles },
  { to: '/rekap', label: 'Rekap', Icon: FolderOpen },
]

export default function Layout() {
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  const location = useLocation()
  const isDasbor = location.pathname === '/dasbor' || location.pathname === '/'

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {/* Header bar: hanya logo kiri & avatar kanan, muncul khusus di Dasbor */}
      {isDasbor && (
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/30">
              <Activity size={20} />
            </span>
            <span className="text-lg font-bold">Doctoid</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Profil & Pengaturan"
            className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-primary-soft to-primary text-white shadow-md shadow-primary/30"
          >
            <UserRound size={18} />
          </button>
        </div>
      )}

      <div className="flex-1 pb-24">
        <Outlet />
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-primary-soft/30 bg-card/90 backdrop-blur-md">
        <div className="flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl px-5 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/30'
                    : 'text-ink-muted'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <SettingsModal />
    </div>
  )
}
