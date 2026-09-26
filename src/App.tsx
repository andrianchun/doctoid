import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Loader2 } from 'lucide-react'
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
  const { user, setUser, isUnlocked, setIsUnlocked, authLoading, setAuthLoading } = useUi()

  // Inisialisasi Native Android: Status Bar, Capgo, & Sinkronisasi Versi APK
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      CapacitorUpdater.notifyAppReady()
      // Atur status bar transparan dengan teks/ikon hitam (gelap) untuk tema terang
      const applyStatusBar = async () => {
        try {
          await StatusBar.setOverlaysWebView({ overlay: true })
          await StatusBar.setStyle({ style: Style.Light })
        } catch {
          // ignore
        }
      }
      applyStatusBar()

      // Deteksi jika user baru saja memasang APK versi baru:
      // Bersihkan bundle cache Capgo agar webview langsung membaca aset terbaru bawaan APK
      ;(async () => {
        try {
          const info = await CapApp.getInfo()
          const lastVer = localStorage.getItem('doctoid_installed_native_ver')
          if (lastVer && lastVer !== info.version) {
            console.log(`Native APK diperbarui dari ${lastVer} ke ${info.version}. Mereset bundle cache Capgo...`)
            localStorage.setItem('doctoid_installed_native_ver', info.version)
            localStorage.removeItem('doctoid_dismissed_ota')
            await CapacitorUpdater.reset()
            window.location.reload()
            return
          }
          localStorage.setItem('doctoid_installed_native_ver', info.version)
        } catch (err) {
          console.warn('Gagal sinkronisasi versi native APK:', err)
        }
      })()
    }
  }, [])

  // Inisialisasi Auth Listener
  useEffect(() => {
    const unsubscribe = initAuthListener((u) => {
      setUser(u)
      setAuthLoading(false)
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
  }, [setUser, setIsUnlocked, setAuthLoading])

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
      {authLoading ? (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 animate-in fade-in duration-300">
          <img src="/logo.png" alt="Doctoid" className="h-36 sm:h-44 w-auto object-contain animate-pulse drop-shadow-md" />
          <Loader2 size={22} className="animate-spin text-primary/70 mt-1" />
        </div>
      ) : !user || !isUnlocked ? (
        <Lock />
      ) : (
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dasbor" replace />} />
              <Route path="/dasbor" element={<Dasbor />} />
              <Route path="/brainstorm" element={<Brainstorm />} />
              <Route path="/rekammedis" element={<RekamMedis />} />
              <Route path="/rekammedis/:id" element={<PatientProfile />} />
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
