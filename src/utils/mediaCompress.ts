/**
 * Utilitas kompresi & konversi media ke format hemat ruang (WebP / WebM).
 */

/**
 * Mengonversi berkas gambar atau base64 gambar ke format WebP terkompresi.
 * @param fileOrDataUrl Berkas file gambar atau string Data URL
 * @param maxDimension Dimensi maksimum panjang/lebar gambar (default: 800px)
 * @param quality Kualitas kompresi WebP antara 0.1 - 1.0 (default: 0.82)
 */
export async function convertToWebP(
  fileOrDataUrl: File | string,
  maxDimension = 800,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const processImg = (src: string) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, width, height)
        }
        resolve(canvas.toDataURL('image/webp', quality))
      }
      img.onerror = reject
      img.src = src
    }

    if (typeof fileOrDataUrl === 'string') {
      processImg(fileOrDataUrl)
    } else {
      const reader = new FileReader()
      reader.onload = (e) => processImg(e.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(fileOrDataUrl)
    }
  })
}
