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
        console.log(`🔒 Mode Khusus: Grup "Doctoid" + Chat Diri Sendiri Aktif!`)
        console.log(`=====================================================`)

        // Pre-cache daftar grup yang diikuti dokter
        try {
          const allGroups = await sock.groupFetchAllParticipating()
          for (const [id, meta] of Object.entries(allGroups)) {
            const isDocto = (meta.subject || '').toLowerCase().includes('docto')
            groupCache.set(id, { name: meta.subject, isDocto })
            if (isDocto) {
              console.log(`🎯 Grup Doctoid Terdeteksi: "${meta.subject}" (${id})`)
            }
          }
        } catch {}
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

    // Listener Pesan Masuk (HANYA Grup Doctoid & Chat Diri Sendiri)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (!botState.active || type !== 'notify') return

      const myJid = sock.user?.id || ''
      const myPhone = myJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')

      for (const msg of messages) {
        if (!msg.message) continue

        const senderJid = msg.key.remoteJid || ''
        const remotePhone = senderJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')

        // 1. Cek apakah ini chat ke diri sendiri
        const isSelfChat =
          Boolean(remotePhone && myPhone && remotePhone === myPhone) ||
          Boolean(senderJid && myPhone && (senderJid.startsWith(myPhone) || myJid.startsWith(remotePhone)))

        // 2. Cek apakah ini pesan di grup yang mengandung kata "docto" (mis. "Doctoid", "docto.id")
        const isDoctoGroup = senderJid.endsWith('@g.us') ? await checkIsDoctoGroup(senderJid) : false

        // HANYA terima jika di chat diri sendiri ATAU di grup Doctoid!
        // Semua grup lain dan chat dari orang lain 100% DIABAIKAN!
        if (!isSelfChat && !isDoctoGroup) {
          continue
        }

        const sourceLabel = isDoctoGroup ? (groupCache.get(senderJid)?.name || 'Grup Doctoid') : 'Diri Sendiri'
        console.log(`\n📥 Menerima konsulan baru via [${sourceLabel}]!`)

        let textContent =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          msg.message.documentMessage?.caption ||
          ''

        const isImage = !!msg.message.imageMessage
        const isVideo = !!msg.message.videoMessage
        const isAudio = !!msg.message.audioMessage
        const isDoc = !!msg.message.documentMessage

        let mediaDataUrl = ''
        let mediaType = ''
        let mediaName = 'lampiran'

        try {
          if (isImage || isVideo || isAudio || isDoc) {
            const buffer = await downloadMediaMessage(msg, 'buffer', {})
            const b64 = buffer.toString('base64')

            if (isImage) {
              mediaType = msg.message.imageMessage.mimetype || 'image/jpeg'
              mediaName = 'Foto_Konsul.jpg'
            } else if (isVideo) {
              mediaType = msg.message.videoMessage.mimetype || 'video/mp4'
              mediaName = 'Video_Kejang.mp4'
            } else if (isAudio) {
              mediaType = msg.message.audioMessage.mimetype || 'audio/ogg'
              mediaName = 'Voice_Note.opus'
            } else if (isDoc) {
              mediaType = msg.message.documentMessage.mimetype || 'application/pdf'
              mediaName = msg.message.documentMessage.fileName || 'Dokumen_Lab.pdf'
            }
            mediaDataUrl = `data:${mediaType};base64,${b64}`
            console.log(`✓ Berkas ${mediaName} (${buffer.length} bytes) berhasil diunduh.`)
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
          sender_name: sourceLabel,
          sender_phone: myPhone || remotePhone,
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

          // CLUSTERING: Gabungkan jika ada pesan masuk dari grup/pengirim yang sama dalam 12 detik terakhir
          const now = Date.now()
          const recentItem = inboxList.find(
            (it) =>
              it.sender_name === inboxItem.sender_name &&
              it.sender_phone === inboxItem.sender_phone &&
              now - new Date(it.created_at).getTime() < 12000
          )

          if (recentItem) {
            if (!recentItem.raw_text && inboxItem.raw_text) {
              recentItem.raw_text = inboxItem.raw_text
              recentItem.parsed_data = inboxItem.parsed_data
            } else if (recentItem.raw_text && inboxItem.raw_text && recentItem.raw_text !== inboxItem.raw_text) {
              recentItem.raw_text += '\n\n' + inboxItem.raw_text
            }
            if (inboxItem.attachments && inboxItem.attachments.length > 0) {
              recentItem.attachments = [...(recentItem.attachments || []), ...inboxItem.attachments]
            }
            recentItem.created_at = new Date().toISOString()
            console.log(`✓ Pesan/lampiran baru berhasil digabungkan ke konsulan pasien [${recentItem.parsed_data?.nama_depan || 'Aktif'}]! Total lampiran: ${recentItem.attachments.length}`)
          } else {
            inboxList.unshift(inboxItem)
            console.log('✓ Konsulan WhatsApp baru berhasil dicatat ke antrean inbox!')
          }

          fs.writeFileSync(INBOX_JSON_PATH, JSON.stringify(inboxList.slice(0, 50), null, 2), 'utf-8')
          botState.lastSync = new Date().toISOString()
          broadcastState()
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

// HTTP API Server (Port 3001)
const server = http.createServer((req, res) => {
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
