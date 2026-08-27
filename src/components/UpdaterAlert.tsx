import { useState, useEffect, useCallback } from 'react'
import { Sparkles, AlertCircle, X, DownloadCloud } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

interface OtaManifest {
  ota_version: string
  ota_url: string
  is_forced?: boolean
  is_apk?: boolean
  release_notes?: string
}

function DownloadProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full space-y-1.5 pt-1">
      <div className="flex items-center justify-between text-xs font-bold text-ink">
        <span className="text-ink-muted">Mengunduh pembaruan OTA…</span>
        <span className="tabular-nums font-mono text-primary">{progress}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-deep transition-all duration-200 ease-out"
          style={{ width: `${Math.max(progress, 4)}%` }}
        />
      </div>
      <p className="caption text-ink-muted text-center">
        Jangan tutup aplikasi. Doctoid akan otomatis dimuat ulang setelah selesai.
      </p>
    </div>
  )
}

export default function UpdaterAlert() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [manifest, setManifest] = useState<OtaManifest | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'
  const isNative = Capacitor.isNativePlatform()
  const otaUrl = 'https://docto-id.web.app/ota/version.json'

  const checkUpdate = useCallback(async () => {
    try {
      const res = await fetch(`${otaUrl}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return
      const contentType = res.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) return

      const data = (await res.json()) as OtaManifest
      
      // Jika nomor versi berbeda dari versi saat ini
      if (data.ota_version && data.ota_version !== currentVersion) {
        const storedDismiss = localStorage.getItem('doctoid_dismissed_ota')
        if (storedDismiss === data.ota_version && !data.is_forced) {
          setUpdateAvailable(false)
          return
        }
        setManifest(data)
        setUpdateAvailable(true)
      } else {
        setUpdateAvailable(false)
      }
    } catch {
      // Offline atau version.json belum ter-deploy, abaikan
    }
  }, [currentVersion, otaUrl])

  useEffect(() => {
    checkUpdate()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkUpdate()
    }
    const onOnline = () => checkUpdate()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    const interval = setInterval(checkUpdate, 15 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      clearInterval(interval)
    }
  }, [checkUpdate])

  // Listener progres unduhan Capgo di native APK
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

  const handleUpdate = async () => {
    if (!manifest) return
    setErrorMsg('')
    localStorage.removeItem('doctoid_dismissed_ota')

    // Web / PWA: Refresh halaman untuk memuat bundle assets baru
    if (!isNative) {
      setDownloadProgress(0)
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
      return
    }

    // Native APK: Unduh bundle ZIP OTA via Capgo dan set bundle
    try {
      setDownloadProgress(0)
      const bundle = await CapacitorUpdater.download({
        url: manifest.ota_url,
        version: manifest.ota_version,
      })
      await CapacitorUpdater.set(bundle)
    } catch (err: any) {
      console.error('OTA Update failed:', err)
      setDownloadProgress(null)
      setErrorMsg(err.message || 'Gagal mengunduh pembaruan. Periksa koneksi internet Anda.')
    }
  }

  const handleDismiss = () => {
    if (manifest?.ota_version) {
      localStorage.setItem('doctoid_dismissed_ota', manifest.ota_version)
    }
    setDismissed(true)
  }

  if (!updateAvailable || !manifest || (dismissed && !manifest.is_forced)) {
    return null
  }

  const isDownloading = downloadProgress !== null

  // Mode 1: FORCED UPDATE (Modal memblokir jika is_forced == true)
  if (manifest.is_forced) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in">
        <div className="w-full max-w-sm rounded-3xl border border-surface bg-card p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-lg shadow-primary/30">
              <Sparkles size={24} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Pembaruan Wajib</p>
              <h2 className="text-lg font-black text-ink">Doctoid v{manifest.ota_version}</h2>
            </div>
          </div>

          <div className="rounded-2xl bg-surface/80 p-3.5 space-y-1.5 border border-primary-soft/20">
            <p className="text-xs font-bold text-ink flex items-center gap-1.5">
              <AlertCircle size={14} className="text-amber-500" />
              Catatan Rilis:
            </p>
            <p className="text-xs text-ink-muted leading-relaxed">
              {manifest.release_notes || 'Peningkatan performa, keamanan, dan perbaikan klinis.'}
            </p>
          </div>

          {errorMsg && (
            <p className="text-center text-xs font-semibold text-rose-500">{errorMsg}</p>
          )}

          {isDownloading ? (
            <DownloadProgressBar progress={downloadProgress} />
          ) : (
            <button
              onClick={handleUpdate}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-deep py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/30 hover:brightness-110 active:scale-95 transition-all"
            >
              <DownloadCloud size={18} />
              <span>Update Sekarang (OTA)</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // Mode 2: NON-FORCED UPDATE (Floating Glass Banner yang nyaman)
  return (
    <aside aria-label="Notifikasi Pembaruan" className="fixed bottom-24 inset-x-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col gap-2.5 rounded-3xl border border-white/30 bg-card/95 p-4 shadow-2xl shadow-primary/10 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/20">
              <Sparkles size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink truncate">
                Doctoid v{manifest.ota_version} Tersedia
              </p>
              <p className="caption text-ink-muted truncate">
                {manifest.release_notes || 'Pembaruan fitur & peningkatan performa'}
              </p>
            </div>
          </div>

          {!isDownloading && (
            <button
              onClick={handleDismiss}
              aria-label="Tutup notifikasi update"
              className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-ink-muted hover:bg-surface transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {errorMsg && (
          <p className="text-xs font-semibold text-rose-500">{errorMsg}</p>
        )}

        {isDownloading ? (
          <DownloadProgressBar progress={downloadProgress} />
        ) : (
          <button
            onClick={handleUpdate}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <DownloadCloud size={15} />
            <span>Update Sekarang (Instan)</span>
          </button>
        )}
      </div>
    </aside>
  )
}
