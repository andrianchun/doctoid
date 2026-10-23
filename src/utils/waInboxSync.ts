import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { db } from '../db'
import { triggerCloudSync } from '../sync'

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
    fetch(`${gatewayUrl}/api/inbox/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idOrCreatedAt }),
    }).catch(() => {})
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
    fetch(`${gatewayUrl}/api/inbox/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idOrCreatedAt }),
    }).catch(() => {})
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
    fetch(`${gatewayUrl}/api/inbox/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }).catch(() => {})
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
  const patientName = item.parsed_data?.nama_depan || item.sender_name || 'Konsul Pasien Baru'
  const rawAge = item.parsed_data?.usia || ''
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
      const fRes = await fetch(firestoreUrl, { signal: AbortSignal.timeout(2000) })
      if (!fRes.ok) throw new Error('Firestore failed')
      const fData = await fRes.json()
      const vals = fData.fields?.items?.arrayValue?.values || []
      return vals.map((v: any) => fromFirestoreMap(v.mapValue?.fields || {}))
    }

    const fetchGateway = async (): Promise<any[]> => {
      const gRes = await fetch(`${gatewayUrl}/api/inbox?t=${Date.now()}`, { signal: AbortSignal.timeout(3500) })
      if (!gRes.ok) throw new Error('Gateway failed')
      return await gRes.json()
    }

    try {
      items = await Promise.any([fetchFirestore(), fetchGateway()])
      serverResponded = true
    } catch {
      try {
        const res = await fetch(`https://docto-id.web.app/wa-inbox.json?t=${Date.now()}`, { signal: AbortSignal.timeout(1500) })
        if (res.ok) {
          items = await res.json()
          serverResponded = true
        }
      } catch {}
    }

    if (!serverResponded || !Array.isArray(items)) return

    // Sinkronisasi status: Jika item aktif di server sudah berkurang/dibersihkan,
    // maka item lokal yang pending namun sudah tidak ada di server otomatis di-dismiss
    const activeServerKeys = new Set<string>()
    items.forEach((it) => {
      if (it.id) activeServerKeys.add(String(it.id))
      if (it.created_at) activeServerKeys.add(String(it.created_at))
    })

    const localPending = await db.inboxQueue.where('status').equals('pending').toArray()
    for (const loc of localPending) {
      const locKey1 = String(loc.id || '')
      const locKey2 = String(loc.created_at || '')
      if (!activeServerKeys.has(locKey1) && !activeServerKeys.has(locKey2)) {
        // HANYA hapus otomatis jika item sudah berumur > 48 jam di server,
        // jangan hapus item baru yang mungkin belum selesai sinkron atau sedang ditinjau dokter!
        const ageHours = (Date.now() - new Date(loc.created_at).getTime()) / (1000 * 60 * 60)
        if (ageHours > 48) {
          await db.inboxQueue.update(loc.id!, { status: 'dismissed' })
        }
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
          status: 'pending',
          created_at: item.created_at || new Date().toISOString(),
        })

        // Picu notifikasi di Notification Bar HP
        sendLocalNotification(item)
      } else if (existing.status === 'pending') {
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
