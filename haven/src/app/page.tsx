import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-5xl w-full space-y-8 text-center">
        <h1 className="text-6xl font-bold tracking-tight">
          Welcome to <span className="text-primary">Haven</span>
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          AI-powered housing platform designed for travel nurses and healthcare professionals.
          Find your perfect temporary home with intelligent matching.
        </p>

        <div className="flex gap-4 justify-center items-center">
          <Link
            href="/dashboard"
            className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 border border-border rounded-lg font-semibold hover:bg-accent transition"
          >
            Sign In
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
          <div className="p-6 border border-border rounded-lg">
            <h3 className="text-lg font-semibold mb-2">🤖 AI-Powered Matching</h3>
            <p className="text-sm text-muted-foreground">
              Smart algorithms match you with compatible listings based on lifestyle and preferences
            </p>
          </div>

          <div className="p-6 border border-border rounded-lg">
            <h3 className="text-lg font-semibold mb-2">✅ Verified Listings</h3>
            <p className="text-sm text-muted-foreground">
              All properties are verified with AI photo analysis and document verification
            </p>
          </div>

          <div className="p-6 border border-border rounded-lg">
            <h3 className="text-lg font-semibold mb-2">⚡ Quick Setup</h3>
            <p className="text-sm text-muted-foreground">
              Create listings in minutes with voice-to-text and automated photo analysis
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Project Status: <span className="font-semibold text-foreground">Setup Complete</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Next.js 14 • TypeScript • Tailwind CSS • Supabase • OpenAI
          </p>
        </div>
      </div>
    </main>
  )
}
