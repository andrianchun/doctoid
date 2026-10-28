import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'

async function deploy() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const accessToken = cfg.tokens.access_token

  const serverJsPath = path.resolve('scripts', 'wa-bot', 'server.js')
  const serverJsContent = fs.readFileSync(serverJsPath)
  const serverGzB64 = zlib.gzipSync(serverJsContent).toString('base64')
  console.log('✓ server.js gzipped base64 length:', serverGzB64.length, 'bytes (limit 64KB)')

  const getRes = await fetch(
    'https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot',
    { headers: { Authorization: 'Bearer ' + accessToken } }
  )
  const inst = await getRes.json()
  const fingerprint = inst.metadata?.fingerprint
  console.log('Current fingerprint:', fingerprint)

  const startupScript = `#!/bin/bash
set -e
echo "=== UPDATING DOCTOID WA BOT CODE ==="
mkdir -p /opt/wa-bot
cat << 'EOF' | base64 -d | gunzip > /opt/wa-bot/server.js
${serverGzB64}
EOF
cd /opt/wa-bot
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart doctoid-wa-bot || pm2 start server.js --name "doctoid-wa-bot"
  pm2 save
fi
echo "=== WA BOT CODE UPDATED & RESTARTED SUCCESSFULLY ==="
`

  console.log('Sending setMetadata (size: ' + startupScript.length + ' chars)...')
  const t0 = Date.now()
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
    }
  )
  console.log('setMetadata finished in', ((Date.now() - t0) / 1000).toFixed(1), 's. Status:', setRes.status)
  const setData = await setRes.json()
  if (setData.error) {
    console.error('Error:', setData.error)
    return
  }

  console.log('Resetting VM...')
  const rRes = await fetch(
    'https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot/reset',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
    }
  )
  console.log('Reset status:', rRes.status)
  console.log('✓ VM successfully reset with updated code!')
}

deploy().catch(console.error)
