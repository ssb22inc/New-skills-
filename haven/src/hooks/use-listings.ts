'use client';

import { useState, useCallback } from 'react';
import { ListingWithPhotos, ListingSearchParams } from '@/types/listing';

export function useListings() {
  const [listings, setListings] = useState<ListingWithPhotos[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  const fetchListings = useCallback(async (params?: ListingSearchParams) => {
    setLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) searchParams.set(key, String(value));
        });
      }

      const res = await fetch(`/api/listings?${searchParams}`);
      if (!res.ok) throw new Error('Failed to fetch listings');

      const data = await res.json();
      setListings(data.listings);
      setPagination(data.pagination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch listings');
    } finally {
      setLoading(false);
    }
  }, []);

  const createListing = async (data: Partial<ListingWithPhotos>) => {
    setLoading(true);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to create listing');
      }
      return await res.json();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create listing';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateListing = async (id: string, data: Partial<ListingWithPhotos>) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to update listing');
      }
      return await res.json();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update listing';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteListing = async (id: string) => {
    const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to delete listing');
    }
  };

  return { listings, loading, error, pagination, fetchListings, createListing, updateListing, deleteListing };
}
