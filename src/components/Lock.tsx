import { useEffect, useState } from 'react'
import { Fingerprint, KeyRound, Loader2, LogOut, ShieldCheck, CheckCircle2, X } from 'lucide-react'
import { useUi } from '../store'
import { loginWithGoogle, logoutUser } from '../auth'
import { verifyBiometric } from '../webauthn'

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all text-center'

export default function Lock() {
  const { user, setUser, setIsUnlocked } = useUi()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

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
    if (!agreedTerms) {
      setErr('Harap centang persetujuan Syarat & Ketentuan terlebih dahulu.')
      return
    }
    setErr('')
    setBusy(true)
    try {
      const loggedUser = await loginWithGoogle()
      setUser(loggedUser)
      setIsUnlocked(true)
    } catch (e: any) {
      console.error('Google login error:', e)
      if (
        e?.code === 'auth/popup-closed-by-user' ||
        e?.code === 'auth/cancelled-popup-request' ||
        e?.message?.includes('closed-by-user') ||
        e?.message?.includes('cancel') ||
        e?.message?.includes('Cancel')
      ) {
        setErr('Pemilihan akun Google dibatalkan.')
      } else {
        setErr(e.message || 'Gagal masuk dengan akun Google. Periksa koneksi internet Anda.')
      }
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
    <div className="min-h-dvh w-full bg-slate-100 flex flex-col items-center justify-center sm:p-4 select-none">
      {/* App Container Frame — Seamless & Natural */}
      <div className="w-full max-w-sm sm:max-w-[410px] min-h-dvh sm:min-h-0 sm:max-h-[96dvh] sm:rounded-3xl bg-white shadow-2xl sm:border sm:border-slate-200/80 overflow-y-auto flex flex-col justify-between">
        
        {/* Top Hero: Karakter Tim Medis Berbaur Alami (Seamless Blend, Tanpa Banner Terpisah) */}
        <div className="relative pt-6 px-4 pb-2 bg-gradient-to-b from-blue-50/70 via-indigo-50/30 to-white overflow-hidden shrink-0">
          {/* Ambient Glow */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 size-56 rounded-full bg-blue-400/10 blur-2xl pointer-events-none" />

          {/* Floating Pill: Tipografi "HALO, DOK!" yang disukai dokter */}
          <div className="relative z-10 flex justify-center mb-2">
            <div className="bg-white/95 backdrop-blur-md border border-blue-100/90 shadow-sm shadow-blue-500/10 text-slate-800 px-4 py-1.5 rounded-full inline-flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] font-black tracking-wider text-slate-900 uppercase">
                {user ? 'SELAMAT BERTUGAS!' : 'HALO, DOK!'}
              </p>
            </div>
          </div>

          {/* Karakter Medis: Dokter Muda Cakep (Kiri) & Perawat Cewek Cantik (Kanan) — Ukuran Besar & Ngeblend */}
          <div className="relative z-10 flex justify-center items-end px-2 pt-1">
            <img
              src="/assets/medical-team.webp"
              alt="Tim Medis Docto.id"
              className="h-52 sm:h-56 w-auto max-w-full object-contain drop-shadow-sm pointer-events-none [mask-image:linear-gradient(to_bottom,black_86%,transparent_100%)]"
              loading="eager"
            />
          </div>

          {/* Tagline Ruang Kerja Mandiri */}
          <div className="text-center px-4 pt-1 space-y-0.5 relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Ruang Kerja Mandiri
            </p>
            <h1 className="text-xs sm:text-sm font-extrabold text-slate-800 leading-snug">
              Visite tenang, data klinis rapi &amp; terorganisir.
            </h1>
          </div>
        </div>

        {/* Content Form Section */}
        <div className="flex-1 flex flex-col justify-between p-5 sm:p-6 bg-white space-y-4">
          {!user ? (
            /* State: Belum Login → Masuk dengan Google */
            <div className="space-y-4 my-auto">
              {/* Brand Header: Icon D & Doctoid text proporsional & terpisah */}
              <div className="flex flex-col items-center gap-2 text-center pt-1">
                <img
                  src="/icon-transparent.png"
                  alt="Logo Docto.id"
                  className="size-14 object-contain drop-shadow-xs"
                />
                <img
                  src="/logo-text.png"
                  alt="Doctoid"
                  className="h-6 sm:h-6.5 w-auto object-contain drop-shadow-2xs"
                />
                <p className="text-xs text-slate-500 font-medium">
                  Asisten klinis &amp; buku log pasien pribadi
                </p>
              </div>

              {/* Syarat & Ketentuan Checkbox */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3 space-y-2 text-left">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedTerms}
                    onChange={(e) => {
                      setAgreedTerms(e.target.checked)
                      if (err) setErr('')
                    }}
                    className="mt-0.5 size-4 rounded border-slate-300 text-primary focus:ring-primary/20 shrink-0 cursor-pointer accent-primary"
                  />
                  <span className="text-[11px] leading-relaxed text-slate-600">
                    Saya menyetujui{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setShowTermsModal(true)
                      }}
                      className="font-bold text-primary hover:underline underline-offset-2 inline cursor-pointer"
                    >
                      Syarat &amp; Ketentuan
                    </button>{' '}
                    serta memahami Docto.id sebagai <b>Buku Log Pasien Mandiri Dokter</b> (bukan RME resmi faskes).
                  </span>
                </label>
              </div>

              {/* Google Login Button — Biru Ala Doctoid */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={busy || !agreedTerms}
                  title={!agreedTerms ? 'Harap centang persetujuan syarat & ketentuan di atas' : 'Masuk dengan Akun Google'}
                  className={`flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-2xl px-4 text-xs font-bold transition-all duration-200 active:scale-95 ${
                    agreedTerms
                      ? 'bg-gradient-to-r from-primary to-primary-deep hover:brightness-110 text-white shadow-lg shadow-primary/30'
                      : 'bg-slate-100 text-slate-400 border border-slate-200/80 cursor-not-allowed opacity-60 shadow-none'
                  }`}
                >
                  {busy ? (
                    <Loader2 size={18} className="animate-spin text-white" />
                  ) : (
                    <div className="flex size-6 items-center justify-center rounded-full bg-white shadow-2xs shrink-0">
                      <svg className="size-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                    </div>
                  )}
                  <span>Masuk dengan Google</span>
                </button>

                {!agreedTerms && (
                  <p className="text-[10px] text-slate-400 font-medium text-center">
                    * Centang persetujuan di atas untuk mengaktifkan tombol masuk
                  </p>
                )}
              </div>

              {err && <p className="text-center text-xs font-semibold text-rose-500 animate-in fade-in">{err}</p>}
            </div>
          ) : (
            /* State: Sudah Login (Layar Terkunci / Idle Lock) */
            <div className="space-y-4 my-auto">
              {/* Profil Dokter */}
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 text-left">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'Avatar'} className="size-12 rounded-2xl object-cover ring-2 ring-primary/20" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white font-bold text-lg">
                    {user.displayName?.[0]?.toUpperCase() || 'D'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{user.displayName || 'Dokter'}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <CheckCircle2 size={11} /> Akun Terhubung
                  </span>
                </div>
              </div>

              {/* Opsi Buka Kunci */}
              {bioEnabled && (
                <button
                  type="button"
                  onClick={handleBioUnlock}
                  disabled={busy}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}
                  <span>Buka dengan Sidik Jari / Face ID</span>
                </button>
              )}

              {storedPin ? (
                <div className="space-y-2">
                  <p className="text-center text-xs font-semibold text-slate-500">Masukkan PIN Layar</p>
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
                    type="button"
                    onClick={handlePinUnlock}
                    disabled={busy || !pin}
                    className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 hover:brightness-105 active:scale-95 transition-all disabled:opacity-40"
                  >
                    <KeyRound size={16} /> Buka Kunci
                  </button>
                </div>
              ) : !bioEnabled ? (
                <div className="space-y-2 text-center">
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-2.5 border border-amber-200/60 leading-relaxed">
                    Proteksi kunci layar belum diaktifkan (PIN / Biometrik). Atur proteksi di menu Pengaturan.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsUnlocked(true)}
                    className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-deep text-xs font-bold text-white shadow-md shadow-primary/25 hover:brightness-105 active:scale-95 transition-all"
                  >
                    Buka Aplikasi
                  </button>
                </div>
              ) : null}

              {/* Logout / Switch Account */}
              <div className="border-t border-slate-100 pt-3 text-center">
                <button
                  type="button"
                  onClick={async () => {
                    await logoutUser()
                    setUser(null)
                    setIsUnlocked(false)
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
                >
                  <LogOut size={14} /> Ganti Akun / Keluar
                </button>
              </div>

              {err && <p className="text-center text-xs font-semibold text-rose-500 animate-in fade-in">{err}</p>}
            </div>
          )}

          {/* Clean Minimalist Trust Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-emerald-600" /> Enkripsi Lokal AES-GCM
            </span>
            <span>v0.1.92</span>
          </div>
        </div>
      </div>

      {/* Modal Syarat & Ketentuan (Pernyataan Buku Log Pasien Mandiri) */}
      {showTermsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setShowTermsModal(false)}
        >
          <div
            className="w-full max-w-md max-h-[88dvh] flex flex-col rounded-3xl bg-white shadow-2xl p-5 sm:p-6 space-y-4 overscroll-contain select-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Syarat, Ketentuan &amp; Privasi</h3>
                <p className="text-[11px] text-slate-500">Pernyataan Penggunaan Buku Log Pasien Mandiri</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs text-slate-700 leading-relaxed min-h-0">
              <div className="p-3 rounded-2xl bg-sky-50/80 border border-sky-100 text-sky-900 space-y-1">
                <p className="font-bold text-xs flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-sky-600" /> Buku Log Pribadi (Bukan RME Resmi)
                </p>
                <p className="text-[11px] text-sky-800/90 leading-relaxed">
                  Docto.id adalah sarana buku log klinis pribadi, kalkulator medis, dan asisten kerja visite dokter. Aplikasi ini <b>bukan</b> merupakan sistem Rekam Medis Elektronik (RME) resmi fasilitas pelayanan kesehatan (RS/Klinik/Puskesmas) sebagaimana diatur dalam Permenkes No. 24 Tahun 2022.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">1. Tanggung Jawab &amp; Pertimbangan Klinis</h4>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Seluruh hasil analisis, ringkasan AI, dan saran penatalaksanaan bersifat sebagai alat bantu administratif. Keputusan klinis, penegakan diagnosis, dan terapi pasien sepenuhnya merupakan wewenang, kompetensi, dan tanggung jawab Dokter Penanggung Jawab Pelayanan (DPJP).
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">2. Kerahasiaan &amp; De-Identifikasi Data Pasien</h4>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Dokter wajib senantiasa mematuhi kode etik kedokteran dan peraturan perundang-undangan perlindungan data pribadi. Aplikasi menyediakan fitur sensor identitas (penyamaran nama dan No. RM) untuk melindungi privasi pasien.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900">3. Penyimpanan Data &amp; Sinkronisasi Mandiri</h4>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Data utama tersimpan di penyimpanan lokal perangkat dokter (<i>local-first</i>). Fitur sinkronisasi cloud terhubung secara terisolasi ke akun Google pribadi dokter dan tidak disebarluaskan ke pihak ketiga.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setAgreedTerms(true)
                  setShowTermsModal(false)
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-deep text-white text-xs font-bold shadow-md shadow-primary/25 hover:brightness-105 active:scale-95 transition-all cursor-pointer"
              >
                Saya Mengerti &amp; Setuju
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
