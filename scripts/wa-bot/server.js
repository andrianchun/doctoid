/**
 * docto.id - WhatsApp Clinical Gateway Controller (Port 3001)
 * Controller HTTP lokal & Service Baileys untuk mengontrol WhatsApp Bot langsung dari menu Pengaturan di docto.id.
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import QRCode from 'qrcode'
import qrcodeTerminal from 'qrcode-terminal'
import pino from 'pino'
import sharp from 'sharp'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from '@whiskeysockets/baileys'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.resolve(__dirname, '../..')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const AUTH_DIR = path.join(__dirname, '.auth_session')
const STATUS_JSON_PATH = path.join(PUBLIC_DIR, 'wa-status.json')
const INBOX_JSON_PATH = path.join(PUBLIC_DIR, 'wa-inbox.json')

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true })

let botState = {
  active: true,
  connected: false,
  qrDataUrl: null,
  pairingCode: null,
  phone: null,
  name: null,
  whitelist: '',
  lastSync: null,
  error: null,
}

let sock = null
let isConnecting = false
const groupCache = new Map()

function broadcastState() {
  try {
    fs.writeFileSync(STATUS_JSON_PATH, JSON.stringify(botState, null, 2), 'utf-8')
  } catch (err) {
    console.error('Gagal menulis status json:', err.message)
  }
}

async function initBaileys() {
  if (!botState.active) {
    console.log('Bot dalam mode NONAKTIF (OFF). Menunda inisialisasi.')
    botState.connected = false
    botState.qrDataUrl = null
    broadcastState()
    return
  }

  if (isConnecting) return
  isConnecting = true

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['docto.id Clinical Gateway', 'Chrome', '1.0.0'],
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr && botState.active) {
        console.log('\n📲 QR Code baru diterima dari WhatsApp Web...')
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 })
          botState.qrDataUrl = qrDataUrl
          botState.connected = false
          broadcastState()
          console.log('✓ QR Code berhasil dikirim ke antarmuka Pengaturan docto.id')
          qrcodeTerminal.generate(qr, { small: true })
        } catch (e) {
          console.error('Gagal generate QR DataURL:', e.message)
        }
      }

      if (connection === 'close') {
        isConnecting = false
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && botState.active
        console.log(`⚠️ Koneksi terputus (${statusCode || 'Unknown'}). Reconnect: ${shouldReconnect}`)

        botState.connected = false
        botState.qrDataUrl = null
        broadcastState()

        if (shouldReconnect) {
          setTimeout(initBaileys, 3000)
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log('Sesi logout oleh pengguna.')
          fs.rmSync(AUTH_DIR, { recursive: true, force: true })
          if (botState.active) setTimeout(initBaileys, 2000)
        }
      } else if (connection === 'open') {
        isConnecting = false
        botState.connected = true
        botState.qrDataUrl = null
        botState.pairingCode = null
        botState.phone = sock.user?.id?.split(':')[0]?.replace(/[^0-9]/g, '') || 'Nomor Terdaftar'
        botState.name = sock.user?.name || 'Dokter'
        broadcastState()
        console.log(`\n=====================================================`)
        console.log(`✅ WHATSAPP TERHUBUNG! Pengguna: ${botState.name} (${botState.phone})`)
        console.log(`🔒 Mode Khusus: HANYA Grup "Doctoid" Aktif (Chat Pribadi Diabaikan)!`)
        console.log(`=====================================================`)

        // Pre-cache daftar grup yang diikuti dokter & auto-create grup jika belum ada
        try {
          const allGroups = await sock.groupFetchAllParticipating()
          let foundDoctoGroup = false
          for (const [id, meta] of Object.entries(allGroups)) {
            const isDocto = (meta.subject || '').toLowerCase().includes('docto')
            groupCache.set(id, { name: meta.subject, isDocto })
            if (isDocto) {
              foundDoctoGroup = true
              console.log(`🎯 Grup Doctoid Terdeteksi: "${meta.subject}" (${id})`)
            }
          }

          // Otomatis buatkan grup "Doctoid" jika dokter belum punya grup bernama Doctoid
          if (!foundDoctoGroup) {
            console.log(`\n✨ Belum ada grup Doctoid di WhatsApp dokter. Membuat grup "Doctoid" otomatis...`)
            try {
              const myCleanJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : ''
              const participants = myCleanJid ? [myCleanJid] : []
              const newGroup = await sock.groupCreate('Doctoid', participants)
              groupCache.set(newGroup.id, { name: 'Doctoid', isDocto: true })
              console.log(`🎉 Grup "Doctoid" berhasil dibuat otomatis! (ID: ${newGroup.id})`)

              await sock.sendMessage(newGroup.id, {
                text: `🩺 *Grup Konsul Medis Docto.id Aktif!*\n\nSelamat datang dokter! Teruskan (forward) pesan konsulan pasien, foto penunjang/lab/EKG, atau video ke grup ini.\n\nSemua pesan di grup ini akan otomatis disaring dan disinkronkan ke rekam medis aplikasi Docto.id.`,
              })
            } catch (err) {
              console.warn('Gagal membuat grup otomatis saat login:', err.message)
            }
          }
        } catch (err) {
          console.warn('Gagal membaca daftar grup:', err.message)
        }
      }
    })

    // Helper untuk cek apakah grup mengandung kata "docto"
    async function checkIsDoctoGroup(jid) {
      if (!jid || !jid.endsWith('@g.us')) return false
      let cached = groupCache.get(jid)
      if (cached) return cached.isDocto

      try {
        const meta = await sock.groupMetadata(jid)
        const name = meta.subject || ''
        const isDocto = name.toLowerCase().includes('docto')
        groupCache.set(jid, { name, isDocto })
        return isDocto
      } catch {
        return false
      }
    }

    // Listener Pesan Masuk (EKSKLUSIF: HANYA Grup Doctoid!)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (!botState.active) return
      if (type !== 'notify' && type !== 'append') return

      const myJid = sock.user?.id || ''
      const myPhone = myJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')

      for (const msg of messages) {
        if (!msg.message) continue

        const senderJid = msg.key.remoteJid || ''
        // Abaikan status/story WA, siaran broadcast, channel newsletter, dan chat personal
        if (
          !senderJid ||
          senderJid === 'status@broadcast' ||
          senderJid.endsWith('@broadcast') ||
          senderJid.endsWith('@newsletter') ||
          senderJid.endsWith('@s.whatsapp.net') // Abaikan semua chat personal/diri sendiri!
        ) {
          continue
        }

        // HANYA terima jika di grup yang mengandung kata "docto" (mis. "Doctoid", "docto.id")!
        // Semua chat pribadi dan grup lain 100% DIABAIKAN!
        const isDoctoGroup = senderJid.endsWith('@g.us') ? await checkIsDoctoGroup(senderJid) : false
        if (!isDoctoGroup) {
          continue
        }

        const participantJid = msg.key.participant || msg.participant || ''
        const participantPhone = participantJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        const remotePhone = senderJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')

        const groupName = groupCache.get(senderJid)?.name || 'Grup Doctoid'
        const senderName = `${groupName}${msg.pushName ? ` (${msg.pushName})` : ''}`
        console.log(`\n📥 Menerima konsulan baru via [${senderName}]!`)

        const m = msg.message
        const unwrap =
          m?.ephemeralMessage?.message ||
          m?.viewOnceMessage?.message ||
          m?.viewOnceMessageV2?.message ||
          m?.documentWithCaptionMessage?.message ||
          m

        let textContent =
          unwrap?.conversation ||
          unwrap?.extendedTextMessage?.text ||
          unwrap?.imageMessage?.caption ||
          unwrap?.videoMessage?.caption ||
          unwrap?.documentMessage?.caption ||
          ''

        const isImage = !!unwrap?.imageMessage
        const isVideo = !!unwrap?.videoMessage
        const isAudio = !!unwrap?.audioMessage
        const isDoc = !!unwrap?.documentMessage

        let mediaDataUrl = ''
        let mediaType = ''
        let mediaName = 'lampiran'

        try {
          if (isImage || isVideo || isAudio || isDoc) {
            const buffer = await downloadMediaMessage(msg, 'buffer', {})
            const b64 = buffer.toString('base64')

            if (isImage) {
              mediaType = 'image/webp'
              mediaName = `Foto_${Date.now()}.webp`
              try {
                const comp = await sharp(buffer)
                  .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 75 })
                  .toBuffer()
                mediaDataUrl = `data:image/webp;base64,${comp.toString('base64')}`
                console.log(`✓ Foto berhasil dikompresi ke WebP resolusi tinggi dari ${(buffer.length/1024).toFixed(0)} KB -> ${(comp.length/1024).toFixed(0)} KB`)
              } catch (e) {
                console.warn('Kompresi webp gagal, fallback ke jpeg:', e.message)
                mediaType = 'image/jpeg'
                mediaDataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`
              }
            } else if (isVideo) {
              mediaType = unwrap.videoMessage.mimetype || 'video/mp4'
              mediaName = 'Video_Kejang.mp4'
              // Video besar tidak di-base64-kan langsung ke JSON agar JSON tetap ringan (<500KB)
              mediaDataUrl = ''
            } else if (isAudio) {
              mediaType = unwrap.audioMessage.mimetype || 'audio/ogg'
              mediaName = 'Voice_Note.opus'
              mediaDataUrl = `data:${mediaType};base64,${buffer.toString('base64')}`
            } else if (isDoc) {
              mediaType = unwrap.documentMessage.mimetype || 'application/pdf'
              mediaName = unwrap.documentMessage.fileName || 'Dokumen_Lab.pdf'
              mediaDataUrl = `data:${mediaType};base64,${buffer.toString('base64')}`
            }
          }
        } catch (e) {
          console.error('Gagal mengunduh berkas:', e.message)
        }

        // Ekstraksi otomatis nama, no RM, dan usia jika tertera di teks
        const titleMatch = textContent.match(/(?:Tn\.|Ny\.|Sdr\.|Sdri\.|An\.|By\.)\s*([A-Za-z\s]{2,30})/i)
        const namaLabelMatch = textContent.match(/(?:Nama|Pasien)\s*[:\.]?\s*([A-Z][a-zA-Z\s]{2,25})/i)
        const rmMatch = textContent.match(/(?:RM|No\.?\s*RM|Rekam\s*Medis)\s*[:\.]?\s*([0-9\-\.\/]{4,15})/i)
        const usiaMatch = textContent.match(/(\d{1,3})\s*(?:th|tahun|yo|bulan)/i)

        const extractedName = titleMatch ? titleMatch[0].trim() : (namaLabelMatch ? namaLabelMatch[1].trim() : '')
        const parsedData = {
          nama_depan: extractedName,
          no_rm: rmMatch ? rmMatch[1].trim() : '',
          usia: usiaMatch ? usiaMatch[0].trim() : '',
        }

        const inboxItem = {
          id: Date.now(),
          source: 'whatsapp',
          sender_name: senderName,
          sender_phone: isDoctoGroup && participantPhone ? participantPhone : (myPhone || remotePhone),
          raw_text: textContent,
          parsed_data: parsedData,
          attachments: mediaDataUrl
            ? [
                {
                  id: Math.random().toString(36).substring(7),
                  name: mediaName,
                  type: mediaType,
                  dataUrl: mediaDataUrl,
                  kategori: isVideo ? 'pemfis' : 'penunjang',
                },
              ]
            : [],
          status: 'pending',
          created_at: new Date().toISOString(),
        }

        // Tulis ke wa-inbox.json untuk diambil oleh frontend docto.id
        try {
          let inboxList = []
          if (fs.existsSync(INBOX_JSON_PATH)) {
            inboxList = JSON.parse(fs.readFileSync(INBOX_JSON_PATH, 'utf-8'))
          }

          // CLUSTERING: Gabungkan jika ada pesan/berkas masuk dari grup/pengirim yang sama dalam 90 detik terakhir
          const now = Date.now()
          const recentItem = inboxList.find(
            (it) =>
              it.sender_name === inboxItem.sender_name &&
              it.sender_phone === inboxItem.sender_phone &&
              now - new Date(it.created_at).getTime() < 90000
          )

          if (recentItem) {
            if (!recentItem.raw_text && inboxItem.raw_text) {
              recentItem.raw_text = inboxItem.raw_text
              recentItem.parsed_data = inboxItem.parsed_data
            } else if (recentItem.raw_text && inboxItem.raw_text && recentItem.raw_text !== inboxItem.raw_text) {
              recentItem.raw_text += '\n\n' + inboxItem.raw_text
            }
            if (inboxItem.attachments && inboxItem.attachments.length > 0) {
              const curAtts = recentItem.attachments || []
              for (const newAtt of inboxItem.attachments) {
                // Jangan deteksi duplikat hanya dari slice(0, 80) karena semua header WebP/JPEG identik!
                const isDup = curAtts.some((a) => {
                  if (a.id && newAtt.id && a.id === newAtt.id) return true
                  if (!a.dataUrl || !newAtt.dataUrl) return false
                  if (a.dataUrl === newAtt.dataUrl) return true
                  // Cek kesamaan panjang dan tail base64 untuk verifikasi akurat
                  return a.dataUrl.length === newAtt.dataUrl.length && a.dataUrl.slice(-120) === newAtt.dataUrl.slice(-120)
                })
                if (!isDup && curAtts.length < 15) {
                  curAtts.push(newAtt)
                }
              }
              recentItem.attachments = curAtts
            }
            recentItem.created_at = new Date().toISOString()
            console.log(`✓ Pesan/lampiran baru berhasil digabungkan ke konsulan pasien [${recentItem.parsed_data?.nama_depan || 'Aktif'}]! Total lampiran: ${recentItem.attachments.length}`)
          } else {
            inboxList.unshift(inboxItem)
            console.log('✓ Konsulan WhatsApp baru berhasil dicatat ke antrean inbox!')
          }

          const trimmedList = inboxList.slice(0, 15)
          fs.writeFileSync(INBOX_JSON_PATH, JSON.stringify(trimmedList, null, 2), 'utf-8')
          const distInbox = path.join(ROOT_DIR, 'dist', 'wa-inbox.json')
          try {
            if (fs.existsSync(path.dirname(distInbox))) {
              fs.writeFileSync(distInbox, JSON.stringify(trimmedList, null, 2), 'utf-8')
            }
          } catch {}
          botState.lastSync = new Date().toISOString()
          broadcastState()

          // Sinkronisasi otomatis ke Cloud Firestore agar langsung masuk ke APK HP dokter
          syncInboxToFirestore(trimmedList)

          // Picu FCM Push Notification Real-time ke HP Dokter (Status Bar & Lockscreen)
          triggerFcmNotificationDebounced(recentItem || inboxItem, 2500)
        } catch (err) {
          console.error('Gagal menulis inbox json:', err.message)
        }

        // Mode Pasif Total: TIDAK PERNAH mengirim pesan balasan ke WhatsApp pengirim.
        // docto.id hanya mencatat konsulan secara diam-diam (silent listener) di aplikasi dokter.
      }
    })
  } catch (err) {
    isConnecting = false
    console.error('Gagal inisialisasi Baileys:', err)
  }
}

const USER_UID = 'fOGcJmF0vGR5EKzlN2l9ZR7WPZu1'

async function getAccessToken() {
  // 1. Coba ambil dari GCP Compute Metadata Server (jika jalan di GCP VM Always-Free / Cloud Run)
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(1500),
      }
    )
    if (res.ok) {
      const data = await res.json()
      if (data.access_token) return data.access_token
    }
  } catch {}

  // 2. Fallback: Ambil dari config firebase-tools lokal (laptop developer)
  try {
    const os = await import('os')
    const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      const tokens = cfg.tokens || {}
      let accessToken = tokens.access_token
      if (tokens.expires_at && tokens.expires_at < Date.now() + 60000 && tokens.refresh_token) {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho85qd6.apps.googleusercontent.com',
            grant_type: 'refresh_token',
            refresh_token: tokens.refresh_token,
          }),
        })
        const refreshData = await refreshRes.json()
        if (refreshData.access_token) {
          accessToken = refreshData.access_token
          tokens.access_token = accessToken
          tokens.expires_at = Date.now() + (refreshData.expires_in || 3600) * 1000
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8')
        }
      }
      return accessToken
    }
  } catch {}

  return null
}

async function syncInboxToFirestore(inboxList) {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return

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

    // Ambil maksimal 5 item pending, bersihkan lampiran video besar agar tidak tembus batas 1MB
    const pendingItems = inboxList
      .filter((i) => i.status === 'pending')
      .slice(0, 5)
      .map((it) => {
        const clone = JSON.parse(JSON.stringify(it))
        if (clone.attachments && clone.attachments.length > 0) {
          clone.attachments = clone.attachments.map((att) => {
            if (att.dataUrl && att.dataUrl.length > 400000) {
              return { ...att, dataUrl: '' }
            }
            return att
          })
        }
        return clone
      })

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

    // Tulis ke dokumen terisolasi khusus inbox WhatsApp: doctoid/inbox_{USER_UID} (Jaminan tidak pernah tembus batas 1MB)
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/inbox_${USER_UID}`

    const res = await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      console.log(`☁️ Konsulan otomatis tersinkron ke Cloud Firestore (langsung muncul di APK HP dokter!)`)
    } else {
      const err = await res.json().catch(() => ({}))
      console.warn('Gagal sync ke Cloud Firestore:', err.error?.message || res.statusText)
    }
  } catch (err) {
    console.warn('Gagal sync ke Cloud Firestore:', err.message)
  }
}

// ============================================================================
// Firebase Cloud Messaging (FCM) Real-time Push Notification Handler
// ============================================================================
const FCM_TOKENS_PATH = path.join(PUBLIC_DIR, 'wa-fcm-tokens.json')

function getLocalFcmTokens() {
  if (fs.existsSync(FCM_TOKENS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(FCM_TOKENS_PATH, 'utf-8'))
    } catch {}
  }
  return []
}

function saveLocalFcmTokens(tokens) {
  try {
    fs.writeFileSync(FCM_TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf-8')
  } catch {}
}

async function getAllFcmTokens() {
  const tokenSet = new Set(getLocalFcmTokens())
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/fcm_tokens`
    const res = await fetch(firestoreUrl)
    if (res.ok) {
      const data = await res.json()
      const vals = data.fields?.tokens?.arrayValue?.values || []
      for (const v of vals) {
        if (v.stringValue) tokenSet.add(v.stringValue)
      }
    }
  } catch {}
  return Array.from(tokenSet)
}

async function sendFcmPushNotification(item) {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) {
      console.warn('⚠️ FCM: Akses token tidak tersedia, lewati push notification.')
      return
    }

    const tokens = await getAllFcmTokens()
    if (!tokens || tokens.length === 0) {
      console.log('ℹ️ FCM: Belum ada device token yang terdaftar.')
      return
    }

    const patientName = item.parsed_data?.nama_depan || item.sender_name || 'Konsul Pasien Baru'
    const age = item.parsed_data?.usia ? ` (${item.parsed_data.usia})` : ''
    const title = `Konsul WhatsApp: ${patientName}${age}`
    const snippet = item.raw_text
      ? item.raw_text.replace(/\n+/g, ' ').slice(0, 140)
      : 'Pesan konsulan baru masuk dari WhatsApp.'

    console.log(`📡 Menembakkan FCM Real-time Push ke ${tokens.length} perangkat HP dokter...`)

    const validTokens = []
    for (const token of tokens) {
      try {
        const payload = {
          message: {
            token: token,
            notification: {
              title: title,
              body: snippet,
            },
            data: {
              inboxId: String(item.id || Date.now()),
              action: 'open_wa_inbox',
            },
            android: {
              priority: 'high',
              notification: {
                channel_id: 'wa_inbox_channel',
                sound: 'default',
                default_vibrate_timings: true,
                default_sound: true,
                priority: 'high',
                visibility: 'public',
              },
            },
          },
        }

        const res = await fetch('https://fcm.googleapis.com/v1/projects/docto-id/messages:send', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          const resData = await res.json()
          console.log(`✓ FCM sukses terkirim ke HP:`, resData.name)
          validTokens.push(token)
        } else {
          const errData = await res.json().catch(() => ({}))
          console.warn(`⚠️ FCM gagal ke token ${token.slice(0, 12)}...:`, errData.error?.message || res.statusText)
          if (errData.error?.status !== 'NOT_FOUND' && errData.error?.details?.[0]?.errorCode !== 'UNREGISTERED') {
            validTokens.push(token)
          }
        }
      } catch (tokenErr) {
        console.warn('⚠️ FCM network error:', tokenErr.message)
        validTokens.push(token)
      }
    }

    saveLocalFcmTokens(validTokens)
  } catch (err) {
    console.warn('⚠️ sendFcmPushNotification gagal:', err.message)
  }
}

let fcmPushTimer = null
function triggerFcmNotificationDebounced(item, delayMs = 2500) {
  if (fcmPushTimer) clearTimeout(fcmPushTimer)
  fcmPushTimer = setTimeout(() => {
    sendFcmPushNotification(item)
  }, delayMs)
}

// HTTP API Server (Port 3001)
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  // GET /api/status
  if (req.method === 'GET' && url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(botState))
    return
  }

  // GET /api/inbox
  if (req.method === 'GET' && url.pathname === '/api/inbox') {
    let inboxList = []
    if (fs.existsSync(INBOX_JSON_PATH)) {
      try {
        inboxList = JSON.parse(fs.readFileSync(INBOX_JSON_PATH, 'utf-8'))
      } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(inboxList))
    return
  }

  // POST /api/register-fcm-token (Pendaftaran Device Push Token dari APK Dokter)
  if (req.method === 'POST' && url.pathname === '/api/register-fcm-token') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const { token } = JSON.parse(body || '{}')
        if (token && typeof token === 'string') {
          const currentTokens = new Set(getLocalFcmTokens())
          currentTokens.add(token)
          saveLocalFcmTokens(Array.from(currentTokens))
          console.log(`📱 FCM Device Token terdaftar di gateway: ${token.slice(0, 16)}... (Total: ${currentTokens.size})`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, count: currentTokens.size }))
          return
        }
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Token is required' }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // POST /api/test-push (Trigger uji coba Push Notification ke seluruh perangkat)
  if (req.method === 'POST' && url.pathname === '/api/test-push') {
    const dummyItem = {
      id: Date.now(),
      sender_name: 'Tes Dokter Jaga',
      raw_text: 'Tes notifikasi darurat konsul real-time Docto.id',
      parsed_data: { nama_depan: 'Pasien Uji Coba', usia: '35 th' },
    }
    await sendFcmPushNotification(dummyItem)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, message: 'Push notification triggered' }))
    return
  }

  // POST /api/toggle
  if (req.method === 'POST' && url.pathname === '/api/toggle') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        const newActive = typeof payload.active === 'boolean' ? payload.active : !botState.active

        botState.active = newActive
        console.log(`\n🎛️ Pengguna mengubah status bot menjadi: ${newActive ? 'AKTIF (ON)' : 'NONAKTIF (OFF)'}`)

        if (!newActive) {
          if (sock) {
            try { sock.end(undefined) } catch {}
            sock = null
          }
          botState.connected = false
          botState.qrDataUrl = null
          broadcastState()
        } else {
          broadcastState()
          initBaileys()
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, botState }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /api/disconnect
  if (req.method === 'POST' && url.pathname === '/api/disconnect') {
    console.log('\n🔌 Memutuskan sesi WhatsApp Web & menghapus kredensial...')
    try {
      if (sock) {
        sock.logout().catch(() => {})
        sock.end(undefined)
        sock = null
      }
      fs.rmSync(AUTH_DIR, { recursive: true, force: true })
      botState.connected = false
      botState.qrDataUrl = null
      botState.phone = null
      botState.name = null
      broadcastState()

      if (botState.active) {
        setTimeout(initBaileys, 1500)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, message: 'Berhasil diputuskan' }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /api/pair-code (Tautkan via Nomor HP & Kode 8 Digit - Tanpa Scan QR)
  if (req.method === 'POST' && url.pathname === '/api/pair-code') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        let phone = (payload.phone || '').replace(/[^0-9]/g, '')
        if (phone.startsWith('0')) phone = '62' + phone.substring(1)

        if (!phone || phone.length < 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Nomor telepon tidak valid (minimal 10 digit).' }))
          return
        }

        if (!sock || botState.connected) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'WhatsApp sudah terhubung atau socket belum siap.' }))
          return
        }

        const code = await sock.requestPairingCode(phone)
        botState.pairingCode = code
        broadcastState()
        console.log(`\n🔑 KODE PAIRING WHATSAPP: ${code} (Untuk nomor: ${phone})`)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, pairingCode: code }))
      } catch (err) {
        console.error('Gagal meminta kode pairing:', err.message)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /api/create-group (Buat grup Doctoid otomatis via tombol antarmuka)
  if (req.method === 'POST' && url.pathname === '/api/create-group') {
    if (!sock || !botState.connected) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'WhatsApp belum terhubung.' }))
      return
    }

    try {
      const myCleanJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : ''
      const participants = myCleanJid ? [myCleanJid] : []
      const newGroup = await sock.groupCreate('Doctoid', participants)
      groupCache.set(newGroup.id, { name: 'Doctoid', isDocto: true })

      await sock.sendMessage(newGroup.id, {
        text: `🩺 *Grup Konsul Medis Docto.id Aktif!*\n\nSelamat datang dokter! Teruskan (forward) pesan konsulan pasien, foto penunjang/lab/EKG, atau video ke grup ini.\n\nSemua pesan di grup ini akan otomatis disaring dan disinkronkan ke rekam medis aplikasi Docto.id.`,
      })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, groupId: newGroup.id, name: 'Doctoid' }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  // POST /api/whitelist
  if (req.method === 'POST' && url.pathname === '/api/whitelist') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}')
        botState.whitelist = payload.whitelist || ''
        broadcastState()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, whitelist: botState.whitelist }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  res.writeHead(404)
  res.end('Not Found')
})

const PORT = 3001
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=====================================================`)
  console.log(`🩺 docto.id WA Gateway Controller berjalan di:`)
  console.log(`   http://localhost:${PORT}`)
  console.log(`   http://192.168.1.45:${PORT} (Akses dari HP via Wi-Fi)`)
  console.log(`=====================================================`)
  broadcastState()
  initBaileys()
})
