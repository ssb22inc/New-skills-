import { SwipeInterface } from '@/components/matching/swipe-interface';

export default function MatchesPage() {
  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Your Matches</h1>
        <p className="mt-1 text-gray-600">
          Listings handpicked based on your preferences
        </p>
      </div>

      <SwipeInterface />
    </div>
  );
}
