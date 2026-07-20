import { db } from './db'
import { encryptJson, decryptJson, syncIdFromEntropy } from './crypto'

/* Zero-knowledge sync: Firestore hanya menyimpan ciphertext.
   Field `revoked` sengaja plaintext (hanya berisi deviceId acak, tanpa PHI)
   agar device hilang bisa self-destruct SEBELUM unlock. */

const TABLES = ['patients', 'progressNotes', 'doctorPreferences', 'hospitals', 'wards', 'templates'] as const

export const getDeviceId = () => {
  let id = localStorage.getItem('doctoid_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('doctoid_device_id', id)
  }
  return id
}

/* Firebase di-lazy-load: bundle utama tetap ramping untuk pemakaian offline murni */
async function fb() {
  const raw = localStorage.getItem('doctoid_fb_config')
  if (!raw) throw new Error('Tempel konfigurasi Firebase di Pengaturan dulu.')
  const [{ initializeApp, getApps }, { getAuth, signInAnonymously }, { getFirestore, doc, getDoc, setDoc }] =
    await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
  const app = getApps()[0] ?? initializeApp(JSON.parse(raw))
  const auth = getAuth(app)
  if (!auth.currentUser) await signInAnonymously(auth)
  return { fs: getFirestore(app), doc, getDoc, setDoc }
}

export const fbConfigured = () => !!localStorage.getItem('doctoid_fb_config')

async function exportTables() {
  const out: Record<string, unknown[]> = {}
  for (const t of TABLES) out[t] = await db.table(t).toArray()
  return out
}

async function importTables(tables: Record<string, unknown[]>) {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      if (tables[t]?.length) await db.table(t).bulkAdd(tables[t])
    }
  })
}

export async function selfDestruct(): Promise<never> {
  await db.delete()
  localStorage.clear()
  location.reload()
  throw new Error('destroyed')
}

/* Cek revoke pra-unlock: syncId & deviceId plaintext di localStorage */
export async function checkRevoked(): Promise<void> {
  const syncId = localStorage.getItem('doctoid_sync_id')
  if (!syncId || !fbConfigured()) return
  try {
    const { fs, doc, getDoc } = await fb()
    const snap = await getDoc(doc(fs, 'doctoid', syncId))
    if (snap.exists() && snap.data().revoked?.[getDeviceId()]) await selfDestruct()
  } catch {
    /* offline / belum ada doc — abaikan, cek lagi sync berikutnya */
  }
}

export interface DeviceInfo {
  nama: string
  lastSeen: string
}

export interface SyncMeta {
  devices: Record<string, DeviceInfo>
  revoked: Record<string, boolean>
}

/* ponytail: snapshot penuh + last-write-wins per updatedAt; ganti merge per-record jika mulai edit paralel multi-device */
export async function syncNow(entropy: Uint8Array, rootKey: CryptoKey): Promise<string> {
  const { fs, doc, getDoc, setDoc } = await fb()
  const syncId = await syncIdFromEntropy(entropy)
  localStorage.setItem('doctoid_sync_id', syncId)
  const deviceId = getDeviceId()
  const ref = doc(fs, 'doctoid', syncId)
  const snap = await getDoc(ref)

  let devices: Record<string, DeviceInfo> = {}
  let revoked: Record<string, boolean> = {}
  let arah = 'push'

  if (snap.exists()) {
    revoked = snap.data().revoked ?? {}
    if (revoked[deviceId]) await selfDestruct()
    const remote = await decryptJson<{ tables: Record<string, unknown[]>; devices: Record<string, DeviceInfo>; updatedAt: number }>(
      rootKey,
      snap.data().payload,
    )
    devices = remote.devices ?? {}
    const lastPush = Number(localStorage.getItem('doctoid_last_push') ?? 0)
    if (remote.updatedAt > lastPush) {
      await importTables(remote.tables)
      arah = 'pull'
    }
  }

  devices[deviceId] = {
    nama: localStorage.getItem('doctoid_device_name') ?? `Perangkat ${deviceId.slice(0, 4)}`,
    lastSeen: new Date().toISOString(),
  }
  const updatedAt = Date.now()
  const payload = await encryptJson(rootKey, { tables: await exportTables(), devices, updatedAt })
  await setDoc(ref, { payload, revoked, updatedAt })
  localStorage.setItem('doctoid_last_push', String(updatedAt))
  localStorage.setItem('doctoid_devices', JSON.stringify(devices))
  return arah
}

/* Remote Kill Switch: tandai device lain revoked (plaintext) + push state terbaru */
export async function revokeDevice(entropy: Uint8Array, rootKey: CryptoKey, targetId: string): Promise<void> {
  const { fs, doc, getDoc, setDoc } = await fb()
  const syncId = await syncIdFromEntropy(entropy)
  const ref = doc(fs, 'doctoid', syncId)
  const snap = await getDoc(ref)
  const revoked = { ...(snap.exists() ? snap.data().revoked : {}), [targetId]: true }
  await setDoc(ref, { revoked }, { merge: true })
  await syncNow(entropy, rootKey)
}
