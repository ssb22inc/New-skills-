import { create } from 'zustand'
import type { Listing, ListingFormData, ListingFilters } from '@/types/listing'

interface ListingState {
  listings: Listing[]
  currentListing: Listing | null
  filters: ListingFilters
  isLoading: boolean
  draftFormData: Partial<ListingFormData>
  setListings: (listings: Listing[]) => void
  setCurrentListing: (listing: Listing | null) => void
  setFilters: (filters: Partial<ListingFilters>) => void
  setLoading: (loading: boolean) => void
  updateDraft: (data: Partial<ListingFormData>) => void
  clearDraft: () => void
}

export const useListingStore = create<ListingState>((set) => ({
  listings: [],
  currentListing: null,
  filters: {},
  isLoading: false,
  draftFormData: {},
  setListings: (listings) => set({ listings }),
  setCurrentListing: (currentListing) => set({ currentListing }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setLoading: (isLoading) => set({ isLoading }),
  updateDraft: (data) => set((state) => ({ draftFormData: { ...state.draftFormData, ...data } })),
  clearDraft: () => set({ draftFormData: {} }),
}))
