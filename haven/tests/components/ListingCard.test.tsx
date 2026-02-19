import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListingCard } from '@/components/listing/listing-card';
import { createMockListing } from '../mocks/data';

describe('ListingCard', () => {
  const mockListing = {
    ...createMockListing(),
    photos: [{ id: '1', url: 'https://test.com/photo.jpg', is_primary: true, order: 0 }],
  };

  it('renders listing information correctly', () => {
    render(<ListingCard listing={mockListing as any} />);

    expect(screen.getByText(mockListing.title)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(mockListing.address_city))).toBeInTheDocument();
    expect(screen.getByText(`${mockListing.bedrooms} bed`)).toBeInTheDocument();
    expect(screen.getByText(`${mockListing.bathrooms} bath`)).toBeInTheDocument();
  });

  it('displays primary photo', () => {
    render(<ListingCard listing={mockListing as any} />);

    const img = screen.getByRole('img', { hidden: true });
    expect(img).toBeDefined();
  });

  it('displays match score when provided', () => {
    render(<ListingCard listing={mockListing as any} showMatchScore matchScore={85} />);

    expect(screen.getByText(/85% Match/i)).toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', () => {
    const onSave = vi.fn();
    render(<ListingCard listing={mockListing as any} onSave={onSave} />);

    const saveButton = screen.getByLabelText(/save listing/i);
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(mockListing.id);
  });

  it('shows filled heart when saved', () => {
    render(<ListingCard listing={mockListing as any} onSave={() => {}} isSaved />);

    const heartIcon = document.querySelector('.fill-red-500');
    expect(heartIcon).toBeInTheDocument();
  });

  it('renders compact variant correctly', () => {
    const { container } = render(<ListingCard listing={mockListing as any} variant="compact" />);

    // Compact variant should have different styling
    expect(container.querySelector('.p-4')).toBeInTheDocument();
  });

  it('displays amenities when present', () => {
    const listingWithAmenities = {
      ...mockListing,
      amenities: ['wifi', 'parking', 'washer_dryer'],
    };
    render(<ListingCard listing={listingWithAmenities as any} />);

    expect(screen.getByText(/wifi/i)).toBeInTheDocument();
    expect(screen.getByText(/parking/i)).toBeInTheDocument();
  });
});
