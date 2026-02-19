'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Heart, MessageSquare, User, Home } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/hooks/use-auth';

const seekerNav = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Matches', href: '/matches', icon: Heart },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Profile', href: '/profile', icon: User },
];

const landlordNav = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Listings', href: '/listings', icon: Home },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Profile', href: '/profile', icon: User },
];

export function MobileNav() {
  const pathname = usePathname();
  const { profile } = useAuth();

  const navigation = profile?.user_type === 'landlord' ? landlordNav : seekerNav;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white lg:hidden">
      <div className="flex justify-around">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium',
                isActive ? 'text-blue-600' : 'text-gray-500'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
