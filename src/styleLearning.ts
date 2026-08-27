import { db, type KategoriTerapi } from './db'

/* Mesin Pembelajar Preferensi Terapi (lokal, TF-IDF cosine — bukan embedding model, tanpa dependency baru).
   ponytail: TF-IDF kata-kunci, bukan embedding semantik — upgrade jika sinonim medis (mis. "SNH" vs "stroke iskemik") perlu dicocokkan. */

const STOPWORDS = new Set(['dan', 'di', 'ke', 'yang', 'dengan', 'pada', 'atau', 'ada', 'tidak', 'tanpa', 'dari', 'untuk'])

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

function tf(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1)
  return m
}

function cosineSim(a: Map<string, number>, b: Map<string, number>, idf: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const wa = (a.get(k) ?? 0) * (idf.get(k) ?? 0)
    const wb = (b.get(k) ?? 0) * (idf.get(k) ?? 0)
    dot += wa * wb
    na += wa * wa
    nb += wb * wb
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

export const buatKonteks = (S: string, diagnosis: string[]) => [S, ...diagnosis].filter(Boolean).join(' ')

/* Panggil saat pasien disimpan — merekam terapi yang dipilih dokter untuk konteks kasus ini */
export async function catatTerapi(
  konteks: string,
  items: { nama_item: string; dosis_keterangan: string; kategori: KategoriTerapi }[],
) {
  if (!konteks.trim()) return
  const created_at = new Date().toISOString()
  for (const it of items) {
    if (!it.nama_item.trim()) continue
    await db.therapyHistory.add({ konteks, ...it, created_at })
  }
}

export interface Suggestion {
  nama_item: string
  dosis_keterangan: string
  kategori: KategoriTerapi
  score: number
}

const MIN_HISTORY = 3 // korpus terlalu kecil → IDF tidak bermakna, skip
const MIN_OCCURRENCE = 2 // hindari saran dari satu kasus kebetulan
const MIN_SCORE = 0.12

/* Cari terapi yang sering dipakai dokter pada kasus dengan konteks (S + diagnosis) serupa */
export async function saranTerapi(konteks: string, sudahAda: string[]): Promise<Suggestion[]> {
  const history = await db.therapyHistory.toArray()
  if (history.length < MIN_HISTORY || !konteks.trim()) return []

  const docs = history.map((h) => tf(tokenize(h.konteks)))
  const df = new Map<string, number>()
  for (const d of docs) for (const k of d.keys()) df.set(k, (df.get(k) ?? 0) + 1)
  const N = docs.length
  const idf = new Map<string, number>()
  for (const [k, c] of df) idf.set(k, Math.log((N + 1) / (c + 1)) + 1)

  const queryVec = tf(tokenize(konteks))
  const exclude = new Set(sudahAda.map((s) => s.toLowerCase().trim()))

  const byItem = new Map<string, { total: number; count: number; sample: (typeof history)[0] }>()
  history.forEach((h, i) => {
    const key = h.nama_item.toLowerCase().trim()
    if (exclude.has(key)) return
    const sim = cosineSim(queryVec, docs[i], idf)
    const cur = byItem.get(key) ?? { total: 0, count: 0, sample: h }
    cur.total += sim
    cur.count += 1
    byItem.set(key, cur)
  })

  return [...byItem.values()]
    .filter((v) => v.count >= MIN_OCCURRENCE)
    .map((v) => ({
      nama_item: v.sample.nama_item,
      dosis_keterangan: v.sample.dosis_keterangan,
      kategori: v.sample.kategori,
      score: v.total / v.count,
    }))
    .filter((s) => s.score > MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}
