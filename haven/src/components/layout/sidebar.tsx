'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Home, Heart, MessageSquare, Settings, Plus, List, User,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/hooks/use-auth';

const seekerNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Matches', href: '/matches', icon: Heart },
  { name: 'Saved', href: '/saved', icon: List },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Profile', href: '/profile', icon: User },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const landlordNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'My Listings', href: '/listings', icon: Home },
  { name: 'Add Listing', href: '/listings/new', icon: Plus },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();

  const navigation = profile?.user_type === 'landlord' ? landlordNavigation : seekerNavigation;

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
      <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white pt-20">
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <item.icon
                  className={cn('h-5 w-5 flex-shrink-0', isActive ? 'text-blue-600' : 'text-gray-400')}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
