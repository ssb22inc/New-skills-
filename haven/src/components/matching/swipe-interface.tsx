'use client';

import { useState, useRef, useEffect } from 'react';
import { Heart, X, Info, Undo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MatchCard } from './match-card';
import { Match } from '@/types/matching';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingSpinner } from '@/components/common/loading-spinner';

interface SwipeInterfaceProps {
  matches: Match[];
  onAccept: (matchId: string) => Promise<void>;
  onReject: (matchId: string) => Promise<void>;
  onLoadMore?: () => void;
  isLoading?: boolean;
  hasMore?: boolean;
}

export function SwipeInterface({
  matches,
  onAccept,
  onReject,
  onLoadMore,
  isLoading = false,
  hasMore = false,
}: SwipeInterfaceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<{ matchId: string; action: 'accept' | 'reject' }[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  const currentMatch = matches[currentIndex];
  const remainingCount = matches.length - currentIndex;

  // Load more when getting close to the end
  useEffect(() => {
    if (remainingCount <= 2 && hasMore && onLoadMore && !isLoading) {
      onLoadMore();
    }
  }, [remainingCount, hasMore, onLoadMore, isLoading]);

  const handleAccept = async () => {
    if (!currentMatch) return;

    setSwipeDirection('right');
    setHistory((prev) => [...prev, { matchId: currentMatch.id, action: 'accept' }]);

    try {
      await onAccept(currentMatch.id);
    } catch (error) {
      console.error('Failed to accept match:', error);
      // Revert on error
      setSwipeDirection(null);
      setHistory((prev) => prev.slice(0, -1));
      return;
    }

    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeDirection(null);
    }, 300);
  };

  const handleReject = async () => {
    if (!currentMatch) return;

    setSwipeDirection('left');
    setHistory((prev) => [...prev, { matchId: currentMatch.id, action: 'reject' }]);

    try {
      await onReject(currentMatch.id);
    } catch (error) {
      console.error('Failed to reject match:', error);
      // Revert on error
      setSwipeDirection(null);
      setHistory((prev) => prev.slice(0, -1));
      return;
    }

    setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setSwipeDirection(null);
    }, 300);
  };

  const handleUndo = () => {
    if (history.length === 0 || currentIndex === 0) return;

    setHistory((prev) => prev.slice(0, -1));
    setCurrentIndex((prev) => prev - 1);
  };

  // Touch/Mouse handlers for swipe gestures
  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    startPosRef.current = { x: clientX, y: clientY };
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;

    const deltaX = clientX - startPosRef.current.x;
    const deltaY = clientY - startPosRef.current.y;
    setDragOffset({ x: deltaX, y: deltaY });
  };

  const handleDragEnd = () => {
    if (!isDragging) return;

    setIsDragging(false);

    // Determine if swipe threshold was met
    const threshold = 100;
    if (Math.abs(dragOffset.x) > threshold) {
      if (dragOffset.x > 0) {
        handleAccept();
      } else {
        handleReject();
      }
    }

    setDragOffset({ x: 0, y: 0 });
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handleReject();
      } else if (e.key === 'ArrowRight') {
        handleAccept();
      } else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentMatch]);

  // Calculate card transform based on drag/swipe
  const getCardTransform = () => {
    if (swipeDirection === 'left') {
      return 'translateX(-150%) rotate(-30deg)';
    }
    if (swipeDirection === 'right') {
      return 'translateX(150%) rotate(30deg)';
    }
    if (isDragging && dragOffset.x !== 0) {
      const rotation = dragOffset.x / 10;
      return `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) rotate(${rotation}deg)`;
    }
    return 'translateX(0) translateY(0) rotate(0)';
  };

  const getCardOpacity = () => {
    if (swipeDirection) return 0;
    if (isDragging) {
      return Math.max(0.5, 1 - Math.abs(dragOffset.x) / 300);
    }
    return 1;
  };

  if (isLoading && currentIndex === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!currentMatch && remainingCount === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="No more matches"
        description="You've reviewed all available matches. Check back later for new listings!"
        action={
          history.length > 0 ? (
            <Button onClick={handleUndo} variant="outline">
              <Undo className="h-4 w-4 mr-2" />
              Undo Last Action
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress Indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>
            {currentIndex + 1} of {matches.length}
          </span>
          <span>{remainingCount} remaining</span>
        </div>
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / matches.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Swipe Card Stack */}
      <div className="relative h-[600px] mb-6">
        {/* Next Card Preview (underneath) */}
        {matches[currentIndex + 1] && (
          <div className="absolute inset-0 scale-95 opacity-50 pointer-events-none">
            <MatchCard match={matches[currentIndex + 1]} showActions={false} />
          </div>
        )}

        {/* Current Card */}
        {currentMatch && (
          <div
            ref={cardRef}
            className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
            style={{
              transform: getCardTransform(),
              opacity: getCardOpacity(),
              transition: isDragging ? 'none' : 'all 0.3s ease-out',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <MatchCard match={currentMatch} showActions={false} />

            {/* Swipe Indicators */}
            {isDragging && (
              <>
                {dragOffset.x > 50 && (
                  <div className="absolute top-8 right-8 px-4 py-2 bg-green-500 text-white font-bold text-xl rounded-lg rotate-12 border-4 border-white shadow-lg">
                    ACCEPT
                  </div>
                )}
                {dragOffset.x < -50 && (
                  <div className="absolute top-8 left-8 px-4 py-2 bg-red-500 text-white font-bold text-xl rounded-lg -rotate-12 border-4 border-white shadow-lg">
                    PASS
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-4">
        <Button
          size="lg"
          variant="outline"
          onClick={handleReject}
          disabled={!currentMatch || !!swipeDirection}
          className="h-16 w-16 rounded-full border-2 hover:border-red-500 hover:text-red-500"
        >
          <X className="h-6 w-6" />
        </Button>

        <Button
          size="lg"
          variant="outline"
          onClick={handleUndo}
          disabled={history.length === 0 || !!swipeDirection}
          className="h-14 w-14 rounded-full"
        >
          <Undo className="h-5 w-5" />
        </Button>

        <Button
          size="lg"
          variant="outline"
          onClick={handleAccept}
          disabled={!currentMatch || !!swipeDirection}
          className="h-16 w-16 rounded-full border-2 hover:border-green-500 hover:text-green-500"
        >
          <Heart className="h-6 w-6" />
        </Button>
      </div>

      {/* Instructions */}
      <div className="mt-6 text-center text-sm text-muted-foreground">
        <p className="mb-1">Swipe or use arrow keys to review matches</p>
        <p className="flex items-center justify-center gap-1">
          <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">←</kbd>
          Pass
          <span className="mx-2">•</span>
          <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">→</kbd>
          Accept
          <span className="mx-2">•</span>
          <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Cmd+Z</kbd>
          Undo
        </p>
      </div>
    </div>
  );
}
