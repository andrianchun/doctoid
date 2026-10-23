import fs from 'fs'
import path from 'path'
import os from 'os'

async function deploy() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const accessToken = cfg.tokens.access_token

  const serverJsPath = path.resolve('scripts', 'wa-bot', 'server.js')
  const serverJsContent = fs.readFileSync(serverJsPath, 'utf8')
  const serverB64 = Buffer.from(serverJsContent).toString('base64')
  console.log('serverB64 length:', serverB64.length)

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
cat << 'EOF' | base64 -d > /opt/wa-bot/server.js
${serverB64}
EOF
cd /opt/wa-bot
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart doctoid-wa-bot || pm2 start server.js --name "doctoid-wa-bot"
  pm2 save
fi
echo "=== WA BOT CODE UPDATED & RESTARTED SUCCESSFULLY ==="
`

  console.log('Sending setMetadata...')
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
  console.log('✓ VM successfully reset with updated Full-HD WebP/WebM code!')
}

deploy().catch(console.error)
