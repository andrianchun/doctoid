import { create } from 'zustand'

export interface SessionKeys {
  entropy: Uint8Array
  rootKey: CryptoKey
}

interface UiState {
  unmasked: boolean
  setUnmasked: (v: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  sessionKeys: SessionKeys | null // hanya di memori — hilang saat tab ditutup/dikunci
  setSessionKeys: (v: SessionKeys | null) => void
}

export const useUi = create<UiState>((set) => ({
  unmasked: false,
  setUnmasked: (unmasked) => set({ unmasked }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  sessionKeys: null,
  setSessionKeys: (sessionKeys) => set({ sessionKeys }),
}))

/* Palet warna ala Notion untuk RS & ruangan */
export const PALETTE = [
  '#5B7FFF', '#60A5FA', '#2DD4BF', '#34D399', '#FBBF24',
  '#FB923C', '#F87171', '#F472B6', '#A78BFA', '#94A3B8',
]
