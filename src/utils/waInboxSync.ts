import { useEffect } from 'react'
import { db } from '../db'

export async function syncWaInboxToDexie() {
  try {
    let items: any[] = []
    try {
      const gatewayUrl =
        localStorage.getItem('doctoid_wa_gateway_url') ||
        (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? 'http://127.0.0.1:3001'
          : 'http://192.168.1.45:3001')

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

      // Cek apakah item sudah pernah tercatat di inboxQueue lokal
      const existing = await db.inboxQueue
        .filter(
          (q) =>
            (item.created_at && q.created_at === item.created_at) ||
            (Boolean(item.raw_text) && q.raw_text === item.raw_text && q.sender_phone === item.sender_phone)
        )
        .first()

      if (!existing) {
        await db.inboxQueue.add({
          source: 'whatsapp',
          sender_name: item.sender_name || 'Konsulan WhatsApp',
          sender_phone: item.sender_phone || '',
          raw_text: item.raw_text || '',
          attachments: item.attachments || [],
          status: 'pending',
          created_at: item.created_at || new Date().toISOString(),
        })
      }
    }
  } catch (err) {
    // Silent catch agar tidak mengganggu UI dokter
  }
}

export function useWaInboxSync(intervalMs = 4000) {
  useEffect(() => {
    let isCancelled = false

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
