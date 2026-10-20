import fs from 'fs';
import path from 'path';
import os from 'os';

async function test() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const accessToken = cfg.tokens.access_token;
  const res = await fetch('https://firestore.googleapis.com/v1/projects/docto-id/databases/(default)/documents/users/fOGcJmF0vGR5EKzlN2l9ZR7WPZu1', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  const data = await res.json();
  const fields = data.fields || {};
  console.log('Top level fields:', Object.keys(fields));
  const tables = fields.tables?.mapValue?.fields || {};
  console.log('Tables:', Object.keys(tables));
  for (const [k, v] of Object.entries(tables)) {
    const arr = v.arrayValue?.values || [];
    const jsonLen = JSON.stringify(v).length;
    console.log('  Table ' + k + ': ' + arr.length + ' items, size: ' + (jsonLen / 1024).toFixed(1) + ' KB');
  }
}
test();
