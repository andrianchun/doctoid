import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useUi } from './store'
import Lock from './components/Lock'
import Layout from './components/Layout'
import PwaInstallPrompt from './components/PwaInstallPrompt'
import Dasbor from './pages/Dasbor'
import Brainstorm from './pages/Brainstorm'
import RekamMedis from './pages/RekamMedis'
import TemplateTab from './pages/TemplateTab'
import PatientProfile from './pages/PatientProfile'
import Settings from './pages/Settings'
import DoctorProfile from './pages/DoctorProfile'
import { initAuthListener } from './auth'
import { checkRevoked, syncUserCloud, fbConfigured } from './sync'

const IDLE_LOCK_MS = 5 * 60 * 1000 // 5 menit tanpa aktivitas → auto-lock layar (proteksi data pasien)

export default function App() {
  const { user, setUser, isUnlocked, setIsUnlocked } = useUi()

  // Inisialisasi Auth Listener
  useEffect(() => {
    const unsubscribe = initAuthListener((u) => {
      setUser(u)
      if (u) {
        // Jika tidak ada PIN dan tidak ada biometrik yang diaktifkan, otomatis buka
        const bioOn = localStorage.getItem('doctoid_bio_enabled') === 'true'
        const pinOn = !!localStorage.getItem('doctoid_screen_pin')
        if (!bioOn && !pinOn) {
          setIsUnlocked(true)
        }
      } else {
        setIsUnlocked(false)
      }
    })
    return () => unsubscribe()
  }, [setUser, setIsUnlocked])

  // Kill switch: cek status revoke saat mount
  useEffect(() => {
    checkRevoked()
  }, [])

  // Auto-lock idle: reset timer di tiap interaksi user, kunci layar jika diam 5 menit
  useEffect(() => {
    if (!user || !isUnlocked) return
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const bioOn = localStorage.getItem('doctoid_bio_enabled') === 'true'
        const pinOn = !!localStorage.getItem('doctoid_screen_pin')
        if (bioOn || pinOn) {
          setIsUnlocked(false)
        }
      }, IDLE_LOCK_MS)
    }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, reset))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [user, isUnlocked, setIsUnlocked])

  // Background cloud sync: saat unlock, saat window focus / app aktif, dan berkala tiap 60 detik
  useEffect(() => {
    if (!user || !isUnlocked || !fbConfigured()) return
    const run = () => syncUserCloud(user.uid).catch(() => {})
    run()
    const iv = setInterval(run, 60_000)

    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        run()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [user, isUnlocked])

  if (!user || !isUnlocked) return <Lock />

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dasbor" replace />} />
            <Route path="/dasbor" element={<Dasbor />} />
            <Route path="/brainstorm" element={<Brainstorm />} />
            <Route path="/rekammedis" element={<RekamMedis />} />
            <Route path="/rekap" element={<Navigate to="/rekammedis" replace />} />
            <Route path="/template" element={<TemplateTab />} />
            <Route path="/pasien/:id" element={<PatientProfile />} />
            <Route path="/pengaturan" element={<Settings />} />
            <Route path="/settings" element={<Navigate to="/pengaturan" replace />} />
            <Route path="/profil" element={<DoctorProfile />} />
            <Route path="/profile" element={<Navigate to="/profil" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <PwaInstallPrompt />
    </>
  )
}
