'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Home } from 'lucide-react';
import { SeekerChat } from '@/components/onboarding/seeker-chat';
import { ProgressTracker } from '@/components/onboarding/progress-tracker';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { Button } from '@/components/ui/button';

const steps = [
  { id: 'intro', name: 'Introduction' },
  { id: 'preferences', name: 'Housing Preferences' },
  { id: 'lifestyle', name: 'Lifestyle' },
  { id: 'verification', name: 'Verification' },
];

export default function SeekerOnboardingPage() {
  const router = useRouter();
  const { step, setStep } = useOnboardingStore();

  useEffect(() => {
    // setStep is a stable zustand setter.
    setStep(0);
  }, [setStep]);

  const handleComplete = async () => {
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
          <ProgressTracker steps={steps} currentStep={step} />
        </div>

        <SeekerChat />

        <div className="mt-8 text-center">
          <Button onClick={handleComplete} size="lg">
            Complete Profile & Find Matches
          </Button>
        </div>
      </main>
    </div>
  );
}
