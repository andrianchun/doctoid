import type { AttachmentTag } from '../db'

export interface VisionAttachmentItem {
  id?: string
  name: string
  type: string
  dataUrl: string
  kategori?: 'pemfis' | 'penunjang'
  tag?: AttachmentTag
}

export interface ClinicalVisionResult {
  classifiedAttachments: VisionAttachmentItem[]
  pdxSuggestions: {
    nama_item: string
    dosis_keterangan: string
    kategori: 'Diagnostik'
  }[]
  penunjangTextSummary: string
  hasAbnormalLab: boolean
}

function getGeminiApiKey(): string | null {
  const geminiLocal = localStorage.getItem('doctoid_gemini_key')
  const aiLocal = localStorage.getItem('doctoid_ai_key')
  const viteGemini = (import.meta.env as any)?.VITE_GEMINI_API_KEY
  const envKeys = (import.meta.env as any)?.AI_SHARED_KEYS?.split(',') || []

  const candidates = [geminiLocal, aiLocal, viteGemini, ...envKeys]
    .filter(Boolean)
    .map((k: string) => k.trim())

  // Cari key Google (diawali AIza atau AQ.)
  for (const k of candidates) {
    if (k.startsWith('AIza') || k.startsWith('AQ.')) return k
  }
  return candidates[0] || null
}

const VISION_MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']

/**
 * Menganalisis lampiran medis (EKG, CT Scan/Thorax, Lab, Foto Fisik) menggunakan AI Vision Cerdas.
 * 100% Free, Cepat, dan Akurat.
 */
export async function analyzeAndClassifyAttachments(
  attachments: VisionAttachmentItem[],
  rawText: string = ''
): Promise<ClinicalVisionResult> {
  if (!attachments || attachments.length === 0) {
    return {
      classifiedAttachments: [],
      pdxSuggestions: [],
      penunjangTextSummary: '',
      hasAbnormalLab: false,
    }
  }

  const imageItems = attachments.filter((a) => a.type?.startsWith('image/') && a.dataUrl)

  // 1. Coba pemrosesan AI Vision Multimodal via Gemini Flash (Prioritas #1: 1-2 detik, Gratis)
  const apiKey = getGeminiApiKey()
  if (apiKey && imageItems.length > 0) {
    try {
      const result = await callGeminiVision(imageItems, rawText, apiKey)
      if (result) {
        return mergeVisionResult(attachments, result)
      }
    } catch (err) {
      console.warn('Gemini Vision gagal, beralih ke heuristik lokal:', err)
    }
  }

  // 2. Fallback Heuristik Cerdas (Lokal / Offline)
  return runHeuristicClassifier(attachments, rawText)
}

interface GeminiVisionParsedOutput {
  images?: {
    index: number
    tag: AttachmentTag
    kategori: 'pemfis' | 'penunjang'
    ringkasan?: string
  }[]
  lab_abnormal?: string[]
  ekg_summary?: string
  radiologi_summary?: string
  pdx?: string[]
}

async function callGeminiVision(
  images: VisionAttachmentItem[],
  rawText: string,
  apiKey: string
): Promise<GeminiVisionParsedOutput | null> {
  // Batasi maksimal 10 foto untuk kecepatan maksimal
  const targetImages = images.slice(0, 10)
  const parts: any[] = []

  for (let i = 0; i < targetImages.length; i++) {
    const img = targetImages[i]
    const match = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      parts.push({
        inline_data: {
          mime_type: match[1] || 'image/jpeg',
          data: match[2],
        },
      })
    }
  }

  if (parts.length === 0) return null

  const prompt = `Anda adalah asisten AI medis neurologi & diagnostik dokter spesialis. Analisis seluruh ${parts.length} gambar lampiran medis berikut beserta teks pendamping: "${rawText.slice(0, 500)}".

ATURAN KLINIS WAJIB:
1. KLASIFIKASI SETIAP GAMBAR (tag & kategori):
   - tag: "EKG" | "Radiologi" | "Lab" | "Pemfis"
   - kategori: "penunjang" (untuk EKG, Radiologi, Lab) atau "pemfis" (untuk foto klinis wajah/fisik pasien)
   - "EKG": grafik elektrokardiogram / kertas rekam jantung 12-lead atau strip irama.
   - "Radiologi": foto CT Scan kepala (aksial otak), Rontgen/Foto Thorax, MRI, atau lembar teks cetak ekspertise radiologi dokter Sp.Rad.
   - "Lab": foto lembar hasil laboratorium darah, kimia klinik, urin, atau layar SIMRS lab.
   - "Pemfis": foto kondisi fisik klinis pasien (wajah mencong/parese N. VII, ekstremitas, pupil, luka).

2. BACAAN LABORATORIUM:
   - Cari dan ekstrak HANYA nilai yang ABNORMAL (di luar rentang normal).
   - Format penulisan WAJIB: "Nama_Parameter Nilai ↑" (jika tinggi) atau "Nama_Parameter Nilai ↓" (jika rendah).
   - JANGAN TULIS rentang rujukan normal (N: ...) dan JANGAN gunakan huruf [H] atau [L]. Gunakan hanya simbol panah ↑ atau ↓.
   - Contoh format:
     "Leukosit 14.500 ↑", "GDS 245 ↑", "Hb 9.2 ↓", "Kalium 3.1 ↓", "Trombosit 98.000 ↓".

3. INTERPRETASI EKG:
   - Deteksi cermat terutama GANGGUAN IRAMA & KONDUKSI:
     * Atrial Fibrillation (AF) / AF RVR / SVR
     * RBBB (Right Bundle Branch Block) atau LBBB
     * Premature Ventricular Contraction (PVC / VES)
     * Irama dasar (Sinus Rhythm / lainnya), Heart Rate (HR bpm), Axis
     * Iskemia/infark akut (ST elevasi, ST depresi, T inverted).

4. INTERPRETASI RADIOLOGI (CT SCAN / THORAX):
   - Prioritas Utama: Jika foto memuat teks lembar bacaan / ekspertise resmi dokter Sp.Rad, kutip langsung kesimpulan/kesan resmi tersebut.
   - Jika foto adalah film CT polos tanpa teks ekspertise: berikan kesan orientasi (Ada/tidaknya perdarahan ICH/SAH/SDH/EDH, infark/lesi hipodens teritorial, edema serebri, midline shift / herniasi).

5. PLANNING DIAGNOSTIK (pdx):
   - Jika ada EKG -> masukkan "EKG" (cukup EKG saja, bukan 12 lead)
   - Jika ada CT Scan -> masukkan "CT Scan Kepala"
   - Jika ada Thorax -> masukkan "Foto Thorax"
   - Jika ada Lab -> masukkan "Darah Lengkap", "GDS", "Elektrolit", dll. sesuai jenis lab.

OUTPUT HARUS BERUPA JSON VALID dengan struktur persis seperti ini:
{
  "images": [
    { "index": 0, "tag": "EKG", "kategori": "penunjang", "ringkasan": "EKG 12 Lead Sinus Rhythm" }
  ],
  "lab_abnormal": ["Leukosit 14.500 ↑", "GDS 245 ↑"],
  "ekg_summary": "Sinus Rhythm, HR 78 bpm, tidak tampak aritmia/PVC/AF, ST-T changes (-)",
  "radiologi_summary": "CT Scan Kepala: Tidak tampak perdarahan intrakranial, infark kronis lakunar kapsula interna",
  "pdx": ["EKG", "CT Scan Kepala", "Darah Lengkap"]
}`

  parts.push({ text: prompt })

  for (const model of VISION_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      )

      if (res.ok) {
        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          return JSON.parse(text)
        }
      }
    } catch {
      continue
    }
  }

  return null
}

function mergeVisionResult(
  originalAttachments: VisionAttachmentItem[],
  visionData: GeminiVisionParsedOutput
): ClinicalVisionResult {
  const classified: VisionAttachmentItem[] = originalAttachments.map((att, idx) => {
    const match = visionData.images?.find((img) => img.index === idx)
    if (match) {
      return {
        ...att,
        kategori: match.kategori || att.kategori || 'penunjang',
        tag: match.tag || att.tag || 'Lainnya',
      }
    }
    // Jika tidak ada index, coba tebak dari nama atau biarkan
    return att
  })

  // Bentuk teks ringkasan O_penunjang (HANYA temuan abnormal, ringkas & bebas clutter)
  const penunjangSections: string[] = []

  if (visionData.lab_abnormal && visionData.lab_abnormal.length > 0) {
    penunjangSections.push(`[Laboratorium]:\n${visionData.lab_abnormal.map((l) => `- ${l}`).join('\n')}`)
  }

  if (visionData.ekg_summary && visionData.ekg_summary.trim()) {
    penunjangSections.push(`[EKG]:\n- ${visionData.ekg_summary.trim()}`)
  }

  if (visionData.radiologi_summary && visionData.radiologi_summary.trim()) {
    penunjangSections.push(`[Radiologi]:\n- ${visionData.radiologi_summary.trim()}`)
  }

  const pdxSuggestions = (visionData.pdx || []).map((name) => ({
    nama_item: name.trim(),
    dosis_keterangan: '',
    kategori: 'Diagnostik' as const,
  }))

  return {
    classifiedAttachments: classified,
    pdxSuggestions,
    penunjangTextSummary: penunjangSections.join('\n\n'),
    hasAbnormalLab: Boolean(visionData.lab_abnormal && visionData.lab_abnormal.length > 0),
  }
}

/**
 * Heuristik Klasifikasi Lokal Cepat saat Offline / Tanpa API Key
 */
function runHeuristicClassifier(
  attachments: VisionAttachmentItem[],
  rawText: string
): ClinicalVisionResult {
  const pdxSet = new Set<string>()
  const classified = attachments.map((att) => {
    const lowerName = (att.name || '').toLowerCase()
    const lowerType = (att.type || '').toLowerCase()

    let tag: AttachmentTag = 'Lainnya'
    let kategori: 'pemfis' | 'penunjang' = 'penunjang'

    if (/ekg|ecg|irama|lead/i.test(lowerName) || /ekg/i.test(rawText)) {
      tag = 'EKG'
      kategori = 'penunjang'
      pdxSet.add('EKG')
    } else if (/ct|scan|radiologi|rontgen|thorax|xray|mri/i.test(lowerName) || /ct scan|rontgen|thorax/i.test(rawText)) {
      tag = 'Radiologi'
      kategori = 'penunjang'
      if (/thorax/i.test(lowerName) || /thorax/i.test(rawText)) pdxSet.add('Foto Thorax')
      else pdxSet.add('CT Scan Kepala')
    } else if (/lab|darah|dl|gds|urin|kimia/i.test(lowerName) || /leuko|tromb|hb|gds/i.test(rawText)) {
      tag = 'Lab'
      kategori = 'penunjang'
      pdxSet.add('Darah Lengkap')
      if (/gds|gula/i.test(rawText) || /gds/i.test(lowerName)) pdxSet.add('GDS')
    } else if (/wajah|parese|fisik|luka|mata|klinis/i.test(lowerName) || lowerType.startsWith('video/')) {
      tag = 'Pemfis'
      kategori = 'pemfis'
    } else {
      // Default: gambar pertama kali masuk diarahkan ke penunjang
      tag = 'Radiologi'
      kategori = 'penunjang'
    }

    return {
      ...att,
      kategori,
      tag,
    }
  })

  // Ekstrak nilai lab abnormal sederhana dari teks mentah jika ada
  const labLines: string[] = []
  const leuMatch = rawText.match(/leukosit[:\s]*([\d.,]+)/i)
  if (leuMatch) {
    const val = parseFloat(leuMatch[1].replace(/\./g, '').replace(',', '.'))
    if (!isNaN(val)) {
      if (val > 10000) labLines.push(`Leukosit: ${leuMatch[1]} ↑`)
      else if (val < 4000) labLines.push(`Leukosit: ${leuMatch[1]} ↓`)
    }
  }

  const gdsMatch = rawText.match(/gds[:\s]*([\d.,]+)/i)
  if (gdsMatch) {
    const val = parseFloat(gdsMatch[1].replace(',', '.'))
    if (!isNaN(val) && val > 140) {
      labLines.push(`GDS: ${gdsMatch[1]} ↑`)
      pdxSet.add('GDS')
    }
  }

  const hbMatch = rawText.match(/hb[:\s]*([\d.,]+)/i)
  if (hbMatch) {
    const val = parseFloat(hbMatch[1].replace(',', '.'))
    if (!isNaN(val) && val < 12) {
      labLines.push(`Hb: ${hbMatch[1]} ↓`)
    }
  }

  const penunjangSections: string[] = []
  if (labLines.length > 0) {
    penunjangSections.push(`[Laboratorium]:\n${labLines.map((l) => `- ${l}`).join('\n')}`)
  }

  const pdxSuggestions = Array.from(pdxSet).map((name) => ({
    nama_item: name,
    dosis_keterangan: '',
    kategori: 'Diagnostik' as const,
  }))

  return {
    classifiedAttachments: classified,
    pdxSuggestions,
    penunjangTextSummary: penunjangSections.join('\n\n'),
    hasAbnormalLab: labLines.length > 0,
  }
}
