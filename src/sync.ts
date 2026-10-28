import { db } from './db'
import { encryptJson, decryptJson, syncIdFromEntropy } from './crypto'
import { getFirestore, initializeFirestore, doc, getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore'
import {
  getFirebaseApp, getFirebaseAuth, getSavedUserProfile, saveUserProfile,
  saveDoctorSpecialty, getDoctorSpecialty, type UserProfile
} from './auth'
import { cachePatients, cacheAllPatients, cacheNotes } from './utils/dataCache'
import { isNonTherapyText } from './parser'
import { getLocalDateString } from './utils/dateFormat'

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
  'penunjang',
  'poliLogs',
] as const

export const getDeviceId = () => {
  let id = localStorage.getItem('doctoid_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('doctoid_device_id', id)
  }
  return id
}

let firestoreDb: Firestore | null = null
export function getFirestoreDb(): Firestore {
  if (!firestoreDb) {
    const app = getFirebaseApp()
    try {
      firestoreDb = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
      })
    } catch {
      firestoreDb = getFirestore(app)
    }
  }
  return firestoreDb
}

async function fb() {
  const fs = getFirestoreDb()
  return { fs, doc, getDoc, setDoc, onSnapshot }
}

export const fbConfigured = () => true

let isImporting = false
export const getIsImporting = () => isImporting

let syncDebounceTimer: any = null

/**
 * Inisialisasi Sinkronisasi Cloud Real-Time (Two-Way Live Sync)
 * Mendengarkan snapshot Firestore secara langsung tanpa jeda
 */
export function initRealtimeCloudSync(uid: string): () => void {
  if (!uid || uid === 'local') return () => {}
  const fs = getFirestoreDb()
  const ref = doc(fs, 'users', uid)
  const currentDeviceId = getDeviceId()

  const unsubscribe = onSnapshot(
    ref,
    async (snap) => {
      // Abaikan write lokal yang belum selesai dari device ini sendiri (anti-loop)
      if (snap.metadata.hasPendingWrites) return

      if (!snap.exists()) {
        // Jika dokumen cloud belum ada tapi lokal punya data, push data awal ke cloud
        const local = await exportTables()
        let hasData = false
        for (const t of TABLES) {
          if (local[t] && local[t].length > 0) {
            hasData = true
            break
          }
        }
        if (hasData) {
          await syncUserCloud(uid, true)
        }
        return
      }

      const remote = snap.data() as {
        tables?: Record<string, unknown[]>
        updatedAt?: number | string
        lastModifiedBy?: string
        displayName?: string
        photoURL?: string
        specialty?: string
        email?: string
      }

      if (remote.tables && typeof remote.tables === 'object') {
        const lastPush = Number(localStorage.getItem('doctoid_last_push') ?? 0)
        const lastImportedRemote = Number(localStorage.getItem('doctoid_last_imported_remote') ?? 0)
        const remoteUpdatedAt =
          typeof remote.updatedAt === 'number'
            ? remote.updatedAt
            : remote.updatedAt
            ? new Date(remote.updatedAt).getTime()
            : 0

        const isFromOtherDevice = !!remote.lastModifiedBy && remote.lastModifiedBy !== currentDeviceId
        const isDeviceFresh = lastPush === 0 || lastImportedRemote === 0
        const isRemoteNewer = remoteUpdatedAt > lastPush
        const isNewRemoteSnapshot = remoteUpdatedAt > 0 && remoteUpdatedAt !== lastImportedRemote

        // Tarik data (pull) jika:
        // 1. Ada snapshot remote baru yang belum diimpor oleh device ini, ATAU
        // 2. Snapshot berasal dari perangkat lain (misal APK di HP), ATAU
        // 3. Timestamp remote lebih baru, ATAU
        // 4. Perangkat lokal baru belum pernah sinkron
        if (isNewRemoteSnapshot || isFromOtherDevice || isRemoteNewer || isDeviceFresh) {
          const imported = await safeImportTables(remote.tables)
          if (imported) {
            localStorage.setItem('doctoid_last_imported_remote', String(remoteUpdatedAt))
            localStorage.setItem('doctoid_last_push', String(remoteUpdatedAt || Date.now()))
            window.dispatchEvent(new CustomEvent('doctoid_data_synced'))
          }
        }
        // JANGAN PERNAH memicu push balik (triggerCloudSync) dari dalam listener onSnapshot!
        // Listener snapshot hanya bertugas menerima pembaruan, bukan memantulkan data kembali ke cloud.

        // Update profil dokter jika ada pembaruan di cloud
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
      }
    },
    (error) => {
      console.warn('Realtime cloud sync listener warning:', error)
    }
  )

  return unsubscribe
}

/**
 * Pemicu Sinkronisasi Cloud Otomatis (Debounced 400ms)
 * Otomatis dipanggil saat ada perubahan tabel database lokal (Faskes, Pasien, CPPT, Template, dll)
 */
export function triggerCloudSync(delayMs = 400) {
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
    const list = await db.table(t).toArray()
    let cleanedList = list

    // Optimasi ukuran dokumen Firestore (Mencegah melampaui batas 1 MB Firebase):
    // 1. therapyHistory: simpan 50 record terbaru untuk sinkronisasi cloud
    if (t === 'therapyHistory' && list.length > 50) {
      cleanedList = list.slice(-50)
    }

    // 2. progressNotes: simpan 70 record catatan terbaru untuk sinkronisasi cloud
    if (t === 'progressNotes' && list.length > 70) {
      cleanedList = list.slice(-70)
    }

    // 3. progressNotes, penunjang, & poliLogs:
    // Pertahankan dataUrl berukuran thumbnail (<= 65KB, mis. WebP preview yang sangat tajam & hemat kuota).
    // Hanya kosongkan jika ukuran dataUrl sangat besar (> 65KB) agar tidak melampaui batas 1 MB Firestore.
    if (t === 'progressNotes') {
      cleanedList = cleanedList.map((item: any) => {
        const safeItem = { ...item }
        if (Array.isArray(safeItem.attachments)) {
          safeItem.attachments = safeItem.attachments.map((att: any) => {
            if (att.dataUrl && att.dataUrl.length > 65000) {
              return { ...att, dataUrl: '' }
            }
            return att
          })
        }
        return safeItem
      })
    }

    if (t === 'penunjang') {
      cleanedList = list.map((item: any) => {
        const safeItem = { ...item }
        if (Array.isArray(safeItem.attachments)) {
          safeItem.attachments = safeItem.attachments.map((att: any) => {
            if (att.dataUrl && att.dataUrl.length > 65000) {
              return { ...att, dataUrl: '' }
            }
            return att
          })
        }
        if (safeItem.dataUrl && safeItem.dataUrl.length > 65000) {
          safeItem.dataUrl = ''
        }
        if (safeItem.foto_url && safeItem.foto_url.length > 65000) {
          safeItem.foto_url = ''
        }
        return safeItem
      })
    }

    if (t === 'poliLogs') {
      cleanedList = list.map((item: any) => {
        const safeItem = { ...item }
        if (Array.isArray(safeItem.foto_urls)) {
          safeItem.foto_urls = safeItem.foto_urls.filter(
            (url: string) => !url.startsWith('data:') || url.length <= 65000
          )
        }
        return safeItem
      })
    }

    // JSON parse/stringify cycle removes any undefined fields safely to prevent Firestore setDoc error
    out[t] = JSON.parse(JSON.stringify(cleanedList))
  }
  return out
}

/**
 * Pemulihan otomatis jika ada lampiran di progressNotes atau penunjang yang dataUrl-nya kosong/hilang
 * dengan mencocokkan nama file ke antrean inbox yang memiliki dataUrl WebP valid.
 */
export async function autoRepairMissingAttachmentMedia(): Promise<number> {
  try {
    const notes = await db.progressNotes.toArray()
    const penunjangList = await db.penunjang.toArray()
    const inboxItems = await db.inboxQueue.toArray()

    const mediaMap = new Map<string, string>()
    for (const item of inboxItems) {
      if (Array.isArray(item.attachments)) {
        for (const att of item.attachments) {
          if (att.dataUrl && att.dataUrl.startsWith('data:image/')) {
            if (att.name) mediaMap.set(att.name, att.dataUrl)
            if (att.url) {
              mediaMap.set(att.url, att.dataUrl)
              const bName = att.url.split('/').pop()?.split('?')[0]
              if (bName) mediaMap.set(bName, att.dataUrl)
            }
            if (att.id) mediaMap.set(att.id, att.dataUrl)
          }
        }
      }
    }

    if (mediaMap.size === 0) return 0
    let repairedCount = 0

    // 1. Periksa progressNotes
    for (const n of notes) {
      if (Array.isArray(n.attachments)) {
        let noteChanged = false
        const newAtts = n.attachments.map((att: any) => {
          const bName = att.name || (att.url ? att.url.split('/').pop()?.split('?')[0] : '')
          if (!att.dataUrl && (mediaMap.has(att.name) || mediaMap.has(bName) || (att.url && mediaMap.has(att.url)))) {
            const restored = mediaMap.get(att.name) || mediaMap.get(bName) || mediaMap.get(att.url)!
            noteChanged = true
            return { ...att, dataUrl: restored }
          }
          return att
        })
        if (noteChanged && n.id != null) {
          await db.progressNotes.update(n.id, { attachments: newAtts })
          repairedCount++
        }
      }
    }

    // 2. Periksa penunjang
    for (const p of penunjangList) {
      if (Array.isArray(p.attachments)) {
        let penChanged = false
        const newAtts = p.attachments.map((att: any) => {
          const bName = att.name || (att.url ? att.url.split('/').pop()?.split('?')[0] : '')
          if (!att.dataUrl && (mediaMap.has(att.name) || mediaMap.has(bName) || (att.url && mediaMap.has(att.url)))) {
            const restored = mediaMap.get(att.name) || mediaMap.get(bName) || mediaMap.get(att.url)!
            penChanged = true
            return { ...att, dataUrl: restored }
          }
          return att
        })
        if (penChanged && p.id != null) {
          await db.penunjang.update(p.id, { attachments: newAtts })
          repairedCount++
        }
      }
    }

    if (repairedCount > 0) {
      console.log(`[AutoRepair] ✓ Berhasil memulihkan ${repairedCount} lampiran media klinis!`)
      cacheNotes(await db.progressNotes.toArray())
      window.dispatchEvent(new CustomEvent('doctoid_data_synced'))
    }
    return repairedCount
  } catch (err) {
    console.warn('AutoRepair attachments error:', err)
    return 0
  }
}

/**
 * Pemulihan otomatis jika ada data lokal (status KRS, progress note)
 * yang sempat tertimpa oleh snapshot lama sebelum perbaikan Two-Way Merge.
 */
export async function autoRecoverPreSyncBackup(): Promise<number> {
  try {
    const raw = sessionStorage.getItem('doctoid_pre_sync_backup') || localStorage.getItem('doctoid_pre_sync_backup')
    // Bersihkan cadangan sementara ini segera agar tidak berulang kali memulihkan snapshot usang pada setiap load/reload
    localStorage.removeItem('doctoid_pre_sync_backup')
    sessionStorage.removeItem('doctoid_pre_sync_backup')

    if (!raw) return 0
    const backup = JSON.parse(raw) as Record<string, any[]>
    if (!backup || typeof backup !== 'object') return 0

    let restoredCount = 0

    // 1. Amankan status KRS jika di data lokal aktif padahal di backup sudah KRS
    if (Array.isArray(backup.patients)) {
      const currentPatients = await db.patients.toArray()
      const currentMap = new Map(currentPatients.map((p) => [p.id, p]))

      for (const bp of backup.patients) {
        if (!bp || bp.id == null) continue
        const cur = currentMap.get(bp.id)

        // JANGAN hidupkan kembali pasien yang tidak ada di DB (!cur) karena mungkin sengaja dihapus.
        // Hanya sinkronkan status KRS jika data lokal saat ini aktif padahal seharusnya KRS:
        if (cur && cur.status_rawat === 'aktif' && bp.status_rawat === 'krs') {
          await db.patients.update(cur.id!, {
            status_rawat: 'krs',
            tgl_krs: bp.tgl_krs || getLocalDateString(),
            keterangan_krs: bp.keterangan_krs,
            detail_krs: bp.detail_krs,
          })
          restoredCount++
          console.log(`[Auto-Recovery] Mengamankan status KRS pasien: ${cur.nama_depan}`)
        }
      }
    }

    if (restoredCount > 0) {
      console.log(`✓ Auto-Recovery: Berhasil mengamankan ${restoredCount} status KRS.`)
      const aktifList = await db.patients.where('status_rawat').equals('aktif').toArray()
      cachePatients(aktifList)
      cacheAllPatients(await db.patients.toArray())
      cacheNotes(await db.progressNotes.toArray())
    }

    return restoredCount
  } catch (err) {
    console.warn('Gagal memulihkan cadangan pra-sinkronisasi:', err)
    return 0
  }
}

/* Two-Way Smart Merge: Menggabungkan data cloud ke database lokal tanpa pernah menghapus data lokal yang belum tersinkron */
export async function safeImportTables(tables: Record<string, unknown[]>): Promise<boolean> {
  if (!tables || typeof tables !== 'object') {
    throw new Error('Data tabel tidak valid untuk diimpor.')
  }

  // Backup data lokal terakhir sebelum penggabungan hanya di sessionStorage (bukan persistent di localStorage)
  try {
    const currentLocal = await exportTables()
    sessionStorage.setItem('doctoid_pre_sync_backup', JSON.stringify(currentLocal))
  } catch {
    // abaikan jika storage penuh
  }

  // Set flag agar Dexie hooks tidak memicu sync looping saat memproses import
  isImporting = true

  try {
    await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
      for (const t of TABLES) {
        if (!Array.isArray(tables[t])) continue
        const remoteList = tables[t] as any[]
        const localItems = await db.table(t).toArray()
        const localMap = new Map(localItems.map((item: any) => [item.id, item]))

        // Lakukan penggabungan cerdas untuk setiap item dari remote
        for (const remoteItem of remoteList) {
          if (!remoteItem || remoteItem.id == null) continue
          const existingLocal = localMap.get(remoteItem.id)

          if (existingLocal) {
            // Khusus tabel pasien: Proteksi absolut status KRS (Terminal State Invariant)
            if (t === 'patients') {
              const isReadmission =
                remoteItem.tgl_mrs &&
                existingLocal.tgl_krs &&
                new Date(remoteItem.tgl_mrs).getTime() > new Date(existingLocal.tgl_krs).getTime()

              if (!isReadmission) {
                // Jika SALAH SATU (lokal atau remote) sudah KRS, pasien TETAP KRS!
                if (existingLocal.status_rawat === 'krs' || remoteItem.status_rawat === 'krs') {
                  remoteItem.status_rawat = 'krs'
                  remoteItem.tgl_krs = remoteItem.tgl_krs || existingLocal.tgl_krs || getLocalDateString()
                  remoteItem.keterangan_krs = remoteItem.keterangan_krs || existingLocal.keterangan_krs
                  remoteItem.detail_krs = remoteItem.detail_krs || existingLocal.detail_krs
                }
              }
            }

            // Khusus progressNotes & penunjang: Jangan hilangkan foto/dataUrl lokal jika remote berukuran kosong
            if (t === 'progressNotes') {
              if (Array.isArray(remoteItem.P)) {
                remoteItem.P = remoteItem.P.filter((p: any) => !isNonTherapyText(p.nama_item))
              }
              if (Array.isArray(remoteItem.attachments) && Array.isArray(existingLocal.attachments)) {
                remoteItem.attachments = remoteItem.attachments.map((rAtt: any, idx: number) => {
                  const lAtt = existingLocal.attachments[idx] || existingLocal.attachments.find((a: any) => a.name === rAtt.name)
                  if (!rAtt.dataUrl && lAtt?.dataUrl) {
                    return { ...rAtt, dataUrl: lAtt.dataUrl }
                  }
                  return rAtt
                })
              }
            }

            if (t === 'penunjang') {
              if (Array.isArray(remoteItem.attachments) && Array.isArray(existingLocal.attachments)) {
                remoteItem.attachments = remoteItem.attachments.map((rAtt: any, idx: number) => {
                  const lAtt = existingLocal.attachments[idx] || existingLocal.attachments.find((a: any) => a.name === rAtt.name || a.id === rAtt.id)
                  if (!rAtt.dataUrl && lAtt?.dataUrl) {
                    return { ...rAtt, dataUrl: lAtt.dataUrl }
                  }
                  return rAtt
                })
              }
              if (!remoteItem.dataUrl && existingLocal.dataUrl) remoteItem.dataUrl = existingLocal.dataUrl
              if (!remoteItem.foto_url && existingLocal.foto_url) remoteItem.foto_url = existingLocal.foto_url
            }

            if (t === 'poliLogs') {
              if (Array.isArray(existingLocal.foto_urls) && (!Array.isArray(remoteItem.foto_urls) || remoteItem.foto_urls.length === 0)) {
                remoteItem.foto_urls = existingLocal.foto_urls
              }
            }

            await db.table(t).put(remoteItem)
          } else {
            // Record baru dari remote yang belum ada di lokal
            if (t === 'progressNotes' && Array.isArray(remoteItem.P)) {
              remoteItem.P = remoteItem.P.filter((p: any) => !isNonTherapyText(p.nama_item))
            }
            await db.table(t).put(remoteItem)
          }
        }
      }
    })

    // Segarkan in-memory appCache agar Dasbor, Rekam Medis, dsb langsung up-to-date
    try {
      const aktifList = await db.patients.where('status_rawat').equals('aktif').toArray()
      aktifList.sort((a, b) => {
        const orderA = a.order ?? Number.MAX_SAFE_INTEGER
        const orderB = b.order ?? Number.MAX_SAFE_INTEGER
        if (orderA !== orderB) return orderA - orderB
        return (a.id ?? 0) - (b.id ?? 0)
      })
      cachePatients(aktifList)
      const allPatientsList = await db.patients.toArray()
      cacheAllPatients(allPatientsList)
      const notesList = await db.progressNotes.toArray()
      cacheNotes(notesList)
    } catch {
      // ignore
    }
  } finally {
    isImporting = false
  }

  // JANGAN memicu triggerCloudSync dari dalam safeImportTables untuk mencegah looping & zombie records

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
   - Jika remote lebih baru atau dari perangkat lain: PULL data & profil dokter, set last_push = remote.updatedAt.
   - Jika lokal lebih baru atau forcePush: PUSH tables & profil dokter terbaru ke cloud. */
export async function syncUserCloud(uid: string, forcePush = false): Promise<string> {
  if (!uid || uid === 'local') return 'idle'
  const auth = getFirebaseAuth()
  if (auth && typeof auth.authStateReady === 'function') {
    await auth.authStateReady()
  }
  if (!auth.currentUser) {
    console.warn('[Sync] Sesi Firebase Auth belum aktif. Sinkronisasi cloud ditunda.')
    return 'idle'
  }
  const { fs, doc, getDoc, setDoc } = await fb()
  const deviceId = getDeviceId()
  const ref = doc(fs, 'users', uid)
  const snap = await getDoc(ref)

  let devices: Record<string, DeviceInfo> = {}
  let arah = 'idle'
  const lastPush = Number(localStorage.getItem('doctoid_last_push') ?? 0)
  const lastImportedRemote = Number(localStorage.getItem('doctoid_last_imported_remote') ?? 0)

  if (snap.exists()) {
    const remote = snap.data() as {
      tables?: Record<string, unknown[]>
      devices?: Record<string, DeviceInfo>
      updatedAt?: number | string
      lastModifiedBy?: string
      displayName?: string
      photoURL?: string
      specialty?: string
      email?: string
    }
    devices = remote.devices ?? {}
    const remoteUpdatedAt = typeof remote.updatedAt === 'number'
      ? remote.updatedAt
      : remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0

    const isFromOtherDevice = !!remote.lastModifiedBy && remote.lastModifiedBy !== deviceId
    const isNewRemoteSnapshot = remoteUpdatedAt > 0 && remoteUpdatedAt !== lastImportedRemote

    // PULL & MERGE DATA jika ada snapshot remote baru, berasal dari perangkat lain, atau remote lebih baru
    if (!forcePush && (isNewRemoteSnapshot || isFromOtherDevice || (remoteUpdatedAt && remoteUpdatedAt > lastPush)) && remote.tables) {
      const imported = await safeImportTables(remote.tables)
      if (imported) {
        localStorage.setItem('doctoid_last_imported_remote', String(remoteUpdatedAt))
        localStorage.setItem('doctoid_last_push', String(remoteUpdatedAt || Date.now()))
        arah = 'pull'
        window.dispatchEvent(new CustomEvent('doctoid_data_synced'))
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

  try {
    await setDoc(
      ref,
      {
        tables,
        devices,
        updatedAt,
        lastModifiedBy: deviceId,
        displayName: currentProfile?.displayName || null,
        photoURL: currentProfile?.photoURL || null,
        specialty: currentProfile?.specialty || getDoctorSpecialty(),
        email: currentProfile?.email || null,
      },
      { merge: true }
    )
    localStorage.setItem('doctoid_last_imported_remote', String(updatedAt))
    localStorage.setItem('doctoid_last_push', String(updatedAt))
    console.log(`[Sync] ✓ Sukses PUSH data ke Firestore Cloud users/${uid}! Waktu: ${new Date(updatedAt).toLocaleTimeString()}`)
  } catch (err: any) {
    console.error(`[Sync] ❌ Gagal PUSH data ke Firestore Cloud:`, err.message || err)
    throw err
  }

  localStorage.setItem('doctoid_last_imported_remote', String(updatedAt))
  localStorage.setItem('doctoid_last_push', String(updatedAt))
  localStorage.setItem('doctoid_devices', JSON.stringify(devices))
  return 'push'
}

/**
 * Paksa kirim seluruh database lokal saat ini ke Firestore Cloud
 */
export async function forcePushCloud(uid: string): Promise<string> {
  const auth = getFirebaseAuth()
  if (auth && typeof auth.authStateReady === 'function') {
    await auth.authStateReady()
  }
  if (!auth.currentUser) {
    throw new Error('Sesi autentikasi Google belum aktif di browser ini. Silakan klik "Masuk dengan Google" di kartu atas.')
  }
  const res = await syncUserCloud(uid, true)
  window.dispatchEvent(new CustomEvent('doctoid_data_synced'))
  return res
}

/**
 * Paksa tarik seluruh database dari Firestore Cloud dan terapkan ke perangkat ini
 */
export async function forcePullCloud(uid: string): Promise<{ success: boolean; count: number; message: string }> {
  if (!uid || uid === 'local') return { success: false, count: 0, message: 'Belum login akun Google.' }
  const auth = getFirebaseAuth()
  if (auth && typeof auth.authStateReady === 'function') {
    await auth.authStateReady()
  }
  if (!auth.currentUser) {
    return { success: false, count: 0, message: 'Sesi autentikasi Google belum aktif di browser ini. Silakan klik "Masuk dengan Google" di kartu atas.' }
  }
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
    localStorage.setItem('doctoid_last_imported_remote', String(updatedAt))
    localStorage.setItem('doctoid_last_push', String(updatedAt))
    window.dispatchEvent(new CustomEvent('doctoid_data_synced'))
    
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
