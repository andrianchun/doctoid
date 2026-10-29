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

const ROOT_DIR = fs.existsSync(path.resolve(__dirname, '../../public'))
  ? path.resolve(__dirname, '../..')
  : __dirname
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const AUTH_DIR = path.join(__dirname, '.auth_session')
const STATUS_JSON_PATH = path.join(PUBLIC_DIR, 'wa-status.json')
const INBOX_JSON_PATH = path.join(PUBLIC_DIR, 'wa-inbox.json')
const CONFIG_JSON_PATH = path.join(PUBLIC_DIR, 'wa-config.json')

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true })

const CLINICAL_GROUP_NAME = 'Doctobot by Doctoid'

let botConfig = {
  clinicalGroupId: null,
  clinicalGroupName: CLINICAL_GROUP_NAME,
  brandedGroupId: null,
}

if (fs.existsSync(CONFIG_JSON_PATH)) {
  try {
    botConfig = { ...botConfig, ...JSON.parse(fs.readFileSync(CONFIG_JSON_PATH, 'utf-8')) }
  } catch {}
}

function saveBotConfig() {
  try {
    fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(botConfig, null, 2), 'utf-8')
  } catch {}
}

let botState = {
  active: true,
  connected: false,
  qrDataUrl: null,
  pairingCode: null,
  phone: null,
  name: null,
  whitelist: '',
  clinicalGroupId: botConfig.clinicalGroupId,
  clinicalGroupName: botConfig.clinicalGroupName,
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
  syncBotStateToFirestore()
}

async function syncBotStateToFirestore() {
  try {
    const accessToken = await getAccessToken()
    if (!accessToken) return
    const payload = {
      fields: {
        active: { booleanValue: Boolean(botState.active) },
        connected: { booleanValue: Boolean(botState.connected) },
        phone: { stringValue: botState.phone || '' },
        name: { stringValue: botState.name || '' },
        clinicalGroupId: { stringValue: botState.clinicalGroupId || '' },
        clinicalGroupName: { stringValue: botState.clinicalGroupName || '' },
        updatedAt: { integerValue: String(Date.now()) },
      },
    }
    await fetch('https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/bot_status', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {}
}

const GROUP_DESCRIPTION_TEXT = `🩺 DOCTOBOT by DOCTO.ID — Gateway Konsul & Rekam Medis Klinis

Grup resmi integrasi asisten AI Docto.id untuk pencatatan dan ekstraksi otomatis konsulan medis.

📋 Panduan Penggunaan:
1. Teruskan (forward) pesan rujukan pasien, anamnesis, atau catatan SOAP ke grup ini.
2. Kirim foto penunjang medis (Hasil Lab, EKG, Rontgen/CT-Scan, atau foto klinis lesi).
3. Kirim rekaman suara (Voice Note) konsulan lisan (otomatis ditranskrip & dianalisis AI).
4. Kirim video klinis singkat (pemeriksaan fisik/neurologis/kejang).

⚡ Alur Kerja Otomatis:
• Sistem AI menyaring & merangkum data pasien secara terstruktur.
• Notifikasi berdering seketika di HP & langsung masuk antrean Catat Pasien Docto.id.
• Siap dimasukkan ke Rekam Medis (CPPT) hanya dengan 1 klik.

🔒 Privasi & Keamanan:
Grup ini bekerja dalam mode pasif (silent listener) & terenkripsi end-to-end. Data hanya disinkronkan ke akun dokter yang terhubung.

Platform: https://docto-id.web.app`

async function setupDoctoGroupBranding(groupId, currentSubject = '', customIconBuffer = null, force = false) {
  if (!sock || !groupId) return

  // Cegah spam: jika grup ini sudah pernah dipasang logo dan deskripsi, lewati kecuali dipaksa manual
  if (!force && botConfig.brandedGroupId === groupId && !customIconBuffer) {
    console.log(`✓ Grup ${groupId} sudah memiliki branding resmi Doctobot. Melewati pembaruan ikon/nama.`)
    return
  }

  console.log(`🎨 Memeriksa branding resmi Doctobot pada grup ${groupId}...`)

  // 1. Rename nama grup menjadi "Doctobot by Doctoid" jika belum sesuai
  if (currentSubject && currentSubject !== CLINICAL_GROUP_NAME) {
    try {
      await sock.groupUpdateSubject(groupId, CLINICAL_GROUP_NAME)
      console.log(`✓ Nama grup WhatsApp berhasil diubah menjadi: "${CLINICAL_GROUP_NAME}"`)
      botConfig.clinicalGroupName = CLINICAL_GROUP_NAME
      saveBotConfig()
    } catch (err) {
      console.warn('⚠️ Gagal mengubah nama grup:', err.message)
    }
  }

  // 2. Pasang Foto Profil Logo Resmi Docto.id (hanya jika belum dibranding atau dipaksa)
  if (force || botConfig.brandedGroupId !== groupId || customIconBuffer) {
    try {
      let iconBuffer = customIconBuffer
      if (!iconBuffer) {
        const iconLocalPath = path.join(__dirname, 'icon.jpg')
        const iconPublicPath = path.join(PUBLIC_DIR, 'icon.jpg')
        const iconB64Path = path.join(__dirname, 'icon_b64.txt')
        if (fs.existsSync(iconLocalPath)) {
          iconBuffer = fs.readFileSync(iconLocalPath)
        } else if (fs.existsSync(iconPublicPath)) {
          iconBuffer = fs.readFileSync(iconPublicPath)
        } else if (fs.existsSync(iconB64Path)) {
          iconBuffer = Buffer.from(fs.readFileSync(iconB64Path, 'utf8').trim(), 'base64')
        }
      }

      if (iconBuffer) {
        await sock.updateProfilePicture(groupId, iconBuffer)
        console.log(`✓ Foto profil logo resmi Docto.id berhasil dipasang pada grup!`)
      }
    } catch (err) {
      console.warn('⚠️ Gagal memasang foto profil grup:', err.message)
    }
  }

  // 3. Pasang Deskripsi Resmi Panduan Konsul
  try {
    await sock.groupUpdateDescription(groupId, GROUP_DESCRIPTION_TEXT)
    console.log(`✓ Deskripsi resmi panduan konsul berhasil dipasang pada grup!`)
  } catch (err) {
    console.warn('⚠️ Gagal memasang deskripsi grup:', err.message)
  }

  botConfig.brandedGroupId = groupId
  saveBotConfig()
}

function isValidWaName(candidate) {
  if (!candidate || candidate.length < 2 || candidate.length > 40) return false
  const lower = candidate.toLowerCase().trim()
  const BAD_TERMS = [
    'igd', 'atas nama', 'atas', 'nama', 'pasien', 'konsul', 'mohon', 'izin', 'dokter', 'perawat',
    'bidan', 'jaga', 'ruangan', 'bangsal', 'suhu', 'temp', 'temperature', 'tensi', 'td', 'nadi',
    'hr', 'rr', 'respirasi', 'spo2', 'gcs', 'ku', 'gda', 'gds', 'subjektif', 'objektif',
    'assessment', 'planning', 'terapi', 'ttv', 'bpjs', 'umum', 'asuransi', 'inhealth', 'rujukan',
    'muntah', 'mual', 'thorax', 'foto thorax', 'cor', 'paru', 'pulmo', 'rontgen', 'ekg', 'lab',
    'darah', 'infus', 'injeksi', 'pulang', 'rujuk', 'kanan', 'kiri', 'ap', 'pa', 'pemeriksaan', 'hasil'
  ]
  if (BAD_TERMS.some((term) => lower === term || lower.startsWith(term + ' ') || lower.endsWith(' ' + term) || lower.includes(' atas nama') || lower.includes('igd '))) {
    return false
  }
  if (/[:()[\]{}=0-9]/.test(candidate)) return false
  return true
}

function extractWaPatientInfo(text) {
  if (!text || typeof text !== 'string') return { title: '', nama_depan: '', usia: '', no_rm: '', jaminan: '' }

  let title = ''
  let nama_depan = ''
  let usia = ''
  let no_rm = ''
  let jaminan = ''

  const lines = text.split(/\r?\n/)

  // 1. Cek baris bergaris miring (format standar konsul medis: "*Tn Suyanto / 69 th / BPJS*")
  for (const line of lines) {
    const rawClean = line.replace(/[*_~#]/g, '').trim()
    if (!rawClean.includes('/')) continue
    if (/(?:^|\s)\[\d{1,2}[/-]\d{1,2}/.test(line) || /https?:\/\//i.test(line)) continue
    // Abaikan baris TTV misal "TD 120/80" atau temuan fisik
    if (/^\s*(?:td|tensi|ttv|vital|suhu|temp|nadi|hr|rr|spo2)\b/i.test(rawClean) || /^\s*\d{2,3}\/\d{2,3}\b/i.test(rawClean)) continue

    // Baris bergaris miring HANYA valid sebagai identitas pasien jika memiliki usia, jaminan, gelar, atau No RM
    const hasDemographicMarker = /\b\d{1,3}\s*(?:th|thn|tahun|yo|bln|bulan)\b/i.test(rawClean) ||
      /\b(bpjs|umum|jkn|kis|asuransi|inhealth|pbi)\b/i.test(rawClean) ||
      /\b(tn|ny|sdri|sdr|an|by)\b/i.test(rawClean) ||
      /\b(?:no\.?\s*rm|rm)\b/i.test(rawClean)
    if (!hasDemographicMarker) continue

    const cleanLine = rawClean.replace(/^(?:(?:pasien\s+(?:igd|bangsal|ruangan|[A-Za-z0-9\s]+?)\s+)?(?:atas\s*nama|a\s*[\/.]\s*n|an\.)\s*[:=–-]?\s*)/i, '').trim()
    const segs = cleanLine
      .split('/')
      .map((s) => s.trim().replace(/^(?:(?:atas\s*nama|a\s*[\/.]\s*n|an\.|n)\s+)/i, '').trim())
      .filter(Boolean)
    if (segs.length < 2) continue

    for (const seg of segs) {
      // Usia
      const ageM = seg.match(/\b(\d{1,3})\s*(?:th|thn|tahun|bln|bulan|hari|yo)\b/i)
      if (ageM && !usia) {
        const n = parseInt(ageM[1], 10)
        if (n > 0 && n <= 125) {
          usia = `${n} th`
          continue
        }
      }

      // Jaminan
      const jmM = seg.match(/\b(BPJS(?:[\s\w]*)|JKN|KIS|PBI|Non-PBI|Umum|Asuransi|Inhealth)\b/i)
      if (jmM && !jaminan) {
        const jm = jmM[1].toUpperCase()
        if (jm.includes('BPJS') || jm.includes('JKN') || jm.includes('KIS') || jm.includes('PBI')) jaminan = 'BPJS'
        else if (jm.includes('UMUM')) jaminan = 'Umum'
        else if (jm.includes('ASURANSI') || jm.includes('INHEALTH')) jaminan = 'Asuransi'
        continue
      }

      // No RM
      const rmM = seg.match(/\b(?:no\.?\s*rm|rm)?\s*([0-9]{2}[-./][0-9]{2}[-./][0-9]{2}|[0-9]{4,10})\b/i)
      if (rmM && !no_rm && /[-./]|\d{5,}/.test(rmM[1])) {
        no_rm = rmM[1].trim()
        continue
      }

      // Gender token (L/P)
      if (/^(?:l|p|laki-laki|perempuan|pria|wanita)$/i.test(seg)) continue

      // Nama pasien
      if (!nama_depan) {
        const titleM = seg.match(/^(dr|dok|dokter|Tn|Ny|Sdri|Sdr|An|By)\.?\s*(.+)$/i)
        let cGelar = ''
        let cNama = seg
        if (titleM) {
          cGelar = titleM[1].toLowerCase()
          cNama = titleM[2].trim()
        } else {
          cNama = cNama.replace(/^(?:nama(?:\s*pasien)?|pasien|px|identitas)\s*[:-]?\s*/i, '').trim()
        }
        cNama = cNama.replace(/\b(?:usia|umur|th|thn|tahun|rm|no\.?\s*rm)\b.*$/i, '').trim()
        if (isValidWaName(cNama)) {
          if (cGelar) {
            title = (cGelar === 'dr' || cGelar === 'dok' || cGelar === 'dokter')
              ? 'dr.'
              : cGelar.charAt(0).toUpperCase() + cGelar.slice(1) + (titleM[1].endsWith('.') ? '' : '.')
          }
          nama_depan = cNama.replace(/[/,*_–—|]/g, '').trim()
        }
      }
    }
  }

  // 2. Cek label "atas nama", "a.n.", "a/n", "nama:", "pasien:"
  if (!nama_depan) {
    const anMatch = text.match(/(?:(?:pasien\s+(?:igd|bangsal|ruangan|[A-Za-z0-9\s]+?)\s+)?(?:atas\s*nama|a\s*[\/.]\s*n|an\.|nama(?:\s*pasien)?|identitas)\s*[:=–-]?\s*[*_~#]*\s*)(?:(dr|dok|dokter|Tn|Ny|Sdri|Sdr|An|By)\.?\s*)?([A-Za-z][A-Za-z'.-]+(?:[ \t]+[A-Za-z'.-]+){0,3})/i)
    if (anMatch) {
      const cGelar = anMatch[1]
      let cNama = anMatch[2].trim()
      cNama = cNama.replace(/\b(?:usia|umur|th|thn|tahun|rm|no\.?\s*rm)\b.*$/i, '').trim()
      if (isValidWaName(cNama)) {
        if (cGelar) {
          title = cGelar.charAt(0).toUpperCase() + cGelar.slice(1).toLowerCase() + (cGelar.endsWith('.') ? '' : '.')
        }
        nama_depan = cNama
      }
    }
  }

  // 3. Fallback gelar mandiri di teks (mis. "*Tn Suyanto*", "Ny. Siti")
  if (!nama_depan) {
    for (const line of lines) {
      if (/dokter\s*(?:jaga|spesialis|ruangan|igd|konsulen|dpjp)|pemeriksa\s*:|asal\s*rujukan|mohon\s*ijin|mohon\s*izin/i.test(line)) continue
      const titleM = line.match(/[*_~#]*\s*\b(dr|dok|dokter|Tn|Ny|Sdri|Sdr|An|By)\.?\s*([A-Za-z'.-]+(?:[ \t]+[A-Za-z'.-]+){0,3})/i)
      if (titleM) {
        const cGelar = titleM[1].toLowerCase()
        let cNama = titleM[2].replace(/[/,*_–—|]/g, '').trim()
        cNama = cNama.replace(/\b(?:usia|umur|th|thn|tahun|rm|no\.?\s*rm)\b.*$/i, '').trim()
        if (isValidWaName(cNama)) {
          title = (cGelar === 'dr' || cGelar === 'dok' || cGelar === 'dokter')
            ? 'dr.'
            : cGelar.charAt(0).toUpperCase() + cGelar.slice(1) + (titleM[1].endsWith('.') ? '' : '.')
          nama_depan = cNama
          break
        }
      }
    }
  }

  // 4. Fallback usia & RM jika belum terdeteksi dari baris slash
  if (!usia) {
    const uM = text.match(/\b(\d{1,3})\s*(?:th|thn|tahun|yo|bulan)\b/i)
    if (uM) {
      const n = parseInt(uM[1], 10)
      if (n > 0 && n <= 125) usia = `${n} th`
    }
  }
  if (!no_rm) {
    const rM = text.match(/(?:RM|No\.?\s*RM|Rekam\s*Medis)\s*[:\.]?\s*([0-9\-\.\/]{4,15})/i)
    if (rM) no_rm = rM[1].trim()
  }

  return { title, nama_depan, usia, no_rm, jaminan }
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
        console.log(`🔒 Mode Khusus: HANYA Grup "${CLINICAL_GROUP_NAME}" Aktif!`)
        console.log(`=====================================================`)

        // Inisialisasi & sinkronisasi grup klinis resmi "Doctobot by Doctoid"
        try {
          const allGroups = await sock.groupFetchAllParticipating()
          console.log(`📋 Membaca total ${Object.keys(allGroups).length} grup WhatsApp yang diikuti dokter...`)

          let targetGroupId = null
          let currentSubject = ''

          // 1. Cek apakah clinicalGroupId yang tersimpan masih ada di daftar grup
          if (botConfig.clinicalGroupId && allGroups[botConfig.clinicalGroupId]) {
            targetGroupId = botConfig.clinicalGroupId
            currentSubject = allGroups[targetGroupId].subject || ''
            console.log(`🎯 Menggunakan grup konsulan terdaftar: "${currentSubject}" (${targetGroupId})`)
          } else {
            // 2. Jika belum tersimpan, cari grup yang sudah dibuat sebelumnya (Doctobot by Doctoid, Doctobot, atau Doctoid)
            for (const [id, meta] of Object.entries(allGroups)) {
              const subj = (meta.subject || '').trim().toLowerCase()
              if (subj === 'doctobot by doctoid' || subj === 'doctobot' || subj === 'doctoid') {
                targetGroupId = id
                currentSubject = meta.subject || ''
                console.log(`🎯 Menemukan grup yang sudah ada: "${meta.subject}" (${id}) -> Ditetapkan sebagai grup resmi!`)
                break
              }
            }
          }

          // 3. Jika belum ada sama sekali, buatkan grup baru
          if (!targetGroupId) {
            console.log(`\n✨ Belum ada grup Doctobot di WhatsApp dokter. Membuat grup "${CLINICAL_GROUP_NAME}" otomatis...`)
            try {
              const myCleanJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : ''
              const participants = myCleanJid ? [myCleanJid] : []
              const newGroup = await sock.groupCreate(CLINICAL_GROUP_NAME, participants)
              targetGroupId = newGroup.id
              currentSubject = CLINICAL_GROUP_NAME
              console.log(`🎉 Grup "${CLINICAL_GROUP_NAME}" baru berhasil dibuat! (ID: ${newGroup.id})`)

              await sock.sendMessage(newGroup.id, {
                text: `🩺 *Grup Konsul Medis Doctobot by Docto.id Aktif!*\n\nSelamat datang dokter! Teruskan (forward) pesan konsulan pasien, foto penunjang/lab/EKG, atau video ke grup ini.\n\nSemua pesan di grup ini akan otomatis disaring dan disinkronkan ke rekam medis aplikasi Docto.id.`,
              })
            } catch (err) {
              console.warn('Gagal membuat grup otomatis saat login:', err.message)
            }
          }

          // 4. Kunci ID grup ini ke config & pasang branding resmi (Logo, Deskripsi, Nama)
          if (targetGroupId) {
            botConfig.clinicalGroupId = targetGroupId
            botConfig.clinicalGroupName = CLINICAL_GROUP_NAME
            saveBotConfig()
            botState.clinicalGroupId = targetGroupId
            botState.clinicalGroupName = CLINICAL_GROUP_NAME
            broadcastState()

            // Modifikasi grup HANYA jika target grup belum pernah dibranding sama sekali
            if (botConfig.brandedGroupId !== targetGroupId) {
              await setupDoctoGroupBranding(targetGroupId, currentSubject)
            }
          }
        } catch (err) {
          console.warn('Gagal membaca/mengatur grup klinis:', err.message)
        }
      }
    })

    // Listener Pesan Masuk (STRICT: EKSKLUSIF HANYA Grup Doctobot!)
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

        // STRICT FILTERING: HANYA terima jika berasal dari grup klinis resmi yang terdaftar!
        // Grup manajemen Doctoid, koordinasi tim dev, bisnis, atau grup lain apapun 100% DIABAIKAN!
        if (!botConfig.clinicalGroupId || senderJid !== botConfig.clinicalGroupId) {
          continue
        }

        const participantJid = msg.key.participant || msg.participant || ''
        const participantPhone = participantJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')
        const remotePhone = senderJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '')

        const groupName = botConfig.clinicalGroupName || 'Doctobot by Doctoid'
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
        let mediaUrl = ''
        let mediaType = ''
        let mediaName = 'lampiran'

        try {
          if (isImage || isVideo || isAudio || isDoc) {
            const buffer = await downloadMediaMessage(msg, 'buffer', {})
            const b64 = buffer.toString('base64')

            if (isImage) {
              const fileId = `${Date.now()}_${Math.random().toString(36).substring(7)}`
              const fileName = `Foto_${fileId}.webp`
              mediaName = fileName
              mediaType = 'image/webp'

              const mediaDir = path.join(PUBLIC_DIR, 'media')
              if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })
              const filePath = path.join(mediaDir, fileName)

              try {
                // Simpan berkas WebP Full-HD di server (1600px q82) - sangat jernih setara original WhatsApp!
                const highResWebp = await sharp(buffer)
                  .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 82 })
                  .toBuffer()

                fs.writeFileSync(filePath, highResWebp)
                mediaUrl = `http://35.255.95.161:3001/media/${fileName}`
                console.log(`✓ Foto Full-HD WebP berhasil disimpan ke disk server: ${fileName} (${(highResWebp.length/1024).toFixed(0)} KB)`)

                // Buat dataUrl WebP yang tajam (1080px q72) untuk antrean konsulan
                const previewWebp = await sharp(highResWebp)
                  .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 72 })
                  .toBuffer()
                mediaDataUrl = `data:image/webp;base64,${previewWebp.toString('base64')}`
              } catch (e) {
                console.warn('Kompresi webp gagal, fallback ke jpeg:', e.message)
                mediaType = 'image/jpeg'
                mediaDataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`
              }
            } else if (isVideo) {
              mediaType = unwrap.videoMessage.mimetype || 'video/mp4'
              const vFile = `video_${Date.now()}.mp4`
              mediaName = 'Video_Pemeriksaan.mp4'
              const mediaDir = path.join(PUBLIC_DIR, 'media')
              if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })
              try {
                fs.writeFileSync(path.join(mediaDir, vFile), buffer)
                console.log(`✓ Video berhasil disimpan ke disk server: ${vFile} (${(buffer.length/1024/1024).toFixed(1)} MB)`)
                mediaUrl = `http://35.255.95.161:3001/media/${vFile}`
              } catch (err) {
                console.error('Gagal menulis berkas video ke disk:', err.message)
              }
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

        // Deteksi apakah pengirim pesan adalah dokter sendiri
        const isFromDoctor = Boolean(msg.key.fromMe || (participantPhone && participantPhone === myPhone))

        // Ekstraksi otomatis identitas pasien klinis secara cerdas
        const parsedInfo = extractWaPatientInfo(textContent)
        const extractedName = parsedInfo.nama_depan

        // Cek apakah pesan ini membawa identitas pasien baru (awalan konsulan baru)
        const hasNewPatientHeader = Boolean(
          extractedName ||
          /(?:mohon izin konsul|izin konsul|konsul pasien|pasien baru|identitas pasien)\b/i.test(textContent) ||
          /(?:subjektif|keluhan utama|rps)\s*[:\.]/i.test(textContent)
        )

        const parsedData = {
          title: parsedInfo.title || '',
          nama_depan: extractedName,
          no_rm: parsedInfo.no_rm || '',
          usia: parsedInfo.usia || '',
          jaminan: parsedInfo.jaminan || '',
        }

        const inboxItem = {
          id: Date.now(),
          source: 'whatsapp',
          sender_name: senderName,
          sender_phone: participantPhone || myPhone || remotePhone,
          raw_text: textContent,
          parsed_data: parsedData,
          attachments: (mediaDataUrl || mediaUrl)
            ? [
                {
                  id: Math.random().toString(36).substring(7),
                  name: mediaName,
                  type: mediaType,
                  dataUrl: mediaDataUrl,
                  url: mediaUrl,
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

          // CLUSTERING PINTAR GRUP KLINIS:
          // Gabungkan jika ada balasan dokter (advis/terapi), foto lanjutan, atau chat lanjutan dalam 20 menit terakhir
          const now = Date.now()
          const recentItem = inboxList.find((it) => {
            if (it.status !== 'pending') return false
            const diffMs = now - new Date(it.created_at).getTime()
            if (diffMs > 20 * 60 * 1000) return false // Jendela 20 menit agar dokter leluasa membaca & membalas

            // A. JIKA PESAN BARU MEMBAWA IDENTITAS PASIEN (Awalan konsul baru atau nama pasien tertera):
            if (hasNewPatientHeader || extractedName) {
              // Jika item aktif sebelumnya belum memiliki nama pasien & teksnya minim (misal foto dikirim duluan):
              if (!it.parsed_data?.nama_depan && (!it.raw_text || it.raw_text.length < 30)) {
                return true // Isi item tersebut dengan identitas pasien ini
              }
              // Jika kedua pesan membawa nama pasien:
              if (extractedName && it.parsed_data?.nama_depan) {
                const normNew = extractedName.toLowerCase().replace(/[^a-z]/g, '')
                const normOld = it.parsed_data.nama_depan.toLowerCase().replace(/[^a-z]/g, '')
                if (normNew === normOld) {
                  return true // Pasien yang sama persis
                }
              }
              // Jika nama berbeda ATAU membawa header konsul baru: JANGAN DIGABUNG! Wajib jadi pasien baru terpisah!
              return false
            }

            // B. JIKA PESAN TANPA IDENTITAS PASIEN BARU:
            // 1. Pesan balasan dokter (advis / terapi): gabungkan ke konsulan aktif terakhir
            if (isFromDoctor) return true

            // 2. Kiriman foto / media lanjutan (lampiran lab, EKG, rontgen): gabungkan
            if (mediaDataUrl) return true

            // 3. Chat teks lanjutan singkat dari pengirim yang sama (misal info tambahan)
            return it.sender_phone === inboxItem.sender_phone
          })

          if (recentItem) {
            if (!recentItem.raw_text && inboxItem.raw_text) {
              recentItem.raw_text = inboxItem.raw_text
              if (inboxItem.parsed_data?.nama_depan) recentItem.parsed_data = inboxItem.parsed_data
            } else if (inboxItem.raw_text) {
              // Tambahkan teks baru (advis dokter atau chat lanjutan) dengan pemisah baris rapi
              if (isFromDoctor && !recentItem.raw_text.includes('*Jawaban / Advis Dokter:*')) {
                recentItem.raw_text += '\n\n---\n*Jawaban / Advis Dokter:*\n' + inboxItem.raw_text
              } else {
                recentItem.raw_text += '\n\n' + inboxItem.raw_text
              }

              // Jika item sebelumnya belum punya nama/usia/no_rm atau membawa nama keliru, update
              if (!recentItem.parsed_data) recentItem.parsed_data = {}
              if (inboxItem.parsed_data?.title && !recentItem.parsed_data.title) {
                recentItem.parsed_data.title = inboxItem.parsed_data.title
              }
              if (
                inboxItem.parsed_data?.nama_depan &&
                (!recentItem.parsed_data.nama_depan || /atas nama|igd/i.test(recentItem.parsed_data.nama_depan))
              ) {
                recentItem.parsed_data.nama_depan = inboxItem.parsed_data.nama_depan
              }
              if (inboxItem.parsed_data?.usia && !recentItem.parsed_data.usia) {
                recentItem.parsed_data.usia = inboxItem.parsed_data.usia
              }
              if (inboxItem.parsed_data?.no_rm && !recentItem.parsed_data.no_rm) {
                recentItem.parsed_data.no_rm = inboxItem.parsed_data.no_rm
              }
              if (inboxItem.parsed_data?.jaminan && !recentItem.parsed_data.jaminan) {
                recentItem.parsed_data.jaminan = inboxItem.parsed_data.jaminan
              }
            }
            if (inboxItem.attachments && inboxItem.attachments.length > 0) {
              const curAtts = recentItem.attachments || []
              for (const newAtt of inboxItem.attachments) {
                // Jangan deteksi duplikat hanya dari slice(0, 80) karena semua header WebP/JPEG identik!
                const isDup = curAtts.some((a) => {
                  if (a.id && newAtt.id && a.id === newAtt.id) return true
                  if (a.url && newAtt.url && a.url === newAtt.url) return true
                  if (!a.dataUrl || !newAtt.dataUrl) return false
                  if (a.dataUrl === newAtt.dataUrl) return true
                  return a.dataUrl.length === newAtt.dataUrl.length && a.dataUrl.slice(-120) === newAtt.dataUrl.slice(-120)
                })
                if (!isDup && curAtts.length < 25) {
                  curAtts.push(newAtt)
                }
              }
              recentItem.attachments = curAtts
            }
            recentItem.updated_at = new Date().toISOString()
            console.log(`✓ Pesan/lampiran/advis berhasil digabungkan ke konsulan pasien [${recentItem.parsed_data?.nama_depan || 'Aktif'}]! Total lampiran: ${recentItem.attachments.length}`)
          } else {
            inboxList.unshift(inboxItem)
            console.log(`✓ Konsulan WhatsApp baru [${inboxItem.parsed_data?.nama_depan || 'Pasien'}] berhasil dicatat ke antrean inbox!`)
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
          triggerFcmNotificationDebounced(recentItem || inboxItem, 300)
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

    // Ambil maksimal 15 item pending
    let pendingItems = inboxList
      .filter((i) => i.status === 'pending')
      .slice(0, 15)
      .map((it) => JSON.parse(JSON.stringify(it)))

    function buildPayload(items) {
      return {
        fields: {
          items: {
            arrayValue: {
              values: items.map(toFirestoreValue),
            },
          },
          updatedAt: {
            integerValue: String(Date.now()),
          },
        },
      }
    }

    let payload = buildPayload(pendingItems)
    let payloadStr = JSON.stringify(payload)

    // Jaminan Lampiran Anti-Rusak & Batas Dokumen Firestore 1MB:
    // Selalu sertakan dataUrl WebP terkompresi efisien (~25-35KB per foto) agar foto BISA DIBUKA LANGSUNG
    // di HP APK maupun browser tanpa risiko kegagalan koneksi HTTP, mixed-content, atau firewall port operator seluler.
    for (const it of pendingItems) {
      if (it.attachments) {
        for (const a of it.attachments) {
          if (!a.dataUrl && a.url) {
            try {
              const fName = path.basename(a.url)
              const localPath = path.join(PUBLIC_DIR, 'media', fName)
              if (fs.existsSync(localPath)) {
                const fBuf = fs.readFileSync(localPath)
                const comp = await sharp(fBuf)
                  .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 65 })
                  .toBuffer()
                a.dataUrl = `data:image/webp;base64,${comp.toString('base64')}`
              }
            } catch {}
          } else if (a.dataUrl && a.dataUrl.length > 45000) {
            try {
              const b64 = a.dataUrl.split(',')[1]
              if (b64) {
                const buf = Buffer.from(b64, 'base64')
                const comp = await sharp(buf)
                  .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 65 })
                  .toBuffer()
                a.dataUrl = `data:image/webp;base64,${comp.toString('base64')}`
              }
            } catch {}
          }
        }
      }
    }
    payload = buildPayload(pendingItems)
    payloadStr = JSON.stringify(payload)

    // Jika total payload masih > 850KB, batasi jumlah pasien pending menjadi 5 pasien teratas
    if (payloadStr.length > 850000 && pendingItems.length > 5) {
      pendingItems = pendingItems.slice(0, 5)
      payload = buildPayload(pendingItems)
      payloadStr = JSON.stringify(payload)
    }

    // Tulis ke dokumen terisolasi khusus inbox WhatsApp: doctoid/inbox_{USER_UID} (Jaminan aman < 1MB)
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/doctoid/inbox_${USER_UID}`

    let res = await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: payloadStr,
    })

    // Fallback darurat jika ukuran masih mendekati limit
    if (!res.ok) {
      console.warn('⚠️ Firestore menolak payload utama, mencoba fallback terkompresi...')
      for (let i = 1; i < pendingItems.length; i++) {
        if (pendingItems[i].attachments && pendingItems[i].attachments.length > 2) {
          pendingItems[i].attachments = pendingItems[i].attachments.slice(0, 2)
        }
      }
      const fallbackPayloadStr = JSON.stringify(buildPayload(pendingItems))
      res = await fetch(firestoreUrl, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: fallbackPayloadStr,
      })
    }

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

function fromFirestoreVal(val) {
  if (!val) return null
  if ('stringValue' in val) return val.stringValue
  if ('integerValue' in val) return Number(val.integerValue)
  if ('doubleValue' in val) return val.doubleValue
  if ('booleanValue' in val) return val.booleanValue
  if ('nullValue' in val) return null
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFirestoreVal)
  if ('mapValue' in val) {
    const res = {}
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFirestoreVal(v)
    }
    return res
  }
  return val
}

async function repairCloudNotes() {
  const accessToken = await getAccessToken()
  if (!accessToken) return { error: 'No access token' }

  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/users/${USER_UID}`
  const snapRes = await fetch(firestoreUrl, {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  if (!snapRes.ok) return { error: 'Failed to fetch user doc: ' + snapRes.statusText }

  const docData = await snapRes.json()
  const rawTables = docData.fields?.tables?.mapValue?.fields
  if (!rawTables) return { error: 'No tables found in user doc' }

  const tables = {}
  for (const [k, v] of Object.entries(rawTables)) {
    tables[k] = fromFirestoreVal(v) || []
  }

  let inboxList = []
  if (fs.existsSync(INBOX_JSON_PATH)) {
    try {
      inboxList = JSON.parse(fs.readFileSync(INBOX_JSON_PATH, 'utf-8'))
    } catch {}
  }

  // Bangun media cache dari memory inboxList dan disk
  const mediaMap = new Map()
  for (const it of inboxList) {
    for (const att of it.attachments || []) {
      if (att.dataUrl && att.dataUrl.startsWith('data:image/')) {
        if (att.name) mediaMap.set(att.name, att.dataUrl)
        if (att.url) mediaMap.set(att.url, att.dataUrl)
      }
    }
  }

  const mediaDir = path.join(PUBLIC_DIR, 'media')
  async function resolveDataUrl(att) {
    if (att.name && mediaMap.has(att.name)) return mediaMap.get(att.name)
    if (att.url && mediaMap.has(att.url)) return mediaMap.get(att.url)

    // Coba baca dari disk server
    const candidateName = att.name || (att.url ? path.basename(att.url) : null)
    if (candidateName) {
      const diskPath = path.join(mediaDir, candidateName)
      if (fs.existsSync(diskPath)) {
        try {
          const buf = fs.readFileSync(diskPath)
          const comp = await sharp(buf)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 65 })
            .toBuffer()
          const dUrl = `data:image/webp;base64,${comp.toString('base64')}`
          mediaMap.set(candidateName, dUrl)
          return dUrl
        } catch {}
      }
    }
    return null
  }

  let repairedCount = 0

  // 1. Periksa progressNotes
  if (Array.isArray(tables.progressNotes)) {
    for (const note of tables.progressNotes) {
      if (Array.isArray(note.attachments)) {
        for (const att of note.attachments) {
          if (!att.dataUrl || att.dataUrl.length === 0) {
            const found = await resolveDataUrl(att)
            if (found) {
              att.dataUrl = found
              repairedCount++
            }
          }
        }
      }
    }
  }

  // 2. Periksa penunjang
  if (Array.isArray(tables.penunjang)) {
    for (const pen of tables.penunjang) {
      if (Array.isArray(pen.attachments)) {
        for (const att of pen.attachments) {
          if (!att.dataUrl || att.dataUrl.length === 0) {
            const found = await resolveDataUrl(att)
            if (found) {
              att.dataUrl = found
              repairedCount++
            }
          }
        }
      }
    }
  }

  if (repairedCount > 0) {
    console.log(`[CloudRepair] Memperbaiki ${repairedCount} lampiran di Cloud Firestore users/${USER_UID}...`)
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

    const payload = {
      fields: {
        tables: toFirestoreValue(tables),
        updatedAt: { integerValue: String(Date.now()) },
      },
    }

    const patchUrl = `https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/users/${USER_UID}?updateMask.fieldPaths=tables&updateMask.fieldPaths=updatedAt`
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!patchRes.ok) {
      const errJson = await patchRes.json().catch(() => ({}))
      console.error('[CloudRepair] Gagal patch:', errJson)
      return { error: 'Patch failed: ' + (errJson.error?.message || patchRes.statusText), repairedCount }
    }

    console.log(`[CloudRepair] ✓ Berhasil memperbarui dokumen Firestore! Realtime sync akan memuat gambar di semua perangkat.`)
    return { success: true, repairedCount }
  }

  return { success: true, repairedCount: 0, message: 'Tidak ada lampiran rusak yang perlu diperbaiki' }
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

    const titlePrefix = item.parsed_data?.title ? `${item.parsed_data.title} ` : ''
    const patientName = item.parsed_data?.nama_depan
      ? `${titlePrefix}${item.parsed_data.nama_depan}`.trim()
      : item.sender_name || 'Konsul Pasien Baru'
    const rawAge = item.parsed_data?.usia || ''
    const formattedAge = rawAge ? ` (${rawAge.replace(/\s*tahun/i, ' th').trim()})` : ''
    const title = `${patientName}${formattedAge}`.trim()
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
              title: title,
              body: snippet,
            },
            android: {
              priority: 'HIGH',
              ttl: '300s',
              notification: {
                tag: 'wa_inbox_' + (item.id || 'active'),
                icon: 'ic_stat_doctoid',
                color: '#0D9488',
                channel_id: 'wa_inbox_channel',
                sound: 'default',
                default_vibrate_timings: true,
                default_sound: true,
                notification_priority: 'PRIORITY_MAX',
                visibility: 'PUBLIC',
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
          if (errData.error?.status !== 'NOT_FOUND' && errData.error?.details?.[0]?.errorCode !== 'UNREGISTERED' && errData.error?.details?.[0]?.errorCode !== 'INVALID_ARGUMENT') {
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
function triggerFcmNotificationDebounced(item, delayMs = 300) {
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

  // GET/HEAD /media/:file (Streaming video & berkas foto/media klinis)
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/media/')) {
    const fileName = path.basename(url.pathname)
    const filePath = path.join(PUBLIC_DIR, 'media', fileName)

    if (!fs.existsSync(filePath)) {
      // Rekonstruksi otomatis jika berkas belum ada di disk tapi tersimpan di inbox dataUrl
      let curInbox = []
      if (fs.existsSync(INBOX_JSON_PATH)) {
        try { curInbox = JSON.parse(fs.readFileSync(INBOX_JSON_PATH, 'utf-8')) } catch {}
      }
      const matchedAtt = curInbox.flatMap((it) => it.attachments || []).find((a) => {
        return (a.url && a.url.endsWith(fileName)) || a.name === fileName || (a.id && fileName.includes(a.id))
      })
      if (matchedAtt && matchedAtt.dataUrl && matchedAtt.dataUrl.includes('base64,')) {
        try {
          const b64 = matchedAtt.dataUrl.split('base64,')[1]
          if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true })
          fs.writeFileSync(filePath, Buffer.from(b64, 'base64'))
          console.log(`✓ Berhasil merekonstruksi media file dari cache dataUrl: ${fileName}`)
        } catch (e) {
          console.warn('Gagal rekonstruksi media:', e.message)
        }
      }
    }

    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath)
      const ext = path.extname(fileName).toLowerCase()
      const mimeTypes = {
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.opus': 'audio/ogg',
        '.ogg': 'audio/ogg',
        '.pdf': 'application/pdf',
      }
      const contentType = mimeTypes[ext] || 'application/octet-stream'

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
        })
        res.end()
        return
      }

      const range = req.headers.range
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
        const chunksize = end - start + 1
        const fileStream = fs.createReadStream(filePath, { start, end })
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        })
        fileStream.pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
        })
        fs.createReadStream(filePath).pipe(res)
      }
      return
    }
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' })
    res.end('Media Not Found')
    return
  }

  // GET /api/repair-cloud-notes
  if (req.method === 'GET' && url.pathname === '/api/repair-cloud-notes') {
    try {
      const result = await repairCloudNotes()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

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

  // POST /api/inbox/set (Perbarui seluruh antrean inbox)
  if (req.method === 'POST' && url.pathname === '/api/inbox/set') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        const { items } = JSON.parse(body || '{}')
        if (Array.isArray(items)) {
          fs.writeFileSync(INBOX_JSON_PATH, JSON.stringify(items, null, 2), 'utf-8')
          const distInbox = path.join(ROOT_DIR, 'dist', 'wa-inbox.json')
          try {
            if (fs.existsSync(path.dirname(distInbox))) {
              fs.writeFileSync(distInbox, JSON.stringify(items, null, 2), 'utf-8')
            }
          } catch {}
          await syncInboxToFirestore(items)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, count: items?.length || 0 }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /api/inbox/dismiss (Abaikan item spesifik atau semua)
  if (req.method === 'POST' && (url.pathname === '/api/inbox/dismiss' || url.pathname === '/api/inbox/clear')) {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        const { id, all } = JSON.parse(body || '{}')
        let inboxList = []
        if (fs.existsSync(INBOX_JSON_PATH)) {
          try {
            inboxList = JSON.parse(fs.readFileSync(INBOX_JSON_PATH, 'utf-8'))
          } catch {}
        }

        if (all || url.pathname === '/api/inbox/clear') {
          inboxList = []
        } else if (id) {
          inboxList = inboxList.filter(
            (it) => String(it.id) !== String(id) && it.created_at !== String(id)
          )
        }

        fs.writeFileSync(INBOX_JSON_PATH, JSON.stringify(inboxList, null, 2), 'utf-8')
        const distInbox = path.join(ROOT_DIR, 'dist', 'wa-inbox.json')
        try {
          if (fs.existsSync(path.dirname(distInbox))) {
            fs.writeFileSync(distInbox, JSON.stringify(inboxList, null, 2), 'utf-8')
          }
        } catch {}

        try {
          await syncInboxToFirestore(inboxList)
        } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, count: inboxList.length }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
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

  // GET /api/groups (Daftar semua grup yang diikuti dokter)
  if (req.method === 'GET' && url.pathname === '/api/groups') {
    try {
      if (!sock || !botState.connected) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ groups: [], clinicalGroupId: botConfig.clinicalGroupId }))
        return
      }
      const allGroups = await sock.groupFetchAllParticipating()
      const list = Object.entries(allGroups).map(([id, meta]) => ({
        id,
        name: meta.subject,
        isClinical: id === botConfig.clinicalGroupId,
        participantsCount: meta.participants?.length || 0,
      }))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ groups: list, clinicalGroupId: botConfig.clinicalGroupId }))
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  // POST /api/sync-group-branding (Terapkan ulang Logo & Deskripsi Resmi ke grup aktif)
  if (req.method === 'POST' && url.pathname === '/api/sync-group-branding') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        if (!sock || !botState.connected || !botConfig.clinicalGroupId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'WhatsApp belum terhubung atau belum ada grup klinis terdaftar.' }))
          return
        }
        let customBuffer = null
        if (body) {
          try {
            const parsed = JSON.parse(body)
            if (parsed.iconBase64) {
              customBuffer = Buffer.from(parsed.iconBase64, 'base64')
            }
          } catch {}
        }
        await setupDoctoGroupBranding(botConfig.clinicalGroupId, '', customBuffer, true)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, message: 'Logo dan deskripsi grup berhasil diperbarui.' }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /api/set-clinical-group (Kunci grup tertentu sebagai saluran konsulan)
  if (req.method === 'POST' && url.pathname === '/api/set-clinical-group') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        const { groupId } = JSON.parse(body || '{}')
        if (!groupId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'groupId diperlukan.' }))
          return
        }
        botConfig.clinicalGroupId = groupId
        saveBotConfig()
        botState.clinicalGroupId = groupId
        broadcastState()
        await setupDoctoGroupBranding(groupId, '')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, clinicalGroupId: groupId }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /api/create-group (Buat grup Doctobot baru otomatis via tombol antarmuka)
  if (req.method === 'POST' && url.pathname === '/api/create-group') {
    if (!sock || !botState.connected) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'WhatsApp belum terhubung.' }))
      return
    }

    try {
      const myCleanJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : ''
      const participants = myCleanJid ? [myCleanJid] : []
      const newGroup = await sock.groupCreate(CLINICAL_GROUP_NAME, participants)

      botConfig.clinicalGroupId = newGroup.id
      botConfig.clinicalGroupName = CLINICAL_GROUP_NAME
      saveBotConfig()
      botState.clinicalGroupId = newGroup.id
      botState.clinicalGroupName = CLINICAL_GROUP_NAME
      broadcastState()

      // Terapkan logo & deskripsi resmi langsung
      await setupDoctoGroupBranding(newGroup.id, CLINICAL_GROUP_NAME)

      await sock.sendMessage(newGroup.id, {
        text: `🩺 *Grup Konsul Medis Doctobot by Docto.id Aktif!*\n\nSelamat datang dokter! Teruskan (forward) pesan konsulan pasien, foto penunjang/lab/EKG, atau video ke grup ini.\n\nSemua pesan di grup ini akan otomatis disaring dan disinkronkan ke rekam medis aplikasi Docto.id.`,
      })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, groupId: newGroup.id, name: CLINICAL_GROUP_NAME }))
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

async function sanitizeAndMigrateInbox() {
  const mediaDir = path.join(PUBLIC_DIR, 'media')
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })
  if (!fs.existsSync(INBOX_JSON_PATH)) return
  try {
    let inboxList = JSON.parse(fs.readFileSync(INBOX_JSON_PATH, 'utf-8'))
    let modified = false
    for (const it of inboxList) {
      // 1. Sanitasi identitas pasien (perbaiki jika sebelumnya keliru "IGD atas nama")
      if (!it.parsed_data?.nama_depan || /atas nama|igd/i.test(it.parsed_data.nama_depan)) {
        const info = extractWaPatientInfo(it.raw_text)
        if (info.nama_depan) {
          it.parsed_data = {
            ...(it.parsed_data || {}),
            title: info.title || it.parsed_data?.title || '',
            nama_depan: info.nama_depan,
            usia: info.usia || it.parsed_data?.usia || '',
            no_rm: info.no_rm || it.parsed_data?.no_rm || '',
            jaminan: info.jaminan || it.parsed_data?.jaminan || '',
          }
          modified = true
          console.log(`✓ Koreksi otomatis nama konsulan: "${info.nama_depan}" (${info.usia})`)
        }
      }

      // 2. Pastikan seluruh berkas lampiran tersimpan di disk media dan dataUrl selalu valid
      if (it.attachments) {
        for (const a of it.attachments) {
          const targetFileName = a.name || (a.url ? path.basename(a.url) : `Foto_${Date.now()}.webp`)
          const targetFilePath = path.join(mediaDir, targetFileName)

          // Jika berkas belum ada di disk tapi punya dataUrl base64, tulis ke disk sekarang
          if (!fs.existsSync(targetFilePath) && a.dataUrl && a.dataUrl.includes('base64,')) {
            try {
              const b64 = a.dataUrl.split('base64,')[1]
              if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })
              fs.writeFileSync(targetFilePath, Buffer.from(b64, 'base64'))
              a.url = `http://35.255.95.161:3001/media/${targetFileName}`
              modified = true
              console.log(`✓ Media direkonstruksi & ditulis ke disk server: ${targetFileName}`)
            } catch (err) {
              console.warn('Gagal menulis media ke disk:', err.message)
            }
          }

          // Jika a.url ada tetapi a.dataUrl kosong, buatkan preview dataUrl dari file lokal
          if (a.url && (!a.dataUrl || a.dataUrl.length === 0)) {
            try {
              const fName = path.basename(a.url)
              const filePath = path.join(mediaDir, fName)
              if (fs.existsSync(filePath)) {
                const fBuf = fs.readFileSync(filePath)
                const comp = await sharp(fBuf)
                  .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 65 })
                  .toBuffer()
                a.dataUrl = `data:image/webp;base64,${comp.toString('base64')}`
                modified = true
              }
            } catch {}
          }
        }
      }
    }
    if (modified) {
      fs.writeFileSync(INBOX_JSON_PATH, JSON.stringify(inboxList, null, 2), 'utf-8')
      const distInbox = path.join(ROOT_DIR, 'dist', 'wa-inbox.json')
      try {
        if (fs.existsSync(path.dirname(distInbox))) {
          fs.writeFileSync(distInbox, JSON.stringify(inboxList, null, 2), 'utf-8')
        }
      } catch {}
      console.log('✓ Seluruh data antrean konsulan WA & lampiran berhasil disanitasi & diperbaiki!')
    }
    // Sinkronkan antrean ke Cloud Firestore agar langsung terbaca di APK & Web
    await syncInboxToFirestore(inboxList).catch((err) => console.warn('Sync firestore inbox startup warning:', err.message))
  } catch (e) {
    console.warn('Sanitasi inbox error:', e.message)
  }
}

const PORT = 3001
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=====================================================`)
  console.log(`🩺 docto.id WA Gateway Controller berjalan di:`)
  console.log(`   http://localhost:${PORT}`)
  console.log(`   http://192.168.1.45:${PORT} (Akses dari HP via Wi-Fi)`)
  console.log(`=====================================================`)
  broadcastState()
  sanitizeAndMigrateInbox().catch(() => {})
  initBaileys()
})
