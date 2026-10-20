import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generate() {
  const sourcePath = 'public/icon-transparent.png';
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Source icon not found: ' + sourcePath);
  }

  // 1. Extract exact bounding box of the D logo (left: 340, top: 312, width: 396, height: 400)
  const extracted = sharp(sourcePath)
    .extract({ left: 340, top: 312, width: 396, height: 400 });

  const { data, info } = await extracted.raw().toBuffer({ resolveWithObject: true });

  // 2. Ubah semua piksel menjadi putih murni (255, 255, 255) dengan mempertahankan transparansi (alpha) asli
  const whiteBuffer = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    whiteBuffer[i] = 255;     // Red: 255
    whiteBuffer[i + 1] = 255; // Green: 255
    whiteBuffer[i + 2] = 255; // Blue: 255
    whiteBuffer[i + 3] = data[i + 3]; // Alpha tetap asli (anti-aliasing halus)
  }

  const whiteSilhouette = sharp(whiteBuffer, {
    raw: { width: info.width, height: info.height, channels: 4 }
  });

  const targets = [
    { dir: 'android/app/src/main/res/drawable', canvas: 96, inner: 80, pad: 8 },
    { dir: 'android/app/src/main/res/drawable-mdpi', canvas: 24, inner: 20, pad: 2 },
    { dir: 'android/app/src/main/res/drawable-hdpi', canvas: 36, inner: 30, pad: 3 },
    { dir: 'android/app/src/main/res/drawable-xhdpi', canvas: 48, inner: 40, pad: 4 },
    { dir: 'android/app/src/main/res/drawable-xxhdpi', canvas: 72, inner: 60, pad: 6 },
    { dir: 'android/app/src/main/res/drawable-xxxhdpi', canvas: 96, inner: 80, pad: 8 },
  ];

  for (const t of targets) {
    if (!fs.existsSync(t.dir)) {
      fs.mkdirSync(t.dir, { recursive: true });
    }
    const dest = path.join(t.dir, 'ic_stat_doctoid.png');
    await whiteSilhouette
      .clone()
      .resize(t.inner, t.inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: t.pad,
        bottom: t.pad,
        left: t.pad,
        right: t.pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(dest);

    console.log(`✓ Dibuat: ${dest} (${t.canvas}x${t.canvas} px)`);
  }

  // Simpan juga salinan di public/ agar bisa diakses web atau di-inspect
  await whiteSilhouette
    .clone()
    .resize(80, 80, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('public/ic_stat_doctoid.png');
  console.log('✓ Dibuat: public/ic_stat_doctoid.png');
}

generate().catch(console.error);
