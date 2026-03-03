import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListingCard } from '@/components/listing/listing-card';
import { createMockListing } from '../mocks/data';

describe('ListingCard', () => {
  const mockListing = {
    ...createMockListing(),
    photos: [{ id: '1', url: 'https://test.com/photo.jpg', is_primary: true }],
  };

  it('renders listing information correctly', () => {
    render(<ListingCard listing={mockListing as any} />);

    expect(screen.getByText(mockListing.title)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(mockListing.city))).toBeInTheDocument();
    expect(screen.getByText(`${mockListing.bedrooms} bed`)).toBeInTheDocument();
    expect(screen.getByText(`${mockListing.bathrooms} bath`)).toBeInTheDocument();
  });

  it('displays primary photo', () => {
    render(<ListingCard listing={mockListing as any} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', mockListing.photos[0].url);
  });

  it('shows "No photo" when no photos exist', () => {
    const listingNoPhotos = { ...mockListing, photos: [] };
    render(<ListingCard listing={listingNoPhotos as any} />);

    expect(screen.getByText('No photo')).toBeInTheDocument();
  });

  it('displays match score when provided', () => {
    render(<ListingCard listing={mockListing as any} showMatchScore matchScore={85} />);

    expect(screen.getByText('85% match')).toBeInTheDocument();
  });

  it('shows instant booking badge when enabled', () => {
    const instantBookListing = { ...mockListing, instant_booking: true };
    render(<ListingCard listing={instantBookListing as any} />);

    expect(screen.getByText('Instant Book')).toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', () => {
    const onSave = vi.fn();
    render(<ListingCard listing={mockListing as any} onSave={onSave} />);

    const saveButton = screen.getByRole('button');
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows filled heart when saved', () => {
    render(<ListingCard listing={mockListing as any} onSave={() => {}} isSaved />);

    const heartIcon = document.querySelector('.fill-red-500');
    expect(heartIcon).toBeInTheDocument();
  });

  it('displays utilities included badge', () => {
    const utilsListing = { ...mockListing, utilities_included: true };
    render(<ListingCard listing={utilsListing as any} />);

    expect(screen.getByText('Utils included')).toBeInTheDocument();
  });
});
