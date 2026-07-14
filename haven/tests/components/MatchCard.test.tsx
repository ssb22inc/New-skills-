import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchCard } from '@/components/matching/match-card';
import { mockMatch } from '../mocks/handlers';

describe('MatchCard', () => {
  const defaultProps = {
    match: mockMatch,
    onLike: vi.fn(),
    onSkip: vi.fn(),
    onViewDetails: vi.fn(),
  };

  it('renders match information', () => {
    render(<MatchCard {...defaultProps} />);

    expect(screen.getByText(mockMatch.listing.title)).toBeInTheDocument();
    expect(screen.getByText(`${mockMatch.scores.total}% Match`)).toBeInTheDocument();
  });

  it('displays location information', () => {
    render(<MatchCard {...defaultProps} />);

    expect(screen.getByText(new RegExp(mockMatch.listing.city))).toBeInTheDocument();
  });

  it('shows score breakdown when toggled', () => {
    render(<MatchCard {...defaultProps} />);

    const toggleButton = screen.getByText('Why this match?');
    fireEvent.click(toggleButton);

    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('Lifestyle')).toBeInTheDocument();
  });

  it('calls onLike when like button is clicked', () => {
    render(<MatchCard {...defaultProps} />);

    const likeButton = screen.getByRole('button', { name: /like/i });
    fireEvent.click(likeButton);

    expect(defaultProps.onLike).toHaveBeenCalledTimes(1);
  });

  it('calls onSkip when skip button is clicked', () => {
    render(<MatchCard {...defaultProps} />);

    const skipButton = screen.getByRole('button', { name: /skip/i });
    fireEvent.click(skipButton);

    expect(defaultProps.onSkip).toHaveBeenCalledTimes(1);
  });

  it('calls onViewDetails when view details is clicked', () => {
    render(<MatchCard {...defaultProps} />);

    const viewButton = screen.getByText('View Details');
    fireEvent.click(viewButton);

    expect(defaultProps.onViewDetails).toHaveBeenCalledTimes(1);
  });
});
