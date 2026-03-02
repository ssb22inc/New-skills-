import { create } from 'zustand';
import { Match } from '@/types/matching';

interface MatchState {
  matches: Match[];
  currentIndex: number;
  isLoading: boolean;
  setMatches: (matches: Match[]) => void;
  nextMatch: () => void;
  previousMatch: () => void;
  setCurrentIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  updateMatchAction: (listingId: string, action: string) => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  matches: [],
  currentIndex: 0,
  isLoading: false,
  setMatches: (matches) => set({ matches, currentIndex: 0 }),
  nextMatch: () =>
    set((state) => ({
      currentIndex: Math.min(state.currentIndex + 1, state.matches.length - 1),
    })),
  previousMatch: () =>
    set((state) => ({
      currentIndex: Math.max(state.currentIndex - 1, 0),
    })),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setLoading: (isLoading) => set({ isLoading }),
  updateMatchAction: (listingId, action) =>
    set((state) => ({
      matches: state.matches.map((m) =>
        m.listing.id === listingId
          ? { ...m, seeker_action: action as Match['seeker_action'] }
          : m
      ),
    })),
}));
