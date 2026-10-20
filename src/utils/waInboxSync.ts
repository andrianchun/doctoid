import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../db'

let notifPermissionRequested = false

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

// Daftarkan listener klik notifikasi agar saat notifikasi di status bar ditekan, langsung membuka modal inbox
if (typeof window !== 'undefined') {
  try {
    if (Capacitor.isNativePlatform()) {
      setupNotificationChannel()
      LocalNotifications.addListener('localNotificationActionPerformed', () => {
        window.location.hash = '#/catat'
        window.dispatchEvent(new CustomEvent('doctoid_open_wa_inbox'))
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
            id: Math.floor(Math.random() * 2147483647),
            title: `Konsul WhatsApp: ${patientName}${age}`,
            body: snippet,
            channelId: 'wa_inbox_channel',
            sound: 'default',
            smallIcon: 'ic_launcher_round',
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

export async function syncWaInboxToDexie() {
  try {
    let items: any[] = []
    try {
      const gatewayUrl =
        localStorage.getItem('doctoid_wa_gateway_url') || 'http://35.255.95.161:3001'

      // Timeout 1.8 detik: jika di luar Wi-Fi laptop, segera beralih ke fallback tanpa lag
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1800)
      const res = await fetch(`${gatewayUrl}/api/inbox?t=${Date.now()}`, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) items = await res.json()
    } catch {
      // Fallback ke file JSON cloud jika di luar jangkauan Wi-Fi lokal
      try {
        const res = await fetch(`https://docto-id.web.app/wa-inbox.json?t=${Date.now()}`)
        if (res.ok) items = await res.json()
      } catch {
        try {
          const res = await fetch(`/wa-inbox.json?t=${Date.now()}`)
          if (res.ok) items = await res.json()
        } catch {
          // ignore
        }
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
        // Jika item masih pending dan ada penambahan teks/lampiran dari pengelompokan gateway
        const newAttachCount = item.attachments?.length || 0
        const oldAttachCount = existing.attachments?.length || 0
        const textChanged = Boolean(item.raw_text && item.raw_text !== existing.raw_text)
        if (newAttachCount > oldAttachCount || textChanged) {
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
