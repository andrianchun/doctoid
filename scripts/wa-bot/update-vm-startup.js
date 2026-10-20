import fs from 'fs'
import path from 'path'
import os from 'os'

async function updateVM() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const accessToken = cfg.tokens.access_token

  // Get current fingerprint
  const getRes = await fetch(
    'https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot',
    {
      headers: { Authorization: 'Bearer ' + accessToken },
    }
  )
  const inst = await getRes.json()
  const fingerprint = inst.metadata.fingerprint

  const startupScript = `#!/bin/bash
set -e

# 1. Enable 2GB swap space
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Node.js check & pm2
export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

# 3. Create bot directory
mkdir -p /opt/wa-bot
cd /opt/wa-bot

# 4. Download bundle using node and metadata token
node -e "
const fs = require('fs');
async function run() {
  const tokRes = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' }
  });
  const tok = await tokRes.json();
  const fileRes = await fetch('https://storage.googleapis.com/storage/v1/b/docto-id-wa-assets/o/wa-bot-bundle.tar.gz?alt=media', {
    headers: { Authorization: 'Bearer ' + tok.access_token }
  });
  const buf = Buffer.from(await fileRes.arrayBuffer());
  fs.writeFileSync('wa-bot-bundle.tar.gz', buf);
  console.log('Downloaded bundle bytes:', buf.length);
}
run().catch(console.error);
"

tar -xzf wa-bot-bundle.tar.gz

# 5. Install dependencies
npm install --omit=dev

# 6. Setup auto-backup cron
cat << 'EOF' > /opt/wa-bot/backup_session.sh
#!/bin/bash
cd /opt/wa-bot
if [ -d ".auth_session" ]; then
  tar -czf /tmp/session_backup.tar.gz .auth_session
  TOKEN=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" -H "Metadata-Flavor: Google" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/gzip" --data-binary "@/tmp/session_backup.tar.gz" "https://storage.googleapis.com/upload/storage/v1/b/docto-id-wa-assets/o?uploadType=media&name=session_backup.tar.gz"
fi
EOF
chmod +x /opt/wa-bot/backup_session.sh
(crontab -l 2>/dev/null | grep -v backup_session; echo "0 */6 * * * /opt/wa-bot/backup_session.sh >/dev/null 2>&1") | crontab -

# 7. Start or restart with PM2
pm2 delete all || true
pm2 start server.js --name "doctoid-wa-bot"
pm2 save
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root || true

echo "=== DOCTOID WA BOT STARTED SUCCESSFULLY ==="
`

  console.log('Mengupdate metadata startup-script...')
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
  const setData = await setRes.json()
  console.log('Update metadata response:', setData.name || setData.error)

  // Reset instance to run the new startup script
  console.log('Mereset VM agar menjalankan startup-script baru...')
  const resetRes = await fetch(
    'https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot/reset',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken },
    }
  )
  const resetData = await resetRes.json()
  console.log('Reset instance response:', resetData.name || resetData.error)
}

updateVM().catch(console.error)
