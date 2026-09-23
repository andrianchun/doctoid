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

function DownloadProgress({ progress }: { progress: number }) {
  return (
    <div className="w-full space-y-1.5 pt-1 text-left">
      <div className="flex items-center justify-between text-xs font-bold text-ink">
        <span className="text-ink-muted">
          {progress >= 100 ? 'Memasang berkas & memuat ulang…' : 'Mengunduh pembaruan OTA…'}
        </span>
        <span className="tabular-nums font-mono text-primary">{progress}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface relative">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-deep transition-all duration-150 ease-out"
          style={{ width: `${Math.max(progress, 3)}%` }}
        />
        {progress >= 100 && (
          <div className="absolute inset-0 bg-white/30 animate-pulse rounded-full" />
        )}
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
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'
  const isNative = Capacitor.isNativePlatform()

  const checkUpdate = useCallback(async () => {
    try {
      // Jalur pengecekan tunggal: Native membaca URL absolut, Web membaca relatif dengan fallback
      const primaryUrl = isNative ? 'https://docto-id.web.app/ota/version.json' : '/ota/version.json'
      let res: Response | null = null

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)
        res = await fetch(`${primaryUrl}?t=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
      } catch {
        // Fallback untuk dev/preview di localhost jika /ota belum ada di bundle lokal
        if (!isNative) {
          try {
            const controller2 = new AbortController()
            const timeoutId2 = setTimeout(() => controller2.abort(), 8000)
            res = await fetch(`https://docto-id.web.app/ota/version.json?t=${Date.now()}`, {
              cache: 'no-store',
              signal: controller2.signal,
            })
            clearTimeout(timeoutId2)
          } catch {
            return
          }
        }
      }

      if (!res || !res.ok) return
      const contentType = res.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) return

      const data = (await res.json()) as OtaManifest

      // Deteksi versi berbeda (mendukung upgrade maupun rollback, standar lomeal/darka)
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
      // Abaikan jika offline
    }
  }, [currentVersion, isNative])

  useEffect(() => {
    checkUpdate()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkUpdate()
    }
    const onOnline = () => checkUpdate()
    const onTrigger = (e: any) => {
      if (e.detail) {
        setManifest(e.detail)
        setUpdateAvailable(true)
      } else {
        checkUpdate()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    window.addEventListener('doctoid_trigger_ota', onTrigger)
    const interval = setInterval(checkUpdate, 15 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('doctoid_trigger_ota', onTrigger)
      clearInterval(interval)
    }
  }, [checkUpdate])

  // Listener progres Capgo di native APK
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

    // Jalur APK Mandiri
    if (manifest.is_apk || !manifest.ota_url.toLowerCase().endsWith('.zip')) {
      window.open(manifest.ota_url, '_blank')
      return
    }

    // Web / PWA: Refresh service worker dan reload
    if (!isNative) {
      setDownloadProgress(0)
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      setDownloadProgress(100)
      setTimeout(() => {
        window.location.reload()
      }, 400)
      return
    }

    // Native APK: Unduh bundle ZIP OTA via Capgo dan set bundle
    try {
      setDownloadProgress(0)
      const bundle = await CapacitorUpdater.download({
        url: manifest.ota_url,
        version: manifest.ota_version,
      })
      setDownloadProgress(100)
      await new Promise((resolve) => setTimeout(resolve, 500))
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
    setUpdateAvailable(false)
  }

  if (!updateAvailable || !manifest) {
    return null
  }

  const isDownloading = downloadProgress !== null
  const versionLine = currentVersion && manifest.ota_version
    ? `v${currentVersion} → v${manifest.ota_version}`
    : `v${manifest.ota_version}`

  // Mode 1: FORCED UPDATE (Modal memblokir jika is_forced == true, tidak bisa ditutup)
  if (manifest.is_forced) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-300">
        <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-300 text-center">
          <div className="flex flex-col items-center gap-2 pt-2">
            <span className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-xl shadow-primary/30">
              <Sparkles size={32} />
            </span>
            <h2 className="text-xl font-black text-ink tracking-tight mt-1">Pembaruan Wajib!</h2>
            <p className="caption text-xs text-ink-muted px-2">
              Versi terbaru Doctoid telah tersedia. Dokter perlu memperbarui aplikasi untuk melanjutkan akses rekam medis.
            </p>
            <p className="text-xs font-bold text-primary tabular-nums mt-1">{versionLine}</p>
          </div>

          {manifest.release_notes && (
            <div className="rounded-2xl bg-surface/80 p-3.5 text-left border border-primary-soft/20 space-y-1">
              <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle size={14} />
                Yang Baru:
              </p>
              <p className="text-xs text-ink whitespace-pre-wrap leading-relaxed">
                {manifest.release_notes}
              </p>
            </div>
          )}

          {errorMsg && (
            <p className="text-center text-xs font-semibold text-rose-500 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
              {errorMsg}
            </p>
          )}

          <div className="pt-2">
            {isDownloading ? (
              <DownloadProgress progress={downloadProgress ?? 0} />
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
      </div>
    )
  }

  // Mode 2: NON-FORCED UPDATE (Floating Glass Banner yang elegan di bagian bawah)
  return (
    <aside aria-label="Notifikasi Pembaruan" className="fixed bottom-24 inset-x-4 z-[9999] mx-auto max-w-md animate-in slide-in-from-bottom-6 fade-in duration-300">
      <div className="flex flex-col gap-3 rounded-3xl border border-white/30 bg-card/95 p-4 shadow-2xl shadow-primary/10 backdrop-blur-xl relative overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-md shadow-primary/20">
              <Sparkles size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-ink leading-tight truncate">Update Tersedia</h3>
              <p className="caption text-xs text-ink-muted mt-0.5 tabular-nums truncate">
                {versionLine}
              </p>
            </div>
          </div>

          {!isDownloading && (
            <button
              onClick={handleDismiss}
              aria-label="Tutup notifikasi update"
              className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-ink-muted hover:bg-surface hover:text-ink transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {manifest.release_notes && !isDownloading && (
          <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap bg-surface/60 p-2.5 rounded-xl border border-surface">
            {manifest.release_notes}
          </p>
        )}

        {errorMsg && (
          <p className="text-xs font-semibold text-rose-500 bg-rose-50 p-2 rounded-xl border border-rose-200">{errorMsg}</p>
        )}

        {isDownloading ? (
          <DownloadProgress progress={downloadProgress ?? 0} />
        ) : (
          <button
            onClick={handleUpdate}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-deep py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <DownloadCloud size={16} />
            <span>Update Sekarang</span>
          </button>
        )}
      </div>
    </aside>
  )
}
