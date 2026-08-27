import { create } from 'zustand'
import type { UserProfile } from './auth'

export interface SessionKeys {
  entropy: Uint8Array
  rootKey: CryptoKey
}

interface UiState {
  unmasked: boolean
  setUnmasked: (v: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  user: UserProfile | null
  setUser: (u: UserProfile | null) => void
  isUnlocked: boolean
  setIsUnlocked: (v: boolean) => void
  sessionKeys: SessionKeys | null // untuk backward compatibility enkripsi lokal/sync
  setSessionKeys: (v: SessionKeys | null) => void
}

export const useUi = create<UiState>((set) => ({
  unmasked: false,
  setUnmasked: (unmasked) => set({ unmasked }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  user: null,
  setUser: (user) => set({ user }),
  isUnlocked: false,
  setIsUnlocked: (isUnlocked) => set({ isUnlocked }),
  sessionKeys: null,
  setSessionKeys: (sessionKeys) => set({ sessionKeys }),
}))

/* Palet warna ala Notion untuk RS & ruangan */
export const PALETTE = [
  '#5B7FFF', '#60A5FA', '#2DD4BF', '#34D399', '#FBBF24',
  '#FB923C', '#F87171', '#F472B6', '#A78BFA', '#94A3B8',
]
