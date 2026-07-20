import { useState } from 'react'
import QRCode from 'qrcode'
import {
  ShieldCheck, RefreshCw, QrCode, Lock as LockIcon, Trash2, Loader2, Smartphone,
} from 'lucide-react'
import { useUi } from '../store'
import { b64, entropyToPhrase } from '../crypto'
import { syncNow, revokeDevice, selfDestruct, getDeviceId, fbConfigured, type DeviceInfo } from '../sync'
import { verifyBiometric } from '../webauthn'

const inputCls =
  'w-full rounded-xl border border-primary-soft/40 bg-surface px-3 py-2 text-sm outline-none focus:border-primary'

export default function SecuritySection({ notify }: { notify: (m: string) => void }) {
  const { sessionKeys, setSessionKeys, setSettingsOpen } = useUi()
  const [fbCfg, setFbCfg] = useState(localStorage.getItem('doctoid_fb_config') ?? '')
  const [devName, setDevName] = useState(localStorage.getItem('doctoid_device_name') ?? '')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState('')
  const [phrase, setPhrase] = useState('')
  const devices: Record<string, DeviceInfo> = JSON.parse(localStorage.getItem('doctoid_devices') ?? '{}')
  const myId = getDeviceId()

  const simpanFb = () => {
    try {
      const clean = fbCfg.trim()
      if (clean) JSON.parse(clean)
      if (clean) localStorage.setItem('doctoid_fb_config', clean)
      else localStorage.removeItem('doctoid_fb_config')
      notify('Konfigurasi Firebase tersimpan ✓')
    } catch {
      notify('JSON konfigurasi tidak valid.')
    }
  }

  const jalankanSync = async () => {
    if (!sessionKeys) return
    setBusy(true)
    try {
      const arah = await syncNow(sessionKeys.entropy, sessionKeys.rootKey)
      notify(arah === 'pull' ? 'Sync ✓ — data terbaru ditarik dari cloud' : 'Sync ✓ — data lokal terkirim')
    } catch (e) {
      notify(`Sync gagal: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const tampilkanRahasia = async () => {
    if (!sessionKeys) return
    if (!(await verifyBiometric())) return notify('Verifikasi gagal.')
    const payload = btoa(
      JSON.stringify({
        e: b64(sessionKeys.entropy),
        fb: fbConfigured() ? JSON.parse(localStorage.getItem('doctoid_fb_config')!) : undefined,
      }),
    )
    setQr(await QRCode.toDataURL(payload, { width: 240, margin: 1 }))
    setPhrase(entropyToPhrase(sessionKeys.entropy))
  }

  return (
    <section className="mb-6 space-y-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
        <ShieldCheck size={15} /> Keamanan & Sinkronisasi
      </h3>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Nama perangkat ini</span>
        <input
          value={devName}
          onChange={(e) => {
            setDevName(e.target.value)
            localStorage.setItem('doctoid_device_name', e.target.value)
          }}
          placeholder={`Perangkat ${myId.slice(0, 4)}`}
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Konfigurasi Firebase (JSON dari Project Settings → Web App)</span>
        <textarea value={fbCfg} onChange={(e) => setFbCfg(e.target.value)} rows={4} placeholder='{"apiKey":"…","authDomain":"…","projectId":"…","appId":"…"}' className={inputCls + ' resize-y font-mono text-[11px]'} />
        <button onClick={simpanFb} className="mt-1.5 cursor-pointer rounded-xl bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted">Simpan Config</button>
      </label>

      <div className="flex flex-wrap gap-2">
        <button onClick={jalankanSync} disabled={busy || !fbConfigured()} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-primary-deep px-3 py-2 text-xs font-semibold text-white shadow-md shadow-primary/30 disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync Sekarang
        </button>
        <button onClick={tampilkanRahasia} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-ink-muted">
          <QrCode size={14} /> QR Pairing & Recovery Phrase
        </button>
      </div>

      {qr && (
        <div className="space-y-2 rounded-xl bg-surface p-3 text-center">
          <img src={qr} alt="QR Pairing" className="mx-auto rounded-lg" />
          <p className="font-mono text-[11px]">{phrase}</p>
          <p className="text-[10px] text-red-500">Jangan bagikan — siapa pun dengan QR/frasa ini dapat membuka seluruh data.</p>
          <button onClick={() => { setQr(''); setPhrase('') }} className="cursor-pointer text-[10px] text-ink-muted underline">Sembunyikan</button>
        </div>
      )}

      {Object.keys(devices).length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-muted"><Smartphone size={13} /> Perangkat tertaut (Kill Switch)</p>
          <div className="space-y-1.5">
            {Object.entries(devices).map(([id, d]) => (
              <div key={id} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-xs">
                <span className="flex-1">
                  {d.nama} {id === myId && <b className="text-primary-deep">(perangkat ini)</b>}
                  <span className="block text-[10px] text-ink-muted">terakhir aktif {new Date(d.lastSeen).toLocaleString('id-ID')}</span>
                </span>
                {id !== myId && (
                  <button
                    onClick={async () => {
                      if (!sessionKeys || !window.confirm(`Revoke "${d.nama}"? Perangkat itu akan menghapus seluruh datanya saat online.`)) return
                    try {
                        await revokeDevice(sessionKeys.entropy, sessionKeys.rootKey, id)
                        notify('Perangkat di-revoke ✓')
                      } catch (e) {
                        notify(`Gagal: ${(e as Error).message}`)
                      }
                    }}
                    className="cursor-pointer rounded-lg bg-red-100 px-2 py-1 font-semibold text-red-600"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-surface pt-3">
        <button
          onClick={() => { setSettingsOpen(false); setSessionKeys(null) }}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-ink-muted"
        >
          <LockIcon size={14} /> Kunci Aplikasi
        </button>
        <button
          onClick={async () => {
            if (window.confirm('Hapus SEMUA data lokal di perangkat ini? Tidak bisa dibatalkan.') && window.confirm('Yakin? Pastikan sudah sync / punya recovery phrase.')) {
              await selfDestruct()
            }
          }}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600"
        >
          <Trash2 size={14} /> Hapus Semua Data Lokal
        </button>
      </div>
    </section>
  )
}
