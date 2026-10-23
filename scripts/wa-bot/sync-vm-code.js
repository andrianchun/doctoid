import fs from 'fs'
import path from 'path'
import os from 'os'

async function syncVM() {
  console.log('🚀 Menyiapkan pembaruan langsung server.js ke VM GCE...')

  const serverJsPath = path.resolve('scripts', 'wa-bot', 'server.js')
  const serverJsContent = fs.readFileSync(serverJsPath, 'utf8')
  const serverB64 = Buffer.from(serverJsContent).toString('base64')
  console.log('✓ server.js terbaca dan dikonversi ke base64 (' + serverB64.length + ' chars)')

  const iconB64Path = path.resolve('scripts', 'wa-bot', 'icon_b64.txt')
  const iconB64 = fs.existsSync(iconB64Path) ? fs.readFileSync(iconB64Path, 'utf8').trim() : ''

  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const accessToken = cfg.tokens.access_token

  // Ambil fingerprint metadata VM saat ini
  const getRes = await fetch(
    'https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot',
    {
      headers: { Authorization: 'Bearer ' + accessToken },
    }
  )
  const inst = await getRes.json()
  const fingerprint = inst.metadata.fingerprint

  // Buat script startup yang langsung menulis server.js terbaru dan merestart PM2
  const startupScript = `#!/bin/bash
set -e
echo "=== UPDATING DOCTOID WA BOT CODE ==="
mkdir -p /opt/wa-bot
cat << 'EOF' | base64 -d > /opt/wa-bot/server.js
${serverB64}
EOF
cat << 'EOF' | base64 -d > /opt/wa-bot/icon.jpg
${iconB64}
EOF

cd /opt/wa-bot
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart doctoid-wa-bot || pm2 start server.js --name "doctoid-wa-bot"
  pm2 save
fi
echo "=== WA BOT CODE UPDATED & RESTARTED SUCCESSFULLY ==="
`

  console.log('Mengupdate metadata startup-script di VM...')
  const setRes = await fetch(
    'https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot/setMetadata',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fingerprint,
        items: [{ key: 'startup-script', value: startupScript }],
      }),
      signal: AbortSignal.timeout(30000),
    }
  )
  console.log('setMetadata response status:', setRes.status)
  const setData = await setRes.json()
  if (setData.error) {
    console.error('❌ Gagal update metadata:', setData.error)
    return
  }
  console.log('✓ Metadata startup-script berhasil diperbarui!')

  // Reset instance agar menjalankan startup-script
  console.log('🔄 Mereset VM agar menerapkan kode bot baru...')
  const resetRes = await fetch(
    'https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot/reset',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
    }
  )
  const resetData = await resetRes.json()
  console.log('✓ VM sedang booting ulang dengan kode bot terbaru!')
}

syncVM().catch(console.error)
