/* Gerbang biometrik lokal untuk unmask data pasien.
   Credential platform dipakai murni sebagai user-verification lokal —
   tidak ada server, jadi challenge acak lokal sudah cukup. */
import { vaultExists, unwrapEntropy } from './crypto'

const CRED_KEY = 'doctoid_webauthn_cred'

/* Fallback tanpa sensor biometrik: verifikasi Master PIN */
async function pinFallback(): Promise<boolean> {
  if (!vaultExists()) return true // belum setup vault (mis. onboarding) — jangan kunci user
  const pin = window.prompt('Sensor biometrik tidak tersedia.\nMasukkan Master PIN:')
  if (!pin) return false
  try {
    await unwrapEntropy(pin)
    return true
  } catch {
    return false
  }
}

export async function verifyBiometric(): Promise<boolean> {
  if (!window.PublicKeyCredential) return pinFallback()
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  try {
    const storedId = localStorage.getItem(CRED_KEY)
    if (!storedId) {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Doctoid', id: location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: 'doctoid-user',
            displayName: 'Doctoid',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null
      if (!cred) return false
      localStorage.setItem(
        CRED_KEY,
        btoa(String.fromCharCode(...new Uint8Array(cred.rawId))),
      )
      return true
    }
    const rawId = Uint8Array.from(atob(storedId), (c) => c.charCodeAt(0))
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: rawId }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return !!assertion
  } catch {
    return pinFallback() // authenticator platform gagal/tidak ada → PIN
  }
}
