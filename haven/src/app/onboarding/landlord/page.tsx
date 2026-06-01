'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LandlordOnboardingPage() {
  const router = useRouter()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Welcome, Landlord!</CardTitle>
            <CardDescription>
              List your property on Haven and find verified, compatible tenants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-semibold">What you get with Haven</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• AI-powered listing creation from photos or voice</li>
                <li>• Compatibility matching with pre-screened tenants</li>
                <li>• Automated pricing recommendations</li>
                <li>• Identity and income verification</li>
              </ul>
            </div>

            <Button
              className="w-full"
              onClick={() => router.push('/listings/new')}
            >
              Create Your First Listing
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/dashboard')}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
