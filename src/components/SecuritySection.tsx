import { useState, useRef, useEffect } from 'react'
import {
  ShieldCheck, RefreshCw, Lock as LockIcon, Trash2, Loader2, Fingerprint,
  KeyRound, Download, Upload, Database, CheckCircle2, Sparkles, DownloadCloud,
  Cloud, AlertTriangle
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useUi } from '../store'
import {
  syncUserCloud, selfDestruct,
  downloadBackupJson, restoreBackupJson
} from '../sync'
import { loginWithGoogle } from '../auth'
import { verifyBiometric } from '../webauthn'

const inputCls =
  'w-full rounded-xl border border-primary-soft/40 bg-surface px-3 py-2 text-sm outline-none focus:border-primary'

export default function SecuritySection({ notify }: { notify: (m: string) => void }) {
  const { user, setUser, setIsUnlocked } = useUi()
  const [busy, setBusy] = useState(false)
  const [bioOn, setBioOn] = useState(localStorage.getItem('doctoid_bio_enabled') === 'true')
  const [pinInput, setPinInput] = useState('')
  const [hasPin, setHasPin] = useState(!!localStorage.getItem('doctoid_screen_pin'))
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [otaChecking, setOtaChecking] = useState(false)
  const [otaInfo, setOtaInfo] = useState<{ current: string; remote?: string; status?: string; notes?: string } | null>(null)
  const [otaManifest, setOtaManifest] = useState<any | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [otaError, setOtaError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'
  const isNative = Capacitor.isNativePlatform()

  // Listener progres Capgo di native Android
  useEffect(() => {
    if (!isNative) return
    let listener: any
    CapacitorUpdater.addListener('download', (info: { percent: number }) => {
      setDownloadProgress(Math.round(info.percent))
    }).then((l) => { listener = l })
    return () => {
      if (listener) listener.remove()
    }
  }, [isNative])

  const handleCheckOta = async () => {
    setOtaChecking(true)
    setOtaError('')
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(`https://docto-id.web.app/ota/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal mengakses server hosting.`)
      const data = await res.json()
      if (data.ota_version) {
        if (data.ota_version !== currentVersion) {
          setOtaManifest(data)
          setOtaInfo({
            current: currentVersion,
            remote: data.ota_version,
            status: `Pembaruan v${data.ota_version} tersedia di Cloud.`,
            notes: data.release_notes,
          })
          localStorage.removeItem('doctoid_dismissed_ota')
          window.dispatchEvent(new CustomEvent('doctoid_trigger_ota', { detail: data }))
          notify(`Pembaruan v${data.ota_version} tersedia di Cloud ✓`)
        } else {
          setOtaManifest(null)
          setOtaInfo({
            current: currentVersion,
            remote: data.ota_version,
            status: `Aplikasi sudah versi terbaru (v${currentVersion}).`,
          })
          notify(`Aplikasi sudah menggunakan versi terbaru (v${currentVersion}) ✓`)
        }
      }
    } catch (e: any) {
      const msg = e.name === 'AbortError' ? 'Koneksi timeout (server lambat merespon).' : e.message || 'Periksa koneksi internet.'
      setOtaError(msg)
      notify(`Gagal cek pembaruan: ${msg}`)
    } finally {
      setOtaChecking(false)
    }
  }

  const handleDirectInstallOta = async () => {
    if (!otaManifest) return
    setOtaError('')

    // Jika jalur APK
    if (otaManifest.is_apk || !otaManifest.ota_url.toLowerCase().endsWith('.zip')) {
      window.open(otaManifest.ota_url, '_blank')
      return
    }

    // Web / PWA: Refresh service worker
    if (!isNative) {
      setDownloadProgress(0)
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      setDownloadProgress(100)
      setTimeout(() => {
        window.location.reload()
      }, 500)
      return
    }

    // Native APK
    try {
      setDownloadProgress(0)
      const bundle = await CapacitorUpdater.download({
        url: otaManifest.ota_url,
        version: otaManifest.ota_version,
      })
      setDownloadProgress(100)
      await new Promise((resolve) => setTimeout(resolve, 600))
      await CapacitorUpdater.set(bundle)
    } catch (err: any) {
      console.error('OTA Install error:', err)
      setDownloadProgress(null)
      setOtaError(err.message || 'Gagal mengunduh bundle update.')
      notify(`Gagal memasang update: ${err.message || 'Error'}`)
    }
  }

  const toggleBio = async () => {
    if (bioOn) {
      localStorage.removeItem('doctoid_bio_enabled')
      setBioOn(false)
      return notify('Kunci biometrik dimatikan.')
    }
    if (!(await verifyBiometric())) return notify('Verifikasi biometrik gagal.')
    localStorage.setItem('doctoid_bio_enabled', 'true')
    setBioOn(true)
    notify('Kunci biometrik diaktifkan ✓')
  }

  const handleSavePin = () => {
    if (pinInput.trim().length < 4) {
      return notify('PIN minimal 4 digit.')
    }
    localStorage.setItem('doctoid_screen_pin', pinInput.trim())
    setHasPin(true)
    setShowPinSetup(false)
    setPinInput('')
    notify('PIN Kunci Layar berhasil disimpan ✓')
  }

  const handleRemovePin = () => {
    localStorage.removeItem('doctoid_screen_pin')
    setHasPin(false)
    setShowPinSetup(false)
    notify('PIN Kunci Layar dihapus.')
  }

  const handleLoginGoogle = async () => {
    setBusy(true)
    try {
      const loggedUser = await loginWithGoogle()
      setUser(loggedUser)
      notify(`Berhasil masuk sebagai ${loggedUser.displayName || loggedUser.email} ✓`)
      await syncUserCloud(loggedUser.uid)
    } catch (e: any) {
      notify(`Gagal login: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleExportBackup = async () => {
    try {
      await downloadBackupJson()
      notify('Cadangan data berhasil diunduh (JSON) ✓')
    } catch (e: any) {
      notify(`Gagal membuat cadangan: ${e.message}`)
    }
  }

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const text = evt.target?.result as string
      if (window.confirm('Pulihkan data dari cadangan ini? Data saat ini akan diperbarui dengan data cadangan.')) {
        const res = await restoreBackupJson(text)
        notify(res.message)
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <section className="mb-6 space-y-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
        <ShieldCheck size={15} /> Keamanan & Privasi Klinis
      </h3>

      {/* Cadangan & Pemulihan Data Offline */}
      <div className="rounded-2xl border border-surface bg-card p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink flex items-center gap-1.5">
            <Database size={15} className="text-primary" />
            Cadangan & Pemulihan Data (Offline)
          </p>
        </div>
        <p className="text-xs text-ink-muted">
          Unduh berkas JSON cadangan seluruh data pasien, resume, bangsal, dan preferensi untuk disimpan mandiri atau dipindahkan ke perangkat lain.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleExportBackup}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary-deep px-3.5 py-2 text-xs font-bold transition-colors"
          >
            <Download size={14} /> Unduh Cadangan (JSON)
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-surface hover:bg-surface/80 text-ink px-3.5 py-2 text-xs font-bold transition-colors"
          >
            <Upload size={14} /> Pulihkan dari File
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportBackupFile}
            accept=".json,application/json"
            className="hidden"
          />
        </div>
      </div>

      {/* Pembaruan Aplikasi (OTA Cloud) */}
      <div className="rounded-2xl border border-surface bg-card p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink flex items-center gap-1.5">
            <Sparkles size={15} className="text-primary" />
            Pembaruan Aplikasi (OTA Cloud)
          </p>
          <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
            v{currentVersion}
          </span>
        </div>
        <p className="text-xs text-ink-muted leading-relaxed">
          Doctoid mendukung pembaruan instan tanpa harus menginstal ulang file APK. Versi terpasang saat ini adalah <strong className="text-ink font-semibold">v{currentVersion}</strong>.
        </p>
        {otaInfo && (
          <div className="rounded-2xl bg-surface/80 p-3.5 text-xs space-y-2.5 border border-primary-soft/30 animate-in fade-in">
            <div className="flex items-center justify-between">
              <p className="font-bold text-ink flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-primary" />
                <span>{otaInfo.status}</span>
              </p>
              {otaInfo.remote && (
                <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                  v{otaInfo.remote}
                </span>
              )}
            </div>

            {otaInfo.notes && (
              <div className="rounded-xl bg-card p-2.5 border border-surface text-ink-muted">
                <span className="font-bold text-primary block mb-0.5">Catatan Rilis:</span>
                <p className="leading-relaxed">{otaInfo.notes}</p>
              </div>
            )}

            {otaManifest && !downloadProgress && (
              <button
                type="button"
                onClick={handleDirectInstallOta}
                className="w-full flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
              >
                <DownloadCloud size={16} />
                <span>Pasang Pembaruan v{otaManifest.ota_version} Sekarang</span>
              </button>
            )}

            {downloadProgress !== null && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-bold text-ink">
                  <span className="text-ink-muted">
                    {downloadProgress >= 100 ? 'Mengekstrak & memuat ulang…' : 'Mengunduh bundle OTA…'}
                  </span>
                  <span className="tabular-nums font-mono text-primary">{downloadProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface relative">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-primary-deep transition-all duration-75 ease-out"
                    style={{ width: `${Math.min(100, Math.max(downloadProgress, 5))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {otaError && (
          <p className="text-xs font-semibold text-rose-500 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
            {otaError}
          </p>
        )}

        <div className="pt-1">
          <button
            onClick={handleCheckOta}
            disabled={otaChecking || downloadProgress !== null}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface hover:bg-surface/80 border border-slate-200 text-ink px-4 py-2.5 text-xs font-bold shadow-xs hover:border-primary/40 active:scale-95 transition-all disabled:opacity-50"
          >
            {otaChecking ? <Loader2 size={14} className="animate-spin text-primary" /> : <RefreshCw size={14} className="text-primary" />}
            <span>Cek Pembaruan Cloud</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-surface bg-card p-4 space-y-3 shadow-sm">
        <p className="text-xs font-bold text-ink">Proteksi Kunci Layar (Saat HP Ditinggal)</p>
        
        <div className="space-y-2">
          <button
            onClick={toggleBio}
            className={`flex w-full cursor-pointer items-center justify-between rounded-xl p-3 text-xs font-semibold transition-all ${
              bioOn ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-surface text-ink-muted'
            }`}
          >
            <span className="flex items-center gap-2">
              <Fingerprint size={16} className={bioOn ? 'text-emerald-600' : ''} />
              <span>Kunci Sidik Jari / Face ID</span>
            </span>
            <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-white/80 shadow-xs">
              {bioOn ? 'Aktif' : 'Nonaktif'}
            </span>
          </button>

          <div className="rounded-xl bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                <KeyRound size={16} />
                <span>PIN Kunci Layar</span>
              </span>
              <span className="text-xs font-bold text-ink-muted">
                {hasPin ? 'PIN Terpasang' : 'Belum Ada PIN'}
              </span>
            </div>

            {showPinSetup ? (
              <div className="pt-2 space-y-2 animate-in fade-in">
                <input
                  type="password"
                  inputMode="numeric"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Masukkan 4-6 digit PIN baru"
                  className={inputCls + ' text-center tracking-[0.3em] font-bold'}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSavePin}
                    className="flex-1 cursor-pointer rounded-xl bg-primary py-2 text-xs font-bold text-white shadow-sm"
                  >
                    Simpan PIN
                  </button>
                  <button
                    onClick={() => { setShowPinSetup(false); setPinInput('') }}
                    className="cursor-pointer rounded-xl bg-card px-3 py-2 text-xs font-semibold text-ink-muted"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowPinSetup(true)}
                  className="cursor-pointer rounded-lg bg-card px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-surface"
                >
                  {hasPin ? 'Ganti PIN' : '+ Buat PIN Layar'}
                </button>
                {hasPin && (
                  <button
                    onClick={handleRemovePin}
                    className="cursor-pointer rounded-lg bg-card px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50"
                  >
                    Hapus PIN
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sinkronisasi Cloud (Firebase) */}
      <div className="rounded-2xl border border-surface bg-card p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink flex items-center gap-1.5">
            <Cloud size={15} className="text-primary" />
            Sinkronisasi Cloud Akun Google
          </p>
          {user ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-lg">
              <CheckCircle2 size={12} /> Terhubung & Realtime
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-lg">
              <AlertTriangle size={12} /> Offline
            </span>
          )}
        </div>

        {user ? (
          <div className="rounded-2xl bg-surface/70 p-3.5 space-y-2.5 border border-surface">
            <div className="flex items-center gap-3">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="size-10 rounded-xl object-cover ring-2 ring-primary/20" />
              ) : (
                <div className="size-10 rounded-xl bg-primary/20 flex items-center justify-center font-bold text-primary text-sm">
                  {user.displayName?.[0] || 'D'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-ink truncate">{user.displayName || 'Dokter'}</p>
                <p className="caption text-ink-muted truncate">{user.email}</p>
              </div>
            </div>

            <p className="caption text-xs text-ink-muted leading-relaxed pt-1.5 border-t border-surface">
              Data pasien, Faskes, ruangan, dan catatan medis tersinkronisasi otomatis secara dua arah (real-time) antar perangkat.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-amber-50/80 p-3.5 space-y-2.5 border border-amber-200/60">
            <p className="text-xs font-semibold text-amber-900 leading-relaxed">
              Anda belum login akun Google di perangkat ini. Masuk dengan Google agar data otomatis tersinkronisasi secara real-time.
            </p>
            <button
              type="button"
              onClick={handleLoginGoogle}
              disabled={busy}
              className="w-full flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white py-2.5 text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition-all"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
              <span>Masuk dengan Google</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => setIsUnlocked(false)}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-surface px-3.5 py-2 text-xs font-semibold text-ink-muted hover:text-ink"
        >
          <LockIcon size={14} /> Kunci Layar Sekarang
        </button>
        <button
          onClick={async () => {
            if (window.confirm('Hapus SEMUA data lokal di perangkat ini? Data di cloud akun Google tetap aman jika sudah di-sync.')) {
              await selfDestruct()
            }
          }}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
        >
          <Trash2 size={14} /> Hapus Data Lokal
        </button>
      </div>
    </section>
  )
}
