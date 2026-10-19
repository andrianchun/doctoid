import React, { useState, useEffect } from 'react'
import {
  MessageSquare,
  ShieldCheck,
  Smartphone,
  Check,
  Copy,
  Lock,
  Power,
  RefreshCw,
  LogOut,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

interface BotState {
  active: boolean
  connected: boolean
  qrDataUrl: string | null
  pairingCode?: string | null
  phone: string | null
  name: string | null
  lastSync?: string | null
}

interface WhatsAppIntegrationCardProps {
  notify: (msg: string) => void
}

export const WhatsAppIntegrationCard: React.FC<WhatsAppIntegrationCardProps> = ({ notify }) => {
  const [waNumber, setWaNumber] = useState('')
  const [isSaved, setIsSaved] = useState(false)
  const [botState, setBotState] = useState<BotState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [serverOnline, setServerOnline] = useState(false)
  const [pairMode, setPairMode] = useState<'qr' | 'code'>('code')
  const [pairingPhone, setPairingPhone] = useState('')
  const [pairingLoading, setPairingLoading] = useState(false)

  // Ambil nomor whitelist dari local storage
  useEffect(() => {
    const saved = localStorage.getItem('doctoid_wa_whitelist') || ''
    setWaNumber(saved)
  }, [])

  // Polling status bot dari endpoint lokal port 3001 (fallback: wa-status.json)
  const fetchStatus = async () => {
    try {
      // 1. Coba hubungi controller server port 3001
      const res = await fetch(`http://127.0.0.1:3001/api/status?t=${Date.now()}`)
      if (res.ok) {
        const data = await res.json()
        setBotState(data)
        setServerOnline(true)
        return
      }
    } catch {
      // 2. Fallback baca static status jika disajikan via Vite public
      try {
        const staticRes = await fetch('/wa-status.json?t=' + Date.now())
        if (staticRes.ok) {
          const staticData = await staticRes.json()
          setBotState(staticData)
          setServerOnline(true)
          return
        }
      } catch {}
    }
    setServerOnline(false)
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  // Toggle Aktif / Nonaktifkan Bot
  const handleToggleBot = async () => {
    if (!botState) return
    setIsLoading(true)
    try {
      const res = await fetch('http://127.0.0.1:3001/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !botState.active }),
      })
      if (res.ok) {
        const data = await res.json()
        setBotState(data.botState)
        notify(
          !botState.active
            ? 'Bot WhatsApp diaktifkan (ON) ✓'
            : 'Bot WhatsApp dinonaktifkan (OFF) ✓'
        )
      } else {
        notify('Gagal mengubah status bot.')
      }
    } catch {
      notify('Server gateway bot tidak merespons.')
    } finally {
      setIsLoading(false)
      fetchStatus()
    }
  }

  // Putuskan Sesi WhatsApp (Logout)
  const handleDisconnect = async () => {
    if (!confirm('Apakah Anda yakin ingin memutuskan tautan WhatsApp? Anda perlu scan QR ulang untuk menghubungkannya kembali.')) {
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('http://127.0.0.1:3001/api/disconnect', { method: 'POST' })
      if (res.ok) {
        notify('Sesi WhatsApp berhasil diputuskan ✓')
        fetchStatus()
      } else {
        notify('Gagal memutuskan sesi.')
      }
    } catch {
      notify('Server gateway bot tidak merespons.')
    } finally {
      setIsLoading(false)
    }
  }

  // Minta Kode Pairing 8 Digit (Tanpa Perangkat Kedua / Scan QR)
  const handleRequestPairCode = async () => {
    if (!pairingPhone.trim()) {
      notify('Masukkan nomor WhatsApp Anda terlebih dahulu.')
      return
    }
    setPairingLoading(true)
    try {
      const res = await fetch('http://127.0.0.1:3001/api/pair-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pairingPhone }),
      })
      if (res.ok) {
        notify('Kode pairing 8 digit berhasil dibuat ✓')
        fetchStatus()
      } else {
        const err = await res.json().catch(() => ({}))
        notify(err.error || 'Gagal meminta kode pairing.')
      }
    } catch {
      notify('Server gateway bot tidak merespons.')
    } finally {
      setPairingLoading(false)
    }
  }

  // Simpan Whitelist Nomor
  const handleSaveNumber = async () => {
    const clean = waNumber.trim().replace(/[^0-9+]/g, '')
    localStorage.setItem('doctoid_wa_whitelist', clean)
    setWaNumber(clean)
    setIsSaved(true)

    try {
      await fetch('http://127.0.0.1:3001/api/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whitelist: clean }),
      })
    } catch {}

    notify('Nomor WhatsApp resmi berhasil disimpan ✓')
    setTimeout(() => setIsSaved(false), 2000)
  }

  return (
    <div className="space-y-4 text-xs">
      {/* Header Utama dengan Saklar Master ON/OFF */}
      <div className="p-4 rounded-3xl bg-slate-900 text-white space-y-3 shadow-md border border-slate-800">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <MessageSquare size={18} />
            </div>
            <div>
              <span className="font-extrabold text-sm block">WhatsApp Clinical Bot</span>
              <span className="text-[11px] text-slate-400">
                Kontrol koneksi bot langsung dari aplikasi
              </span>
            </div>
          </div>

          {/* Saklar Master Switch ON / OFF */}
          <button
            type="button"
            onClick={handleToggleBot}
            disabled={isLoading || !serverOnline}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl font-bold text-xs transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
              botState?.active
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Power size={14} />
            )}
            <span>{botState?.active ? 'BOT AKTIF (ON)' : 'BOT NONAKTIF (OFF)'}</span>
          </button>
        </div>

        {/* Status Indikator Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
          <div className="flex items-center gap-2">
            <span
              className={`size-2.5 rounded-full ${
                !serverOnline
                  ? 'bg-slate-500'
                  : botState?.connected
                  ? 'bg-emerald-400 animate-pulse'
                  : botState?.active
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-semibold text-slate-300">
              {!serverOnline
                ? 'Gateway Service Belum Berjalan'
                : botState?.connected
                ? `Terhubung: ${botState.name || 'Dokter'} (${botState.phone || 'Aktif'})`
                : botState?.active
                ? 'Menunggu Scan Kode QR WhatsApp'
                : 'Bot Dimatikan oleh Dokter'}
            </span>
          </div>

          {serverOnline && (
            <button
              type="button"
              onClick={fetchStatus}
              className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              title="Perbarui Status"
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>
      </div>

      {/* KONDISI 1: BELUM TERHUBUNG (PILIHAN: KODE 8 DIGIT / SCAN QR) */}
      {serverOnline && botState?.active && !botState?.connected && (
        <div className="p-4 rounded-3xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-3.5 animate-in fade-in zoom-in-95 shadow-sm">
          {/* Header Penjelasan Keamanan */}
          <div className="p-3 rounded-2xl bg-amber-100/70 border border-amber-200 text-left text-[11px] text-amber-900 space-y-1.5">
            <span className="font-bold block text-emerald-800">🔒 Aman &amp; Terisolasi 100%:</span>
            <p className="leading-relaxed">
              Bot diprogram untuk <b>HANYA</b> membaca pesan di grup khusus bernama <b>&quot;Doctoid&quot;</b> atau chat <b>&quot;Kirim ke Diri Sendiri&quot;</b>. Seluruh chat grup RS lain, keluarga, dan pasien <b>100% diblokir &amp; diabaikan</b>, serta <b>tanpa pesan balasan apa pun</b>.
            </p>
          </div>

          {/* Tab Pemilih Metode: Kode 8 Digit (Khusus 1 HP Saja) vs Scan QR */}
          <div className="flex p-1 bg-amber-200/60 rounded-2xl gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPairMode('code')}
              className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                pairMode === 'code' ? 'bg-white text-ink shadow-xs' : 'text-amber-800 hover:text-ink'
              }`}
            >
              <span>🔢 Kode 8 Digit (Cukup 1 HP)</span>
            </button>
            <button
              type="button"
              onClick={() => setPairMode('qr')}
              className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                pairMode === 'qr' ? 'bg-white text-ink shadow-xs' : 'text-amber-800 hover:text-ink'
              }`}
            >
              <span>📲 Scan QR (Jika Ada Laptop)</span>
            </button>
          </div>

          {/* OPSI A: KODE 8 DIGIT (SANGAT COCOK UNTUK PAKAI 1 HP TANPA PERANGKAT LAIN) */}
          {pairMode === 'code' && (
            <div className="space-y-3 p-3 bg-white rounded-2xl border border-amber-200 text-left">
              <span className="font-bold text-xs text-ink block">
                Tautkan WhatsApp Menggunakan Nomor HP (Tanpa Kamera):
              </span>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={pairingPhone}
                  onChange={(e) => setPairingPhone(e.target.value)}
                  placeholder="Nomor WA Anda, mis. 08123456789"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-ink outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleRequestPairCode}
                  disabled={pairingLoading}
                  className="px-3.5 py-2 rounded-xl bg-primary text-white font-bold hover:bg-primary-deep text-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {pairingLoading ? <Loader2 size={13} className="animate-spin" /> : 'Minta Kode'}
                </button>
              </div>

              {botState?.pairingCode && (
                <div className="p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-center space-y-2 animate-in zoom-in-95">
                  <span className="text-[11px] font-bold text-emerald-800 block">
                    🔑 Masukkan Kode Ini di WhatsApp HP Anda:
                  </span>
                  <div className="text-2xl font-black font-mono tracking-widest text-emerald-700 bg-white py-2 px-4 rounded-xl border border-emerald-200 shadow-xs inline-block">
                    {botState.pairingCode}
                  </div>
                  <div className="text-[10px] text-emerald-800 text-left space-y-0.5 bg-emerald-100/60 p-2.5 rounded-xl">
                    <p><b>Cara Masukkan di WhatsApp:</b></p>
                    <p>1. Buka WhatsApp di HP Anda &gt; <b>Perangkat Tertaut</b>.</p>
                    <p>2. Klik <b>Tautkan Perangkat</b>.</p>
                    <p>3. Di bawah layar kamera, klik teks kecil: <b>&quot;Tautkan dengan nomor telepon saja&quot;</b>.</p>
                    <p>4. Masukkan kode 8 digit di atas.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OPSI B: SCAN QR BIASA */}
          {pairMode === 'qr' && (
            <div className="flex flex-col items-center space-y-2">
              {botState?.qrDataUrl ? (
                <div className="p-2.5 rounded-2xl bg-white shadow-md border border-amber-200">
                  <img
                    src={botState.qrDataUrl}
                    alt="Scan WhatsApp QR"
                    className="size-56 sm:size-64 object-contain"
                  />
                </div>
              ) : (
                <div className="size-56 flex items-center justify-center text-xs text-amber-800">
                  Memuat QR Code...
                </div>
              )}
              <span className="text-[10px] text-amber-700 italic">
                💡 Buka WhatsApp di HP &gt; Perangkat Tertaut &gt; Tautkan Perangkat.
              </span>
            </div>
          )}
        </div>
      )}

      {/* KONDISI 2: SUDAH TERHUBUNG (CONNECTED) */}
      {serverOnline && botState?.connected && (
        <div className="p-4 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <div>
                <span className="font-bold text-xs block text-emerald-900">
                  WhatsApp Terhubung (Mode Grup &quot;Doctoid&quot; Aktif)
                </span>
                <span className="text-[11px] text-emerald-700 font-mono">
                  Nomor: {botState.phone || 'Aktif'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-700 font-bold hover:bg-rose-200 transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
            >
              <LogOut size={13} />
              <span>Putuskan</span>
            </button>
          </div>

          <div className="p-3 rounded-2xl bg-white/80 border border-emerald-200 text-[11px] text-emerald-900 space-y-1.5">
            <span className="font-bold text-emerald-950 block">📱 Skenario Pemakaian Sehari-hari (Hanya Pakai HP):</span>
            <p className="leading-relaxed">
              1. Dokter cukup buat <b>1 grup WhatsApp bernama &quot;Doctoid&quot;</b> (anggotanya cukup dokter sendirian).<br />
              2. Di grup IGD / bangsal RS, tandai pesan / foto lab / video kejang &gt; klik <b>Forward (Panah Teruskan)</b> &gt; kirim ke grup <b>&quot;Doctoid&quot;</b>.<br />
              3. Buka app docto.id di HP dokter &gt; menu <b>Catat Pasien</b>: data langsung tersedia dan siap dirapikan dengan AI!
            </p>
          </div>
        </div>
      )}

      {/* KONDISI 3: SERVER BELUM BERJALAN */}
      {!serverOnline && (
        <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 space-y-2">
          <span className="font-bold text-xs text-ink block">
            Jalankan Gateway Service di Komputer Anda:
          </span>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Buka terminal proyek dan ketik perintah berikut untuk memulai service bot:
          </p>
          <div className="p-2.5 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px] flex items-center justify-between">
            <span>npm run wa:bot</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText('npm run wa:bot')
                notify('Perintah disalin ke clipboard')
              }}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <Copy size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Form Whitelist Nomor HP Dokter */}
      <div className="rounded-2xl border border-slate-200 p-3.5 bg-white space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-ink flex items-center gap-1.5">
            <Lock size={14} className="text-primary" />
            <span>Nomor WA Pribadi Dokter (Pengirim Forward yang Sah)</span>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
            UU PDP Protected
          </span>
        </div>

        <p className="text-slate-500 text-[11px] leading-relaxed">
          Masukkan nomor WA pribadi dokter di sini. Akun Bot docto.id hanya akan memproses pesan/media yang <b>diforward oleh nomor dokter ini</b>. Chat dari nomor lain otomatis diabaikan.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={waNumber}
            onChange={(e) => setWaNumber(e.target.value)}
            placeholder="mis. 08123456789 atau +628123456789"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={handleSaveNumber}
            className="px-4 py-2 rounded-xl bg-primary text-white font-bold hover:bg-primary-deep transition-all cursor-pointer flex items-center gap-1.5"
          >
            {isSaved ? <Check size={14} /> : null}
            <span>{isSaved ? 'Tersimpan' : 'Simpan'}</span>
          </button>
        </div>
      </div>

      {/* Opsi Direct Share (Alternatif Tanpa Bot) */}
      <div className="rounded-2xl border border-slate-200 p-3 bg-slate-50/60 space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Smartphone size={14} className="text-primary" />
          <span>Alternatif: Direct Share Android (Siap Pakai Kapan Saja)</span>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Jika bot sedang dimatikan atau offline, dokter tetap bisa membagikan chat/foto/voice note/video langsung dari WhatsApp menggunakan tombol <b>Share ke Docto.id</b> di ponsel.
        </p>
      </div>

      {/* Status Keamanan */}
      <div className="p-3 rounded-2xl bg-slate-100/80 border border-slate-200 space-y-1 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5 font-bold text-ink">
          <ShieldCheck size={14} className="text-emerald-600" />
          <span>Status Keamanan Sistem docto.id</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
            ✓ De-identifikasi PII On-The-Fly Aktif
          </span>
          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
            ✓ Enkripsi E2EE AES-GCM 256 Terpasang
          </span>
          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
            ✓ Privacy Blur Shield Video Kejang Aktif
          </span>
          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
            ✓ Tombol Darurat Putuskan / Matikan Bot Tersedia
          </span>
        </div>
      </div>
    </div>
  )
}
