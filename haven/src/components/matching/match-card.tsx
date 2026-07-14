'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Heart, X, ChevronDown, ChevronUp, MapPin, Bed, Bath, DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { Match } from '@/types/matching';

interface MatchCardProps {
  match: Match;
  onLike: () => void;
  onSkip: () => void;
  onViewDetails: () => void;
}

export function MatchCard({ match, onLike, onSkip, onViewDetails }: MatchCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { listing, scores, breakdown } = match;
  const primaryPhoto = listing.photos?.find(p => p.is_primary) || listing.photos?.[0];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-blue-600 bg-blue-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  };

  return (
    <Card className="overflow-hidden max-w-md mx-auto">
      {/* Photo */}
      <div className="relative aspect-[4/3]">
        {primaryPhoto ? (
          <Image
            src={primaryPhoto.url}
            alt={listing.title}
            fill
            sizes="(max-width: 768px) 100vw, 28rem"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gray-200" />
        )}
        
        <div className={`absolute top-4 right-4 px-3 py-1 rounded-full font-bold ${getScoreColor(scores.total)}`}>
          {scores.total}% Match
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-xl font-bold text-gray-900">{listing.title}</h3>
        
        <p className="mt-1 flex items-center gap-1 text-gray-500">
          <MapPin className="h-4 w-4" />
          {listing.neighborhood}, {listing.city}
        </p>

        <div className="mt-3 flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            {formatCurrency(listing.price_monthly)}/mo
          </span>
          <span className="flex items-center gap-1">
            <Bed className="h-4 w-4" />
            {listing.bedrooms} bed
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-4 w-4" />
            {listing.bathrooms} bath
          </span>
        </div>

        {/* Score breakdown toggle */}
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          Why this match?
          {showBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showBreakdown && (
          <div className="mt-3 space-y-2 p-3 bg-gray-50 rounded-lg">
            <ScoreRow label="Location" score={scores.location} />
            <ScoreRow label="Budget" score={scores.budget} />
            <ScoreRow label="Lifestyle" score={scores.lifestyle} />
            <ScoreRow label="Amenities" score={scores.amenity} />
            
            {breakdown.amenity.matched_must_haves.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500">Has your must-haves:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {breakdown.amenity.matched_must_haves.map(item => (
                    <Badge key={item} variant="success" className="text-xs">{item}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <Button
            onClick={onSkip}
            variant="outline"
            size="lg"
            className="rounded-full h-14 w-14 p-0"
            aria-label="Skip"
          >
            <X className="h-6 w-6 text-gray-500" />
          </Button>
          
          <Button
            onClick={onViewDetails}
            variant="secondary"
            className="px-6"
          >
            View Details
          </Button>
          
          <Button
            onClick={onLike}
            size="lg"
            className="rounded-full h-14 w-14 p-0 bg-red-500 hover:bg-red-600"
            aria-label="Like"
          >
            <Heart className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full"
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-sm font-medium w-8">{score}</span>
      </div>
    </div>
  );
}
