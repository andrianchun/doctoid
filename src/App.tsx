import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useUi } from './store'
import Lock from './components/Lock'
import Layout from './components/Layout'
import Dasbor from './pages/Dasbor'
import Brainstorm from './pages/Brainstorm'
import Rekap from './pages/Rekap'
import PatientProfile from './pages/PatientProfile'
import { checkRevoked, syncNow, fbConfigured } from './sync'

export default function App() {
  const keys = useUi((s) => s.sessionKeys)

  // Kill switch: cek status revoke SEBELUM unlock (device hilang online → self-destruct)
  useEffect(() => {
    checkRevoked()
  }, [])

  // Background sync: saat unlock + tiap 2 menit
  useEffect(() => {
    if (!keys || !fbConfigured()) return
    const run = () => syncNow(keys.entropy, keys.rootKey).catch(() => {})
    run()
    const iv = setInterval(run, 120_000)
    return () => clearInterval(iv)
  }, [keys])

  if (!keys) return <Lock />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dasbor" replace />} />
          <Route path="/dasbor" element={<Dasbor />} />
          <Route path="/brainstorm" element={<Brainstorm />} />
          <Route path="/rekap" element={<Rekap />} />
          <Route path="/pasien/:id" element={<PatientProfile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
