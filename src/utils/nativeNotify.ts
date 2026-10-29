import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

let channelCreated = false

/**
 * Memicu notifikasi lokal ke status bar Android (Heads-up pop-up) dan Web Notification
 * ketika proses background parser SIMRS / WA selesai.
 */
export async function notifyParserFinished(
  patientName: string,
  detail: string = 'Data siap diterapkan ke rekam medis'
) {
  const title = 'SIMRS / WA Selesai Diparsing'
  const body = `Data ${patientName}: ${detail}`

  // 1. Android Status Bar (Native Local Notification)
  if (Capacitor.isNativePlatform()) {
    try {
      if (!channelCreated) {
        await LocalNotifications.createChannel({
          id: 'ai_parser_channel',
          name: 'Proses AI SIMRS & Konsul',
          description: 'Notifikasi saat analisis AI foto SIMRS atau pesan selesai diproses',
          importance: 5, // Priority tinggi: muncul sebagai pop-up heads-up di layar
          visibility: 1,
          sound: 'default',
          vibration: true,
        }).catch(() => {})
        channelCreated = true
      }

      const perm = await LocalNotifications.checkPermissions().catch(() => ({ display: 'prompt' as const }))
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions().catch(() => {})
      }

      const notifId = Math.floor(Math.random() * 899999) + 100000
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title,
            body,
            channelId: 'ai_parser_channel',
            sound: 'default',
            smallIcon: 'ic_stat_doctoid',
            iconColor: '#0D9488',
          },
        ],
      })
      return
    } catch (err) {
      console.warn('Native LocalNotification error:', err)
    }
  }

  // 2. Web / PWA Notification Fallback
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') {
            new Notification(title, {
              body,
              icon: '/favicon.ico',
            })
          }
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('Web notification error:', err)
  }
}
