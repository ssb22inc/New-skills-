'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, MapPin, Bed, Bath, Home, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListingWithPhotos } from '@/types/listing';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface ListingCardProps {
  listing: ListingWithPhotos;
  matchScore?: number;
  onSave?: (listingId: string) => void;
  onUnsave?: (listingId: string) => void;
  isSaved?: boolean;
  showMatchScore?: boolean;
  variant?: 'default' | 'compact';
}

export function ListingCard({
  listing,
  matchScore,
  onSave,
  onUnsave,
  isSaved = false,
  showMatchScore = false,
  variant = 'default',
}: ListingCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const primaryPhoto = listing.photos.find((p) => p.is_primary) || listing.photos[0];

  const handleSaveToggle = async () => {
    setIsLoading(true);
    try {
      if (isSaved && onUnsave) {
        await onUnsave(listing.id);
      } else if (!isSaved && onSave) {
        await onSave(listing.id);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isCompact = variant === 'compact';

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <Link href={`/listings/${listing.id}`}>
        <div className={`relative ${isCompact ? 'h-48' : 'h-64'} bg-gray-100`}>
          {primaryPhoto ? (
            <Image
              src={primaryPhoto.url}
              alt={listing.title}
              fill
              className="object-cover"
              sizes={isCompact ? '(max-width: 768px) 100vw, 33vw' : '(max-width: 768px) 100vw, 50vw'}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Home className="h-16 w-16 text-gray-400" />
            </div>
          )}

          {/* Match Score Badge */}
          {showMatchScore && matchScore && (
            <div className="absolute top-3 left-3">
              <Badge
                variant={matchScore >= 80 ? 'default' : 'secondary'}
                className="font-semibold"
              >
                {matchScore}% Match
              </Badge>
            </div>
          )}

          {/* Status Badge */}
          {listing.status !== 'active' && (
            <div className="absolute top-3 right-3">
              <Badge variant="destructive" className="capitalize">
                {listing.status}
              </Badge>
            </div>
          )}

          {/* Save Button */}
          {(onSave || onUnsave) && (
            <button
              onClick={(e) => {
                e.preventDefault();
                handleSaveToggle();
              }}
              disabled={isLoading}
              className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              aria-label={isSaved ? 'Unsave listing' : 'Save listing'}
            >
              <Heart
                className={`h-5 w-5 ${
                  isSaved ? 'fill-red-500 text-red-500' : 'text-gray-600'
                }`}
              />
            </button>
          )}

          {/* Photo Count */}
          {listing.photos.length > 1 && (
            <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 text-white text-sm rounded">
              1 / {listing.photos.length}
            </div>
          )}
        </div>
      </Link>

      <CardContent className={isCompact ? 'p-4' : 'p-5'}>
        <Link href={`/listings/${listing.id}`}>
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
          <div className="flex items-center gap-4 text-sm mb-3">
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
              <span className="capitalize">{listing.property_type.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Availability */}
          {listing.available_from && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <Calendar className="h-4 w-4" />
              <span>Available from {formatDate(listing.available_from)}</span>
            </div>
          )}

          {/* Description */}
          {!isCompact && listing.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {listing.description}
            </p>
          )}

          {/* Amenities */}
          {listing.amenities && listing.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {listing.amenities.slice(0, isCompact ? 2 : 3).map((amenity) => (
                <Badge key={amenity} variant="outline" className="text-xs capitalize">
                  {amenity.replace('_', ' ')}
                </Badge>
              ))}
              {listing.amenities.length > (isCompact ? 2 : 3) && (
                <Badge variant="outline" className="text-xs">
                  +{listing.amenities.length - (isCompact ? 2 : 3)} more
                </Badge>
              )}
            </div>
          )}
        </Link>
      </CardContent>
    </Card>
  );
}
