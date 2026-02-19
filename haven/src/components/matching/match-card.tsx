'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Bed, Bath, Home, Heart, X, MessageCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Match } from '@/types/matching';
import { formatCurrency } from '@/lib/utils/format';

interface MatchCardProps {
  match: Match;
  onAccept?: (matchId: string) => void;
  onReject?: (matchId: string) => void;
  onMessage?: (matchId: string) => void;
  showActions?: boolean;
  variant?: 'default' | 'compact';
}

export function MatchCard({
  match,
  onAccept,
  onReject,
  onMessage,
  showActions = true,
  variant = 'default',
}: MatchCardProps) {
  const [isLoading, setIsLoading] = useState<'accept' | 'reject' | null>(null);
  const listing = match.listing;
  const primaryPhoto = listing.photos?.find((p) => p.is_primary) || listing.photos?.[0];
  const isCompact = variant === 'compact';

  // Parse match breakdown if it's a string
  const breakdown =
    typeof match.match_breakdown === 'string'
      ? JSON.parse(match.match_breakdown)
      : match.match_breakdown;

  const handleAccept = async () => {
    if (!onAccept) return;
    setIsLoading('accept');
    try {
      await onAccept(match.id);
    } finally {
      setIsLoading(null);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    setIsLoading('reject');
    try {
      await onReject(match.id);
    } finally {
      setIsLoading(null);
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-blue-600 bg-blue-50';
    if (score >= 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent Match';
    if (score >= 60) return 'Good Match';
    if (score >= 40) return 'Fair Match';
    return 'Low Match';
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Match Score Header */}
      <div className={`px-4 py-3 ${getScoreColor(match.match_score)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <div>
              <div className="font-bold text-2xl">{match.match_score}%</div>
              <div className="text-xs font-medium">{getScoreLabel(match.match_score)}</div>
            </div>
          </div>
          {match.status && (
            <Badge
              variant={
                match.status === 'accepted'
                  ? 'default'
                  : match.status === 'rejected'
                  ? 'destructive'
                  : 'secondary'
              }
              className="capitalize"
            >
              {match.status}
            </Badge>
          )}
        </div>
      </div>

      <Link href={`/listings/${listing.id}`}>
        {/* Listing Photo */}
        <div className={`relative ${isCompact ? 'h-48' : 'h-64'} bg-gray-100`}>
          {primaryPhoto ? (
            <Image
              src={primaryPhoto.url}
              alt={listing.title}
              fill
              className="object-cover"
              sizes={isCompact ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 768px) 100vw, 100vw'}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Home className="h-16 w-16 text-gray-400" />
            </div>
          )}

          {listing.photos && listing.photos.length > 1 && (
            <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 text-white text-sm rounded">
              1 / {listing.photos.length}
            </div>
          )}
        </div>

        <CardContent className={isCompact ? 'p-4' : 'p-5'}>
          {/* Title and Price */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className={`font-semibold ${isCompact ? 'text-base' : 'text-lg'} line-clamp-1`}>
              {listing.title}
            </h3>
            <div className="text-right shrink-0">
              <div className={`font-bold ${isCompact ? 'text-base' : 'text-xl'} text-primary`}>
                {formatCurrency(listing.price)}
              </div>
              <div className="text-xs text-muted-foreground">per month</div>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <MapPin className="h-4 w-4" />
            <span className="line-clamp-1">
              {listing.address_city}, {listing.address_state}
            </span>
          </div>

          {/* Property Details */}
          <div className="flex items-center gap-4 text-sm mb-4">
            <div className="flex items-center gap-1">
              <Bed className="h-4 w-4 text-muted-foreground" />
              <span>{listing.bedrooms} bed</span>
            </div>
            <div className="flex items-center gap-1">
              <Bath className="h-4 w-4 text-muted-foreground" />
              <span>{listing.bathrooms} bath</span>
            </div>
            <div className="flex items-center gap-1">
              <Home className="h-4 w-4 text-muted-foreground" />
              <span className="capitalize">{listing.property_type?.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Match Breakdown */}
          {breakdown && !isCompact && (
            <div className="space-y-2 pt-3 border-t">
              <div className="text-sm font-semibold mb-2">Why it's a match:</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {breakdown.lifestyle_score && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lifestyle:</span>
                    <span className="font-medium">{breakdown.lifestyle_score}%</span>
                  </div>
                )}
                {breakdown.location_score && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{breakdown.location_score}%</span>
                  </div>
                )}
                {breakdown.budget_score && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Budget:</span>
                    <span className="font-medium">{breakdown.budget_score}%</span>
                  </div>
                )}
                {breakdown.amenity_score && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amenities:</span>
                    <span className="font-medium">{breakdown.amenity_score}%</span>
                  </div>
                )}
              </div>

              {/* Key Highlights */}
              {breakdown.key_highlights && breakdown.key_highlights.length > 0 && (
                <div className="pt-2">
                  <ul className="text-sm space-y-1">
                    {breakdown.key_highlights.slice(0, 3).map((highlight: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span className="text-muted-foreground">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Link>

      {/* Action Buttons */}
      {showActions && match.status === 'pending' && (
        <CardFooter className="p-4 pt-0 gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleReject}
            disabled={!!isLoading}
          >
            {isLoading === 'reject' ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                Rejecting...
              </span>
            ) : (
              <>
                <X className="h-4 w-4 mr-2" />
                Pass
              </>
            )}
          </Button>
          <Button
            variant="default"
            className="flex-1"
            onClick={handleAccept}
            disabled={!!isLoading}
          >
            {isLoading === 'accept' ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Accepting...
              </span>
            ) : (
              <>
                <Heart className="h-4 w-4 mr-2" />
                Accept
              </>
            )}
          </Button>
        </CardFooter>
      )}

      {/* Matched State Actions */}
      {showActions && match.status === 'accepted' && onMessage && (
        <CardFooter className="p-4 pt-0">
          <Button variant="default" className="w-full" onClick={() => onMessage(match.id)}>
            <MessageCircle className="h-4 w-4 mr-2" />
            Send Message
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
