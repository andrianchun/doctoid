import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { StatusBar, Style } from '@capacitor/status-bar'
import { useUi } from './store'
import Lock from './components/Lock'
import Layout from './components/Layout'
import PwaInstallPrompt from './components/PwaInstallPrompt'
import UpdaterAlert from './components/UpdaterAlert'
import Dasbor from './pages/Dasbor'
import Brainstorm from './pages/Brainstorm'
import RekamMedis from './pages/RekamMedis'
import TemplateTab from './pages/TemplateTab'
import PatientProfile from './pages/PatientProfile'
import Settings from './pages/Settings'
import DoctorProfile from './pages/DoctorProfile'
import { initAuthListener } from './auth'
import { checkRevoked, initRealtimeCloudSync, fbConfigured } from './sync'

const IDLE_LOCK_MS = 5 * 60 * 1000 // 5 menit tanpa aktivitas → auto-lock layar (proteksi data pasien)

export default function App() {
  const { user, setUser, isUnlocked, setIsUnlocked } = useUi()

  // Inisialisasi Native Android: Status Bar & Capgo
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      CapacitorUpdater.notifyAppReady()
      StatusBar.setStyle({ style: Style.Light }).catch(() => {})
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
    }
  }, [])

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

  // Real-Time Two-Way Cloud Sync (Firestore onSnapshot Listener)
  // Langsung mendengarkan dan mengirim pembaruan data secara instan <1 detik antar perangkat
  useEffect(() => {
    if (!user || !fbConfigured() || user.uid === 'local') return
    const unsubscribe = initRealtimeCloudSync(user.uid)
    return () => {
      unsubscribe()
    }
  }, [user])

  return (
    <>
      {!user || !isUnlocked ? (
        <Lock />
      ) : (
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
      )}
      <UpdaterAlert />
      <PwaInstallPrompt />
    </>
  )
}
