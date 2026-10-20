import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

async function clean() {
  const filePath = '/public/wa-inbox.json'
  if (!fs.existsSync(filePath)) {
    console.log('File not found:', filePath)
    return
  }

  const items = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  console.log('Original items count:', items.length)

  for (const it of items) {
    if (it.attachments && it.attachments.length > 0) {
      const seen = new Set()
      const uniqueAtts = []
      for (const att of it.attachments) {
        const key = att.dataUrl ? att.dataUrl.slice(0, 80) : att.name
        if (seen.has(key)) continue
        seen.add(key)

        if (att.dataUrl && att.dataUrl.startsWith('data:image/')) {
          const rawB64 = att.dataUrl.split(',')[1]
          if (rawB64) {
            try {
              const buf = Buffer.from(rawB64, 'base64')
              const compressed = await sharp(buf)
                .resize(280, 280, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 50 })
                .toBuffer()
              att.dataUrl = `data:image/jpeg;base64,${compressed.toString('base64')}`
            } catch (err) {
              console.warn('Compress failed:', err.message)
            }
          }
        }
        uniqueAtts.push(att)
      }
      it.attachments = uniqueAtts.slice(0, 3)
    }
  }

  const outStr = JSON.stringify(items, null, 2)
  fs.writeFileSync(filePath, outStr, 'utf8')
  console.log(`✓ New file size: ${(Buffer.byteLength(outStr) / 1024).toFixed(1)} KB`)
}

clean().catch(console.error)
