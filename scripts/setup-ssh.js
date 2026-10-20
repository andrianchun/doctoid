import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

async function setupSSH() {
  const sshDir = path.join(os.homedir(), '.ssh');
  if (!fs.existsSync(sshDir)) fs.mkdirSync(sshDir, { recursive: true });
  const keyPath = path.join(sshDir, 'gcp_vm');
  if (!fs.existsSync(keyPath)) {
    execSync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "admin"`);
  }
  const pubKey = fs.readFileSync(keyPath + '.pub', 'utf8').trim();
  const sshKeyEntry = `admin:${pubKey}`;

  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const accessToken = cfg.tokens.access_token;

  const getRes = await fetch('https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  const inst = await getRes.json();
  const fingerprint = inst.metadata.fingerprint;
  const items = (inst.metadata.items || []).filter(i => i.key !== 'ssh-keys');
  items.push({ key: 'ssh-keys', value: sshKeyEntry });

  const setRes = await fetch('https://compute.googleapis.com/compute/v1/projects/docto-id/zones/us-central1-a/instances/doctoid-wa-bot/setMetadata', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fingerprint, items })
  });
  console.log('Set metadata status:', setRes.status, setRes.statusText);
}
setupSSH();
