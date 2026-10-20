import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { db } from '../db'

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

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('📩 Push notification masuk saat app terbuka:', notification)
        syncWaInboxToDexie()
      })

      PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
        console.log('👆 Push notification ditekan di status bar / lockscreen:', notification)
        window.location.hash = '#/catat'
        syncWaInboxToDexie()
        window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox'))
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

// Daftarkan listener klik notifikasi agar saat notifikasi di status bar ditekan, langsung membuka modal inbox
if (typeof window !== 'undefined') {
  try {
    if (Capacitor.isNativePlatform()) {
      setupNotificationChannel()
      setupPushNotifications()

      LocalNotifications.addListener('localNotificationActionPerformed', async (notification) => {
        window.location.hash = '#/catat'
        window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox'))
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
  const age = item.parsed_data?.usia ? ` (${item.parsed_data.usia})` : ''
  const snippet = item.raw_text
    ? item.raw_text.replace(/\n+/g, ' ').slice(0, 120)
    : 'Pesan konsulan baru masuk dari WhatsApp.'

  // 1. Android Native Local Notifications
  try {
    if (Capacitor.isNativePlatform()) {
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
            title: `Konsul WhatsApp: ${patientName}${age}`,
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
        const notif = new Notification(`Konsul WhatsApp: ${patientName}${age}`, {
          body: snippet,
          icon: '/favicon.ico',
        })
        notif.onclick = () => {
          window.focus()
          window.location.hash = '#/catat'
          window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox'))
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

    // 1. Coba hubungi Gateway VM langsung (Port 3001) dengan timeout 3.5s
    try {
      const gatewayUrl =
        localStorage.getItem('doctoid_wa_gateway_url') || 'http://35.255.95.161:3001'

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3500)
      const res = await fetch(`${gatewayUrl}/api/inbox?t=${Date.now()}`, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) items = await res.json()
    } catch {}

    // 2. Fallback: Cloud Firestore REST API langsung (Port 443 HTTPS, selalu tembus operator seluler & PWA)
    if (!items || items.length === 0) {
      try {
        const USER_UID = 'fOGcJmF0vGR5EKzlN2l9ZR7WPZu1'
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/inbox_${USER_UID}?t=${Date.now()}`
        const fRes = await fetch(firestoreUrl)
        if (fRes.ok) {
          const fData = await fRes.json()
          const vals = fData.fields?.items?.arrayValue?.values || []
          items = vals.map((v: any) => fromFirestoreMap(v.mapValue?.fields || {}))
        }
      } catch {}
    }

    // 3. Fallback: File JSON cloud dari Firebase Hosting
    if (!items || items.length === 0) {
      try {
        const res = await fetch(`https://docto-id.web.app/wa-inbox.json?t=${Date.now()}`)
        if (res.ok) items = await res.json()
      } catch {
        try {
          const res = await fetch(`/wa-inbox.json?t=${Date.now()}`)
          if (res.ok) items = await res.json()
        } catch {}
      }
    }

    if (!Array.isArray(items) || items.length === 0) return

    for (const item of items) {
      if (!item.raw_text && (!item.attachments || item.attachments.length === 0)) continue

      // Cek apakah item sudah pernah tercatat di inboxQueue lokal berdasarkan ID / timestamp unik
      const existing = await db.inboxQueue
        .filter(
          (q) =>
            Boolean(item.created_at && q.created_at === item.created_at) ||
            Boolean(item.id && q.id === item.id)
        )
        .first()

      if (!existing) {
        await db.inboxQueue.add({
          id: typeof item.id === 'number' ? item.id : undefined,
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
        const attachUpdated = newAttachCount !== oldAttachCount || (incomingDataLen > existingDataLen)

        if (newAttachCount > 0 && (attachUpdated || textChanged)) {
          await db.inboxQueue.update(existing.id!, {
            raw_text: item.raw_text || existing.raw_text,
            attachments: item.attachments || existing.attachments,
            parsed_data: item.parsed_data || existing.parsed_data,
          })
        }
      }
    }
  } catch (err) {
    // Silent catch agar tidak mengganggu UI dokter
  }
}

export function useWaInboxSync(intervalMs = 4000) {
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
