import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="font-bold text-xl text-primary">Haven</div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="container px-4 py-24 text-center">
          <h1 className="text-5xl font-bold tracking-tight">
            Find your perfect home match
          </h1>
          <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto">
            Haven uses AI to match renters and landlords based on lifestyle compatibility,
            personality, and real preferences — not just price filters.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg">Find a Home</Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline">List a Property</Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="container px-4 py-16">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: 'AI-Powered Matching',
                description: 'Our algorithm considers lifestyle, personality, and preferences to find truly compatible matches.',
              },
              {
                title: 'Verified Listings',
                description: 'Every listing is verified and enhanced with AI analysis of photos, pricing, and descriptions.',
              },
              {
                title: 'Smart Onboarding',
                description: 'Chat naturally with our AI to build your profile. No tedious forms required.',
              },
            ].map((feature) => (
              <div key={feature.title} className="rounded-lg border p-6">
                <h3 className="font-semibold text-lg">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Haven. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
