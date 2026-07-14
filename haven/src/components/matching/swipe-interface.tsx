'use client';

import { useEffect } from 'react';
import { useMatches } from '@/hooks/use-matches';
import { useMatchStore } from '@/stores/match-store';
import { MatchCard } from './match-card';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { EmptyState } from '@/components/common/empty-state';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SwipeInterface() {
  const router = useRouter();
  const { fetchMatches, recordAction, loading, error } = useMatches();
  const { matches, currentIndex, nextMatch, setMatches } = useMatchStore();

  useEffect(() => {
    // fetchMatches is a stable useCallback; setMatches is a stable zustand setter.
    fetchMatches({ limit: 20, minScore: 40 }).then((data) => {
      if (data) setMatches(data);
    });
  }, [fetchMatches, setMatches]);

  const currentMatch = matches[currentIndex];

  const handleLike = async () => {
    if (!currentMatch) return;
    await recordAction(currentMatch.listing.id, 'liked');
    nextMatch();
  };

  const handleSkip = async () => {
    if (!currentMatch) return;
    await recordAction(currentMatch.listing.id, 'skipped');
    nextMatch();
  };

  const handleViewDetails = () => {
    if (!currentMatch) return;
    router.push(`/listings/${currentMatch.listing.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Something went wrong"
        description={error}
        action={{ label: 'Try again', onClick: () => fetchMatches() }}
      />
    );
  }

  if (!currentMatch || currentIndex >= matches.length) {
    return (
      <EmptyState
        icon={Heart}
        title="No more matches"
        description="Check back later for new listings that match your preferences"
        action={{ label: 'Refresh', onClick: () => fetchMatches() }}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-4 text-center text-sm text-gray-500">
        {currentIndex + 1} of {matches.length} matches
      </div>
      
      <MatchCard
        match={currentMatch}
        onLike={handleLike}
        onSkip={handleSkip}
        onViewDetails={handleViewDetails}
      />
    </div>
  );
}
