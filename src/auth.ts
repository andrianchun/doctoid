import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'

export interface UserProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  specialty?: string | null
}

const LOCAL_USER_KEY = 'doctoid_user_profile'
const LOCAL_SPECIALTY_KEY = 'doctoid_doctor_specialty'
const FB_CONFIG_KEY = 'doctoid_fb_config'

export function getDoctorSpecialty(): string {
  const raw = localStorage.getItem(LOCAL_SPECIALTY_KEY)
  if (raw && raw.trim()) return raw.trim()
  const u = getSavedUserProfile()
  if (u?.specialty && u.specialty.trim()) return u.specialty.trim()
  return 'Spesialis Neurologi / Saraf (Sp.N)'
}

export function saveDoctorSpecialty(specialty: string) {
  localStorage.setItem(LOCAL_SPECIALTY_KEY, specialty.trim())
}

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAtzL9rHyDRYnaStK90cMrNKq7ucCTLveI',
  authDomain: 'docto-id.firebaseapp.com',
  projectId: 'docto-id',
  storageBucket: 'docto-id.firebasestorage.app',
  messagingSenderId: '1037044059481',
  appId: '1:1037044059481:web:331dc3938d7172fdaf5048',
}

export function getStoredFirebaseConfig(): Record<string, string> {
  try {
    const raw = localStorage.getItem(FB_CONFIG_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return DEFAULT_FIREBASE_CONFIG
}

export function getFirebaseApp(): FirebaseApp {
  const config = getStoredFirebaseConfig()
  try {
    const apps = getApps()
    return apps.length > 0 ? apps[0] : initializeApp(config)
  } catch (e) {
    console.error('Failed to init Firebase App', e)
    return initializeApp(config)
  }
}

export function getFirebaseAuth(): Auth {
  const app = getFirebaseApp()
  return getAuth(app)
}

export async function fetchCloudUserProfile(uid: string): Promise<Partial<UserProfile> | null> {
  if (!uid || uid === 'local') return null
  try {
    const app = getFirebaseApp()
    const fs = getFirestore(app)
    const snap = await getDoc(doc(fs, 'users', uid))
    if (snap.exists()) {
      const data = snap.data()
      return {
        displayName: data.displayName || null,
        photoURL: data.photoURL || null,
        specialty: data.specialty || null,
      }
    }
  } catch (err) {
    console.warn('Gagal membaca profil cloud dari Firestore:', err)
  }
  return null
}

export function getSavedUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return null
}

export function saveUserProfile(user: UserProfile | null) {
  if (user) {
    const existing = getSavedUserProfile()
    const merged = { ...existing, ...user }
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(merged))
    if (user.specialty) {
      saveDoctorSpecialty(user.specialty)
    }
  } else {
    localStorage.removeItem(LOCAL_USER_KEY)
  }
}

export async function saveUserProfileCloud(profile: UserProfile): Promise<void> {
  saveUserProfile(profile)
  if (profile.specialty) {
    saveDoctorSpecialty(profile.specialty)
  }

  // 1. Simpan ke Firebase Auth Profile (untuk popup / native auth session)
  try {
    const auth = getFirebaseAuth()
    if (auth.currentUser && profile.displayName) {
      await updateProfile(auth.currentUser, {
        displayName: profile.displayName,
        photoURL: profile.photoURL || undefined,
      })
    }
  } catch (e) {
    console.warn('Firebase Auth updateProfile:', e)
  }

  // 2. Simpan ke Firestore users/{uid} secara lengkap & numerik updatedAt
  if (profile.uid && profile.uid !== 'local') {
    try {
      const app = getFirebaseApp()
      const fs = getFirestore(app)
      await setDoc(
        doc(fs, 'users', profile.uid),
        {
          displayName: profile.displayName || null,
          photoURL: profile.photoURL || null,
          specialty: profile.specialty || getDoctorSpecialty(),
          email: profile.email || null,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    } catch (err) {
      console.warn('Gagal sinkronisasi profil ke Firestore users document:', err)
    }
  }
}

export async function uploadDoctorAvatar(fileOrDataUrl: File | string, uid: string): Promise<string> {
  let dataUrl: string
  if (typeof fileOrDataUrl === 'string') {
    dataUrl = fileOrDataUrl
  } else {
    dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(fileOrDataUrl)
    })
  }

  const current = getSavedUserProfile()
  const updated: UserProfile = {
    uid: uid || current?.uid || 'local',
    email: current?.email || null,
    displayName: current?.displayName || 'Dokter',
    photoURL: dataUrl,
    specialty: current?.specialty || getDoctorSpecialty(),
  }

  await saveUserProfileCloud(updated)
  return dataUrl
}

export async function loginWithGoogle(): Promise<UserProfile> {
  const auth = getFirebaseAuth()

  if (Capacitor.isNativePlatform()) {
    // JALUR APK NATIVE ANDROID: Dialog pemilih akun Google bawaan HP
    const res = await FirebaseAuthentication.signInWithGoogle()
    const idToken = res.credential?.idToken
    if (!idToken) throw new Error('Gagal mendapatkan token akun Google dari perangkat.')
    const credential = GoogleAuthProvider.credential(idToken)
    const userCred = await signInWithCredential(auth, credential)
    const saved = getSavedUserProfile()
    const cloud = await fetchCloudUserProfile(userCred.user.uid)

    const profile: UserProfile = {
      uid: userCred.user.uid,
      email: userCred.user.email,
      displayName: cloud?.displayName || saved?.displayName || userCred.user.displayName || 'Dokter',
      photoURL: cloud?.photoURL || saved?.photoURL || userCred.user.photoURL,
      specialty: cloud?.specialty || saved?.specialty || getDoctorSpecialty(),
    }
    await saveUserProfileCloud(profile)
    return profile
  } else {
    // JALUR WEB BROWSER / PWA
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    const res = await signInWithPopup(auth, provider)
    const saved = getSavedUserProfile()
    const cloud = await fetchCloudUserProfile(res.user.uid)

    const profile: UserProfile = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: cloud?.displayName || saved?.displayName || res.user.displayName || 'Dokter',
      photoURL: cloud?.photoURL || saved?.photoURL || res.user.photoURL,
      specialty: cloud?.specialty || saved?.specialty || getDoctorSpecialty(),
    }
    await saveUserProfileCloud(profile)
    return profile
  }
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth()
  if (auth) {
    try {
      await signOut(auth)
    } catch {
      // ignore
    }
  }
  if (Capacitor.isNativePlatform()) {
    try {
      await FirebaseAuthentication.signOut()
    } catch {
      // ignore
    }
  }
  saveUserProfile(null)
  localStorage.removeItem('doctoid_unlocked')
}

export function initAuthListener(onUserChanged: (user: UserProfile | null) => void): () => void {
  const auth = getFirebaseAuth()
  if (!auth) {
    const saved = getSavedUserProfile()
    onUserChanged(saved)
    return () => {}
  }

  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
    const saved = getSavedUserProfile()
    if (firebaseUser) {
      const cloud = await fetchCloudUserProfile(firebaseUser.uid)

      const profile: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || saved?.email || null,
        displayName: cloud?.displayName || saved?.displayName || firebaseUser.displayName || 'Dokter',
        photoURL: cloud?.photoURL || saved?.photoURL || firebaseUser.photoURL || null,
        specialty: cloud?.specialty || saved?.specialty || getDoctorSpecialty(),
      }
      saveUserProfile(profile)
      onUserChanged(profile)
    } else {
      if (saved) {
        onUserChanged(saved)
      } else {
        saveUserProfile(null)
        onUserChanged(null)
      }
    }
  })

  return unsubscribe
}
