import Link from 'next/link';
import Image from 'next/image';
import { Heart, MapPin, Bed, Bath, Square } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils/format';
import { ListingWithPhotos } from '@/types/listing';

interface ListingCardProps {
  listing: ListingWithPhotos;
  onSave?: () => void;
  isSaved?: boolean;
  showMatchScore?: boolean;
  matchScore?: number;
}

export function ListingCard({ listing, onSave, isSaved, showMatchScore, matchScore }: ListingCardProps) {
  const primaryPhoto = listing.photos?.find(p => p.is_primary) || listing.photos?.[0];
  
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <Link href={`/listings/${listing.id}`}>
        <div className="relative aspect-[4/3]">
          {primaryPhoto ? (
            <Image
              src={primaryPhoto.url}
              alt={listing.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gray-200 flex items-center justify-center">
              <span className="text-gray-400">No photo</span>
            </div>
          )}
          
          {showMatchScore && matchScore && (
            <div className="absolute top-3 left-3">
              <Badge variant={matchScore >= 80 ? 'success' : matchScore >= 60 ? 'default' : 'secondary'}>
                {matchScore}% match
              </Badge>
            </div>
          )}
          
          {listing.instant_booking && (
            <Badge className="absolute top-3 right-3" variant="default">
              Instant Book
            </Badge>
          )}
        </div>
      </Link>
      
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <Link href={`/listings/${listing.id}`}>
              <h3 className="font-semibold text-gray-900 truncate hover:text-blue-600">
                {listing.title}
              </h3>
            </Link>
            <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <MapPin className="h-4 w-4" />
              {listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city}, {listing.state}
            </p>
          </div>
          
          {onSave && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.preventDefault(); onSave(); }}
              className="flex-shrink-0"
            >
              <Heart className={isSaved ? 'fill-red-500 text-red-500' : ''} />
            </Button>
          )}
        </div>
        
        <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
          {listing.bedrooms !== null && (
            <span className="flex items-center gap-1">
              <Bed className="h-4 w-4" /> {listing.bedrooms} bed
            </span>
          )}
          {listing.bathrooms !== null && (
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4" /> {listing.bathrooms} bath
            </span>
          )}
          {listing.sqft && (
            <span className="flex items-center gap-1">
              <Square className="h-4 w-4" /> {listing.sqft.toLocaleString()} sqft
            </span>
          )}
        </div>
        
        <div className="mt-3 flex items-baseline justify-between">
          <p className="text-lg font-bold text-gray-900">
            {formatCurrency(listing.price_monthly)}
            <span className="text-sm font-normal text-gray-500">/mo</span>
          </p>
          {listing.utilities_included && (
            <Badge variant="secondary">Utils included</Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
