import { create } from 'zustand'
import type { MatchWithDetails } from '@/types/matching'

interface MatchState {
  matches: MatchWithDetails[]
  currentIndex: number
  isLoading: boolean
  setMatches: (matches: MatchWithDetails[]) => void
  nextMatch: () => void
  prevMatch: () => void
  setLoading: (loading: boolean) => void
}

export const useMatchStore = create<MatchState>((set) => ({
  matches: [],
  currentIndex: 0,
  isLoading: false,
  setMatches: (matches) => set({ matches, currentIndex: 0 }),
  nextMatch: () => set((state) => ({
    currentIndex: Math.min(state.currentIndex + 1, state.matches.length - 1),
  })),
  prevMatch: () => set((state) => ({
    currentIndex: Math.max(state.currentIndex - 1, 0),
  })),
  setLoading: (isLoading) => set({ isLoading }),
}))
