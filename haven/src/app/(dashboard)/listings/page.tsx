import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/format'

export default async function ListingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: listings } = await supabase
    .from('listings')
    .select('*, listing_photos(*)')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Listings</h1>
          <p className="text-muted-foreground mt-1">Manage your rental properties</p>
        </div>
        <a
          href="/listings/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New Listing
        </a>
      </div>

      {!listings || listings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <h3 className="text-lg font-semibold">No listings yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first listing to start attracting tenants.
            </p>
            <a
              href="/listings/new"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create Listing
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <Card key={listing.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base line-clamp-2">{listing.title}</CardTitle>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                    listing.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {listing.status}
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
                <div className="mt-3 flex gap-2">
                  <a
                    href={`/listings/${listing.id}`}
                    className="flex-1 rounded-md border px-3 py-1.5 text-center text-xs hover:bg-accent"
                  >
                    Edit
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
