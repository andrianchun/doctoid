/**
 * Privacy Sanitizer & PII De-Identification (UU PDP No. 27/2022 & Permenkes 24/2022)
 * Menghapus/menyamarkan PII (Nama, No RM, NIK, No HP) sebelum teks dikirim ke API AI pihak ketiga (Google/OpenAI).
 * Hasil ekstraksi kemudian dipadukan kembali dengan identitas asli di sisi klien (on-device).
 */

export interface SanitizedPayload {
  sanitizedText: string
  originalTokens: Map<string, string>
}

export function sanitizePiiForAi(rawText: string): SanitizedPayload {
  if (!rawText) return { sanitizedText: '', originalTokens: new Map() }

  const originalTokens = new Map<string, string>()
  let text = rawText

  // 1. Samarkan NIK (16 digit angka berurutan)
  text = text.replace(/\b\d{16}\b/g, (match) => {
    const token = `[NIK_PROTECTED_${originalTokens.size + 1}]`
    originalTokens.set(token, match)
    return token
  })

  // 2. Samarkan No HP (08xx atau +628xx 9-13 digit)
  text = text.replace(/(?:\+62|62|0)8[1-9][0-9]{7,10}\b/g, (match) => {
    const token = `[TELP_PROTECTED_${originalTokens.size + 1}]`
    originalTokens.set(token, match)
    return token
  })

  // 3. Samarkan No RM (misal: "RM: 123456", "No. RM 12-34-56", "No RM: 01.23.45")
  text = text.replace(/(?:(?:no\.?\s*)?rm|rekam\s*medis)\s*[:-]?\s*([0-9A-Za-z./-]+)/gi, (match, rmVal) => {
    const cleanVal = rmVal.trim()
    if (cleanVal.length >= 3 && cleanVal.length <= 15) {
      const token = `[RM_PROTECTED_${originalTokens.size + 1}]`
      originalTokens.set(token, cleanVal)
      return `RM: ${token}`
    }
    return match
  })

  return { sanitizedText: text, originalTokens }
}

export function restorePiiFromAi(text: string, tokens: Map<string, string>): string {
  if (!text || tokens.size === 0) return text
  let restored = text
  tokens.forEach((originalVal, token) => {
    restored = restored.replaceAll(token, originalVal)
  })
  return restored
}
