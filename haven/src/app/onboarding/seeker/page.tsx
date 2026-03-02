'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const STEPS = [
  { id: 'profession', title: 'Tell us about yourself', description: 'Help landlords understand who you are' },
  { id: 'budget', title: 'What\'s your budget?', description: 'We\'ll only show listings you can afford' },
  { id: 'location', title: 'Where do you want to live?', description: 'Pick your preferred city and neighborhoods' },
  { id: 'lifestyle', title: 'Your lifestyle', description: 'Help us find the right fit for your daily routine' },
]

export default function SeekerOnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState({
    profession: '',
    budget_min: '',
    budget_max: '',
    city: '',
    move_in_date: '',
    work_from_home: false,
    has_pets: false,
  })

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }

    // Submit
    setIsLoading(true)
    try {
      await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_completed: true }),
      })

      const seekerData = {
        profession: data.profession,
        budget_min: Number(data.budget_min),
        budget_max: Number(data.budget_max),
        move_in_date: data.move_in_date || undefined,
        location_preferences: data.city ? [{ city: data.city }] : [],
        must_haves: [
          ...(data.work_from_home ? ['workspace'] : []),
          ...(data.has_pets ? ['pets_allowed'] : []),
        ],
        lifestyle: { work_from_home: data.work_from_home },
      }

      // In production, this would call an API endpoint to save seeker profile
      console.log('Saving seeker data:', seekerData)
      router.push('/dashboard')
    } catch {
      // Handle error
    } finally {
      setIsLoading(false)
    }
  }

  const currentStep = STEPS[step]

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Step {step + 1} of {STEPS.length}</span>
            <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{currentStep.title}</CardTitle>
            <CardDescription>{currentStep.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">What do you do for work?</label>
                <Input
                  placeholder="e.g., Travel Nurse, Software Engineer"
                  value={data.profession}
                  onChange={(e) => setData({ ...data, profession: e.target.value })}
                />
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Min Budget ($/mo)</label>
                  <Input
                    type="number"
                    placeholder="1500"
                    value={data.budget_min}
                    onChange={(e) => setData({ ...data, budget_min: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Budget ($/mo)</label>
                  <Input
                    type="number"
                    placeholder="3000"
                    value={data.budget_max}
                    onChange={(e) => setData({ ...data, budget_max: e.target.value })}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Preferred City</label>
                  <Input
                    placeholder="e.g., Houston, TX"
                    value={data.city}
                    onChange={(e) => setData({ ...data, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Move-in Date</label>
                  <Input
                    type="date"
                    value={data.move_in_date}
                    onChange={(e) => setData({ ...data, move_in_date: e.target.value })}
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.work_from_home}
                    onChange={(e) => setData({ ...data, work_from_home: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">I work from home and need a dedicated workspace</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.has_pets}
                    onChange={(e) => setData({ ...data, has_pets: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">I have pets and need a pet-friendly place</span>
                </label>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              <Button
                type="button"
                className="flex-1"
                onClick={handleNext}
                disabled={isLoading}
              >
                {step === STEPS.length - 1
                  ? isLoading ? 'Saving...' : 'Complete Setup'
                  : 'Next'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
