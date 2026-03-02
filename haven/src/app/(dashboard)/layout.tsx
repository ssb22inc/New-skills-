import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="font-bold text-xl text-primary">Haven</div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="/dashboard" className="text-foreground hover:text-primary transition-colors">Dashboard</a>
            <a href="/listings" className="text-muted-foreground hover:text-primary transition-colors">Listings</a>
            <a href="/matches" className="text-muted-foreground hover:text-primary transition-colors">Matches</a>
            <a href="/messages" className="text-muted-foreground hover:text-primary transition-colors">Messages</a>
            <a href="/settings" className="text-muted-foreground hover:text-primary transition-colors">Settings</a>
          </nav>
        </div>
      </header>
      <main className="flex-1 container px-4 py-8">
        {children}
      </main>
    </div>
  )
}
