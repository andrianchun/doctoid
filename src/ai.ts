import type { Jaminan, KategoriTerapi, RegexField, PoliLogItem } from './db'
import { getNeuroLockPrompt, getAnalisisInstruksi, RAPIKAN_INSTRUKSI, DIRECT_EDIT_INSTRUKSI } from './prompts'
import { db } from './db'
import { sanitizePiiForAi, restorePiiFromAi } from './utils/privacySanitizer'

class APIError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'APIError'
  }
}

function getAllKeys(): string[] {
  const geminiLocal = localStorage.getItem('doctoid_gemini_key')
  const aiLocal = localStorage.getItem('doctoid_ai_key')
  const openaiLocal = localStorage.getItem('doctoid_openai_key')
  const envKeys = import.meta.env.AI_SHARED_KEYS?.split(',') || []
  const viteGemini = (import.meta.env as any).VITE_GEMINI_API_KEY
  const allKeys: string[] = []
  if (geminiLocal) allKeys.push(geminiLocal)
  if (aiLocal) allKeys.push(aiLocal)
  if (viteGemini) allKeys.push(viteGemini)
  allKeys.push(...envKeys)
  if (openaiLocal) allKeys.push(openaiLocal)
  return Array.from(new Set(allKeys.map((k) => k.trim()))).filter((k) => !!k)
}

function getProvider(key: string): 'openai' | 'google' | 'anthropic' {
  if (key.startsWith('sk-ant')) return 'anthropic'
  if (key.startsWith('sk-')) return 'openai'
  if (key.startsWith('AIza') || key.startsWith('AQ.')) return 'google'
  return 'google'
}

/* Fase Hemat Token & Kecepatan: Google Gemini Flash selalu prioritas #1 (kuota token melimpah & latensi rendah), baru OpenAI gpt-4o-mini */
const PROVIDER_COST_TIER: Record<string, number> = { google: 0, openai: 1, anthropic: 2 }
function cheapestFirst(keys: string[]): string[] {
  return [...keys].sort((a, b) => (PROVIDER_COST_TIER[getProvider(a)] ?? 99) - (PROVIDER_COST_TIER[getProvider(b)] ?? 99))
}

const GOOGLE_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash']

function getPplxKeys(): string[] {
  const local = localStorage.getItem('doctoid_pplx_key')
  const envKeys = import.meta.env.AI_SHARED_KEYS?.split(',') || []
  const shared = envKeys.filter((k: string) => k.startsWith('pplx-'))
  const allKeys = []
  allKeys.push(...shared)
  if (local) allKeys.push(local)
  return allKeys.filter(k => !!k.trim())
}

function formatError(status: number, rawMessage: string, provider: string) {
  const msgLower = rawMessage.toLowerCase()
  if (status === 401 || status === 403) return `Kunci API ${provider} tidak valid.`
  if (status === 404) return `Model ${provider} tidak ditemukan (Error 404).`
  if (status === 429) {
    if (msgLower.includes('quota') || msgLower.includes('insufficient_quota')) return `Kuota API ${provider} telah habis.`
    return `Server ${provider} sedang penuh (Rate Limit). Tunggu sebentar.`
  }
  if (status >= 500) return `Server ${provider} error (${status}): ${msgLower.substring(0, 100)}. Coba lagi nanti.`
  return `Gagal memproses dengan ${provider} (Error ${status}): ${msgLower.substring(0, 100)}. Coba lagi nanti.`
}

export interface RapikanResult {
  title: string
  nama_depan: string
  usia: string
  no_rm: string
  jaminan: Jaminan | ''
  tgl_mrs: string
  tgl_onset: string
  S: string
  O_pemfis: string
  O_penunjang: string
  A: { kategori: 'Utama' | 'Sekunder'; nama_diagnosis: string; icd10: string }[]
  P: { nama_item: string; dosis_keterangan: string; kategori: KategoriTerapi; icd9?: string }[]
  regex_baru?: { field: RegexField; pattern: string; flags: string }[]
}

export interface AnalisisResult {
  A: { kategori: 'Utama' | 'Sekunder'; nama_diagnosis: string; icd10: string }[]
  P: { nama_item: string; dosis_keterangan: string; kategori: KategoriTerapi; status: 'aktif' | 'stop'; icd9?: string }[]
  komentar: string
}


async function preferensiDokter(): Promise<string> {
  const prefs = await db.doctorPreferences.toArray()
  if (!prefs.length) return ''
  return `\n\n[PREFERENSI DOKTER]\n${prefs.map((p) => `- ${p.konteks}: ${p.pola}`).join('\n')}`
}

/* Mode Rapikan — LLM generik memparse teks berantakan + audio VN + foto/video/PDF + sugesti ICD */
export async function rapikan(text: string, attachments: { type: string; dataUrl: string }[] = [], isRingkas: boolean = true): Promise<RapikanResult> {
  const keys = getAllKeys()
  if (!keys.length) throw new Error('Isi API Key di Pengaturan terlebih dahulu.')

  // De-identifikasi PII sebelum payload meninggalkan perangkat (Kepatuhan UU PDP No. 27/2022)
  const { sanitizedText, originalTokens } = sanitizePiiForAi(text)

  let lastError = new Error('Gagal menghubungi server pemrosesan')

  for (const key of cheapestFirst(keys)) {
    const provider = getProvider(key)
    if (provider === 'anthropic') continue // not supported for text yet

    try {
      const prefs = await preferensiDokter()
      const modeInstruction = isRingkas 
        ? '\n\nATURAN MODE RINGKAS: PADA BAGIAN O_pemfis dan O_penunjang, HANYA cantumkan baris/kategori yang memiliki kelainan (abnormal/positif). Jika suatu sub-sistem (misal Meningeal Sign, Abdomen) sepenuhnya normal, BUANG baris tersebut sepenuhnya dari hasil teks untuk menghemat tempat.'
        : '\n\nATURAN MODE LENGKAP: PADA BAGIAN O_pemfis dan O_penunjang, cantumkan SELURUH struktur secara utuh (head-to-toe), termasuk yang normal/negatif sebagai bukti medis bahwa pemeriksaan telah dilakukan.'
      const systemPrompt = getNeuroLockPrompt() + prefs + modeInstruction + '\n\n' + RAPIKAN_INSTRUKSI
      let res;
      
      if (provider === 'openai') {
        const contentParts: any[] = [{ type: 'text', text: sanitizedText || 'Tolong rapikan data ini sesuai instruksi.' }]
        for (const att of attachments) {
          if (att.type.startsWith('image/')) {
            contentParts.push({ type: 'image_url', image_url: { url: att.dataUrl } })
          }
        }
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: contentParts },
            ],
          }),
        })
      } else {
        // Google Gemini model fallback chain - Multimodal (Teks, Foto, Audio VN, Video Kejang, PDF Lab)
        const googleModels = GOOGLE_MODELS
        const parts: any[] = [{ text: systemPrompt + '\n\n[INPUT KASUS]\n' + (sanitizedText || 'Tolong rapikan media/data klinis ini sesuai schema JSON.') }]
        for (const att of attachments) {
          if (
            att.type.startsWith('image/') ||
            att.type.startsWith('audio/') ||
            att.type.startsWith('video/') ||
            att.type === 'application/pdf'
          ) {
            const b64 = att.dataUrl.includes(',') ? att.dataUrl.split(',')[1] : att.dataUrl
            if (b64) {
              parts.push({ inline_data: { mime_type: att.type, data: b64 } })
            }
          }
        }
        
        for (let mIdx = 0; mIdx < googleModels.length; mIdx++) {
          const model = googleModels[mIdx]
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          })
          const isLastModel = mIdx === googleModels.length - 1
          if (res && (res.status === 404 || res.status === 400 || res.status === 403 || res.status === 503) && !isLastModel) {
            continue
          }
          break
        }
      }

      if (!res || !res.ok) {
        const txt = res ? await res.text() : 'No response from AI'
        let errMsg = txt
        try { errMsg = JSON.parse(txt).error?.message || txt } catch {}
        throw new APIError(res?.status || 500, formatError(res?.status || 500, errMsg, provider === 'openai' ? 'OpenAI' : 'Gemini'))
      }

      const data = await res.json()
      let resultText = ''
      if (provider === 'openai') {
        resultText = data.choices[0].message.content
      } else {
        resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      }
      const jsonMatch = resultText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (jsonMatch) resultText = jsonMatch[0]

      // Pulihkan kembali PII asli secara lokal pada perangkat
      if (originalTokens.size > 0) {
        resultText = restorePiiFromAi(resultText, originalTokens)
      }

      return JSON.parse(resultText)
    } catch (err: any) {
      lastError = err
      if (err.name === 'APIError' && [400, 401, 403, 404, 429, 500, 502, 503, 504].includes(err.status)) {
        continue // Try next key if available
      }
      throw err // Stop on unknown errors
    }
  }

  throw lastError
}

/* Mode Analisis Klinis - LLM membaca data terstruktur dan merevisi A & P */
export async function analisisKasus(formStateStr: string): Promise<AnalisisResult> {
  const keys = getAllKeys()
  if (!keys.length) throw new Error('Isi API Key di Pengaturan terlebih dahulu.')

  let lastError = new Error('Gagal menghubungi server pemrosesan')

  for (const key of cheapestFirst(keys)) {
    const provider = getProvider(key)
    if (provider === 'anthropic') continue

    try {
      const prefs = await preferensiDokter()
      const systemPrompt = getNeuroLockPrompt() + prefs + '\n\n' + getAnalisisInstruksi()
      let res;
      
      if (provider === 'openai') {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Data Rekam Medis Pasien saat ini:\n\n${formStateStr}\n\nLakukan analisis klinis, tambahkan terapi/diagnosis yang tertinggal atau koreksi bila ada kontraindikasi.` }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          }),
        })
      } else if (provider === 'google') {
        const googleModels = GOOGLE_MODELS
        for (let mIdx = 0; mIdx < googleModels.length; mIdx++) {
          const model = googleModels[mIdx]
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: `Data Rekam Medis Pasien saat ini:\n\n${formStateStr}\n\nLakukan analisis klinis, tambahkan terapi/diagnosis yang tertinggal atau koreksi bila ada kontraindikasi.` }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
            }),
          })
          const isLastModel = mIdx === googleModels.length - 1
          if (res && (res.status === 404 || res.status === 400 || res.status === 403 || res.status === 503) && !isLastModel) {
            continue
          }
          break
        }
      }

      if (!res || !res.ok) {
        const txt = res ? await res.text() : 'No response from AI'
        let errMsg = txt
        try { errMsg = JSON.parse(txt).error?.message || txt } catch {}
        throw new APIError(res?.status || 500, formatError(res?.status || 500, errMsg, provider === 'openai' ? 'OpenAI' : 'Gemini'))
      }

      const data = await res.json()
      let resultText = ''
      if (provider === 'openai') {
        resultText = data.choices[0].message.content
      } else {
        resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      }
      const jsonMatch = resultText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (jsonMatch) resultText = jsonMatch[0]
      return JSON.parse(resultText)
    } catch (err: any) {
      lastError = err
      if (err.name === 'APIError' && [400, 401, 403, 404, 429, 500, 502, 503, 504].includes(err.status)) {
        continue
      }
      throw err
    }
  }

  throw lastError
}

/* Contextual Patient Chat — AI membaca jaminan + seluruh CPPT + terapi */
export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export async function chatPasien(messages: ChatMsg[], konteksPasien: string): Promise<string> {
  const keys = getAllKeys()
  if (!keys.length) throw new Error('Isi API Key di Pengaturan terlebih dahulu.')

  let lastError = new Error('Gagal menghubungi server pemrosesan')

  for (const key of cheapestFirst(keys)) {
    const provider = getProvider(key)
    if (provider === 'anthropic') continue

    try {
      const prefs = await preferensiDokter()
      const systemPrompt = getNeuroLockPrompt() + prefs + '\n\n' + DIRECT_EDIT_INSTRUKSI + '\n\n' + konteksPasien
      let res;
      
      if (provider === 'openai') {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages,
            ],
          }),
        })
      } else {
        const geminiMessages = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
        const googleModels = GOOGLE_MODELS
        for (let mIdx = 0; mIdx < googleModels.length; mIdx++) {
          const model = googleModels[mIdx]
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: geminiMessages,
            }),
          })
          const isLastModel = mIdx === googleModels.length - 1
          if (res && (res.status === 404 || res.status === 400 || res.status === 403 || res.status === 503) && !isLastModel) {
            continue
          }
          break
        }
      }

      if (!res || !res.ok) {
        const txt = res ? await res.text() : 'No response from AI'
        let errMsg = txt
        try { errMsg = JSON.parse(txt).error?.message || txt } catch {}
        throw new APIError(res?.status || 500, formatError(res?.status || 500, errMsg, provider === 'openai' ? 'OpenAI' : 'Gemini'))
      }

      const data = await res.json()
      if (provider === 'openai') return data.choices[0].message.content
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } catch (err: any) {
      lastError = err
      if (err.name === 'APIError' && [400, 401, 403, 404, 429, 500, 502, 503, 504].includes(err.status)) {
        continue
      }
      throw err
    }
  }

  throw lastError
}

/* Mode Deep Search — Perplexity untuk DDx/guideline dengan sitasi EBM */
export async function deepSearch(query: string, konteks = ''): Promise<{ content: string; citations: string[] }> {
  const keys = getPplxKeys()
  if (!keys.length) throw new Error('Isi Perplexity API Key di Pengaturan terlebih dahulu.')

  let lastError = new Error('Gagal menghubungi Perplexity')

  for (const key of keys) {
    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: getNeuroLockPrompt() + '\n\nJawab ringkas berbasis bukti (EBM) dan sertakan sitasi.' + konteks,
            },
            { role: 'user', content: query },
          ],
        }),
      })

      if (!res.ok) {
        const txt = await res.text()
        let errMsg = txt
        try { errMsg = JSON.parse(txt).error?.message || txt } catch {}
        throw new APIError(res.status, formatError(res.status, errMsg, 'Perplexity'))
      }

      const data = await res.json()
      return {
        content: data.choices[0].message.content,
        citations: data.citations ?? [],
      }
    } catch (err: any) {
      lastError = err
      if (err.name === 'APIError' && [401, 403, 429, 500, 502, 503, 504].includes(err.status)) {
        continue
      }
      throw err
    }
  }

  throw lastError
}

export interface ExtractPoliResult {
  daftar_pasien: PoliLogItem[]
  total: number
}

export async function extractPoliPatientsFromImage(
  attachment: { type: string; dataUrl: string },
  hospitalName?: string
): Promise<ExtractPoliResult> {
  const keys = getAllKeys()
  if (!keys.length) throw new Error('Isi API Key di Pengaturan terlebih dahulu.')

  let lastError = new Error('Gagal memproses gambar register poli')

  const promptText = `Anda adalah asisten medis spesialis digitalisasi register pasien poliklinik rumah sakit.
Tugas Anda adalah membaca gambar foto layar monitor e-RM, buku register perawat, atau daftar antrean pasien poliklinik${hospitalName ? ` di ${hospitalName}` : ''}, dan mengekstrak daftar pasien yang tertera.

Format JSON yang HARUS dikembalikan:
{
  "daftar_pasien": [
    {
      "nama": "Nama lengkap pasien",
      "no_rm": "Nomor rekam medis jika terlihat (atau string kosong)",
      "jaminan": "BPJS",
      "keterangan": "Diagnosis / tindakan / poli / catatan singkat jika ada"
    }
  ],
  "total": 0
}

Aturan ekstraksi:
1. Baca setiap baris pasien yang terlihat jelas atau terbaca. Jika ada nomor urut, hitung dengan teliti.
2. Jaminan:
   - Jika ada kata BPJS / JKN / KIS / PBI / Non-PBI -> "BPJS"
   - Jika ada kata UMUM / TUNAI / SENDIRI / BAYAR -> "Umum"
   - Jika ada nama asuransi komersial -> "Asuransi"
   - Jika ragu atau tidak tertulis jelas, default ke "BPJS".
3. "total" adalah jumlah total pasien yang berhasil diekstrak dalam array "daftar_pasien".
4. Hanya kembalikan JSON valid tanpa pembungkus markdown atau komentar teks.`

  for (const key of cheapestFirst(keys)) {
    const provider = getProvider(key)
    if (provider === 'anthropic') continue

    try {
      let res: Response | null = null

      if (provider === 'openai') {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
                  { type: 'image_url', image_url: { url: attachment.dataUrl } }
                ],
              },
            ],
          }),
        })
      } else {
        const googleModels = GOOGLE_MODELS
        const b64 = attachment.dataUrl.split(',')[1]
        const parts: any[] = [
          { text: promptText },
          { inline_data: { mime_type: attachment.type, data: b64 } }
        ]

        for (let mIdx = 0; mIdx < googleModels.length; mIdx++) {
          const model = googleModels[mIdx]
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          })
          const isLastModel = mIdx === googleModels.length - 1
          if (res && (res.status === 404 || res.status === 400 || res.status === 403 || res.status === 503) && !isLastModel) {
            continue
          }
          break
        }
      }

      if (!res || !res.ok) {
        const txt = res ? await res.text() : 'No response from AI'
        let errMsg = txt
        try { errMsg = JSON.parse(txt).error?.message || txt } catch {}
        throw new APIError(res?.status || 500, formatError(res?.status || 500, errMsg, provider === 'openai' ? 'OpenAI' : 'Gemini'))
      }

      const data = await res.json()
      let resultText = ''
      if (provider === 'openai') {
        resultText = data.choices[0].message.content
      } else {
        resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      }
      const jsonMatch = resultText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (jsonMatch) resultText = jsonMatch[0]
      const parsed = JSON.parse(resultText)
      const list: PoliLogItem[] = Array.isArray(parsed.daftar_pasien) ? parsed.daftar_pasien : []
      return {
        daftar_pasien: list,
        total: typeof parsed.total === 'number' && parsed.total > 0 ? parsed.total : list.length,
      }
    } catch (err: any) {
      lastError = err
      if (err.name === 'APIError' && [400, 401, 403, 404, 429, 500, 502, 503, 504].includes(err.status)) {
        continue
      }
      throw err
    }
  }

  throw lastError
}

