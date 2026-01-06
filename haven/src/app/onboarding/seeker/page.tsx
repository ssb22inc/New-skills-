'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Home } from 'lucide-react';
import { SeekerChat } from '@/components/onboarding/seeker-chat';
import { ProgressTracker } from '@/components/onboarding/progress-tracker';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { Button } from '@/components/ui/button';

const steps = [
  {
    id: 'intro',
    title: 'Introduction',
    description: 'Tell us about yourself',
    status: 'current' as const,
  },
  {
    id: 'preferences',
    title: 'Housing Preferences',
    description: 'What are you looking for?',
    status: 'upcoming' as const,
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle',
    description: 'Help us understand your lifestyle',
    status: 'upcoming' as const,
  },
  {
    id: 'verification',
    title: 'Verification',
    description: 'Verify your identity',
    status: 'upcoming' as const,
    optional: true,
  },
];

export default function SeekerOnboardingPage() {
  const router = useRouter();
  const { step, setStep } = useOnboardingStore();

  useEffect(() => {
    setStep(0);
  }, [setStep]);

  const handleComplete = async () => {
    // Save profile and redirect
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Home className="h-6 w-6 text-blue-600" />
            <span className="font-bold text-gray-900">Haven</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
            Skip for now
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            Let's Find Your Perfect Home
          </h1>
          <p className="mt-2 text-gray-600 text-center">
            Chat with our AI to tell us what you're looking for
          </p>
        </div>

        <div className="mb-8">
          <ProgressTracker
            steps={steps}
            currentStepId={steps[step]?.id || 'intro'}
            variant="horizontal"
            showDescription={false}
          />
        </div>

        <SeekerChat seekerId="demo-user-id" onComplete={handleComplete} />

        <div className="mt-8 text-center">
          <Button onClick={handleComplete} size="lg">
            Complete Profile & Find Matches
          </Button>
        </div>
      </main>
    </div>
  );
}
