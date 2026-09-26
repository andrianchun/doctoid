import { create } from 'zustand'
import type { UserProfile } from './auth'

export interface SessionKeys {
  entropy: Uint8Array
  rootKey: CryptoKey
}

const COLLAPSED_RS_KEY = 'doctoid_collapsed_rs'
const COLLAPSED_WARDS_KEY = 'doctoid_collapsed_wards'

const getStoredMap = (key: string): Record<number, boolean> => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const saveStoredMap = (key: string, data: Record<number, boolean>) => {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {}
}

interface UiState {
  unmasked: boolean
  setUnmasked: (v: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  user: UserProfile | null
  setUser: (u: UserProfile | null) => void
  authLoading: boolean
  setAuthLoading: (v: boolean) => void
  isUnlocked: boolean
  setIsUnlocked: (v: boolean) => void
  sessionKeys: SessionKeys | null // untuk backward compatibility enkripsi lokal/sync
  setSessionKeys: (v: SessionKeys | null) => void
  collapsedRs: Record<number, boolean>
  setCollapsedRs: (val: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)) => void
  toggleCollapsedRs: (id: number, currentCollapsed: boolean) => void
  expandHospital: (id: number) => void
  collapsedWards: Record<number, boolean>
  setCollapsedWards: (val: Record<number, boolean> | ((prev: Record<number, boolean>) => Record<number, boolean>)) => void
  toggleCollapsedWard: (id: number, currentCollapsed: boolean) => void
  expandWard: (id: number) => void
}

export const useUi = create<UiState>((set) => ({
  unmasked: false,
  setUnmasked: (unmasked) => set({ unmasked }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  user: null,
  setUser: (user) => set({ user }),
  authLoading: true,
  setAuthLoading: (authLoading) => set({ authLoading }),
  isUnlocked: false,
  setIsUnlocked: (isUnlocked) => set({ isUnlocked }),
  sessionKeys: null,
  setSessionKeys: (sessionKeys) => set({ sessionKeys }),
  collapsedRs: getStoredMap(COLLAPSED_RS_KEY),
  setCollapsedRs: (val) =>
    set((state) => {
      const next = typeof val === 'function' ? val(state.collapsedRs) : val
      saveStoredMap(COLLAPSED_RS_KEY, next)
      return { collapsedRs: next }
    }),
  toggleCollapsedRs: (id, currentCollapsed) =>
    set((state) => {
      const next = { ...state.collapsedRs, [id]: !currentCollapsed }
      saveStoredMap(COLLAPSED_RS_KEY, next)
      return { collapsedRs: next }
    }),
  expandHospital: (id) =>
    set((state) => {
      if (state.collapsedRs[id] === false) return {}
      const next = { ...state.collapsedRs, [id]: false }
      saveStoredMap(COLLAPSED_RS_KEY, next)
      return { collapsedRs: next }
    }),
  collapsedWards: getStoredMap(COLLAPSED_WARDS_KEY),
  setCollapsedWards: (val) =>
    set((state) => {
      const next = typeof val === 'function' ? val(state.collapsedWards) : val
      saveStoredMap(COLLAPSED_WARDS_KEY, next)
      return { collapsedWards: next }
    }),
  toggleCollapsedWard: (id, currentCollapsed) =>
    set((state) => {
      const next = { ...state.collapsedWards, [id]: !currentCollapsed }
      saveStoredMap(COLLAPSED_WARDS_KEY, next)
      return { collapsedWards: next }
    }),
  expandWard: (id) =>
    set((state) => {
      if (state.collapsedWards[id] === false) return {}
      const next = { ...state.collapsedWards, [id]: false }
      saveStoredMap(COLLAPSED_WARDS_KEY, next)
      return { collapsedWards: next }
    }),
}))

/* Palet warna ala Notion untuk RS & ruangan */
export const PALETTE = [
  '#5B7FFF', '#60A5FA', '#2DD4BF', '#34D399', '#FBBF24',
  '#FB923C', '#F87171', '#F472B6', '#A78BFA', '#94A3B8',
]
