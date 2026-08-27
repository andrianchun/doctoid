const CRED_KEY = 'doctoid_webauthn_cred'

/* Fallback tanpa sensor biometrik: verifikasi PIN layar jika ada */
async function pinFallback(): Promise<boolean> {
  const storedPin = localStorage.getItem('doctoid_screen_pin')
  if (!storedPin) return true
  const pin = window.prompt('Sensor biometrik tidak tersedia.\nMasukkan PIN Kunci Layar:')
  if (!pin) return false
  return pin.trim() === storedPin.trim()
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
