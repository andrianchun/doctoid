import { useEffect } from 'react'
import { db } from '../db'

export async function syncWaInboxToDexie() {
  try {
    let items: any[] = []
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/inbox?t=${Date.now()}`)
      if (res.ok) items = await res.json()
    } catch {
      // Fallback ke file JSON statis jika server HTTP belum/tidak terjangkau
      const res = await fetch(`/wa-inbox.json?t=${Date.now()}`)
      if (res.ok) items = await res.json()
    }

    if (!Array.isArray(items) || items.length === 0) return

    for (const item of items) {
      if (!item.raw_text && (!item.attachments || item.attachments.length === 0)) continue

      // Cek apakah item sudah pernah tercatat di inboxQueue lokal
      const existing = await db.inboxQueue
        .filter(
          (q) =>
            (item.created_at && q.created_at === item.created_at) ||
            (q.raw_text === item.raw_text && q.sender_phone === item.sender_phone)
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
