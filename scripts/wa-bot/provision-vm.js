import fs from 'fs'
import path from 'path'
import os from 'os'

async function provisionVM() {
  console.log('🚀 Memulai provisi Google Compute Engine VM (Always Free)...')

  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const accessToken = cfg.tokens.access_token

  const startupScript = `#!/bin/bash
set -e

# 1. Enable 2GB swap space (crucial for e2-micro 1GB RAM)
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Update packages & install Node.js 20 & build tools
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg tar

# NodeSource Node.js 20 LTS
if ! command -v node >/dev/null 2>&1; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi

# Install pm2 globally
npm install -g pm2

# 3. Create bot directory
mkdir -p /opt/wa-bot
cd /opt/wa-bot

# 4. Download bundle from Cloud Storage using instance service account token
TOKEN=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" -H "Metadata-Flavor: Google" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

curl -s -H "Authorization: Bearer $TOKEN" "https://storage.googleapis.com/storage/v1/b/docto-id-wa-assets/o/wa-bot-bundle.tar.gz?alt=media" -o wa-bot-bundle.tar.gz

tar -xzf wa-bot-bundle.tar.gz

# 5. Install dependencies
npm install --omit=dev

# 6. Setup auto-backup cron: sync .auth_session to Cloud Storage every 6 hours
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
(crontab -l 2>/dev/null; echo "0 */6 * * * /opt/wa-bot/backup_session.sh >/dev/null 2>&1") | crontab -

# 7. Start bot with PM2 and configure startup on boot
pm2 start server.js --name "doctoid-wa-bot"
pm2 save
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
`

  const vmPayload = {
    name: 'doctoid-wa-bot',
    machineType: 'zones/us-central1-a/machineTypes/e2-micro',
    disks: [
      {
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: 'projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts',
          diskSizeGb: '30',
          diskType: 'zones/us-central1-a/diskTypes/pd-standard',
        },
      },
    ],
    networkInterfaces: [
      {
        network: 'global/networks/default',
        accessConfigs: [
          {
            name: 'External NAT',
            type: 'ONE_TO_ONE_NAT',
          },
        ],
      },
    ],
    serviceAccounts: [
      {
        email: '1037044059481-compute@developer.gserviceaccount.com',
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
    ],
    tags: {
      items: ['wa-bot'],
    },
    metadata: {
      items: [
        {
          key: 'startup-script',
          value: startupScript,
        },
      ],
    },
  }

  console.log('Mengirim permintaan pembuatan VM ke Google Compute Engine...')
  const res = await fetch(
    'https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(vmPayload),
    }
  )

  const data = await res.json()
  if (data.error) {
    console.error('❌ Gagal membuat VM:', data.error.message)
    return
  }

  console.log('✓ Operasi pembuatan VM dimulai! ID Operasi:', data.name)
}

provisionVM().catch(console.error)
