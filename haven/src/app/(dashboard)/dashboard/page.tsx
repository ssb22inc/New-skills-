import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home, Heart, MessageSquare, Eye } from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, seeker_profile:seeker_profiles(*)')
    .eq('id', user?.id)
    .single();

  const isSeeker = profile?.user_type === 'seeker' || profile?.user_type === 'both';
  const isLandlord = profile?.user_type === 'landlord' || profile?.user_type === 'both';

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
        </h1>
        <p className="mt-1 text-gray-600">
          {isSeeker ? "Here's what's happening with your housing search." : "Here's an overview of your listings."}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isSeeker && (
          <>
            <StatCard icon={Heart} label="New Matches" value="12" href="/matches" />
            <StatCard icon={MessageSquare} label="Messages" value="3" href="/messages" />
            <StatCard icon={Home} label="Saved Listings" value="8" href="/saved" />
            <StatCard icon={Eye} label="Profile Views" value="24" />
          </>
        )}
        {isLandlord && (
          <>
            <StatCard icon={Home} label="Active Listings" value="4" href="/listings" />
            <StatCard icon={Eye} label="Total Views" value="156" />
            <StatCard icon={MessageSquare} label="Inquiries" value="8" href="/messages" />
            <StatCard icon={Heart} label="Saves" value="42" />
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        {isSeeker && (
          <Card>
            <CardHeader>
              <CardTitle>Continue Your Search</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                We found 12 new listings that match your preferences. Ready to explore?
              </p>
              <Link href="/matches">
                <Button>View Matches</Button>
              </Link>
            </CardContent>
          </Card>
        )}
        
        {isLandlord && (
          <Card>
            <CardHeader>
              <CardTitle>List a New Property</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Add a new listing in minutes with our AI-powered listing creator.
              </p>
              <Link href="/listings/new">
                <Button>Create Listing</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { text: 'New message from property owner', time: '2 hours ago' },
                { text: 'Your profile was viewed 5 times', time: '5 hours ago' },
                { text: 'New listing matches your criteria', time: '1 day ago' },
              ].map((activity, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span className="text-sm text-gray-700">{activity.text}</span>
                  <span className="text-xs text-gray-500">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, href }: { 
  icon: React.ComponentType<{ className?: string }>;
  label: string; 
  value: string; 
  href?: string;
}) {
  const content = (
    <Card className={href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="p-3 bg-blue-100 rounded-full">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  
  return href ? <Link href={href}>{content}</Link> : content;
}
