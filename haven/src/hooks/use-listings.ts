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
    } catch (err: any) {
      setError(err.message);
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
      if (!res.ok) throw new Error('Failed to create listing');
      return await res.json();
    } catch (err: any) {
      setError(err.message);
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
      if (!res.ok) throw new Error('Failed to update listing');
      return await res.json();
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { listings, loading, error, pagination, fetchListings, createListing, updateListing };
}
