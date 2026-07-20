/* E2EE inti: Master PIN membungkus entropy → Root Key (AES-GCM 256).
   Recovery phrase = 12 kata yang meng-encode entropy 96-bit.
   ponytail: wordlist 256 kata (96-bit), bukan BIP39 2048 kata — upgrade jika perlu interop dompet standar */

export const WORDS = (
  'able,acid,aged,also,area,army,away,baby,back,ball,band,bank,base,bath,bear,beat,' +
  'bed,bell,belt,bend,bird,blue,boat,body,bone,book,born,both,bowl,boy,bread,brief,' +
  'broad,brown,build,burn,bush,busy,cake,call,calm,camp,card,care,cart,case,cash,cat,' +
  'cell,chair,chart,cheap,chest,chief,child,city,clean,clear,clock,close,cloud,coal,coast,coat,' +
  'code,cold,come,cook,cool,cope,copy,core,corn,cost,crew,crop,cross,crowd,cup,dark,' +
  'data,date,dawn,day,dead,deal,dean,dear,debt,deep,deer,desk,dish,dog,door,dose,' +
  'down,draw,dream,dress,drink,drive,drop,drum,dry,duck,dust,duty,each,earn,east,easy,' +
  'edge,face,fact,fair,fall,farm,fast,fate,fear,feed,feel,few,field,file,film,find,' +
  'fine,fire,firm,fish,five,flag,flat,flow,food,foot,ford,form,fort,four,free,fresh,' +
  'front,fruit,fuel,full,fund,gain,game,gate,gift,girl,give,glad,glass,goal,goat,gold,' +
  'golf,good,gray,great,green,group,grow,gulf,hair,half,hall,hand,hang,hard,harm,hat,' +
  'head,hear,heat,hero,hide,high,hill,hold,hole,home,hope,horn,horse,host,hour,house,' +
  'huge,hunt,idea,inch,iron,item,jack,jade,jar,jazz,jean,job,join,joke,judge,juice,' +
  'jump,jury,keen,keep,kind,king,knee,knife,lab,lack,lake,land,lane,large,last,late,' +
  'lead,leaf,lean,left,leg,less,life,lift,light,like,lime,line,link,lion,lip,list,' +
  'load,loan,lock,long,look,lord,lose,loss,lot,loud,love,low,luck,made,mail,main'
).split(',')

const te = new TextEncoder()
export const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const genEntropy = () => crypto.getRandomValues(new Uint8Array(12)) // 96-bit

export const entropyToPhrase = (e: Uint8Array) => [...e].map((b) => WORDS[b]).join(' ')

export function phraseToEntropy(phrase: string): Uint8Array {
  const idx = phrase.trim().toLowerCase().split(/\s+/).map((w) => WORDS.indexOf(w))
  if (idx.length !== 12 || idx.some((i) => i < 0)) throw new Error('Recovery phrase tidak valid (harus 12 kata dari daftar).')
  return new Uint8Array(idx)
}

async function deriveKey(secret: BufferSource, salt: BufferSource, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export const deriveRootKey = (entropy: Uint8Array) =>
  deriveKey(entropy as BufferSource, te.encode('doctoid-root-v1'), 100_000)

/* Kunci terpisah untuk enkripsi data lokal (Dexie), didomain-pisah dari rootKey sync */
export const deriveLocalKey = (entropy: Uint8Array) =>
  deriveKey(entropy as BufferSource, te.encode('doctoid-local-v1'), 100_000)

/* Vault: entropy dibungkus PIN, disimpan localStorage */
const VAULT = 'doctoid_vault'

export const vaultExists = () => !!localStorage.getItem(VAULT)

export async function wrapEntropy(entropy: Uint8Array, pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(te.encode(pin), salt, 310_000)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, entropy as BufferSource)
  localStorage.setItem(VAULT, JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) }))
}

export async function unwrapEntropy(pin: string): Promise<Uint8Array> {
  const v = JSON.parse(localStorage.getItem(VAULT)!)
  const key = await deriveKey(te.encode(pin), unb64(v.salt), 310_000)
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.ct))
    return new Uint8Array(pt)
  } catch {
    throw new Error('PIN salah.')
  }
}

/* Payload sync terenkripsi (zero-knowledge: server hanya lihat ciphertext) */
export async function encryptJson(key: CryptoKey, obj: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)))
  return b64(iv) + '.' + b64(ct)
}

export async function decryptJson<T>(key: CryptoKey, payload: string): Promise<T> {
  const [iv, ct] = payload.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct))
  return JSON.parse(new TextDecoder().decode(pt))
}

/* ID dokumen sync: hash entropy — bukan rahasia, hanya penunjuk lokasi ciphertext */
export async function syncIdFromEntropy(entropy: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array([...entropy, ...te.encode('sync-v1')]))
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
