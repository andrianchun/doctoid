import { useEffect } from 'react'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { db } from '../db'
import { triggerCloudSync, autoRepairMissingAttachmentMedia } from '../sync'
import { extractDemografi } from '../parser'

async function fetchHttpJson(url: string, timeoutMs = 10000): Promise<any> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.get({
        url,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      })
      if (res.status >= 200 && res.status < 300) {
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
      }
      throw new Error(`CapacitorHttp returned ${res.status}`)
    } catch (nativeErr) {
      console.warn('[waInboxSync] Native CapacitorHttp get failed, falling back to fetch:', nativeErr)
    }
  }

  const fRes = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!fRes.ok) throw new Error(`Fetch error: ${fRes.status}`)
  return await fRes.json()
}

let notifPermissionRequested = false
let pushInitialized = false

// Inisialisasi Channel Notifikasi Android (High Priority agar muncul pop-up heads-up)
export async function setupNotificationChannel() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.createChannel({
        id: 'wa_inbox_channel',
        name: 'Konsultasi WhatsApp',
        description: 'Notifikasi konsulan pasien baru dari WhatsApp',
        importance: 5, // High / Heads-up
        visibility: 1,
        sound: 'default',
        vibration: true,
      })
    } catch (e) {
      console.warn('Failed to create notification channel:', e)
    }
  }
}

// Inisialisasi Real-time Firebase Cloud Messaging (Push Notifications)
/**
 * Alihkan navigasi ke tab Catat Pasien (/brainstorm) dan buka modal Inbox WhatsApp
 * Aman dipanggil dari PushNotification, LocalNotification, maupun PWA Notification onClick.
 */
export function openWaInboxInApp() {
  try {
    localStorage.setItem('doctoid_auto_open_inbox', 'true')
    sessionStorage.setItem('doctoid_auto_open_inbox', 'true')

    // Sinkronisasi data lokal seketika
    syncWaInboxToDexie()

    // 1. Beri tahu Layout agar navigate('/brainstorm')
    window.dispatchEvent(new CustomEvent('doctoid_nav_inbox'))

    // 2. Direct browser navigation fallback jika Layout belum mendengarkan
    if (window.location.pathname !== '/brainstorm') {
      window.history.pushState({}, '', '/brainstorm')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }

    // 3. Picu buka modal seketika dan dengan jeda bertingkat
    window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox'))
    setTimeout(() => window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox')), 100)
    setTimeout(() => window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox')), 300)
    setTimeout(() => window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox')), 600)
    setTimeout(() => window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox')), 1000)
  } catch {}
}

export async function setupPushNotifications() {
  if (!Capacitor.isNativePlatform()) return

  try {
    if (!pushInitialized) {
      pushInitialized = true

      PushNotifications.addListener('registration', async (token) => {
        console.log('📱 FCM Device Token terdaftar:', token.value)
        await registerFcmTokenToServer(token.value)
      })

      PushNotifications.addListener('registrationError', (error) => {
        console.warn('⚠️ FCM Registration Error:', error)
      })

      PushNotifications.addListener('pushNotificationReceived', async (notification) => {
        console.log('📩 Push notification masuk saat app terbuka:', notification)
        const d = notification?.data
        if (d?.inboxId && d?.body) {
          const numId = Number(d.inboxId) || Date.now()
          const exists = await db.inboxQueue.get(numId)
          if (!exists) {
            await db.inboxQueue.put({
              id: numId,
              source: 'whatsapp',
              sender_name: d.title || 'Konsulan WhatsApp',
              sender_phone: '',
              raw_text: d.body,
              status: 'pending',
              created_at: new Date().toISOString(),
            })
          }
        }
        syncWaInboxToDexie()
      })

      PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
        console.log('👆 Push notification ditekan di status bar / lockscreen:', notification)
        const d = notification?.notification?.data
        if (d?.inboxId && d?.body) {
          const numId = Number(d.inboxId) || Date.now()
          const exists = await db.inboxQueue.get(numId)
          if (!exists) {
            await db.inboxQueue.put({
              id: numId,
              source: 'whatsapp',
              sender_name: d.title || 'Konsulan WhatsApp',
              sender_phone: '',
              raw_text: d.body,
              status: 'pending',
              created_at: new Date().toISOString(),
            })
          }
        }
        openWaInboxInApp()
        syncWaInboxToDexie()
        await clearAllDeliveredNotifications()
      })
    }

    await PushNotifications.createChannel({
      id: 'wa_inbox_channel',
      name: 'Konsultasi WhatsApp',
      description: 'Notifikasi konsulan pasien baru dari WhatsApp',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
    })

    let perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions()
    }

    if (perm.receive === 'granted') {
      await PushNotifications.register()
    }

    // Jika sudah ada token tersimpan di cache lokal HP, pastikan tersinkron ke Firestore
    const cachedToken = localStorage.getItem('doctoid_fcm_token')
    if (cachedToken) {
      registerFcmTokenToServer(cachedToken).catch(() => {})
    }
  } catch (err) {
    console.warn('setupPushNotifications error:', err)
  }
}

export async function registerFcmTokenToServer(token: string) {
  if (!token) return

  try {
    localStorage.setItem('doctoid_fcm_token', token)
  } catch {}

  // 1. Kirim langsung ke Gateway VM Port 3001
  try {
    const gatewayUrl = localStorage.getItem('doctoid_wa_gateway_url') || 'http://35.255.95.161:3001'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    await fetch(`${gatewayUrl}/api/register-fcm-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, registered_at: new Date().toISOString() }),
      signal: controller.signal,
    })
    clearTimeout(timer)
  } catch {}

  // 2. Simpan juga ke Cloud Firestore doctoid/fcm_tokens (Port 443 HTTPS, selalu tembus seluler)
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/fcm_tokens`
    let existingTokens: string[] = []
    const getRes = await fetch(`${firestoreUrl}?t=${Date.now()}`)
    if (getRes.ok) {
      const gData = await getRes.json()
      const vals = gData.fields?.tokens?.arrayValue?.values || []
      existingTokens = vals.map((v: any) => v.stringValue).filter(Boolean)
    }

    if (!existingTokens.includes(token)) {
      existingTokens.push(token)
      if (existingTokens.length > 25) existingTokens = existingTokens.slice(-25)

      const payload = {
        fields: {
          tokens: {
            arrayValue: {
              values: existingTokens.map((t) => ({ stringValue: t })),
            },
          },
          updatedAt: {
            integerValue: String(Date.now()),
          },
        },
      }

      await fetch(firestoreUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
  } catch {}
}

// Hitung ID integer konsisten (deterministik) untuk notifikasi agar dapat dibatalkan spesifik per item
export function getNotificationIdForItem(item: any): number {
  const str = String(item?.id || item?.timestamp || item?.created_at || 'inbox')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 2147483647
}

// Bersihkan notifikasi konsulan dari tray status bar HP Android
export async function clearDeliveredNotifications(itemId?: number | string) {
  if (!Capacitor.isNativePlatform()) return

  try {
    if (itemId !== undefined) {
      const id = typeof itemId === 'number' && itemId < 2147483647 ? itemId : getNotificationIdForItem({ id: itemId })
      await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {})
      const delivered = await LocalNotifications.getDeliveredNotifications().catch(() => ({ notifications: [] }))
      const matching = (delivered.notifications || []).filter((n) => n.id === id)
      if (matching.length > 0) {
        await LocalNotifications.removeDeliveredNotifications({
          notifications: matching,
        }).catch(() => {})
      }
    }
  } catch {}

  try {
    const pendingCount = await db.inboxQueue.where('status').equals('pending').count()
    if (pendingCount <= 1) {
      await LocalNotifications.removeAllDeliveredNotifications().catch(() => {})
      await PushNotifications.removeAllDeliveredNotifications().catch(() => {})
    }
  } catch {
    await LocalNotifications.removeAllDeliveredNotifications().catch(() => {})
    await PushNotifications.removeAllDeliveredNotifications().catch(() => {})
  }
}

// Bersihkan seluruh notifikasi konsulan WhatsApp dari status bar
export async function clearAllDeliveredNotifications() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.removeAllDeliveredNotifications().catch(() => {})
  } catch {}
  try {
    await PushNotifications.removeAllDeliveredNotifications().catch(() => {})
  } catch {}
}

/**
 * Abaikan satu item konsulan WA dan sinkronkan ke server & cloud
 */
export async function dismissInboxItem(idOrCreatedAt: number | string) {
  try {
    const query = db.inboxQueue.filter(
      (q) => String(q.id) === String(idOrCreatedAt) || q.created_at === String(idOrCreatedAt)
    )
    const match = await query.first()
    if (match && match.id) {
      await db.inboxQueue.update(match.id, { status: 'dismissed' })
    }
  } catch {}

  clearDeliveredNotifications(idOrCreatedAt)
  triggerCloudSync(100)

  // 1. Hubungi Gateway VM (Port 3001)
  try {
    const gatewayUrl = localStorage.getItem('doctoid_wa_gateway_url') || 'http://35.255.95.161:3001'
    if (Capacitor.isNativePlatform()) {
      CapacitorHttp.post({
        url: `${gatewayUrl}/api/inbox/dismiss`,
        headers: { 'Content-Type': 'application/json' },
        data: { id: idOrCreatedAt },
      }).catch(() => {})
    } else {
      fetch(`${gatewayUrl}/api/inbox/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idOrCreatedAt }),
      }).catch(() => {})
    }
  } catch {}

  // 2. Hubungi Firestore doctoid/inbox_${USER_UID}
  try {
    const USER_UID = 'fOGcJmF0vGR5EKzlN2l9ZR7WPZu1'
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/inbox_${USER_UID}`
    const fRes = await fetch(firestoreUrl)
    if (fRes.ok) {
      const fData = await fRes.json()
      const vals = fData.fields?.items?.arrayValue?.values || []
      const filtered = vals.filter((v: any) => {
        const item = fromFirestoreMap(v.mapValue?.fields || {})
        return String(item.id) !== String(idOrCreatedAt) && item.created_at !== String(idOrCreatedAt)
      })
      await fetch(firestoreUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            items: { arrayValue: { values: filtered } },
            updatedAt: { integerValue: String(Date.now()) },
          },
        }),
      }).catch(() => {})
    }
  } catch {}
}

/**
 * Tandai satu item konsulan WA sebagai 'imported' (sudah dicatat ke rekam medis) dan hapus dari antrean server
 */
export async function markInboxItemImported(idOrCreatedAt: number | string) {
  try {
    const query = db.inboxQueue.filter(
      (q) => String(q.id) === String(idOrCreatedAt) || q.created_at === String(idOrCreatedAt)
    )
    const match = await query.first()
    if (match && match.id) {
      await db.inboxQueue.update(match.id, { status: 'imported' })
    }
  } catch {}

  clearDeliveredNotifications(idOrCreatedAt)
  triggerCloudSync(100)

  // Hapus dari antrean server gateway agar tidak muncul di device lain
  try {
    const gatewayUrl = localStorage.getItem('doctoid_wa_gateway_url') || 'http://35.255.95.161:3001'
    if (Capacitor.isNativePlatform()) {
      CapacitorHttp.post({
        url: `${gatewayUrl}/api/inbox/dismiss`,
        headers: { 'Content-Type': 'application/json' },
        data: { id: idOrCreatedAt },
      }).catch(() => {})
    } else {
      fetch(`${gatewayUrl}/api/inbox/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idOrCreatedAt }),
      }).catch(() => {})
    }
  } catch {}

  try {
    const USER_UID = 'fOGcJmF0vGR5EKzlN2l9ZR7WPZu1'
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/inbox_${USER_UID}`
    const fRes = await fetch(firestoreUrl)
    if (fRes.ok) {
      const fData = await fRes.json()
      const vals = fData.fields?.items?.arrayValue?.values || []
      const filtered = vals.filter((v: any) => {
        const item = fromFirestoreMap(v.mapValue?.fields || {})
        return String(item.id) !== String(idOrCreatedAt) && item.created_at !== String(idOrCreatedAt)
      })
      await fetch(firestoreUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            items: { arrayValue: { values: filtered } },
            updatedAt: { integerValue: String(Date.now()) },
          },
        }),
      }).catch(() => {})
    }
  } catch {}
}

/**
 * Bersihkan seluruh antrean konsulan WA (Abaikan Semua) baik lokal maupun cloud server
 */
export async function dismissAllInboxItems() {
  try {
    await db.inboxQueue.where('status').equals('pending').modify({ status: 'dismissed' })
  } catch {}

  clearAllDeliveredNotifications()
  triggerCloudSync(100)

  // 1. Hubungi Gateway VM
  try {
    const gatewayUrl = localStorage.getItem('doctoid_wa_gateway_url') || 'http://35.255.95.161:3001'
    if (Capacitor.isNativePlatform()) {
      CapacitorHttp.post({
        url: `${gatewayUrl}/api/inbox/clear`,
        headers: { 'Content-Type': 'application/json' },
        data: { all: true },
      }).catch(() => {})
    } else {
      fetch(`${gatewayUrl}/api/inbox/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      }).catch(() => {})
    }
  } catch {}

  // 2. Kosongkan Firestore doctoid/inbox_${USER_UID}
  try {
    const USER_UID = 'fOGcJmF0vGR5EKzlN2l9ZR7WPZu1'
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/inbox_${USER_UID}`
    await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          items: { arrayValue: { values: [] } },
          updatedAt: { integerValue: String(Date.now()) },
        },
      }),
    }).catch(() => {})
  } catch {}
}

// Daftarkan listener klik notifikasi agar saat notifikasi di status bar ditekan, langsung membuka modal inbox
if (typeof window !== 'undefined') {
  try {
    if (Capacitor.isNativePlatform()) {
      setupNotificationChannel()
      setupPushNotifications()

      LocalNotifications.addListener('localNotificationActionPerformed', async (notification) => {
        openWaInboxInApp()
        syncWaInboxToDexie()
        if (notification.notification) {
          await LocalNotifications.removeDeliveredNotifications({
            notifications: [notification.notification],
          }).catch(() => {})
        }
        await clearDeliveredNotifications()
      })
    }
  } catch {}
}

export async function sendLocalNotification(item: any) {
  let patientName = item.parsed_data?.nama_depan || ''
  let rawAge = item.parsed_data?.usia || ''

  if (!patientName || /atas nama|igd/i.test(patientName)) {
    const demo = extractDemografi(item.raw_text || '')
    if (demo.nama_depan) {
      patientName = `${demo.title ? demo.title + ' ' : ''}${demo.nama_depan}`.trim()
      if (demo.usia && !rawAge) rawAge = demo.usia
    }
  } else if (item.parsed_data?.title) {
    patientName = `${item.parsed_data.title} ${patientName}`.trim()
  }

  if (!patientName) patientName = item.sender_name || 'Konsul Pasien Baru'
  const formattedAge = rawAge ? ` (${rawAge.replace(/\s*tahun/i, ' th').trim()})` : ''
  const title = `${patientName}${formattedAge}`.trim()
  const snippet = item.raw_text
    ? item.raw_text.replace(/\n+/g, ' ').slice(0, 120)
    : 'Pesan konsulan baru masuk dari WhatsApp.'

  // 1. Android Native Local Notifications
  try {
    if (Capacitor.isNativePlatform()) {
      // Jika push notifications (FCM) sudah aktif/terdaftar pada HP dokter,
      // FCM cloud push sudah otomatis menembakkan notifikasi status bar.
      // Hindari memicu LocalNotification agar tidak muncul 2 kartu notifikasi kembar (double) di tray HP.
      const hasFcmToken = Boolean(localStorage.getItem('doctoid_fcm_token'))
      if (hasFcmToken) {
        return
      }

      if (!notifPermissionRequested) {
        notifPermissionRequested = true
        const check = await LocalNotifications.checkPermissions()
        if (check.display !== 'granted') {
          await LocalNotifications.requestPermissions()
        }
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: getNotificationIdForItem(item),
            title: title,
            body: snippet,
            channelId: 'wa_inbox_channel',
            sound: 'default',
            smallIcon: 'ic_stat_doctoid',
            iconColor: '#0D9488',
            extra: {
              inboxId: item.id,
            },
          },
        ],
      })
      return
    }
  } catch (err) {
    console.warn('Native notification error:', err)
  }

  // 2. Web / PWA Notification Fallback
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        const notif = new Notification(title, {
          body: snippet,
          icon: '/favicon.ico',
        })
        notif.onclick = () => {
          window.focus()
          openWaInboxInApp()
        }
      } else if (Notification.permission !== 'denied' && !notifPermissionRequested) {
        notifPermissionRequested = true
        Notification.requestPermission()
      }
    }
  } catch {}
}

function fromFirestoreMap(fields: Record<string, any>): any {
  const result: any = {}
  for (const [key, val] of Object.entries(fields)) {
    if ('stringValue' in val) result[key] = val.stringValue
    else if ('integerValue' in val) result[key] = Number(val.integerValue)
    else if ('doubleValue' in val) result[key] = val.doubleValue
    else if ('booleanValue' in val) result[key] = val.booleanValue
    else if ('arrayValue' in val) {
      result[key] = (val.arrayValue.values || []).map((v: any) =>
        v.mapValue ? fromFirestoreMap(v.mapValue.fields || {}) : (v.stringValue ?? v.integerValue)
      )
    } else if ('mapValue' in val) {
      result[key] = fromFirestoreMap(val.mapValue.fields || {})
    }
  }
  return result
}

export async function syncWaInboxToDexie() {
  try {
    let items: any[] = []
    let serverResponded = false

    // Rute Cepat Paralel: Coba Firestore HTTPS (Port 443) & Gateway VM secara simultan
    // Siapa yang pertama selesai (<200ms) langsung dipakai tanpa jeda tunggu timeout!
    const USER_UID = 'fOGcJmF0vGR5EKzlN2l9ZR7WPZu1'
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/inbox_${USER_UID}?t=${Date.now()}`
    const gatewayUrl = localStorage.getItem('doctoid_wa_gateway_url') || 'http://35.255.95.161:3001'

    const fetchFirestore = async (): Promise<any[]> => {
      const fData = await fetchHttpJson(firestoreUrl, 8000)
      const vals = fData?.fields?.items?.arrayValue?.values || []
      return vals.map((v: any) => fromFirestoreMap(v.mapValue?.fields || {}))
    }

    const fetchGateway = async (): Promise<any[]> => {
      const gData = await fetchHttpJson(`${gatewayUrl}/api/inbox?t=${Date.now()}`, 8000)
      if (!Array.isArray(gData)) throw new Error('Gateway response not array')
      return gData
    }

    try {
      items = await Promise.any([fetchFirestore(), fetchGateway()])
      serverResponded = true
    } catch {
      try {
        items = await fetchFirestore()
        serverResponded = true
      } catch {
        try {
          items = await fetchGateway()
          serverResponded = true
        } catch {}
      }
    }

    if (!serverResponded || !Array.isArray(items)) return

    // Sinkronisasi status: Jika item aktif di server sudah berkurang/dibersihkan,
    // maka item lokal yang pending namun sudah tidak ada di server otomatis di-dismiss
    const activeServerKeys = new Set<string>()
    items.forEach((it) => {
      if (it.id) activeServerKeys.add(String(it.id))
      if (it.created_at) activeServerKeys.add(String(it.created_at))
    })

    const allPatients = await db.patients.toArray()
    const cleanCore = (str?: string) =>
      (str || '')
        .toLowerCase()
        .replace(/^(?:dr|dok|dokter|tn|ny|sdri|sdr|an|by)\.?\s+/i, '')
        .replace(/[^a-z0-9]/g, '')
        .trim()

    const isPatientAlreadyAdmitted = (it: any): boolean => {
      const pName = cleanCore(it.parsed_data?.nama_depan)
      const pRm = (it.parsed_data?.no_rm || '').trim()
      if (!pName && !pRm) return false

      return allPatients.some((p) => {
        if (pRm && p.no_rm && p.no_rm.trim() === pRm) return true
        const curName = cleanCore(p.nama_depan)
        if (curName && pName) {
          if (curName === pName) return true
          if (curName.length >= 4 && pName.length >= 4) {
            if (curName.includes(pName) || pName.includes(curName)) return true
          }
        }
        return false
      })
    }

    const localPending = await db.inboxQueue.where('status').equals('pending').toArray()
    for (const loc of localPending) {
      // 1. Jika pasien sudah tercatat di db.patients, otomatis tandai 'imported'
      if (isPatientAlreadyAdmitted(loc)) {
        await db.inboxQueue.update(loc.id!, { status: 'imported' })
        continue
      }

      // 2. Jika item sudah tidak ada di antrean server aktif (berarti sudah di-dismiss di HP lain/server)
      const locKey1 = String(loc.id || '')
      const locKey2 = String(loc.created_at || '')
      if (!activeServerKeys.has(locKey1) && !activeServerKeys.has(locKey2)) {
        await db.inboxQueue.update(loc.id!, { status: 'dismissed' })
      }
    }

    if (items.length === 0) return

    for (const item of items) {
      if (!item.raw_text && (!item.attachments || item.attachments.length === 0)) continue

      // Cek apakah item sudah pernah tercatat di inboxQueue lokal berdasarkan ID / timestamp unik
      const existing = await db.inboxQueue
        .filter((q) => {
          const idMatch = Boolean(item.id && q.id && String(q.id) === String(item.id))
          const timeMatch = Boolean(item.created_at && q.created_at && q.created_at === item.created_at)
          return idMatch || timeMatch
        })
        .first()

      const isAdmitted = isPatientAlreadyAdmitted(item)

      if (!existing) {
        const numericId = typeof item.id === 'number' ? item.id : Number(item.id) || undefined
        await db.inboxQueue.put({
          ...(numericId ? { id: numericId } : {}),
          source: 'whatsapp',
          sender_name: item.sender_name || 'Konsulan WhatsApp',
          sender_phone: item.sender_phone || '',
          raw_text: item.raw_text || '',
          parsed_data: item.parsed_data || undefined,
          attachments: item.attachments || [],
          status: isAdmitted ? 'imported' : 'pending',
          created_at: item.created_at || new Date().toISOString(),
        })

        // Picu notifikasi di Notification Bar HP hanya jika pasien belum masuk rawat inap
        if (!isAdmitted) {
          sendLocalNotification(item)
        }
      } else if (existing.status === 'pending') {
        if (isAdmitted || isPatientAlreadyAdmitted(existing)) {
          await db.inboxQueue.update(existing.id!, { status: 'imported' })
          continue
        }
        // Jika item masih pending dan ada pembaruan teks atau data lampiran yang lebih lengkap / valid
        const newAttachCount = item.attachments?.length || 0
        const oldAttachCount = existing.attachments?.length || 0
        const textChanged = Boolean(item.raw_text && item.raw_text !== existing.raw_text)
        const existingDataLen = (existing.attachments?.[0]?.dataUrl || '').length
        const incomingDataLen = (item.attachments?.[0]?.dataUrl || '').length
        const incomingHasUrls = (item.attachments || []).some((a: any) => Boolean(a.url))
        const existingHasUrls = (existing.attachments || []).some((a: any) => Boolean(a.url))
        const attachUpdated = newAttachCount !== oldAttachCount || (incomingDataLen > existingDataLen) || (incomingHasUrls && !existingHasUrls)

        if (attachUpdated || textChanged) {
          let resolvedAttachments = item.attachments || existing.attachments
          // Jika server membawa URL Full-HD WebP/WebM, gabungkan dengan preview lokal agar instan & jernih
          if (incomingHasUrls && existing.attachments && existing.attachments.length > 0) {
            resolvedAttachments = (item.attachments || []).map((newAtt: any, idx: number) => {
              const oldAtt = existing.attachments?.[idx]
              return {
                ...newAtt,
                dataUrl: newAtt.dataUrl || oldAtt?.dataUrl || '',
                url: newAtt.url || oldAtt?.url || '',
              }
            })
          }

          await db.inboxQueue.update(existing.id!, {
            raw_text: item.raw_text || existing.raw_text,
            attachments: resolvedAttachments,
            parsed_data: item.parsed_data || existing.parsed_data,
            created_at: item.created_at || existing.created_at,
          })
        }
      }
    }
    // Periksa dan pulihkan secara otomatis jika ada catatan/penunjang yang lampirannya kehilangan dataUrl
    await autoRepairMissingAttachmentMedia().catch(() => {})
  } catch (err) {
    // Silent catch agar tidak mengganggu UI dokter
  }
}

export function useWaInboxSync(intervalMs = 2500) {
  useEffect(() => {
    let isCancelled = false

    // Minta izin notifikasi sejak dini agar konsulan berikutnya tidak terhambat popup sistem
    if (Capacitor.isNativePlatform()) {
      setupNotificationChannel()
      setupPushNotifications()
      LocalNotifications.checkPermissions()
        .then((status) => {
          if (status.display !== 'granted') {
            LocalNotifications.requestPermissions()
          }
        })
        .catch(() => {})
    }

    const run = async () => {
      if (isCancelled) return
      await syncWaInboxToDexie()
    }

    run()
    const timer = setInterval(run, intervalMs)

    return () => {
      isCancelled = true
      clearInterval(timer)
    }
  }, [intervalMs])
}
