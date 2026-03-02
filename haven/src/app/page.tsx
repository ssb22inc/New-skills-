import Link from 'next/link';
import { Home, Search, Shield, Sparkles, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                Find Your Perfect
                <span className="text-blue-600"> Temporary Home</span>
              </h1>
              <p className="mt-6 text-lg text-gray-600 max-w-xl">
                Haven uses AI to match travel nurses with ideal furnished rentals. 
                Skip the stress of housing searches and focus on what matters—your patients.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/signup">
                  <Button size="lg" className="gap-2">
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/listings">
                  <Button size="lg" variant="outline">
                    Browse Listings
                  </Button>
                </Link>
              </div>
              <div className="mt-8 flex items-center gap-4 text-sm text-gray-500">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-8 w-8 rounded-full bg-gray-300 border-2 border-white" />
                  ))}
                </div>
                <span>
                  <strong className="text-gray-900">2,000+</strong> nurses housed this month
                </span>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 p-1">
                <div className="h-full w-full rounded-xl bg-white p-4">
                  <div className="h-full w-full rounded-lg bg-gray-100 flex items-center justify-center">
                    <Home className="h-24 w-24 text-gray-300" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              How Haven Works
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Our AI-powered platform makes finding housing as easy as swiping right
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Sparkles,
                title: 'Tell Us Your Needs',
                description: 'Chat with our AI to share your preferences, budget, and must-haves. No forms to fill out.',
              },
              {
                icon: Search,
                title: 'Get Matched Instantly',
                description: 'Our algorithm finds listings that match your lifestyle, commute, and budget perfectly.',
              },
              {
                icon: Shield,
                title: 'Book with Confidence',
                description: 'All landlords are verified. Pay securely and move in stress-free.',
              },
            ].map((feature, i) => (
              <div key={i} className="relative p-8 bg-gray-50 rounded-2xl">
                <div className="inline-flex items-center justify-center rounded-xl bg-blue-100 p-3">
                  <feature.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900">
            Loved by Travel Nurses
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              { name: 'Sarah M.', role: 'ICU Nurse', quote: 'Found my perfect apartment in Houston in 20 minutes. The AI knew exactly what I needed.' },
              { name: 'James K.', role: 'ER Nurse', quote: 'No more scrolling through hundreds of listings. Haven showed me 5 perfect matches.' },
              { name: 'Maria L.', role: 'OR Nurse', quote: 'The landlord verification gave me peace of mind. Best housing experience ever.' },
            ].map((testimonial, i) => (
              <div key={i} className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex gap-1 text-yellow-400">
                  {[...Array(5)].map((_, j) => <Star key={j} className="h-4 w-4 fill-current" />)}
                </div>
                <p className="mt-4 text-gray-600">"{testimonial.quote}"</p>
                <div className="mt-4">
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-blue-600 px-8 py-16 text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Ready to Find Your Haven?
            </h2>
            <p className="mt-4 text-lg text-blue-100 max-w-xl mx-auto">
              Join thousands of travel nurses who've found their perfect temporary home.
            </p>
            <Link href="/signup" className="mt-8 inline-block">
              <Button size="lg" variant="secondary">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Home className="h-6 w-6 text-blue-600" />
              <span className="font-bold text-gray-900">Haven</span>
            </div>
            <p className="text-sm text-gray-500">
              © 2024 Haven. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
