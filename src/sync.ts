import { db } from './db'
import { encryptJson, decryptJson, syncIdFromEntropy } from './crypto'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'
import { getFirebaseApp, getSavedUserProfile, saveUserProfile, saveDoctorSpecialty, getDoctorSpecialty, type UserProfile } from './auth'

/* Zero-knowledge sync & Cloud sync engine dengan proteksi Wipe-Out, Auto-Trigger, & Anti-Pingpong. */

export const TABLES = [
  'patients',
  'progressNotes',
  'doctorPreferences',
  'hospitals',
  'wards',
  'templates',
  'regexRules',
  'therapyHistory',
] as const

export const getDeviceId = () => {
  let id = localStorage.getItem('doctoid_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('doctoid_device_id', id)
  }
  return id
}

async function fb() {
  const app = getFirebaseApp()
  return { fs: getFirestore(app), doc, getDoc, setDoc }
}

export const fbConfigured = () => true

let isImporting = false
export const getIsImporting = () => isImporting

let syncDebounceTimer: any = null

/**
 * Pemicu Sinkronisasi Cloud Otomatis (Debounced 800ms)
 * Otomatis dipanggil saat ada perubahan tabel database lokal (Faskes, Pasien, CPPT, Template, dll)
 */
export function triggerCloudSync(delayMs = 800) {
  if (isImporting) return
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer)

  syncDebounceTimer = setTimeout(async () => {
    const saved = getSavedUserProfile()
    if (saved?.uid && saved.uid !== 'local') {
      try {
        await syncUserCloud(saved.uid, true)
      } catch (err) {
        console.warn('Auto cloud sync background push warning:', err)
      }
    }
  }, delayMs)
}

// Pasang hooks otomatis ke seluruh tabel Dexie agar setiap mutasi lokal otomatis ter-sync ke cloud
TABLES.forEach((tableName) => {
  const table = db.table(tableName)
  table.hook('creating', () => {
    if (!isImporting) triggerCloudSync()
  })
  table.hook('updating', () => {
    if (!isImporting) triggerCloudSync()
  })
  table.hook('deleting', () => {
    if (!isImporting) triggerCloudSync()
  })
})

export async function exportTables(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    out[t] = await db.table(t).toArray()
  }
  return out
}

/* Proteksi Wipe-Out: Validasi snapshot sebelum penimpaan & simpan safety backup */
export async function safeImportTables(tables: Record<string, unknown[]>): Promise<boolean> {
  if (!tables || typeof tables !== 'object') {
    throw new Error('Data tabel tidak valid untuk diimpor.')
  }

  // Hitung total seluruh record lokal vs remote (tidak hanya pasien, termasuk faskes & template)
  let localTotal = 0
  for (const t of TABLES) {
    try {
      localTotal += await db.table(t).count()
    } catch {
      // ignore
    }
  }

  let remoteTotal = 0
  for (const t of TABLES) {
    if (Array.isArray(tables[t])) {
      remoteTotal += tables[t].length
    }
  }

  // Jika lokal memiliki data tapi remote kosong (mis. faskes baru dibuat di lokal), jangan hapus lokal!
  if (localTotal > 0 && remoteTotal === 0) {
    console.warn('WIPEOUT SHIELD: Mencegah penimpaan database lokal dengan remote kosong. Memicu push.')
    return false
  }

  // Backup data lokal terakhir sebelum ditimpa
  try {
    const currentLocal = await exportTables()
    sessionStorage.setItem('doctoid_pre_sync_backup', JSON.stringify(currentLocal))
  } catch {
    // abaikan jika storage penuh
  }

  // Set flag agar Dexie hooks tidak memicu sync looping
  isImporting = true
  try {
    await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
      for (const t of TABLES) {
        if (Array.isArray(tables[t])) {
          await db.table(t).clear()
          if (tables[t].length > 0) {
            await db.table(t).bulkPut(tables[t])
          }
        }
      }
    })
  } finally {
    isImporting = false
  }

  return true
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
    if (snap.exists() && snap.data().revoked?.[getDeviceId()]) {
      await selfDestruct()
    }
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

/* Sync Cloud Bebas Ping-Pong & Full Profil:
   - Jika remote lebih baru: PULL data & profil dokter, set last_push = remote.updatedAt.
   - Jika lokal lebih baru atau forcePush: PUSH tables & profil dokter terbaru ke cloud. */
export async function syncUserCloud(uid: string, forcePush = false): Promise<string> {
  if (!uid || uid === 'local') return 'idle'
  const { fs, doc, getDoc, setDoc } = await fb()
  const deviceId = getDeviceId()
  const ref = doc(fs, 'users', uid)
  const snap = await getDoc(ref)

  let devices: Record<string, DeviceInfo> = {}
  let arah = 'idle'
  const lastPush = Number(localStorage.getItem('doctoid_last_push') ?? 0)

  if (snap.exists()) {
    const remote = snap.data() as {
      tables?: Record<string, unknown[]>
      devices?: Record<string, DeviceInfo>
      updatedAt?: number | string
      displayName?: string
      photoURL?: string
      specialty?: string
      email?: string
    }
    devices = remote.devices ?? {}
    const remoteUpdatedAt = typeof remote.updatedAt === 'number'
      ? remote.updatedAt
      : remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0

    // PULL DATA jika remote lebih baru dari waktu sync lokal terakhir dan bukan forcePush
    if (remoteUpdatedAt && remoteUpdatedAt > lastPush && remote.tables && !forcePush) {
      const imported = await safeImportTables(remote.tables)
      if (imported) {
        localStorage.setItem('doctoid_last_push', String(remoteUpdatedAt))
        arah = 'pull'
      }

      // Sinkronisasi profil dokter dari remote ke lokal
      if (remote.displayName || remote.photoURL || remote.specialty) {
        const current = getSavedUserProfile()
        const updatedProfile: UserProfile = {
          uid,
          email: remote.email || current?.email || null,
          displayName: remote.displayName || current?.displayName || 'Dokter',
          photoURL: remote.photoURL || current?.photoURL || null,
          specialty: remote.specialty || current?.specialty || getDoctorSpecialty(),
        }
        saveUserProfile(updatedProfile)
        if (updatedProfile.specialty) {
          saveDoctorSpecialty(updatedProfile.specialty)
        }
      }

      // Update info perangkat lokal saja tanpa mengubah snapshot/updatedAt utama (Anti Ping-Pong)
      devices[deviceId] = {
        nama: localStorage.getItem('doctoid_device_name') ?? `Perangkat ${deviceId.slice(0, 4)}`,
        lastSeen: new Date().toISOString(),
      }
      await setDoc(ref, { devices }, { merge: true })
      localStorage.setItem('doctoid_devices', JSON.stringify(devices))
      return arah
    }
  }

  // PUSH DATA ke Cloud (jika data lokal dimutasi, forcePush, atau remote lebih lama/kosong)
  devices[deviceId] = {
    nama: localStorage.getItem('doctoid_device_name') ?? `Perangkat ${deviceId.slice(0, 4)}`,
    lastSeen: new Date().toISOString(),
  }
  const updatedAt = Date.now()
  const tables = await exportTables()
  const currentProfile = getSavedUserProfile()

  await setDoc(
    ref,
    {
      tables,
      devices,
      updatedAt,
      displayName: currentProfile?.displayName || null,
      photoURL: currentProfile?.photoURL || null,
      specialty: currentProfile?.specialty || getDoctorSpecialty(),
      email: currentProfile?.email || null,
    },
    { merge: true }
  )

  localStorage.setItem('doctoid_last_push', String(updatedAt))
  localStorage.setItem('doctoid_devices', JSON.stringify(devices))
  return 'push'
}

/**
 * Paksa kirim seluruh database lokal saat ini ke Firestore Cloud
 */
export async function forcePushCloud(uid: string): Promise<string> {
  return syncUserCloud(uid, true)
}

/**
 * Paksa tarik seluruh database dari Firestore Cloud dan terapkan ke perangkat ini
 */
export async function forcePullCloud(uid: string): Promise<{ success: boolean; count: number; message: string }> {
  if (!uid || uid === 'local') return { success: false, count: 0, message: 'Belum login akun Google.' }
  const { fs, doc, getDoc } = await fb()
  const ref = doc(fs, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    return { success: false, count: 0, message: 'Belum ada data cadangan di cloud untuk akun ini.' }
  }
  const remote = snap.data()
  if (!remote.tables || typeof remote.tables !== 'object') {
    return { success: false, count: 0, message: 'Format data di cloud tidak valid atau kosong.' }
  }

  const imported = await safeImportTables(remote.tables)
  if (imported) {
    const updatedAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : Date.now()
    localStorage.setItem('doctoid_last_push', String(updatedAt))
    
    // Sinkronisasi profil
    if (remote.displayName || remote.photoURL || remote.specialty) {
      const current = getSavedUserProfile()
      const updatedProfile: UserProfile = {
        uid,
        email: remote.email || current?.email || null,
        displayName: remote.displayName || current?.displayName || 'Dokter',
        photoURL: remote.photoURL || current?.photoURL || null,
        specialty: remote.specialty || current?.specialty || getDoctorSpecialty(),
      }
      saveUserProfile(updatedProfile)
    }

    let total = 0
    for (const t of TABLES) {
      if (Array.isArray(remote.tables[t])) total += remote.tables[t].length
    }
    return { success: true, count: total, message: `Berhasil menarik ${total} data dari Cloud!` }
  }
  return { success: false, count: 0, message: 'Gagal menarik data cloud.' }
}

/* Ekspor Cadangan Data Offline (JSON File Download) */
export async function downloadBackupJson(): Promise<void> {
  const tables = await exportTables()
  const payload = {
    app: 'Doctoid',
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0',
    exported_at: new Date().toISOString(),
    tables,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const dateStr = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `doctoid_backup_${dateStr}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* Pulihkan Data dari Cadangan JSON */
export async function restoreBackupJson(jsonString: string): Promise<{ success: boolean; message: string }> {
  try {
    const data = JSON.parse(jsonString)
    const tables = data.tables || data
    if (!tables || typeof tables !== 'object') {
      return { success: false, message: 'File cadangan tidak memiliki struktur data tabel yang valid.' }
    }
    const imported = await safeImportTables(tables)
    if (imported) {
      triggerCloudSync(100)
      return { success: true, message: 'Seluruh data rekam medis berhasil dipulihkan ✓' }
    } else {
      return { success: false, message: 'Pemulihan dibatalkan oleh pelindung data.' }
    }
  } catch (e: any) {
    return { success: false, message: `Gagal membaca file cadangan: ${e.message || 'Format tidak valid'}` }
  }
}

/* Fallback syncNow untuk zero-knowledge backward compatibility */
export async function syncNow(entropy?: Uint8Array, rootKey?: CryptoKey): Promise<string> {
  const user = JSON.parse(localStorage.getItem('doctoid_user_profile') ?? 'null')
  if (user?.uid) {
    return syncUserCloud(user.uid)
  }
  if (!entropy || !rootKey) return 'none'
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
    if (remote.updatedAt > lastPush && remote.tables) {
      await safeImportTables(remote.tables)
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
