'use client';

import { useState, useCallback } from 'react';
import { Match } from '@/types/matching';

export function useMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async (params?: { limit?: number; minScore?: number }) => {
    setLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.minScore) searchParams.set('minScore', String(params.minScore));

      const res = await fetch(`/api/matches?${searchParams}`);
      if (!res.ok) throw new Error('Failed to fetch matches');

      const data = await res.json();
      const fetched: Match[] = data.matches ?? [];
      setMatches(fetched);
      return fetched;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch matches');
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  const recordAction = async (listingId: string, action: 'liked' | 'skipped' | 'saved') => {
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, action }),
      });
      if (!res.ok) throw new Error('Failed to record action');

      setMatches(prev =>
        prev.map(m =>
          m.listing.id === listingId ? { ...m, seeker_action: action } : m
        )
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record action');
    }
  };

  return { matches, loading, error, fetchMatches, recordAction };
}
