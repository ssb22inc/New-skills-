import { create } from 'zustand';
import { ListingWithPhotos, ListingFilters } from '@/types/listing';

interface ListingState {
  listings: ListingWithPhotos[];
  currentListing: ListingWithPhotos | null;
  filters: ListingFilters;
  isLoading: boolean;
  setListings: (listings: ListingWithPhotos[]) => void;
  setCurrentListing: (listing: ListingWithPhotos | null) => void;
  setFilters: (filters: Partial<ListingFilters>) => void;
  setLoading: (loading: boolean) => void;
  clearFilters: () => void;
}

export const useListingStore = create<ListingState>((set) => ({
  listings: [],
  currentListing: null,
  filters: {},
  isLoading: false,
  setListings: (listings) => set({ listings }),
  setCurrentListing: (currentListing) => set({ currentListing }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setLoading: (isLoading) => set({ isLoading }),
  clearFilters: () => set({ filters: {} }),
}));
