import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhotoUploader } from '@/components/listing/photo-uploader';

describe('PhotoUploader', () => {
  const defaultProps = {
    photos: [],
    onChange: vi.fn(),
    maxPhotos: 20,
  };

  it('renders upload zone', () => {
    render(<PhotoUploader {...defaultProps} />);

    expect(screen.getByText(/drag & drop/i)).toBeInTheDocument();
    expect(screen.getByText('0 / 20 photos uploaded')).toBeInTheDocument();
  });

  it('shows photo count correctly', () => {
    const photos = [
      { url: 'https://test.com/1.jpg', position: 0, is_primary: true },
      { url: 'https://test.com/2.jpg', position: 1, is_primary: false },
    ];
    render(<PhotoUploader {...defaultProps} photos={photos} />);

    expect(screen.getByText('2 / 20 photos uploaded')).toBeInTheDocument();
  });

  it('renders photo thumbnails', () => {
    const photos = [
      { url: 'https://test.com/1.jpg', position: 0, is_primary: true },
    ];
    render(<PhotoUploader {...defaultProps} photos={photos} />);

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://test.com/1.jpg');
  });

  it('shows primary badge on primary photo', () => {
    const photos = [
      { url: 'https://test.com/1.jpg', position: 0, is_primary: true },
    ];
    render(<PhotoUploader {...defaultProps} photos={photos} />);

    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('calls onChange when photo is removed', async () => {
    const photos = [
      { url: 'https://test.com/1.jpg', position: 0, is_primary: true },
    ];
    const onChange = vi.fn();
    render(<PhotoUploader {...defaultProps} photos={photos} onChange={onChange} />);

    const removeButtons = document.querySelectorAll('button');
    const removeButton = Array.from(removeButtons).find(btn =>
      btn.querySelector('svg')?.classList.contains('lucide-x')
    );

    if (removeButton) {
      fireEvent.click(removeButton);
      expect(onChange).toHaveBeenCalled();
    }
  });

  it('disables upload when max photos reached', () => {
    const photos = Array.from({ length: 20 }, (_, i) => ({
      url: `https://test.com/${i}.jpg`,
      position: i,
      is_primary: i === 0,
    }));
    render(<PhotoUploader {...defaultProps} photos={photos} maxPhotos={20} />);

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeDisabled();
  });

  it('shows analyze button when enough photos', () => {
    const photos = Array.from({ length: 3 }, (_, i) => ({
      url: `https://test.com/${i}.jpg`,
      position: i,
      is_primary: i === 0,
    }));
    const onAnalyze = vi.fn();
    render(<PhotoUploader {...defaultProps} photos={photos} onAnalyze={onAnalyze} />);

    expect(screen.getByText(/analyze photos with ai/i)).toBeInTheDocument();
  });
});
