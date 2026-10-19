/**
 * docto.id - WhatsApp Clinical Ingestion Gateway (100% Gratis via Baileys)
 * Menghubungkan WhatsApp dokter langsung ke docto.id.
 */

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

const AUTH_DIR = path.join(__dirname, '.auth_session')
const SCAN_HTML_PATH = path.join(__dirname, 'scan.html')
const QR_PNG_PATH = path.join(__dirname, 'scan-qr.png')
const INBOX_LOG_PATH = path.join(__dirname, 'incoming_inbox.json')

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true })
}

console.log('=====================================================')
console.log('🩺 docto.id - WhatsApp Clinical Ingestion Gateway')
console.log('=====================================================')

async function updateHtmlScanPage(qrDataUrl, rawQr) {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scan WhatsApp - docto.id</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 32px;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    h1 { font-size: 20px; margin-bottom: 8px; color: #38bdf8; }
    p { font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
    .qr-box {
      background: white;
      padding: 16px;
      border-radius: 16px;
      display: inline-block;
      margin-bottom: 20px;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);
    }
    .qr-box img { display: block; width: 260px; height: 260px; }
    .steps {
      text-align: left;
      background: #0f172a;
      padding: 16px;
      border-radius: 12px;
      font-size: 12px;
      color: #cbd5e1;
    }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps li { margin-bottom: 6px; }
    .badge {
      display: inline-block;
      background: #065f46;
      color: #34d399;
      font-size: 11px;
      font-weight: bold;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }
  </style>
  <meta http-equiv="refresh" content="20">
</head>
<body>
  <div class="card">
    <div class="badge">🔒 Gateway Mandiri & Aman (UU PDP)</div>
    <h1>Hubungkan WhatsApp ke docto.id</h1>
    <p>Pindai kode QR ini menggunakan aplikasi WhatsApp di ponsel Anda.</p>
    <div class="qr-box">
      <img src="${qrDataUrl}" alt="WhatsApp QR Code" />
    </div>
    <div class="steps">
      <ol>
        <li>Buka WhatsApp di ponsel Anda.</li>
        <li>Ketuk <b>Menu (titik tiga)</b> atau <b>Pengaturan</b>.</li>
        <li>Pilih <b>Perangkat Tertaut (Linked Devices)</b>.</li>
        <li>Ketuk <b>Tautkan Perangkat</b> lalu arahkan kamera ke QR ini.</li>
      </ol>
    </div>
  </div>
</body>
</html>`
  fs.writeFileSync(SCAN_HTML_PATH, html, 'utf-8')
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['docto.id Clinical Gateway', 'Chrome', '1.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n=====================================================')
      console.log('📲 KODE QR WHATSAPP SIAP!')
      console.log('=====================================================')
      // Tampilkan QR di terminal
      qrcodeTerminal.generate(qr, { small: true })

      // Generate HTML dan PNG
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 })
        await updateHtmlScanPage(qrDataUrl, qr)
        await QRCode.toFile(QR_PNG_PATH, qr, { width: 400, margin: 2 })
        console.log(`\n👉 Halaman Scan Visual: file:///${SCAN_HTML_PATH.replace(/\\/g, '/')}`)
        console.log(`👉 File Gambar QR: file:///${QR_PNG_PATH.replace(/\\/g, '/')}`)
        console.log('Silakan buka link di atas atau scan langsung dari terminal.\n')
      } catch (err) {
        console.error('Gagal membuat gambar QR:', err)
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      console.log(`⚠️ Koneksi terputus (${statusCode || 'Unknown'}). Menghubungkan ulang:`, shouldReconnect)
      if (shouldReconnect) {
        setTimeout(startBot, 3000)
      } else {
        console.log('Sesi logout. Menghapus auth dan membuat sesi baru...')
        fs.rmSync(AUTH_DIR, { recursive: true, force: true })
        setTimeout(startBot, 2000)
      }
    } else if (connection === 'open') {
      console.log('\n=====================================================')
      console.log('✅ WHATSAPP GATEWAY BERHASIL TERHUBUNG & AKTIF!')
      console.log('=====================================================')
      console.log('Bot siap menerima: Teks Konsul, Foto Lab, PDF, Voice Note, & Video Kejang.')
      console.log('Menunggu pesan masuk dari dokter...\n')
    }
  })

  // Listener Pesan Masuk
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue

      const senderJid = msg.key.remoteJid || ''
      if (senderJid.endsWith('@g.us') || senderJid.includes('broadcast') || senderJid.includes('status')) {
        continue
      }
      const senderPhone = senderJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
      const pushName = msg.pushName || 'Dokter / Rekan Medis'

      console.log(`\n📨 Pesan Masuk dari: ${pushName} (${senderPhone})`)

      // Ekstraksi Teks
      let textContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        msg.message.documentMessage?.caption ||
        ''

      // Deteksi Media (Foto, Video, Audio, Dokumen)
      const isImage = !!msg.message.imageMessage
      const isVideo = !!msg.message.videoMessage
      const isAudio = !!msg.message.audioMessage
      const isDoc = !!msg.message.documentMessage

      let mediaBuffer = null
      let mediaType = ''
      let mediaName = 'berkas'

      try {
        if (isImage) {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {})
          mediaType = msg.message.imageMessage.mimetype || 'image/jpeg'
          mediaName = 'Foto_Konsul.jpg'
          console.log(`📷 Mengunduh foto (${mediaBuffer.length} bytes)...`)
        } else if (isVideo) {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {})
          mediaType = msg.message.videoMessage.mimetype || 'video/mp4'
          mediaName = 'Video_Kejang.mp4'
          console.log(`🎥 Mengunduh video klinis (${mediaBuffer.length} bytes)...`)
        } else if (isAudio) {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {})
          mediaType = msg.message.audioMessage.mimetype || 'audio/ogg'
          mediaName = 'Voice_Note.opus'
          console.log(`🎙️ Mengunduh voice note (${mediaBuffer.length} bytes)...`)
        } else if (isDoc) {
          mediaBuffer = await downloadMediaMessage(msg, 'buffer', {})
          mediaType = msg.message.documentMessage.mimetype || 'application/pdf'
          mediaName = msg.message.documentMessage.fileName || 'Dokumen_Lab.pdf'
          console.log(`📄 Mengunduh dokumen (${mediaBuffer.length} bytes)...`)
        }
      } catch (e) {
        console.error('Gagal mengunduh media:', e.message)
      }

      // Catat ke Antrean Ingestion Lokal
      const inboxEntry = {
        id: Date.now(),
        source: 'whatsapp',
        sender_name: pushName,
        sender_phone: senderPhone,
        raw_text: textContent,
        has_media: !!mediaBuffer,
        media_type: mediaType,
        media_name: mediaName,
        created_at: new Date().toISOString(),
      }

      let existingInbox = []
      try {
        if (fs.existsSync(INBOX_LOG_PATH)) {
          existingInbox = JSON.parse(fs.readFileSync(INBOX_LOG_PATH, 'utf-8'))
        }
      } catch {}
      existingInbox.unshift(inboxEntry)
      fs.writeFileSync(INBOX_LOG_PATH, JSON.stringify(existingInbox.slice(0, 50), null, 2))

      console.log('✓ Pesan berhasil dicatat ke antrean konsulan docto.id!')

      // Mode Silent: docto.id hanya mencatat secara lokal dan TIDAK PERNAH membalas ke pengirim
    }
  })
}

startBot().catch((err) => {
  console.error('Fatal bot error:', err)
})
