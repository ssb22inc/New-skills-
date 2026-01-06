'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Menu, X, Bell, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const pathname = usePathname();

  const navigation = user
    ? [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'Listings', href: '/listings' },
        { name: 'Matches', href: '/matches' },
        { name: 'Messages', href: '/messages' },
      ]
    : [
        { name: 'How it Works', href: '/#how-it-works' },
        { name: 'For Landlords', href: '/landlords' },
        { name: 'Pricing', href: '/pricing' },
      ];

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Home className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">Haven</span>
          </Link>

          <div className="hidden md:flex md:gap-6">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-blue-600',
                  pathname === item.href ? 'text-blue-600' : 'text-gray-600'
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Button variant="ghost" size="icon" className="hidden sm:flex">
                <Bell className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="hidden sm:flex">
                <MessageSquare className="h-5 w-5" />
              </Button>
              <div className="relative group">
                <Avatar
                  src={profile?.avatar_url}
                  alt={profile?.full_name || 'User'}
                  size="sm"
                  className="cursor-pointer"
                />
                <div className="absolute right-0 top-full mt-2 w-48 rounded-lg bg-white py-2 shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <Link href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Settings
                  </Link>
                  <button
                    onClick={signOut}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link href="/signup">
                <Button>Get Started</Button>
              </Link>
            </>
          )}

          <button
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="block py-2 text-base font-medium text-gray-600 hover:text-blue-600"
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.name}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
