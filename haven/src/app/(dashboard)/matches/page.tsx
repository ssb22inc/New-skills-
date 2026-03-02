import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/format'

export default async function MatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: seekerProfile } = await supabase
    .from('seeker_profiles')
    .select('id')
    .eq('user_id', user!.id)
    .single()

  const { data: matches } = seekerProfile
    ? await supabase
        .from('matches')
        .select('*, listings(*, listing_photos(*))')
        .eq('seeker_id', seekerProfile.id)
        .order('total_score', { ascending: false })
        .limit(20)
    : { data: [] }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your Matches</h1>
        <p className="text-muted-foreground mt-1">
          Properties matched to your preferences and lifestyle
        </p>
      </div>

      {!seekerProfile ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <h3 className="text-lg font-semibold">Complete your profile first</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              We need to know your preferences to find great matches.
            </p>
            <a
              href="/onboarding/seeker"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Complete Profile
            </a>
          </CardContent>
        </Card>
      ) : !matches || matches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <h3 className="text-lg font-semibold">No matches yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Check back soon as new listings are added daily.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {matches.map((match) => {
            const listing = match.listings as { title: string; city: string; state: string; price_monthly: number; bedrooms: number; bathrooms: number } | null
            if (!listing) return null
            return (
              <Card key={match.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base line-clamp-2">{listing.title}</CardTitle>
                    <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                      {match.total_score}%
                    </span>
                  </div>
                  <CardDescription>
                    {listing.city}, {listing.state}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">
                      {formatCurrency(listing.price_monthly)}/mo
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {listing.bedrooms}bd · {listing.bathrooms}ba
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
