import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth'
import { Capacitor } from '@capacitor/core'

const CRED_KEY = 'doctoid_webauthn_cred'

export async function checkBiometricAvailable(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const info = await BiometricAuth.checkBiometry()
      return info.isAvailable && info.biometryType !== BiometryType.none
    }
    return !!window.PublicKeyCredential
  } catch {
    return false
  }
}

export async function verifyBiometric(): Promise<boolean> {
  // 1. JALUR NATIVE ANDROID / IOS: Menggunakan BiometricPrompt bawaan OS HP
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await BiometricAuth.checkBiometry()
      if (info.isAvailable && info.biometryType !== BiometryType.none) {
        await BiometricAuth.authenticate({
          reason: 'Verifikasi identitas dokter untuk membuka data rekam medis',
          cancelTitle: 'Batal',
          allowDeviceCredential: true,
        })
        return true
      }
      return false
    } catch (e: any) {
      console.warn('Native biometric error/cancel:', e)
      return false
    }
  }

  // 2. JALUR WEB BROWSER / PWA: Menggunakan WebAuthn (Passkey / Windows Hello / Touch ID)
  if (window.PublicKeyCredential) {
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
    } catch (err: any) {
      console.warn('WebAuthn biometric error/cancel:', err)
      return false
    }
  }

  return false
}
