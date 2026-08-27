import { useEffect, useState } from 'react'
import { Activity, Fingerprint, KeyRound, Loader2, LogOut, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { useUi } from '../store'
import { loginWithGoogle, logoutUser } from '../auth'
import { verifyBiometric } from '../webauthn'

const inputCls =
  'w-full rounded-2xl border border-primary-soft/40 bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-center'

export default function Lock() {
  const { user, setUser, setIsUnlocked } = useUi()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const bioEnabled = localStorage.getItem('doctoid_bio_enabled') === 'true'
  const storedPin = localStorage.getItem('doctoid_screen_pin')

  // Auto-prompt biometrik saat lock screen muncul jika biometrik aktif & user sudah login
  useEffect(() => {
    if (user && bioEnabled) {
      handleBioUnlock()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleGoogleLogin = async () => {
    setErr('')
    setBusy(true)
    try {
      const loggedUser = await loginWithGoogle()
      setUser(loggedUser)
      setIsUnlocked(true)
    } catch (e: any) {
      console.error(e)
      setErr(e.message || 'Gagal masuk dengan akun Google. Periksa koneksi internet Anda.')
    } finally {
      setBusy(false)
    }
  }

  const handleBioUnlock = async () => {
    setErr('')
    setBusy(true)
    try {
      const ok = await verifyBiometric()
      if (ok) {
        setIsUnlocked(true)
      } else {
        setErr('Verifikasi biometrik dibatalkan atau tidak cocok.')
      }
    } catch (e: any) {
      setErr(e.message || 'Biometrik tidak tersedia.')
    } finally {
      setBusy(false)
    }
  }

  const handlePinUnlock = () => {
    if (!storedPin) {
      setIsUnlocked(true)
      return
    }
    if (pin.trim() === storedPin.trim()) {
      setIsUnlocked(true)
    } else {
      setErr('PIN salah.')
      setPin('')
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 pt-safe pb-safe">
      {/* Brand Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-xl shadow-primary/30 animate-in zoom-in-95">
          <Activity size={34} />
        </span>
        <div>
          <h1 className="h1 text-2xl font-black text-ink">Doctoid</h1>
          <p className="caption text-xs text-ink-muted mt-0.5">Asisten Klinis & Rekam Medis Dokter</p>
        </div>
      </div>

      {/* Main Card */}
      <div className="glass-card w-full space-y-4 rounded-3xl p-6 shadow-xl shadow-primary/5 animate-in fade-in slide-in-from-bottom-3">
        {!user ? (
          /* State: Belum Login → Masuk dengan Google */
          <div className="space-y-3">
            <button
              onClick={handleGoogleLogin}
              disabled={busy}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-white border border-surface/80 px-4 text-xs font-bold text-ink shadow-sm hover:shadow-md hover:bg-surface/30 active:scale-95 transition-all disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={18} className="animate-spin text-primary" />
              ) : (
                <svg className="size-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              )}
              <span>Masuk dengan Google</span>
            </button>
          </div>
        ) : (
          /* State: Sudah Login (Layar Terkunci / Idle Lock) */
          <div className="space-y-4">
            {/* Profil Dokter */}
            <div className="flex items-center gap-3 rounded-2xl bg-surface/60 p-3">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'Avatar'} className="size-12 rounded-2xl object-cover ring-2 ring-primary/20" />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white font-bold text-lg">
                  {user.displayName?.[0]?.toUpperCase() || 'D'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="h2 text-sm font-bold text-ink truncate">{user.displayName || 'Dokter'}</p>
                <p className="caption text-xs text-ink-muted truncate">{user.email}</p>
                <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 size={12} /> Akun Terhubung
                </span>
              </div>
            </div>

            {/* Opsi Buka Kunci */}
            {bioEnabled && (
              <button
                onClick={handleBioUnlock}
                disabled={busy}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/30 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}
                <span>Buka dengan Sidik Jari / Face ID</span>
              </button>
            )}

            {storedPin ? (
              <div className="space-y-2">
                <p className="caption text-center text-xs font-semibold text-ink-muted">Masukkan PIN Layar</p>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePinUnlock()}
                  placeholder="••••••"
                  className={inputCls + ' tracking-[0.5em] text-lg font-bold h-12'}
                  autoFocus={!bioEnabled}
                />
                <button
                  onClick={handlePinUnlock}
                  disabled={busy || !pin}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/30 hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
                >
                  <KeyRound size={16} /> Buka Kunci
                </button>
              </div>
            ) : !bioEnabled ? (
              <button
                onClick={() => setIsUnlocked(true)}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/30 hover:brightness-110 active:scale-95 transition-all"
              >
                Buka Aplikasi
              </button>
            ) : null}

            {/* Logout / Switch Account */}
            <div className="border-t border-surface pt-3 text-center">
              <button
                onClick={async () => {
                  await logoutUser()
                  setUser(null)
                  setIsUnlocked(false)
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-rose-600 transition-colors"
              >
                <LogOut size={14} /> Ganti Akun / Keluar
              </button>
            </div>
          </div>
        )}

        {err && <p className="text-center text-xs font-semibold text-rose-500 animate-in fade-in">{err}</p>}
      </div>

      {/* Security Footer Minimalis */}
      <div className="flex items-center gap-1.5 text-center text-xs text-ink-muted/80 max-w-xs">
        <ShieldCheck size={14} className="shrink-0 text-emerald-600" />
        <span className="caption text-xs text-ink-muted">Tersinkronisasi aman ke akun Google pribadi Dokter</span>
      </div>
    </div>
  )
}
