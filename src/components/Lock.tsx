import { useEffect, useRef, useState } from 'react'
import { Activity, KeyRound, RotateCcw, QrCode, Loader2, Check } from 'lucide-react'
import {
  vaultExists, genEntropy, entropyToPhrase, phraseToEntropy,
  wrapEntropy, unwrapEntropy, deriveRootKey, unb64,
} from '../crypto'
import { useUi } from '../store'

type Mode = 'unlock' | 'setup' | 'restore' | 'pair' | 'phrase'

const inputCls =
  'w-full rounded-xl border border-primary-soft/40 bg-card px-3 py-2.5 text-sm outline-none focus:border-primary'

export default function Lock() {
  const setSessionKeys = useUi((s) => s.setSessionKeys)
  const [mode, setMode] = useState<Mode>(vaultExists() ? 'unlock' : 'setup')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [phrase, setPhrase] = useState('')
  const [pairPayload, setPairPayload] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [scanning, setScanning] = useState(false)

  const masuk = async (entropy: Uint8Array) => {
    setSessionKeys({ entropy, rootKey: await deriveRootKey(entropy) })
  }

  const guard = async (fn: () => Promise<void>) => {
    setErr('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const unlock = () => guard(async () => masuk(await unwrapEntropy(pin)))

  const setup = () =>
    guard(async () => {
      if (pin.length < 4) throw new Error('PIN minimal 4 digit.')
      if (pin !== pin2) throw new Error('PIN tidak sama.')
      const e = genEntropy()
      await wrapEntropy(e, pin)
      setNewPhrase(entropyToPhrase(e))
      setMode('phrase')
    })

  const selesaiPhrase = () => guard(async () => masuk(phraseToEntropy(newPhrase)))

  const restore = () =>
    guard(async () => {
      if (pin.length < 4) throw new Error('PIN baru minimal 4 digit.')
      const e = phraseToEntropy(phrase)
      await wrapEntropy(e, pin)
      await masuk(e)
    })

  const pair = () =>
    guard(async () => {
      if (pin.length < 4) throw new Error('PIN baru minimal 4 digit.')
      let data: { e: string; fb?: unknown }
      try {
        data = JSON.parse(atob(pairPayload.trim()))
      } catch {
        throw new Error('Kode pairing tidak valid.')
      }
      if (data.fb) localStorage.setItem('doctoid_fb_config', JSON.stringify(data.fb))
      const e = unb64(data.e)
      await wrapEntropy(e, pin)
      await masuk(e)
    })

  /* Scan QR via BarcodeDetector native (Chrome/Android); fallback: tempel kode */
  useEffect(() => {
    if (!scanning) return
    let stop = false
    let stream: MediaStream
    ;(async () => {
      try {
        // @ts-expect-error BarcodeDetector belum ada di lib TS
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        videoRef.current!.srcObject = stream
        await videoRef.current!.play()
        const loop = async () => {
          if (stop) return
          const codes = await detector.detect(videoRef.current!)
          if (codes.length) {
            setPairPayload(codes[0].rawValue)
            setScanning(false)
          } else requestAnimationFrame(loop)
        }
        loop()
      } catch {
        setErr('Kamera/pemindai tidak tersedia — tempel kode manual.')
        setScanning(false)
      }
    })()
    return () => {
      stop = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [scanning])

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 p-6">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-lg shadow-primary/40">
        <Activity size={32} />
      </span>
      <h1 className="text-2xl font-bold">Doctoid</h1>

      <div className="w-full space-y-3 rounded-3xl bg-card p-5 shadow-sm">
        {mode === 'unlock' && (
          <>
            <p className="text-center text-sm font-semibold">Masukkan Master PIN</p>
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} placeholder="••••••" className={inputCls + ' text-center tracking-[0.5em]'} autoFocus />
            <button onClick={unlock} disabled={busy || !pin} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep py-2.5 text-sm font-bold text-white shadow-md shadow-primary/30 disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Buka
            </button>
            <button onClick={() => { setMode('restore'); setErr('') }} className="w-full cursor-pointer text-center text-xs text-ink-muted underline-offset-2 hover:underline">
              Lupa PIN? Pulihkan dengan recovery phrase
            </button>
          </>
        )}

        {mode === 'setup' && (
          <>
            <p className="text-center text-sm font-semibold">Buat Master PIN</p>
            <p className="text-center text-xs text-ink-muted">PIN ini membangkitkan kunci enkripsi (E2EE). Tidak ada server yang menyimpannya.</p>
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN baru" className={inputCls + ' text-center tracking-[0.5em]'} autoFocus />
            <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="Ulangi PIN" className={inputCls + ' text-center tracking-[0.5em]'} />
            <button onClick={setup} disabled={busy} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep py-2.5 text-sm font-bold text-white shadow-md shadow-primary/30 disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Buat Vault
            </button>
            <div className="flex justify-center gap-4 text-xs text-ink-muted">
              <button onClick={() => { setMode('restore'); setErr('') }} className="flex cursor-pointer items-center gap-1 underline-offset-2 hover:underline"><RotateCcw size={12} /> Pulihkan</button>
              <button onClick={() => { setMode('pair'); setErr('') }} className="flex cursor-pointer items-center gap-1 underline-offset-2 hover:underline"><QrCode size={12} /> Pairing QR</button>
            </div>
          </>
        )}

        {mode === 'phrase' && (
          <>
            <p className="text-center text-sm font-semibold">Catat Recovery Phrase Anda</p>
            <p className="text-center text-xs text-red-500">Ditampilkan SEKALI ini saja. Tanpa ini + lupa PIN = data tidak bisa dipulihkan.</p>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface p-3">
              {newPhrase.split(' ').map((w, i) => (
                <span key={i} className="rounded-lg bg-card px-2 py-1 text-center text-xs font-mono"><span className="text-ink-muted">{i + 1}.</span> {w}</span>
              ))}
            </div>
            <button onClick={selesaiPhrase} disabled={busy} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-deep py-2.5 text-sm font-bold text-white shadow-md shadow-primary/30">
              <Check size={16} /> Sudah kucatat dengan aman
            </button>
          </>
        )}

        {mode === 'restore' && (
          <>
            <p className="text-center text-sm font-semibold">Pulihkan dari Recovery Phrase</p>
            <textarea value={phrase} onChange={(e) => setPhrase(e.target.value)} rows={3} placeholder="12 kata dipisah spasi…" className={inputCls + ' resize-none font-mono text-xs'} autoFocus />
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Master PIN baru" className={inputCls + ' text-center tracking-[0.5em]'} />
            <button onClick={restore} disabled={busy} className="w-full cursor-pointer rounded-xl bg-gradient-to-br from-primary to-primary-deep py-2.5 text-sm font-bold text-white shadow-md shadow-primary/30 disabled:opacity-40">
              Pulihkan & Buka
            </button>
            <button onClick={() => setMode(vaultExists() ? 'unlock' : 'setup')} className="w-full cursor-pointer text-center text-xs text-ink-muted underline-offset-2 hover:underline">Kembali</button>
          </>
        )}

        {mode === 'pair' && (
          <>
            <p className="text-center text-sm font-semibold">Pairing dari Perangkat Lain</p>
            <p className="text-center text-xs text-ink-muted">Buka Pengaturan → Keamanan di perangkat lama, lalu scan QR atau salin kode pairing-nya.</p>
            {scanning && <video ref={videoRef} className="w-full rounded-xl" muted playsInline />}
            <button onClick={() => setScanning((v) => !v)} className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-surface py-2 text-xs font-semibold text-ink-muted">
              <QrCode size={14} /> {scanning ? 'Berhenti Scan' : 'Scan QR dengan Kamera'}
            </button>
            <textarea value={pairPayload} onChange={(e) => setPairPayload(e.target.value)} rows={3} placeholder="…atau tempel kode pairing di sini" className={inputCls + ' resize-none font-mono text-xs'} />
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Master PIN baru untuk perangkat ini" className={inputCls + ' text-center tracking-[0.5em]'} />
            <button onClick={pair} disabled={busy || !pairPayload.trim()} className="w-full cursor-pointer rounded-xl bg-gradient-to-br from-primary to-primary-deep py-2.5 text-sm font-bold text-white shadow-md shadow-primary/30 disabled:opacity-40">
              Pairing & Buka
            </button>
            <button onClick={() => setMode(vaultExists() ? 'unlock' : 'setup')} className="w-full cursor-pointer text-center text-xs text-ink-muted underline-offset-2 hover:underline">Kembali</button>
          </>
        )}

        {err && <p className="text-center text-xs font-medium text-red-500">{err}</p>}
      </div>
      <p className="text-center text-[10px] text-ink-muted">Data terenkripsi end-to-end. Server sinkronisasi hanya melihat ciphertext.</p>
    </div>
  )
}
