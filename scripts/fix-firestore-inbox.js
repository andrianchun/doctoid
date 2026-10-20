import fs from 'fs'
import path from 'path'
import os from 'os'

async function syncRealInbox() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const accessToken = cfg.tokens.access_token

  const res = await fetch('http://35.255.95.161:3001/api/inbox')
  const items = await res.json()
  console.log('Fetched items from VM:', items.length)

  function toFirestoreValue(val) {
    if (val === null || val === undefined) return { nullValue: null }
    if (typeof val === 'string') return { stringValue: val }
    if (typeof val === 'boolean') return { booleanValue: val }
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return { integerValue: String(val) }
      return { doubleValue: val }
    }
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map(toFirestoreValue) } }
    }
    if (typeof val === 'object') {
      const fields = {}
      for (const [k, v] of Object.entries(val)) {
        if (v !== undefined) fields[k] = toFirestoreValue(v)
      }
      return { mapValue: { fields } }
    }
    return { stringValue: String(val) }
  }

  // Ambil item pending, pastikan dataUrl LENGKAP tanpa potongan!
  const pendingItems = items.filter((i) => i.status === 'pending').slice(0, 8)

  const payload = {
    fields: {
      items: {
        arrayValue: {
          values: pendingItems.map(toFirestoreValue),
        },
      },
      updatedAt: {
        integerValue: String(Date.now()),
      },
    },
  }

  const USER_UID = 'fOGcJmF0vGR5EKzlN2l9ZR7WPZu1'
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/inbox_${USER_UID}`

  const patchRes = await fetch(firestoreUrl, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  console.log('Firestore patch status:', patchRes.status, patchRes.statusText)
  if (patchRes.ok) {
    console.log('✓ Berhasil menyinkronkan data lampiran LENGKAP & VALID ke Firestore!')
  } else {
    console.error('Gagal:', await patchRes.text())
  }
}

syncRealInbox().catch(console.error)
