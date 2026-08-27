import type { Jaminan, KategoriTerapi, RegexField } from './db'
import { getNeuroLockPrompt, getAnalisisInstruksi, RAPIKAN_INSTRUKSI, DIRECT_EDIT_INSTRUKSI } from './prompts'
import { db } from './db'

class APIError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'APIError'
  }
}

function getAllKeys(): string[] {
  const local = localStorage.getItem('doctoid_openai_key')
  const envKeys = import.meta.env.AI_SHARED_KEYS?.split(',') || []
  const allKeys = []
  allKeys.push(...envKeys)
  if (local) allKeys.push(local)
  return allKeys.filter(k => !!k.trim())
}

function getProvider(key: string): 'openai' | 'google' | 'anthropic' {
  if (key.startsWith('sk-ant')) return 'anthropic'
  if (key.startsWith('sk-')) return 'openai'
  if (key.startsWith('AIza') || key.startsWith('AQ.')) return 'google'
  return 'google'
}

/* Fase Hemat Token: Gemini Flash dicoba dulu (termurah), baru OpenAI gpt-4o-mini */
const PROVIDER_COST_TIER: Record<string, number> = { google: 0, openai: 1, anthropic: 2 }
function cheapestFirst(keys: string[]): string[] {
  return [...keys].sort((a, b) => PROVIDER_COST_TIER[getProvider(a)] - PROVIDER_COST_TIER[getProvider(b)])
}

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
  if (status === 404) return `Model AI ${provider} tidak ditemukan (Error 404).`
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

/* Mode Rapikan — LLM generik memparse teks berantakan + sugesti ICD */
export async function rapikan(text: string, attachments: { type: string; dataUrl: string }[] = [], isRingkas: boolean = true): Promise<RapikanResult> {
  const keys = getAllKeys()
  if (!keys.length) throw new Error('Isi API Key di Pengaturan terlebih dahulu.')

  let lastError = new Error('Gagal menghubungi AI Server')

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
        const contentParts: any[] = [{ type: 'text', text: text || 'Tolong rapikan data ini sesuai instruksi.' }]
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
        // Google Gemini model fallback chain
        const googleModels = ['gemini-3.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest']
        const parts: any[] = [{ text: systemPrompt + '\n\n[INPUT KASUS]\n' + (text || 'Tolong rapikan gambar/data ini sesuai schema JSON.') }]
        for (const att of attachments) {
          if (att.type.startsWith('image/')) {
            const b64 = att.dataUrl.split(',')[1]
            parts.push({ inline_data: { mime_type: att.type, data: b64 } })
          }
        }
        
        for (let mIdx = 0; mIdx < googleModels.length; mIdx++) {
          const model = googleModels[mIdx]
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
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

  let lastError = new Error('Gagal menghubungi AI Server')

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
        const googleModels = ['gemini-3.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest']
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
        const err = new Error(txt)
        ;(err as any).status = res?.status
        ;(err as any).name = 'APIError'
        throw err
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

  let lastError = new Error('Gagal menghubungi AI Server')

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
        const googleModels = ['gemini-3.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest']
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
