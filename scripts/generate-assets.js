import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC_ICON = 'C:/Users/unthe/.gemini/antigravity/brain/7ed47e3b-1c39-4abd-96be-74ed32b87787/.user_uploaded/media_1790212317490.jpg';
const SRC_LOGO = 'C:/Users/unthe/.gemini/antigravity/brain/7ed47e3b-1c39-4abd-96be-74ed32b87787/.user_uploaded/media_1790212333266.jpg';
const SRC_BANNER = 'C:/Users/unthe/.gemini/antigravity/brain/7ed47e3b-1c39-4abd-96be-74ed32b87787/.user_uploaded/media_1790212342279.png';

async function removeBackground(srcPath, outPath) {
  const image = sharp(srcPath);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  
  const outBuf = Buffer.alloc(w * h * 4);
  const bgR = 253, bgG = 253, bgB = 253;
  
  for (let i = 0, j = 0; i < data.length; i += ch, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const dr = bgR - r;
    const dg = bgG - g;
    const db = bgB - b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    
    let alpha = 0;
    if (dist <= 6) {
      alpha = 0;
    } else if (dist >= 30) {
      alpha = 1;
    } else {
      alpha = (dist - 6) / 24;
    }
    
    if (alpha === 0) {
      outBuf[j] = 0;
      outBuf[j + 1] = 0;
      outBuf[j + 2] = 0;
      outBuf[j + 3] = 0;
    } else {
      const cleanR = Math.min(255, Math.max(0, Math.round((r - (1 - alpha) * bgR) / alpha)));
      const cleanG = Math.min(255, Math.max(0, Math.round((g - (1 - alpha) * bgG) / alpha)));
      const cleanB = Math.min(255, Math.max(0, Math.round((b - (1 - alpha) * bgG) / alpha)));
      
      outBuf[j] = cleanR;
      outBuf[j + 1] = cleanG;
      outBuf[j + 2] = cleanB;
      outBuf[j + 3] = Math.round(alpha * 255);
    }
  }
  
  await sharp(outBuf, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outPath);
}

async function main() {
  console.log('1. Menyalin aset asli ke folder public...');
  fs.copyFileSync(SRC_ICON, 'public/icon-original.jpg');
  fs.copyFileSync(SRC_ICON, 'public/icon.jpg');
  fs.copyFileSync(SRC_LOGO, 'public/logo-original.jpg');
  fs.copyFileSync(SRC_LOGO, 'public/logo.jpg');
  fs.copyFileSync(SRC_BANNER, 'public/banner-original.png');
  fs.copyFileSync(SRC_BANNER, 'public/banner.png');

  console.log('2. Membuat salinan transparan (tanpa background)...');
  const tempRawIcon = 'public/icon-raw-trans.png';
  await removeBackground(SRC_ICON, tempRawIcon);
  await removeBackground(SRC_LOGO, 'public/logo.png');
  fs.copyFileSync('public/logo.png', 'public/logo-transparent.png');
  await removeBackground(SRC_BANNER, 'public/banner-transparent.png');

  console.log('3. Melakukan presisi Centering & Zoom-out ikon "D" agar aman dari cropping lingkaran Android...');
  // Trim pixel transparan berlebih untuk mendapatkan batas simbol murni
  const trimmedIconBuf = await sharp(tempRawIcon).trim().toBuffer();
  
  // Skala simbol ke 560x560 (sekitar 54.6% dari kanvas 1024x1024)
  // Menjamin safe zone 100% pada adaptive icon Android & maskable PWA
  const symbolSize = 560;
  const resizedSymbol = await sharp(trimmedIconBuf)
    .resize(symbolSize, symbolSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Simpan master icon yang benar-benar simetris & centered
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resizedSymbol, gravity: 'center' }])
    .png()
    .toFile('public/icon.png');

  fs.copyFileSync('public/icon.png', 'public/icon-transparent.png');
  if (fs.existsSync(tempRawIcon)) fs.unlinkSync(tempRawIcon);

  console.log('4. Membuat aset PWA & Favicon...');
  // Favicon (64x64)
  await sharp('public/icon.png')
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('public/favicon.png');

  // Apple touch icon (180x180) dengan background putih bersih
  await sharp(trimmedIconBuf)
    .resize(110, 110, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: 35, bottom: 35, left: 35, right: 35,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toFile('public/apple-touch-icon.png');

  // PWA Icon 192x192
  await sharp('public/icon.png')
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('public/icon-192.png');

  // PWA Icon 512x512
  await sharp('public/icon.png')
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile('public/icon-512.png');

  // PWA Maskable Icon 512x512 (simbol D aman di tengah dengan safe zone ~58%)
  const maskableSymbol = await sharp(trimmedIconBuf)
    .resize(290, 290, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const maskPad = Math.round((512 - 290) / 2);
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{ input: maskableSymbol, gravity: 'center' }])
    .png()
    .toFile('public/icon-maskable-512.png');

  console.log('5. Membuat Android Launcher Icons (mipmap)...');
  const mipmaps = [
    { dir: 'mipmap-mdpi', launcher: 48, fg: 108 },
    { dir: 'mipmap-hdpi', launcher: 72, fg: 162 },
    { dir: 'mipmap-xhdpi', launcher: 96, fg: 216 },
    { dir: 'mipmap-xxhdpi', launcher: 144, fg: 324 },
    { dir: 'mipmap-xxxhdpi', launcher: 192, fg: 432 },
  ];

  for (const m of mipmaps) {
    const targetDir = path.join('android/app/src/main/res', m.dir);
    if (!fs.existsSync(targetDir)) continue;

    // 1. ic_launcher_foreground.png (108dp canvas, icon inside ~54dp safe zone diameter)
    // Sesuai standar Android Adaptive Icons: safe zone adalah lingkaran 66dp, kita pakai 54dp agar aman dari pemotongan launcher vendor mana pun
    const iconSizeInFg = Math.round(m.fg * (54 / 108));
    const fgSymbol = await sharp(trimmedIconBuf)
      .resize(iconSizeInFg, iconSizeInFg, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: {
        width: m.fg,
        height: m.fg,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: fgSymbol, gravity: 'center' }])
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));

    // 2. ic_launcher.png (legacy launcher icon)
    const iconSizeInLauncher = Math.round(m.launcher * 0.65);
    const launcherSymbol = await sharp(trimmedIconBuf)
      .resize(iconSizeInLauncher, iconSizeInLauncher, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: {
        width: m.launcher,
        height: m.launcher,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: launcherSymbol, gravity: 'center' }])
      .png()
      .toFile(path.join(targetDir, 'ic_launcher.png'));

    // 3. ic_launcher_round.png (legacy round icon with circular mask)
    const roundSvg = Buffer.from(
      `<svg width="${m.launcher}" height="${m.launcher}">
        <circle cx="${m.launcher/2}" cy="${m.launcher/2}" r="${m.launcher/2}" fill="white" />
      </svg>`
    );
    const roundBg = await sharp(roundSvg).png().toBuffer();
    const roundIcon = await sharp(trimmedIconBuf)
      .resize(Math.round(m.launcher * 0.58), Math.round(m.launcher * 0.58), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp(roundBg)
      .composite([{ input: roundIcon, gravity: 'center' }])
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_round.png'));
  }

  console.log('6. Membuat Android Splash Screens (drawable)...');
  const splashSizes = [
    { dir: 'drawable', w: 480, h: 320 },
    { dir: 'drawable-port-mdpi', w: 320, h: 480 },
    { dir: 'drawable-port-hdpi', w: 480, h: 800 },
    { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
    { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
    { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
    { dir: 'drawable-land-mdpi', w: 480, h: 320 },
    { dir: 'drawable-land-hdpi', w: 800, h: 480 },
    { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
    { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
    { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 },
  ];

  for (const s of splashSizes) {
    const targetDir = path.join('android/app/src/main/res', s.dir);
    if (!fs.existsSync(targetDir)) continue;

    // Logo size: ~55% of width in portrait, ~55% of height in landscape
    const isPort = s.h >= s.w;
    const maxLogoW = Math.round(isPort ? s.w * 0.58 : s.h * 0.60);
    const maxLogoH = Math.round(isPort ? s.h * 0.40 : s.h * 0.60);

    const logoResized = await sharp('public/logo.png')
      .resize(maxLogoW, maxLogoH, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({
      create: {
        width: s.w,
        height: s.h,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: logoResized, gravity: 'center' }])
      .png()
      .toFile(path.join(targetDir, 'splash.png'));
  }

  console.log('\n✅ Seluruh aset icon (centered & zoomed-out), logo, splash screen, dan banner berhasil diperbarui!');
}

main().catch(console.error);
