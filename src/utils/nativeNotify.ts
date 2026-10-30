import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

let channelCreated = false

export interface NotificationExtraPayload {
  type?: 'brainstorm' | 'visite' | 'patient_profile' | 'wa_inbox'
  route?: string
  patientId?: number
  date?: string
  patientName?: string
  [key: string]: any
}

/**
 * Memicu notifikasi lokal ke status bar Android (Heads-up pop-up) dan Web Notification
 * ketika proses background parser SIMRS / WA selesai.
 */
export async function notifyParserFinished(
  patientName: string,
  detail: string = 'Data siap diterapkan ke rekam medis',
  extraData?: NotificationExtraPayload
) {
  const title = 'SIMRS / WA Selesai Diparsing'
  const body = `Data ${patientName}: ${detail}`

  const resolvedExtra: NotificationExtraPayload = {
    type: extraData?.type || 'brainstorm',
    route: extraData?.route || '/brainstorm',
    patientId: extraData?.patientId,
    date: extraData?.date,
    patientName,
    ...extraData,
  }

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
            iconColor: '#2563EB',
            extra: resolvedExtra,
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
      const showWebNotif = () => {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          data: resolvedExtra,
        })
        notif.onclick = () => {
          window.focus()
          if (resolvedExtra.type === 'visite' && resolvedExtra.patientId) {
            window.dispatchEvent(new CustomEvent('doctoid_nav_visite', { detail: resolvedExtra }))
          } else if (resolvedExtra.type === 'patient_profile' && resolvedExtra.patientId) {
            window.dispatchEvent(new CustomEvent('doctoid_nav_route', { detail: { route: resolvedExtra.route || `/pasien/${resolvedExtra.patientId}` } }))
          } else if (resolvedExtra.route) {
            window.dispatchEvent(new CustomEvent('doctoid_nav_route', { detail: { route: resolvedExtra.route } }))
          }
        }
      }

      if (Notification.permission === 'granted') {
        showWebNotif()
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') {
            showWebNotif()
          }
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('Web notification error:', err)
  }
}
