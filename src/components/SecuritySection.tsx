import { useState, useRef } from 'react'
import {
  ShieldCheck, RefreshCw, Lock as LockIcon, Trash2, Loader2, Fingerprint,
  KeyRound, Download, Upload, Database, CheckCircle2, Sparkles
} from 'lucide-react'
import { useUi } from '../store'
import { syncUserCloud, selfDestruct, fbConfigured, downloadBackupJson, restoreBackupJson } from '../sync'
import { verifyBiometric } from '../webauthn'

const inputCls =
  'w-full rounded-xl border border-primary-soft/40 bg-surface px-3 py-2 text-sm outline-none focus:border-primary'

export default function SecuritySection({ notify }: { notify: (m: string) => void }) {
  const { user, setIsUnlocked } = useUi()
  const [devName, setDevName] = useState(localStorage.getItem('doctoid_device_name') ?? '')
  const [busy, setBusy] = useState(false)
  const [bioOn, setBioOn] = useState(localStorage.getItem('doctoid_bio_enabled') === 'true')
  const [pinInput, setPinInput] = useState('')
  const [hasPin, setHasPin] = useState(!!localStorage.getItem('doctoid_screen_pin'))
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [otaChecking, setOtaChecking] = useState(false)
  const [otaInfo, setOtaInfo] = useState<{ current: string; remote?: string; status?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'

  const handleCheckOta = async () => {
    setOtaChecking(true)
    try {
      const res = await fetch(`https://docto-id.web.app/ota/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Gagal mengakses server hosting.')
      const data = await res.json()
      if (data.ota_version) {
        if (data.ota_version !== currentVersion) {
          setOtaInfo({
            current: currentVersion,
            remote: data.ota_version,
            status: `Pembaruan v${data.ota_version} tersedia di Cloud.`,
          })
          notify(`Pembaruan v${data.ota_version} tersedia di Cloud ✓`)
        } else {
          setOtaInfo({
            current: currentVersion,
            remote: data.ota_version,
            status: `Aplikasi sudah versi terbaru (v${currentVersion}).`,
          })
          notify(`Aplikasi sudah menggunakan versi terbaru (v${currentVersion}) ✓`)
        }
      }
    } catch (e: any) {
      notify(`Gagal cek pembaruan: ${e.message || 'Periksa koneksi internet.'}`)
    } finally {
      setOtaChecking(false)
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

  const jalankanSync = async () => {
    if (!user) return
    setBusy(true)
    try {
      const arah = await syncUserCloud(user.uid)
      notify(arah === 'pull' ? 'Sync ✓ — data terbaru ditarik dari cloud' : 'Sync ✓ — data lokal terkirim ke cloud')
    } catch (e: any) {
      notify(`Sync gagal: ${e.message || 'Periksa konfigurasi Firebase & koneksi internet.'}`)
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
          <div className="rounded-xl bg-surface/70 p-3 text-xs space-y-1 border border-primary-soft/20 animate-in fade-in">
            <p className="font-bold text-ink flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-primary" />
              Status: {otaInfo.status}
            </p>
            {otaInfo.remote && (
              <p className="caption text-xs text-ink-muted">
                Versi Cloud Terkini: <strong className="text-ink">v{otaInfo.remote}</strong>
              </p>
            )}
          </div>
        )}
        <div className="pt-1">
          <button
            onClick={handleCheckOta}
            disabled={otaChecking}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            {otaChecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>Cek Pembaruan Cloud Sekarang</span>
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

      <div className="rounded-2xl border border-surface bg-card p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink">Sinkronisasi Cloud (Firebase)</p>
          <button
            onClick={jalankanSync}
            disabled={busy || !fbConfigured()}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-primary-deep px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-primary/20 disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            <span>Sync Sekarang</span>
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">Nama perangkat ini</span>
          <input
            value={devName}
            onChange={(e) => {
              setDevName(e.target.value)
              localStorage.setItem('doctoid_device_name', e.target.value)
            }}
            placeholder="Perangkat Dokter"
            className={inputCls}
          />
        </label>

        <div className="rounded-xl bg-surface/60 p-3 space-y-1.5 border border-surface">
          <div className="flex items-center gap-2 text-xs font-bold text-ink">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>Project Cloud: docto-id</span>
          </div>
          <p className="text-xs text-ink-muted">
            Otentikasi Google & sinkronisasi Firestore sudah terkonfigurasi otomatis dan siap digunakan tanpa konfigurasi manual.
          </p>
        </div>
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
