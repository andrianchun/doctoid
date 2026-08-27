// Manifest builder untuk update OTA Doctoid.
// Dipisah dari build-ota.js supaya bisa diuji tanpa menjalankan build penuh.

export const HOSTING_DOMAIN = 'https://docto-id.web.app';
export const APK_URL = `${HOSTING_DOMAIN}/apk/doctoid-latest.apk`;

export const zipNameFor = (version) => `update_${version.replace(/\./g, '')}.zip`;

export function buildManifest(version, { apk = false, forced = false, notes = '' } = {}) {
  const manifest = {
    ota_version: version,
    ota_url: apk ? APK_URL : `${HOSTING_DOMAIN}/ota/${zipNameFor(version)}`,
    is_forced: forced,
    release_notes: notes || `Pembaruan Doctoid v${version}`,
  };
  if (apk) manifest.is_apk = true;
  return manifest;
}
